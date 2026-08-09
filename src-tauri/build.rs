fn main() {
    // 前端资源（../dist）变化时强制重跑 tauri-build，重新嵌入最新前端。
    // 不声明会导致 cargo 增量编译沿用旧 dist（表现为启动后"无法访问此页面"）。
    println!("cargo:rerun-if-changed=../dist");
    tauri_build::build()
}
