use serde::Serialize;

/// WebDAV GET 结果。
/// `exists=false` 表示远端文件不存在（404），其余字段仅在请求成功（2xx）时填充。
/// 字段用 camelCase 序列化，与前端 TS 类型保持一致。
/// `content` 为原始字节（gzip 压缩的 JSON），serde 序列化为 number[]。
/// 为什么用字节而非文本：上传前前端对 JSON 做了 gzip 压缩以节省坚果云免费版流量，
/// 下载侧必须拿到原始字节后由前端检查 gzip 魔数（0x1f 0x8b）再决定是否解压，
/// 这里若直接用 .text() 解码会破坏压缩字节流。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebdavFetchResult {
    pub status: u16,
    pub exists: bool,
    pub last_modified: Option<String>,
    pub content: Option<Vec<u8>>,
}

/// WebDAV PUT 结果。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebdavPutResult {
    pub status: u16,
    pub last_modified: Option<String>,
}

/// WebDAV MKCOL（创建目录）结果。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebdavMkcolResult {
    pub status: u16,
}

/// 拼接服务地址与远端相对路径，保证两者之间恰好一个斜杠。
/// 服务地址可能以 "/" 结尾、路径可能以 "/" 开头，两者都要容忍。
fn join_path(base: &str, path: &str) -> String {
    let base_trimmed = base.trim_end_matches('/');
    let path_trimmed = path.trim_start_matches('/');
    if base_trimmed.is_empty() {
        format!("/{path_trimmed}")
    } else {
        format!("{base_trimmed}/{path_trimmed}")
    }
}

/// GET 远端文件：探测存在性 + 下载内容。
/// 为什么放在 Rust 侧：WebView 内的 fetch 受 CORS 限制，而 WebDAV
/// 服务器（坚果云等）不返回 CORS 头，只能由 Rust 侧直连。
#[tauri::command]
pub async fn webdav_fetch(
    url: String,
    username: String,
    password: String,
    remote_path: String,
) -> Result<WebdavFetchResult, String> {
    let target = join_path(&url, &remote_path);

    let response = reqwest::Client::new()
        .get(&target)
        .basic_auth(&username, Some(&password))
        .send()
        .await
        .map_err(|e| {
            // builder error = URL 解析失败（如缺失 https:// 协议头），给出可操作的中文提示
            if e.is_builder() {
                "服务器地址格式不正确（请检查是否以 https:// 开头）".to_string()
            } else {
                format!("网络请求失败：{e}")
            }
        })?;

    let status = response.status();
    let status_code = status.as_u16();

    // 404 是正常分支而非错误：表示远端文件尚未存在（首次同步）。
    // 409 也按"不存在"处理：坚果云等 WebDAV 对父目录缺失的路径返回 409（而非 404）。
    if status_code == 404 || status_code == 409 {
        return Ok(WebdavFetchResult {
            status: status_code,
            exists: false,
            last_modified: None,
            content: None,
        });
    }

    if !status.is_success() {
        let reason = status.canonical_reason().unwrap_or("未知错误");
        let hint = match status_code {
            401 => "（认证失败，请检查用户名/密码）",
            403 => "（权限不足，请检查 WebDAV 访问权限）",
            _ => "",
        };
        return Err(format!("WebDAV 请求失败：HTTP {status_code} {reason}{hint}"));
    }

    let last_modified = response
        .headers()
        .get(reqwest::header::LAST_MODIFIED)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    // 读取原始字节（不按文本解码）：上传内容已由前端 gzip 压缩，压缩字节流不是合法 UTF-8 文本，
    // 必须保留字节交由前端按 gzip 魔数解压；历史未压缩快照也能原样返回（前端兼容两种格式）。
    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("读取响应内容失败：{e}"))?;

    Ok(WebdavFetchResult {
        status: status_code,
        exists: true,
        last_modified,
        content: Some(bytes.to_vec()),
    })
}

/// PUT 上传内容到远端文件（不存在则创建，存在则覆盖）。
/// content 是前端 gzip 压缩后的字节（JSON 文本 → CompressionStream('gzip')），
/// 因此 Content-Type 用 application/octet-stream（二进制载荷）而非 application/json；
/// 压缩目的：坚果云免费版上传配额仅 1GB/月，JSON 文本压缩约 10 倍，显著降低流量消耗。
#[tauri::command]
pub async fn webdav_put(
    url: String,
    username: String,
    password: String,
    remote_path: String,
    content: Vec<u8>,
) -> Result<WebdavPutResult, String> {
    let target = join_path(&url, &remote_path);

    let response = reqwest::Client::new()
        .put(&target)
        .basic_auth(&username, Some(&password))
        .header(reqwest::header::CONTENT_TYPE, "application/octet-stream")
        .body(content)
        .send()
        .await
        .map_err(|e| {
            // builder error = URL 解析失败（如缺失 https:// 协议头），给出可操作的中文提示
            if e.is_builder() {
                "服务器地址格式不正确（请检查是否以 https:// 开头）".to_string()
            } else {
                format!("网络请求失败：{e}")
            }
        })?;

    let status = response.status();
    let status_code = status.as_u16();

    if !status.is_success() {
        let reason = status.canonical_reason().unwrap_or("未知错误");
        let hint = match status_code {
            401 => "（认证失败，请检查用户名/密码）",
            403 => "（权限不足，请检查 WebDAV 访问权限）",
            _ => "",
        };
        return Err(format!("WebDAV 上传失败：HTTP {status_code} {reason}{hint}"));
    }

    let last_modified = response
        .headers()
        .get(reqwest::header::LAST_MODIFIED)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    Ok(WebdavPutResult {
        status: status_code,
        last_modified,
    })
}

/// MKCOL 创建远端目录。
/// 为什么需要：坚果云等 WebDAV 对"父目录不存在的路径"执行 PUT 会返回 409，
/// 因此上传前先用 MKCOL 创建目录。目录已存在时服务器通常返回 405/409/301，
/// 由调用方视为"目录就绪"处理（本函数只透传状态码，不做成功/失败判定）。
#[tauri::command]
pub async fn webdav_mkcol(
    url: String,
    username: String,
    password: String,
    remote_path: String,
) -> Result<WebdavMkcolResult, String> {
    let target = join_path(&url, &remote_path);
    let response = reqwest::Client::new()
        .request(reqwest::Method::from_bytes(b"MKCOL").unwrap(), &target)
        .basic_auth(&username, Some(&password))
        .send()
        .await
        .map_err(|e| {
            // builder error = URL 解析失败（如缺失 https:// 协议头），给出可操作的中文提示
            if e.is_builder() {
                "服务器地址格式不正确（请检查是否以 https:// 开头）".to_string()
            } else {
                format!("网络请求失败：{e}")
            }
        })?;

    Ok(WebdavMkcolResult {
        status: response.status().as_u16(),
    })
}
