# 变量名大全

统一管理项目中的变量命名，方便全局搜索和重构。

## 数据类型（types.ts）

| 变量名 | 描述 | 类型 | 出现位置 | 出现频率 |
|--------|------|------|----------|----------|
| Folder | 文件夹接口 | interface | src/data/types.ts | 1 |
| Task | 任务接口 | interface | src/data/types.ts | 1 |
| Settings | 设置接口 | interface | src/data/types.ts | 1 |
| WindowState | 窗口状态接口 | interface | src/data/types.ts | 1 |
| TaskWithSubtasks | 带子任务的任务 | interface | src/data/types.ts | 1 |
| FolderWithTasks | 带任务的文件夹 | interface | src/data/types.ts | 1 |
| Priority | 优先级类型 | type | src/data/types.ts | 1 |
| Theme | 主题类型 | type | src/data/types.ts | 1 |
| SortType | 排序类型 | type | src/data/types.ts | 1 |

## 数据库层（database.ts）

| 变量名 | 描述 | 类型 | 出现位置 | 出现频率 |
|--------|------|------|----------|----------|
| db | 数据库连接实例 | Database \| undefined | src/data/database.ts | 5 |
| initError | 初始化错误记录 | Error \| null | src/data/database.ts | 2 |
| appDir | 应用数据目录路径 | string | src/data/database.ts | 1 |
| dbPath | 数据库文件路径 | string | src/data/database.ts | 1 |

## Repository层

### TaskRepository.ts

| 变量名 | 描述 | 类型 | 出现位置 | 出现频率 |
|--------|------|------|----------|----------|
| taskRepository | 任务仓库实例 | TaskRepository | src/services/TaskService.ts | 1 |
| TaskUpdateFields | 允许更新的任务字段类型 | type | src/data/repositories/TaskRepository.ts | 1 |

### FolderRepository.ts

| 变量名 | 描述 | 类型 | 出现位置 | 出现频率 |
|--------|------|------|----------|----------|
| folderRepository | 文件夹仓库实例 | FolderRepository | src/services/FolderService.ts | 1 |

### SettingsRepository.ts

| 变量名 | 描述 | 类型 | 出现位置 | 出现频率 |
|--------|------|------|----------|----------|
| settingsRepository | 设置仓库实例 | SettingsRepository | src/services/SettingsService.ts | 1 |

### WindowStateRepository.ts

| 变量名 | 描述 | 类型 | 出现位置 | 出现频率 |
|--------|------|------|----------|----------|
| windowStateRepository | 窗口状态仓库实例 | WindowStateRepository | src/services/WindowStateService.ts | 1 |

## Service层

### TaskService.ts

| 变量名 | 描述 | 类型 | 出现位置 | 出现频率 |
|--------|------|------|----------|----------|
| newCompleted | 新的完成状态 | boolean | src/services/TaskService.ts | 2 |
| updated | 更新后的任务 | Task \| null | src/services/TaskService.ts | 2 |
| completed | 已完成子任务数量 | number | src/services/TaskService.ts | 2 |
| total | 子任务总数 | number | src/services/TaskService.ts | 2 |
| allCompleted | 是否全部完成 | boolean | src/services/TaskService.ts | 1 |
| parentTask | 父任务 | Task \| null | src/services/TaskService.ts | 1 |
| taskMap | 任务映射表 | Map<string, TaskWithSubtasks> | src/services/TaskService.ts | 1 |
| rootTasks | 根任务列表 | TaskWithSubtasks[] | src/services/TaskService.ts | 1 |
| taskWithSubtasks | 带子任务的任务项 | TaskWithSubtasks | src/services/TaskService.ts | 1 |

### FolderService.ts

| 变量名 | 描述 | 类型 | 出现位置 | 出现频率 |
|--------|------|------|----------|----------|
| sortOrder | 排序顺序 | number | src/services/FolderService.ts | 2 |
| folders | 文件夹列表 | Folder[] | src/services/FolderService.ts | 2 |
| tasks | 任务列表 | Task[] | src/services/FolderService.ts | 2 |
| taskTree | 任务树结构 | TaskWithSubtasks[] | src/services/FolderService.ts | 2 |
| folderWithTasks | 带任务的文件夹 | FolderWithTasks | src/services/FolderService.ts | 1 |

## 工具函数（utils.ts）

| 变量名 | 描述 | 类型 | 出现位置 | 出现频率 |
|--------|------|------|----------|----------|
| result | 映射结果对象 | T | src/data/utils.ts | 3 |
| key | 对象属性键 | string | src/data/utils.ts | 2 |
| value | JSON字段值 | string \| T | src/data/utils.ts | 1 |

## 常量命名规范

| 常量名 | 描述 | 类型 | 出现位置 |
|--------|------|------|----------|
| MAX_RETRY_COUNT | 最大重试次数 | number | - |
| DEFAULT_THEME | 默认主题 | Theme | - |
| DEFAULT_TRANSPARENCY | 默认透明度 | number | - |

## 命名规则

### 类型命名
- 接口使用 PascalCase（首字母大写）：`Folder`, `Task`, `Settings`
- 类型别名使用 PascalCase：`Priority`, `Theme`, `SortType`

### 变量命名
- 实例变量使用 camelCase：`taskRepository`, `folderRepository`
- 局部变量使用 camelCase：`newCompleted`, `updated`, `taskMap`
- 常量使用 UPPER_SNAKE_CASE：`MAX_RETRY_COUNT`

### 文件命名
- 使用 camelCase：`taskRepository.ts`, `taskService.ts`
- 文件名体现内容职责