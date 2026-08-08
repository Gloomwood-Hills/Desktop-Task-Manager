# 公共符号索引（VARIABLE_INDEX）

> 生成时间：2026-08-08（Task 0 文档扫描）
> 扫描范围：`src/` 下全部 `.ts/.tsx`（含 `src/data/sync/` 同步模块）与 `src-tauri/src/lib.rs`
> 频率说明：`≈N 处` 为基于全文检索（grep）的行级匹配估算值，含定义、导出与引用；`（M 文件）` 表示涉及文件数。

---

## 1. 类型定义

| 变量名 | 变量注释（描述） | 出现位置 | 出现频率 |
| --- | --- | --- | --- |
| `Folder` | 文件夹实体接口：id / name / parentId / sortOrder / createdAt / updatedAt | `src/data/types.ts` | ≈54 处（10 文件） |
| `Priority` | 优先级字面量类型：`'normal' \| 'important'` | `src/data/types.ts` | ≈12 处 |
| `Task` | 任务实体接口：标题/备注/文件夹/父子任务/开始与截止/优先级/排序/完成/软删 | `src/data/types.ts` | ≈110 处（14 文件） |
| `Theme` | 主题字面量类型：`'light' \| 'dark'` | `src/data/types.ts` | ≈15 处 |
| `SortType` | 排序方式字面量：`'deadline' \| 'name' \| 'createdAt' \| 'manual'` | `src/data/types.ts` | ≈13 处 |
| `Settings` | 设置实体接口：主题/毛玻璃/透明度/排序/重要置顶/提醒/自动置顶/自启动/截止渐变 + V2 视图模式/WebDAV 同步字段（见下方子表） | `src/data/types.ts` | ≈78 处（11 文件） |
| `WindowState` | 窗口状态接口：位置 x/y、大小 width/height、折叠文件夹集合 | `src/data/types.ts` | ≈33 处（7 文件） |
| `TaskWithSubtasks` | 任务 + 递归子任务树（`Task` 扩展 `subtasks`） | `src/data/types.ts` | ≈35 处 |
| `FolderWithTasks` | 文件夹 + 直属任务树（`Folder` 扩展 `tasks`） | `src/data/types.ts` | ≈13 处 |
| `FolderNode` | 文件夹树节点：任务树 + 递归子文件夹（`children`） | `src/data/types.ts` | ≈30 处 |
| `SyncSettings` | WebDAV 同步设置：URL / 用户名 / 密码（密码仅本地保存） | `src/data/sync/types.ts` | ≈3 处 |
| `SyncSnapshot` | 云同步数据快照（版本化 JSON：schemaVersion/exportedAt/deviceId/folders/tasks） | `src/data/sync/types.ts` | ≈12 处 |
| `SyncFolder` | 同步用文件夹传输格式 | `src/data/sync/types.ts` | ≈8 处 |
| `SyncTask` | 同步用任务传输格式 | `src/data/sync/types.ts` | ≈10 处 |
| `SYNC_SCHEMA_VERSION` | 快照结构版本号常量（当前 = 1，结构变更必须递增） | `src/data/sync/types.ts` | ≈4 处 |
| `UseTaskData` | `useTaskData` Hook 返回值接口（树/任务/设置/窗口状态及全部操作） | `src/hooks/useTaskData.ts` | ≈3 处 |
| `ContextMenuState` | 右键菜单状态：坐标 x/y、关联 taskId、可选 folderId | `src/components/contextMenu.tsx` | ≈3 处 |
| `ThemeMode` | 设置面板主题模式别名（`'light' \| 'dark'`） | `src/components/settingsPanel.tsx` | ≈3 处 |
| `ViewMode` | 视图模式字面量：`'list' \| 'calendar' \| 'day'`（V2：列表 / 日历 / 日视图） | `src/data/types.ts` | ≈9 处（3 文件） |
| `WebdavFetchResult` | WebDAV GET 结果接口：status / exists / lastModified / content | `src/data/sync/webdavClient.ts` | ≈4 处 |
| `WebdavPutResult` | WebDAV PUT 结果接口：status / lastModified | `src/data/sync/webdavClient.ts` | ≈3 处 |
| `SyncResult` | 同步结果接口：status（`'uploaded' \| 'downloaded' \| 'skipped' \| 'error'`）+ message | `src/data/sync/engine.ts` | ≈5 处 |
| `SyncProbe` | 远端探测结果：remoteExists / remoteExportedAt / remoteModified | `src/data/sync/engine.ts` | ≈4 处 |
| `CalendarViewProps` | 日历视图组件属性：tasks + onSelectDay（回调当天 00:00 时间戳） | `src/components/calendarView.tsx` | ≈3 处 |
| `DayViewProps` | 日视图组件属性：tasks / date / onDateChange / onNewTask | `src/components/dayView.tsx` | ≈3 处 |

#### Settings 新增字段（V2）

| 字段名 | 变量注释（描述） | 出现位置 | 出现频率 |
| --- | --- | --- | --- |
| `Settings.viewMode` | 当前视图模式（默认 `'list'`，切换视图后持久化回写） | `src/data/types.ts` | ≈23 处（4 文件） |
| `Settings.webdavUrl` | WebDAV 服务器地址（默认 ''） | `src/data/types.ts` | ≈15 处（6 文件） |
| `Settings.webdavUsername` | WebDAV 账号（默认 ''） | `src/data/types.ts` | ≈15 处（6 文件） |
| `Settings.webdavPassword` | WebDAV 密码（仅保存在本机数据库，默认 ''） | `src/data/types.ts` | ≈15 处（6 文件） |
| `Settings.lastSyncedAt` | 上次成功同步时间戳（毫秒），null 表示尚未同步 | `src/data/types.ts` | ≈20 处（5 文件） |

## 2. Repositories（`src/data/repositories/`）

| 类 / 方法 | 变量注释（描述） | 出现位置 | 出现频率 |
| --- | --- | --- | --- |
| `FolderRepository` | 文件夹数据访问类（构造函数注入 Database） | `src/data/repositories/FolderRepository.ts` | ≈11 处 |
| ├ `.getAll()` | 获取全部文件夹（按 sortOrder 升序） | `FolderRepository.ts` | ≈4 处 |
| ├ `.getById(id)` | 按 id 查询文件夹 | `FolderRepository.ts` | ≈4 处 |
| ├ `.getByParentId(parentId)` | 按父 id 查询子文件夹（null = 顶层） | `FolderRepository.ts` | ≈3 处 |
| ├ `.create(folder)` | 新建文件夹（自动补 createdAt/updatedAt） | `FolderRepository.ts` | ≈2 处 |
| ├ `.update(folder)` | 更新文件夹名称/父级/排序 | `FolderRepository.ts` | ≈2 处 |
| ├ `.delete(id)` | 物理删除文件夹（级联删除子项） | `FolderRepository.ts` | ≈2 处 |
| ├ `.updateSortOrder(id, order)` | 更新单个文件夹排序号 | `FolderRepository.ts` | ≈2 处 |
| └ `.reorderFolders(orderedIds)` | 手动排序：按给定顺序批量更新同级 sortOrder | `FolderRepository.ts` | ≈2 处 |
| `TaskRepository` | 任务数据访问类 | `src/data/repositories/TaskRepository.ts` | ≈10 处 |
| ├ `.getAll()` | 获取全部未删除任务 | `TaskRepository.ts` | ≈2 处 |
| ├ `.getById(id)` | 按 id 查询任务 | `TaskRepository.ts` | ≈5 处 |
| ├ `.getByFolderId(folderId)` | 按文件夹查询任务 | `TaskRepository.ts` | ≈3 处 |
| ├ `.getByParentId(parentId)` | 按父任务查询子任务 | `TaskRepository.ts` | ≈1 处 |
| ├ `.getCompleted(folderId?)` | 查询根级已完成任务（可选按文件夹） | `TaskRepository.ts` | ≈2 处 |
| ├ `.create(task)` | 新建任务（追加到容器末尾，自动补默认字段） | `TaskRepository.ts` | ≈2 处 |
| ├ `.reorderTasks(orderedIds)` | 手动排序：批量更新任务 sortOrder | `TaskRepository.ts` | ≈2 处 |
| ├ `.update(id, updates)` | 更新任务字段（标题/备注/时间/优先级等） | `TaskRepository.ts` | ≈2 处 |
| ├ `.softDelete(id)` | 软删除任务（deleted=1） | `TaskRepository.ts` | ≈2 处 |
| ├ `.restore(id)` | 恢复软删除任务并清空完成状态 | `TaskRepository.ts` | ≈2 处 |
| ├ `.markCompleted(id, completed)` | 标记完成/未完成（联动 completedAt） | `TaskRepository.ts` | ≈4 处 |
| ├ `.getSubtaskCount(parentId)` | 统计子任务总数 | `TaskRepository.ts` | ≈2 处 |
| └ `.getCompletedSubtaskCount(parentId)` | 统计已完成子任务数 | `TaskRepository.ts` | ≈2 处 |
| `SettingsRepository` | 设置数据访问类 | `src/data/repositories/SettingsRepository.ts` | ≈8 处 |
| ├ `.get()` | 读取唯一设置行（id='default'） | `SettingsRepository.ts` | ≈3 处 |
| ├ `.update(settings)` | 更新设置字段（部分更新） | `SettingsRepository.ts` | ≈9 处 |
| ├ `.updateTheme(theme)` | 更新主题 | `SettingsRepository.ts` | ≈2 处 |
| ├ `.updateGlassEffect(bool)` | 更新毛玻璃开关 | `SettingsRepository.ts` | ≈2 处 |
| ├ `.updateTransparency(n)` | 更新透明度 | `SettingsRepository.ts` | ≈2 处 |
| ├ `.updateSortType(type)` | 更新排序方式 | `SettingsRepository.ts` | ≈2 处 |
| ├ `.updateImportantTop(bool)` | 更新重要任务置顶开关 | `SettingsRepository.ts` | ≈2 处 |
| ├ `.updateReminderEnabled(bool)` | 更新提醒开关 | `SettingsRepository.ts` | ≈2 处 |
| └ `.updateReminderOffset(offset)` | 更新提醒提前量（秒） | `SettingsRepository.ts` | ≈2 处 |
| `WindowStateRepository` | 窗口状态数据访问类 | `src/data/repositories/WindowStateRepository.ts` | ≈7 处 |
| ├ `.get()` | 读取唯一窗口状态行（id='default'） | `WindowStateRepository.ts` | ≈3 处 |
| ├ `.update(windowState)` | 更新窗口状态（位置/大小/折叠集合） | `WindowStateRepository.ts` | ≈5 处 |
| ├ `.updatePosition(x, y)` | 更新窗口位置 | `WindowStateRepository.ts` | ≈2 处 |
| ├ `.updateSize(w, h)` | 更新窗口大小 | `WindowStateRepository.ts` | ≈2 处 |
| └ `.updateCollapsedFolders(ids)` | 更新折叠文件夹集合 | `WindowStateRepository.ts` | ≈2 处 |

## 3. Services（`src/services/`）

| 类 / 方法 | 变量注释（描述） | 出现位置 | 出现频率 |
| --- | --- | --- | --- |
| `FolderService` | 文件夹业务层（组合 FolderRepository + TaskRepository） | `src/services/FolderService.ts` | ≈7 处 |
| ├ `.getAllFolders()` | 获取全部文件夹 | `FolderService.ts` | ≈2 处 |
| ├ `.getFolderById(id)` | 按 id 获取文件夹 | `FolderService.ts` | ≈1 处 |
| ├ `.getByParentId(parentId)` | 获取指定父级下的文件夹 | `FolderService.ts` | ≈1 处 |
| ├ `.createFolder(name, parentId?)` | 创建文件夹（自动生成 id 与 sortOrder） | `FolderService.ts` | ≈2 处 |
| ├ `.updateFolder(id, name)` | 重命名文件夹 | `FolderService.ts` | ≈2 处 |
| ├ `.deleteFolder(id)` | 删除文件夹 | `FolderService.ts` | ≈2 处 |
| ├ `.updateSortOrder(id, order)` | 更新文件夹排序号 | `FolderService.ts` | ≈1 处 |
| ├ `.reorderFolders(orderedIds)` | 手动排序：持久化同级文件夹顺序 | `FolderService.ts` | ≈2 处 |
| ├ `.getFolderWithTasks(id)` | 获取文件夹及其任务树 | `FolderService.ts` | ≈1 处 |
| └ `.getAllFoldersWithTasks()` | 获取全部文件夹及其任务树 | `FolderService.ts` | ≈1 处 |
| `TaskService` | 任务业务层 | `src/services/TaskService.ts` | ≈10 处 |
| ├ `.getAllTasks()` | 获取全部未删除任务 | `TaskService.ts` | ≈2 处 |
| ├ `.getTaskById(id)` | 按 id 获取任务 | `TaskService.ts` | ≈1 处 |
| ├ `.getTasksByFolderId(folderId)` | 按文件夹获取任务 | `TaskService.ts` | ≈1 处 |
| ├ `.getCompletedTasks(folderId?)` | 获取已完成任务 | `TaskService.ts` | ≈2 处 |
| ├ `.createTask(title, folderId, options?)` | 创建任务（支持备注/父任务/时间/优先级） | `TaskService.ts` | ≈2 处 |
| ├ `.updateTask(id, updates)` | 更新任务字段 | `TaskService.ts` | ≈2 处 |
| ├ `.reorderTasks(orderedIds)` | 手动排序：持久化任务顺序 | `TaskService.ts` | ≈2 处 |
| ├ `.deleteTask(id)` | 软删除任务 | `TaskService.ts` | ≈2 处 |
| ├ `.restoreTask(id)` | 恢复已删除任务 | `TaskService.ts` | ≈2 处 |
| ├ `.toggleTaskCompleted(id)` | 切换完成状态并递归联动父任务 | `TaskService.ts` | ≈2 处 |
| ├ `.getParentTaskCompletion(parentId)` | 获取父任务子任务完成进度 {completed, total} | `TaskService.ts` | ≈2 处 |
| └ `.buildTaskTree(tasks)` | 将扁平任务列表构建为树 | `TaskService.ts` | ≈1 处 |
| `SettingsService` | 设置业务层 | `src/services/SettingsService.ts` | ≈6 处 |
| ├ `.getSettings()` | 获取设置 | `SettingsService.ts` | ≈2 处 |
| ├ `.updateSettings(patch)` | 更新设置（部分） | `SettingsService.ts` | ≈2 处 |
| ├ `.setTheme(theme)` | 设置主题 | `SettingsService.ts` | ≈2 处 |
| ├ `.setGlassEffect(bool)` | 设置毛玻璃 | `SettingsService.ts` | ≈1 处 |
| ├ `.setTransparency(n)` | 设置透明度 | `SettingsService.ts` | ≈1 处 |
| ├ `.setSortType(type)` | 设置排序方式 | `SettingsService.ts` | ≈1 处 |
| ├ `.setReminderEnabled(bool)` | 设置提醒开关 | `SettingsService.ts` | ≈1 处 |
| └ `.setReminderOffset(offset)` | 设置提醒提前量 | `SettingsService.ts` | ≈1 处 |
| `WindowStateService` | 窗口状态业务层 | `src/services/WindowStateService.ts` | ≈5 处 |
| ├ `.getWindowState()` | 获取窗口状态 | `WindowStateService.ts` | ≈2 处 |
| ├ `.saveWindowState(patch)` | 保存窗口状态（位置/大小/折叠集合） | `WindowStateService.ts` | ≈2 处 |
| ├ `.savePosition(x, y)` | 保存窗口位置 | `WindowStateService.ts` | ≈1 处 |
| ├ `.saveSize(w, h)` | 保存窗口大小 | `WindowStateService.ts` | ≈1 处 |
| └ `.saveCollapsedFolders(ids)` | 保存折叠文件夹集合 | `WindowStateService.ts` | ≈1 处 |

## 4. 工具函数

| 变量名 | 变量注释（描述） | 出现位置 | 出现频率 |
| --- | --- | --- | --- |
| `getDatabase()` | 初始化并返回 SQLite 连接（含建表/迁移/默认数据） | `src/data/database.ts` | ≈6 处（4 文件） |
| `mapBooleanFields()` | 将数据库 1/0 行字段映射为布尔值 | `src/data/utils.ts` | ≈8 处 |
| `generateId()` | 生成唯一 id（时间戳 + 随机串） | `src/data/utils.ts` | ≈5 处 |
| `parseJSONField()` | 解析 JSON 字符串字段（失败时原样返回） | `src/data/utils.ts` | ≈6 处 |
| `buildTaskTree()` | 扁平任务列表 → 任务树（TaskWithSubtasks） | `src/data/utils.ts` | ≈12 处 |
| `compareByName()` | 名称排序比较器（A-Z 直觉排序，中英混排） | `src/data/utils.ts` | ≈5 处 |
| `sortTasksByType()` | 按设置排序任务列表（支持 importantTop 置顶） | `src/data/utils.ts` | ≈4 处 |
| `sortFolders()` | 按设置排序同级文件夹 | `src/data/utils.ts` | ≈4 处 |
| `buildFolderTree()` | 扁平 folders + tasks → FolderNode 树 | `src/data/utils.ts` | ≈3 处 |
| `buildSnapshot()` | 应用数据 → 同步快照（显式逐字段映射） | `src/data/sync/snapshot.ts` | ≈4 处 |
| `parseSnapshot()` | 解析快照 JSON 并校验版本/结构（失败抛错） | `src/data/sync/snapshot.ts` | ≈4 处 |
| `snapshotToJson()` | 序列化快照为缩进 JSON | `src/data/sync/snapshot.ts` | ≈2 处 |
| `exportLocalSnapshot()` | 导出本地全量数据为同步快照 | `src/data/sync/exporter.ts` | ≈2 处 |
| `formatDeadlineRel()` | 相对标签：明天/后天/本周x/下周x | `src/components/utils/formatDate.ts` | ≈4 处 |
| `formatDeadlineYMD()` | 年月日标签（含具体时间时附 HH:mm） | `src/components/utils/formatDate.ts` | ≈7 处 |
| `formatDeadline()` | 截止时间组合文案（相对标签 + 年月日） | `src/components/utils/formatDate.ts` | ≈9 处 |
| `formatStartDate()` | 开始日期徽章：MM-DD（含时间附 HH:mm） | `src/components/utils/formatDate.ts` | ≈3 处 |
| `formatCompletedAt()` | 完成时间：7月19日 | `src/components/utils/formatDate.ts` | ≈2 处 |
| `parseNaturalDateTime()` | 自然语言日期解析（今天/周X/月底/X小时后 等）→ 时间戳 | `src/components/utils/formatDate.ts` | ≈15 处 |

#### V2 新增：平台检测

| 变量名 | 变量注释（描述） | 出现位置 | 出现频率 |
| --- | --- | --- | --- |
| `isMobile` | 平台检测常量：userAgent 含 "Android" 判定移动端（模块加载时一次性求值） | `src/data/platform.ts` | ≈23 处（4 文件） |

#### V2 新增：同步模块（`src/data/sync/`）

| 变量名 | 变量注释（描述） | 出现位置 | 出现频率 |
| --- | --- | --- | --- |
| `joinWebdavPath()` | 拼接服务地址与远端路径，容错末尾/开头斜杠避免双斜杠 | `src/data/sync/webdavClient.ts` | ≈2 处 |
| `webdavFetch()` | GET 远端文件（存在性探测 + 内容下载；Rust 侧直连规避 CORS） | `src/data/sync/webdavClient.ts` | ≈4 处（3 文件） |
| `webdavPut()` | PUT 上传内容到远端（不存在创建、存在覆盖） | `src/data/sync/webdavClient.ts` | ≈3 处（3 文件） |
| `importSnapshot()` | 从快照覆盖导入本地库（校验通过后全量替换） | `src/data/sync/importer.ts` | ≈4 处（3 文件） |
| `probeRemote()` | 探测远端：GET 备份文件并解析 exportedAt（损坏/版本不兼容抛错） | `src/data/sync/engine.ts` | ≈5 处（3 文件） |
| `uploadLocal()` | 上传本地快照到远端（buildSnapshot → snapshotToJson → webdavPut） | `src/data/sync/engine.ts` | ≈5 处（3 文件） |
| `downloadRemote()` | 从远端下载快照并覆盖本地库 | `src/data/sync/engine.ts` | ≈5 处（3 文件） |
| `syncAuto()` | 自动同步决策：Last-Modified Wins，较新者胜、相等跳过、冲突附说明 | `src/data/sync/engine.ts` | ≈5 处（3 文件） |
| `getDeviceId()` | 稳定设备标识：localStorage 持久化，`dtm-` 前缀（区分跨端数据来源） | `src/data/sync/engine.ts` | ≈4 处 |
| `REMOTE_PATH` | 远端备份文件相对路径常量（`desktop-task-manager/backup.json`） | `src/data/sync/engine.ts` | ≈5 处 |

## 5. Hooks

| 变量名 | 变量注释（描述） | 出现位置 | 出现频率 |
| --- | --- | --- | --- |
| `useTaskData()` | 应用核心数据 Hook：加载 DB/Service、构建任务树、暴露全部任务/文件夹/设置/窗口状态操作 | `src/hooks/useTaskData.ts` | ≈3 处 |

## 6. Rust 命令（`src-tauri/src/lib.rs`）

| 变量名 | 变量注释（描述） | 出现位置 | 出现频率 |
| --- | --- | --- | --- |
| `exit_app` | Tauri 命令：前端"设置 → 退出"调用，退出应用（`app.exit(0)`） | `src-tauri/src/lib.rs`（注册于 `invoke_handler`） | ≈3 处（Rust 2 + 前端 App.tsx invoke 1） |
| `webdav_fetch` | Tauri 命令：WebDAV GET 远端文件（Rust 直连规避 CORS，返回 status/exists/lastModified/content） | `src-tauri/src/webdav.rs`（注册于 `invoke_handler`） | ≈3 处（Rust 2 + 前端 webdavClient invoke 1） |
| `webdav_put` | Tauri 命令：WebDAV PUT 上传内容（不存在创建、存在覆盖） | `src-tauri/src/webdav.rs`（注册于 `invoke_handler`） | ≈3 处（Rust 2 + 前端 webdavClient invoke 1） |

## 7. 组件（`src/components/`，默认导出组件与导出函数）

| 变量名 | 变量注释（描述） | 出现位置 | 出现频率 |
| --- | --- | --- | --- |
| `TopBar` | 顶栏：搜索框 + 设置/新建按钮 + 锁定位置 | `src/components/topBar.tsx` | ≈2 处 |
| `FolderTree` | 文件夹树：递归渲染文件夹层级 + 任务项，支持手动拖动排序 | `src/components/folderTree.tsx` | ≈2 处 |
| `CompletedSection` | 已完成区域（默认折叠，点击恢复任务） | `src/components/completedSection.tsx` | ≈2 处 |
| `ContextMenu` | 右键菜单（任务/文件夹/空白区三类菜单项） | `src/components/contextMenu.tsx` | ≈2 处 |
| `QuickCapture` | 新建任务弹窗：自然语言日期解析 + 快捷项 + 可选 `initialDate` 预填默认截止日期 | `src/components/quickCapture.tsx` | ≈2 处 |
| `EditTaskDialog` | 任务编辑弹窗：标题/备注/开始与截止/重要 | `src/components/editTaskDialog.tsx` | ≈2 处 |
| `SettingsPanel` | 设置面板（外观/排序/提醒/同步四 Tab） | `src/components/settingsPanel.tsx` | ≈2 处 |
| `TaskItem` | 任务卡片：复选框/标题/优先级/日期徽章 + 递归子任务 | `src/components/taskItem.tsx` | ≈3 处 |
| `PromptDialog` | 文本输入对话框（替代 window.prompt） | `src/components/dialogPrompt.tsx` | ≈5 处 |
| `ConfirmDialog` | 确认对话框（替代 window.confirm） | `src/components/dialogPrompt.tsx` | ≈3 处 |
| `Highlight` | 搜索关键词高亮组件 | `src/components/taskItem.tsx` | ≈5 处 |
| `App` | 应用根组件（默认导出，main.tsx 挂载） | `src/App.tsx` | ≈2 处 |
| `CalendarView` | 日历月视图：固定 6×7 网格，任务数徽标，选中日回调切日视图 | `src/components/calendarView.tsx` | ≈2 处 |
| `DayView` | 日视图：当天任务列表 + 前后翻日 + 新建按钮 | `src/components/dayView.tsx` | ≈2 处 |
| `ViewTabs` | 视图切换入口（App.tsx 内部组件）：桌面顶部胶囊按钮组 / 移动端底部导航条 | `src/App.tsx` | ≈3 处 |

---

## 附：模块统一出口

| 文件 | 导出的公共符号 |
| --- | --- |
| `src/data/index.ts` | `getDatabase`、四个 Repository、types 中 10 个类型（V2 新增 `ViewMode`）、`generateId/buildTaskTree/mapBooleanFields/parseJSONField` |
| `src/data/repositories/index.ts` | `FolderRepository / TaskRepository / SettingsRepository / WindowStateRepository` |
| `src/services/index.ts` | `FolderService / TaskService / SettingsService / WindowStateService` |
| `src/data/sync/index.ts` | `SYNC_SCHEMA_VERSION`、Sync 类型、`buildSnapshot/parseSnapshot/snapshotToJson/exportLocalSnapshot/importSnapshot`、WebDAV 客户端（`webdavFetch/webdavPut/joinWebdavPath` + 结果类型）、同步引擎（`REMOTE_PATH/probeRemote/uploadLocal/downloadRemote/syncAuto/getDeviceId` + `SyncResult/SyncProbe`） |
