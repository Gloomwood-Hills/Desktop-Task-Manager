# 技术文档

## 1. 技术栈

| 层 | 技术 | 说明 |
| --- | --- | --- |
| 桌面框架 | **Tauri 2** | Rust 后端 + WebView2 前端，包体小、启动快 |
| 前端 | **React 18 + TypeScript + Vite + Tailwind CSS** | 组件化 UI，Vite 构建 |
| 动效 | **motion（framer-motion v13）** | Material 3 运动系统，仅用 transform/opacity GPU 加速 |
| 数据库 | **SQLite**（tauri-plugin-sql） | 本地存储，桌面端与 Android 小部件共享 |
| 系统集成 | **windows-rs**（Rust） | WorkerW 桌面挂载、托盘、全局快捷键 |
| 通知 | **tauri-plugin-notification** | 系统通知（提醒） |
| 自启动 | **tauri-plugin-autostart** | 开机自启动 |
| 网络 | **reqwest**（Rust） | WebDAV HTTP 直连，规避 WebView CORS |
| 手机端 | **Android 原生小部件**（Kotlin / RemoteViews） | 跨进程读写同一 SQLite |
| 测试 | **Vitest** | 同步引擎单元测试 |

## 2. 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    Windows 桌面端                         │
│  ┌────────────────┐    ┌──────────────────────────────┐  │
│  │  React 前端     │    │  Rust 后端 (lib.rs)           │  │
│  │  (WebView2)     │◄──►│  - WorkerW 桌面挂载            │  │
│  │                │    │  - 系统托盘 / 全局快捷键        │  │
│  │  components/   │    │  - WebDAV 命令 (webdav.rs)     │  │
│  │  data/         │    │  - 平台条件化编译              │  │
│  │  services/     │    └──────────────────────────────┘  │
│  │  sync/ 引擎    │           │                          │
│  └────────────────┘           │ invoke                   │
│           │                   ▼                          │
│           │          ┌─────────────────┐                 │
│           └─────────►│  SQLite data.db │◄──────────┐     │
│                      └─────────────────┘           │     │
└───────────────────────────────────────────────────┼─────┘
                                                    │
┌───────────────────────────────────────────────────┼─────┐
│              Android 手机端                        │     │
│  ┌────────────────┐                                │     │
│  │ Tauri WebView   │  (App 主界面，与桌面端同源)     │     │
│  └────────────────┘                                │     │
│  ┌────────────────┐    跨进程读写                   │     │
│  │ 桌面小部件      │◄───────────────────────────────┘     │
│  │ (Kotlin)       │                                      │
│  │ - Provider      │                                      │
│  │ - Factory       │                                      │
│  │ - AddTask       │                                      │
│  │ - Appearance    │                                      │
│  └────────────────┘                                      │
└─────────────────────────────────────────────────────────┘
```

## 3. 桌面层嵌入（WorkerW）

### 为什么嵌入桌面层

普通窗口会占用任务栏、被其他窗口遮挡；嵌入 WorkerW 后窗口与桌面壁纸同级，常驻显示且不干扰正常窗口操作。

### 实现步骤（lib.rs `worker_w` 模块）

1. `FindWindowW("Progman")` 找到桌面管理器窗口
2. 向 Progman 发送消息 `0x052C`，触发生成 WorkerW（这是一个未公开但广泛使用的 trick）
3. `FindWindowExW` 找到 `SHELLDLL_DefView` 及其子 `WorkerW`
4. `SetParent(appHwnd, workerW)` 将应用窗口设为 WorkerW 的子窗口
5. `SetWindowPos` + `ShowWindow(SW_SHOWNOACTIVATE)` 显示且不抢占焦点

**注意**：该能力仅在 Windows 上编译（`#[cfg(windows)]`），Android 构建时排除。

## 4. 数据层

### 分层

```
UI (components) → Service (业务逻辑) → Repository (SQL) → SQLite
```

- **types.ts**：`Folder` / `Task` / `Settings` / `WindowState` 类型定义
- **database.ts**：SQLite 初始化、建表、迁移；使用 `DELETE` 日志模式（非 WAL），方便 Android 小部件跨进程只读
- **repositories/**：每个实体一个 Repository，封装 CRUD，软删除用 `deleted=0/1`
- **services/**：业务编排（如创建任务时生成 sortOrder、处理自然语言日期等）

### 数据库位置

- 桌面端：`%APPDATA%\com.desktop.taskmanager\desktop-task-manager\data.db`
- Android：`<dataDir>/desktop-task-manager/data.db`

## 5. WebDAV 同步引擎

### 5.1 设计目标

- 兼容坚果云等支持 WebDAV 的云存储
- 双向合并，不整库覆盖，删除可传播
- 控制流量（坚果云免费版 1GB/月上传配额）
- 失败可重试，绝不误覆盖远端

### 5.2 快照格式

远端存储一个 JSON 快照文件 `Desktop-task-manager/backup.json`（gzip 压缩后上传）：

```typescript
interface SyncSnapshot {
  schemaVersion: number;     // 快照版本，用于兼容性迁移
  exportedAt: number;        // 导出时间戳（元数据，不参与相等判定）
  deviceId: string;          // 导出设备 ID（元数据）
  folders: SyncFolder[];     // 全量文件夹（含墓碑 deleted=true）
  tasks: SyncTask[];         // 全量任务（含墓碑）
}
```

**关键点**：快照包含**软删除记录**（`deleted=1` 的墓碑），这是删除能跨端传播的基础。

### 5.3 合并算法（Last-Write-Wins + 墓碑）

核心在 `sync/merge.ts` 的 `mergeRecords`：

```
对每条记录（按 id 标识）：
  - 双端都有 → 取 updatedAt 较新者（相等取 local）
  - 仅一端有 → 保留该端
  - deleted 作为普通字段参与 LWW：
      较新的墓碑覆盖较旧的存活记录 → 删除传播到对端
      较新的存活记录覆盖较旧的墓碑 → 恢复
```

**顺序稳定性**：以 local 数组顺序为准，remote 独有记录追加末尾，避免 UI 抖动。

### 5.4 同步流程（syncMerge）

```
1. 拉取远端快照（webdavFetch）
2. 远端不存在 → 首次同步，上传本地全量
3. 解析远端快照（失败抛错，绝不覆盖远端）
4. 导出本地快照（含墓碑）
5. mergeFolders / mergeTasks 按 LWW 合并
6. 节流判定：
   - 合并结果 == 本地 且 合并结果 == 远端 → skipped（零流量）
   - 合并结果 != 本地 → 写回本地（INSERT OR REPLACE 逐条收敛）
   - 合并结果 != 远端 → PUT 上传合并结果
```

### 5.5 流量优化

| 手段 | 效果 |
| --- | --- |
| **gzip 压缩** | JSON 文本压缩约 10 倍（坚果云免费版友好） |
| **记录级相等判定** | 无变化时跳过写库和上传，零流量 |
| **防抖 30s** | 连续操作合并为一次同步 |
| **定时兜底 60min** | 仅拉取他端变更，低频执行 |
| **只同步差异端** | 仅本地缺 → 只写不上传；仅远端落后 → 只上传 |

### 5.6 重试与错误处理

- 可重试状态：`429`（限流）、`500/502/503/504`（服务端临时错误）
- 退避策略：第 1 次重试等 800ms，第 2 次等 2.4s，共 3 次尝试
- **关键安全保证**：瞬态失败时**抛错而非返回"不存在"**，避免把本地快照当首次同步上传覆盖远端

### 5.7 并发控制

模块级 Promise 链串行队列（`enqueueSync`），多个同步触发（启动 / 防抖 / 定时 / 手动）排队执行，防止并发双写远端。

### 5.8 调度器（scheduler.ts）

| 触发 | 时机 |
| --- | --- |
| 启动同步 | 应用启动时立即执行一次 |
| 变更防抖 | 数据变更后 30s 无新变更则触发 |
| 定时兜底 | 每 60 分钟一次（拉取他端变更） |

失败静默（仅日志），下一轮自动重试，不阻塞主流程。

### 5.9 Rust 侧 WebDAV 命令

为什么 WebDAV 请求放在 Rust 侧而不是前端 fetch？

> WebView 内的 fetch 受 CORS 限制，而 WebDAV 服务器（坚果云等）不返回 CORS 头，只能由 Rust 侧用 reqwest 直连。

`webdav.rs` 暴露三个 Tauri command：
- `webdav_fetch`：GET 文件，返回原始字节（前端按 gzip 魔数解压）
- `webdav_put`：PUT 文件（接收 gzip 压缩后的字节数组）
- `webdav_mkcol`：创建目录（上传前确保父目录存在，规避 409）

## 6. Android 桌面小部件

### 6.1 跨进程数据库访问

小部件（AppWidgetProvider + RemoteViewsService）运行在独立进程，通过 `SQLiteDatabase.openDatabase` 直接打开 App 的 `data.db`：

- 路径：`<dataDir>/desktop-task-manager/data.db`
- 只读查询用 `OPEN_READONLY`，写入用 `OPEN_READWRITE`
- 设置 `PRAGMA busy_timeout = 3000` 避免 App 写入瞬间触发 SQLITE_BUSY

### 6.2 小部件架构

| 组件 | 职责 |
| --- | --- |
| `TaskWidgetProvider` | 接收广播（刷新 / 切换完成 / 翻页）、重绘 RemoteViews |
| `TaskWidgetFactory` | 列表数据工厂（已由静态渲染替代，保留兼容） |
| `WidgetAddTaskActivity` | 独立新建任务界面，直接读写 SQLite |
| `WidgetAppearanceActivity` | 小部件外观设置（主题/毛玻璃/透明度） |
| `WidgetDb` | 数据库路径解析与打开封装 |

### 6.3 静态渲染方案

鸿蒙桌面对集合视图（ListView）的项点击和 fill-in 附加信息支持不佳，因此采用**静态 RemoteViews** 渲染前 6 条任务，每行独立 `setOnClickPendingIntent`，任务 ID 内嵌在 PendingIntent 的 `data URI` 中（保证不同任务的 PendingIntent 身份不冲突）。

### 6.4 外观设置

独立于 App 设置，存于 `SharedPreferences("widget_appearance")`，支持：
- 主题：浅色 / 深色
- 毛玻璃：近似半透明背景（RemoteViews 不支持真模糊，用 alpha 分档 drawable 模拟）
- 透明度：20%~100%

## 7. 平台隔离

### Rust 侧条件编译

```rust
#[cfg(not(target_os = "android"))]
use tauri_plugin_global_shortcut::{...};  // 桌面专属

#[cfg(windows)]
mod worker_w { ... }  // Windows 桌面挂载
```

Android 构建时桌面专属 crate（托盘、全局快捷键、autostart）不编译。

### Tauri capabilities 分离

- `capabilities/desktop.json`：桌面端权限（窗口、托盘、快捷键、SQL、通知、自启动、WebDAV）
- `capabilities/android.json`：Android 端权限（窗口、SQL、通知）

## 8. 自然语言日期解析

`quickCapture` 输入框实时解析标题中的日期/时间表达，支持：

- 相对日期：今天、明天、后天、本周X、下周X、月底
- 相对时间：一小时后、X小时后、X分钟后
- 绝对日期：YYYY.MM.DD、YYYY年MM月DD日、MM月DD日
- 绝对时间：HH:mm、X点、X点Y分

解析结果实时显示"识别到"预览，用户也可手动选择覆盖。

## 9. 构建与发布

### 桌面端

```bash
npm run build          # vite build → dist/
npm run tauri build    # cargo build --release，嵌入 dist
npm run release        # 上述 + scripts/copy-release.mjs 归档便携版 exe
```

便携版 exe 输出到 `release/DesktopTaskManager-v2.1.0.exe`。

### Android

```powershell
# 环境变量
$env:JAVA_HOME="D:\Android\jdk-21"
$env:ANDROID_HOME="D:\Android"
$env:NDK_HOME="D:\Android\ndk\<version>"

cd src-tauri\gen\android
.\gradlew.bat assembleRelease -PtargetList=aarch64 -ParchList=arm64 -PabiList=arm64-v8a
```

产物：`app/build/outputs/apk/arm64/release/app-arm64-release.apk`

### Android 交叉编译注意事项

1. Rust 工具链路径不能含中文（lld 链接失败），需将 `RUSTUP_HOME` / `CARGO_HOME` 迁移到 ASCII 路径
2. Android target 使用 `rustls` 而非 `openssl-sys`（交叉编译 openssl 困难）
3. `reqwest` 在 Android 上用 `rustls-tls` feature，桌面端用默认
4. WebView 内 fetch 受 CORS 限制，WebDAV 请求必须由 Rust 侧发起

## 10. UI 动效系统

### 10.1 运动令牌

`src/components/utils/motion.ts` 统一全应用的缓动曲线、时长与过渡变体，消除散落的魔法数字：

- **EASE**：6 条 Material 3 缓动曲线（standard / emphasized 及其 decelerate / accelerate 变体）
- **DUR**：三档时长（short 微反馈 0.15s / medium 组件过渡 0.3s / long 大范围转场 0.5s）
- **panelSpring**：面板弹簧（stiffness 420 / damping 20 / mass 0.9）
- **变体**：`fadeThrough`（视图切换）/ `containerTransform`（对话框）/ `sharedAxis`（侧栏滑入）/ `listItem`（列表项增删）/ `toastUp`（Toast）

对应的 CSS 变量（`--ease-*`、`--dur-*`）定义在 `src/index.css`。

### 10.2 动画原则

- 仅使用 `transform` / `opacity`，保证桌面 WebView2 与 Android WebView 的 GPU 加速流畅度
- 视图切换用 `AnimatePresence mode="wait"` + `fadeThrough`
- 列表项增删用 `layout` + `listItem` 变体实现平滑补位
- 复选框完成态用 `motion.span` scale + fade 绘制对勾

### 10.3 无障碍

- `main.tsx` 使用 `<MotionConfig reducedMotion="user">` 让组件跳过位移动画
- `index.css` 增加 `@media (prefers-reduced-motion: reduce)` 禁用/缩短动画

## 11. AI 客户端

`src/services/aiClient.ts` 封装 OpenAI 兼容接口（BaseURL + API Key + Model），兼容 DeepSeek / OpenAI / 通义 / Moonshot 等。

### 11.1 能力

| 函数 | 作用 |
| --- | --- |
| `generateSubtasks` | 给定父任务标题 + 截止时间，AI 生成按实际工作量排期的子任务（时间强约束在 `[当前时间, 父截止]` 内） |
| `aiRunCommand` | 命令栏 function calling，AI 解析「新建/编辑任务」并返回 `create_task` / `update_task` 工具调用 |
| `testAiConnection` | 验证 AI 配置是否可用 |

### 11.2 关键设计

- **显式时间上下文**：模型不知道"当前时刻"，prompt 中显式给出当前时间与区间天数，避免子任务 deadline 聚集
- **按工作量分配**：禁止机械平均分配时间，工作量大的子任务获得更长区间，最后一个子任务 deadline 接近父任务截止
- **AI 只负责复杂解析**：新建文件夹 / 移动 / 删除等简单指令由应用内自然语言解析器处理，AI 不输出这些工具调用
- **时间钳制**：`clampTs` 把 AI 返回的时间戳强约束到合法区间，非法值丢弃
- **配置安全**：API Key 仅保存在本地 SQLite，不随同步上传
