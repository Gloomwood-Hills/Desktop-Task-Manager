# Desktop Task Manager 桌面任务管理器

一款嵌入 Windows 桌面层的轻量任务管理应用。任务清单直接悬浮于桌面，随手记录、直观管理，无需打开独立窗口。

## 功能特性

- **桌面嵌入式窗口**：窗口嵌入 Windows 桌面层（WorkerW），随桌面常驻显示
- **文件夹 / 子任务**：两级结构组织任务，按文件夹归类管理
- **快捷记录**：支持自然语言识别日期与时间（今天 / 明天 / 后天 / 下周X / 月底 / 一小时后 / X年X月X日 / YY.MM.DD 等）
- **截止时间渐变提醒**：截止日期越近颜色越深，临近 1 天转为红色（可在设置中关闭渐变，直接显示红色）
- **重要任务置顶**：重要未分类任务优先，含重要任务的文件夹次优先
- **窗口状态记忆**：记住位置与大小，重启后原位恢复
- **开机自启动**：可选开机自动启动，桌面直接出现应用窗口
- **本地数据存储**：数据保存于本地 SQLite 数据库，不依赖网络
- **低资源占用**：启动快、内存占用小，适合长时间驻留

## 安装

### 方式一：安装程序（推荐）

下载 [V1 Release](https://github.com/Gloomwood-Hills/Desktop-Task-Manager/releases) 中的 `DesktopTaskManager-v1.0.0-setup.exe`，运行后按提示安装（可选安装路径、可选语言）。

### 方式二：MSI 包

`DesktopTaskManager-v1.0.0-x64.msi` 支持企业批量部署。

### 卸载

- 通过 Windows「设置 → 应用」卸载；或
- 运行 Release 中的 `Uninstall.ps1` 清理工具。

## 使用说明

- **添加任务**：在顶部输入框记录内容，可使用自然语言快速指定时间，例如 `明天交报告`、`一小时后开会`、`下周一 9 点整理`。
- **文件夹**：用于对任务分类；任务可拖入文件夹或直接创建于未分类区域。
- **截止 / 开始时间**：日期为必选，具体时间为可选；未选具体时间时只显示日期。
- **提醒**：应用会轮询任务时间，到期弹出系统通知。
- **设置**：外观（主题 / 截止渐变）、排序、提醒、同步（开机自启动）等。

## 开发环境

```
Node.js ≥ 18
Rust (stable)
```

```bash
npm install            # 安装前端依赖
npm run tauri dev      # 开发模式（热更新）
npm run tauri build    # 打包（产物在 src-tauri/target/release/bundle/）
```

## 技术栈

- **Tauri 2**（Rust 后端 + WebView 前端）
- **React 18 + TypeScript + Vite + Tailwind CSS**
- **SQLite**（tauri-plugin-sql，本地存储）
- **tauri-plugin-notification**（系统通知）
- **tauri-plugin-autostart**（开机自启动）

## 数据与隐私

- 所有数据仅保存在本机 SQLite 数据库中，无任何云端上传。
- 应用为离线单机应用，无需注册登录。

## 版本

- **V1.0.0**：首个正式版本，支持上述全部功能。
