# Desktop Task Manager 桌面任务管理器

> 一款嵌入 Windows 桌面层、配套 Android 桌面小部件、支持 WebDAV 双向合并同步的跨端任务管理器——任务清单直接长在桌面上，手机小部件读写同一份数据，云端合并不丢改。

## 与其他 Todo 应用的区别

| 维度 | 常见 Todo 应用 | 本项目 |
| --- | --- | --- |
| 桌面形态 | 独立窗口 / 托盘弹窗 | **嵌入桌面层（WorkerW）**，与壁纸同级常驻，不占任务栏 |
| 手机端 | 独立 App | **桌面小部件**直接展示任务、新建任务、切换完成，无需打开 App |
| 数据同步 | 厂商云账号 / 第三方服务 | **WebDAV 双向合并**（坚果云等），按记录 Last-Write-Wins，删除墓碑传播，不整库覆盖 |
| 时间输入 | 手动选日期 | **自然语言解析**（"明天交报告""一小时后开会""下周一9点"） |

## 功能特性

### 桌面端（Windows）

- **桌面嵌入式窗口**：窗口挂载到 Windows WorkerW 桌面层，随桌面常驻显示，不占用任务栏
- **多视图切换**：列表视图 / 日历月视图 / 日视图，按需切换
- **文件夹 + 子任务**：两级结构组织任务，按文件夹归类
- **快捷记录**：输入框支持自然语言识别日期与时间（今天 / 明天 / 后天 / 下周X / 月底 / 一小时后 / 具体日期等）
- **截止时间紧迫度渐变**：截止越近颜色越深（≤1天红、≤3天橙红、≤7天橙），可在设置中切换为直接红色
- **重要任务置顶**：重要未分类任务优先，含重要任务的文件夹次优先
- **提醒通知**：基于截止/开始时间弹出系统通知，支持相对偏移（提前15分钟/1小时/1天等）
- **窗口状态记忆**：记住位置与大小，重启后原位恢复
- **系统托盘 + 全局快捷键**：`Ctrl+Shift+Space` 快速唤起，托盘菜单操作
- **开机自启动**：可选开机自动启动
- **本地 SQLite 存储**：数据保存在本地，不依赖网络
- **AI 智能助手**：命令栏可用自然语言让 AI 解析「新建/编辑任务」的多字段；任务可一键生成按实际工作量排期的子任务（兼容 DeepSeek / OpenAI / 通义 / Moonshot 等 OpenAI 风格接口，需在设置中配置）
- **Material 3 动效**：视图切换、对话框、任务增删、侧栏、Toast 等全链路过渡动画，仅用 transform/opacity 保证 GPU 流畅，并支持「减少动态效果」无障碍降级

### 手机端（Android 小部件）

- **桌面小部件**：4×3 小部件直接展示任务列表（前 6 条，可翻页）
- **小部件内新建任务**：点击「＋」弹出独立新建任务界面，支持文件夹/重要/开始/截止/自然语言识别，保存后自动返回桌面
- **小部件内切换完成**：点击任务行即标记完成，已完成任务自动从小部件隐藏
- **小部件外观自定义**：主题（浅/深）、毛玻璃效果、透明度独立可调
- **与桌面端共享数据库**：小部件直接读写 App 的 SQLite 库，无需网络

### 云同步

- **WebDAV 双向合并同步**：兼容坚果云等支持 WebDAV 的云存储
- **记录级合并**：按 `id + updatedAt` 做 Last-Write-Wins，删除墓碑（`deleted=1`）参与传播，两端各自的新增/修改/删除都保留
- **流量优化**：gzip 压缩传输（JSON 压缩约 10 倍）、记录级相等判定跳过无变化同步、60 分钟定时兜底
- **瞬态失败重试**：429/5xx 退避重试，绝不把瞬态失败误判为"远端不存在"而覆盖
- **同步策略**：双向合并 / 仅上传 / 仅下载 可选

## 安装

### 桌面端

下载 [Release](https://github.com/Gloomwood-Hills/Desktop-Task-Manager/releases) 中的便携版 `DesktopTaskManager-v2.1.0.exe`，双击即可运行（免安装）。

### 手机端

下载 Release 中的 `desktop-task-manager-arm64-release.apk`，在 Android 手机上安装。安装后长按桌面 → 添加小部件 → 选择「桌面任务管理器」。

## 使用说明

- **添加任务**：顶部输入框输入内容，可用自然语言快速指定时间，如 `明天交报告`、`一小时后开会`、`下周一 9 点整理`
- **视图切换**：顶栏左侧切换列表 / 月历 / 日视图
- **文件夹**：对任务分类；任务可拖入文件夹
- **截止 / 开始时间**：日期为必选，具体时间可选
- **提醒**：到期弹出系统通知，可在任务上设置提醒偏移
- **设置**：外观（主题 / 截止渐变）、排序、提醒、同步（WebDAV）、开机自启动等

## 开发环境

```
Node.js ≥ 18
Rust (stable)
JDK 21（仅 Android 构建需要）
Android SDK + NDK（仅 Android 构建需要）
```

```bash
npm install            # 安装前端依赖
npm run dev            # Vite 前端开发服务器
npm run tauri dev      # Tauri 桌面调试模式
npm run build          # 前端构建（vite build）
npm run release        # 桌面端打包并归档便携版 exe 到 release/
npm test               # 运行同步引擎单元测试
```

### Android 小部件构建

小部件源码位于 `src-tauri/gen/android/app/src/main/java/com/desktop/taskmanager/`（已被 .gitignore 排除，需通过 `npm run tauri android init` 生成工程后拷入）。

构建命令（PowerShell）：

```powershell
$env:JAVA_HOME="D:\Android\jdk-21"
$env:ANDROID_HOME="D:\Android"
$env:NDK_HOME="D:\Android\ndk\<version>"
cd src-tauri\gen\android
.\gradlew.bat assembleRelease -PtargetList=aarch64 -ParchList=arm64 -PabiList=arm64-v8a
```

## 技术栈

- **Tauri 2**（Rust 后端 + WebView2 前端）
- **React 18 + TypeScript + Vite + Tailwind CSS**
- **motion（framer-motion v13）**：Material 3 运动系统动效
- **SQLite**（tauri-plugin-sql，本地存储，桌面与 Android 小部件共享）
- **tauri-plugin-notification**（系统通知）
- **tauri-plugin-autostart**（开机自启动）
- **reqwest**（Rust 侧 WebDAV HTTP 直连，规避 WebView CORS）
- **Android 原生小部件**（Kotlin / RemoteViews / AppWidgetProvider）

## 数据与隐私

- 所有数据默认仅保存在本机 SQLite 数据库中
- WebDAV 同步为可选功能，需用户自行配置云存储账号
- 应用无需注册登录，不收集任何用户数据

## 项目结构

```
src/                    前端（WebView 内运行，TypeScript + React）
  components/           UI 组件（quickCapture / calendarView / dayView / topBar / folderSidebar 等）
    utils/motion.ts     运动令牌与过渡变体（Material 3 动效）
  data/
    database.ts         SQLite 初始化与连接
    repositories/       Repository 模式数据访问层
    services/           业务服务层（aiClient.ts：AI 子任务生成 + 命令解析）
    sync/               WebDAV 同步引擎（engine / merge / snapshot / webdavClient）
  hooks/                useTaskData 等
src-tauri/              Rust 后端
  src/
    lib.rs              应用入口、WorkerW 桌面挂载、托盘、全局快捷键
    webdav.rs           WebDAV GET/PUT/MKCOL 命令（reqwest 直连）
  capabilities/         Tauri 权限配置（桌面 / Android 分离）
scripts/
  copy-release.mjs      打包产物归档脚本
```

## 许可证

MIT
