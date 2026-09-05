# 交接文档 —— 重复任务"撤销完成产生重复实例"Bug（待下一位修复）

> 项目：desktop-task-manager（Tauri v2 桌面 + Android 壳 + 小部件）
> 分支：`v2.1-rework` ｜ 本 Bug **仍未解决**，请下一位接手。

---

## 0. 现象（用户复现）
1. 建一个**重复**任务（如「每天」，需设截止时间）。
2. **点击勾选完成**该任务 → 自动生成"下一实例"（正常）。
3. **去「已完成」区点击该任务（撤销完成）** → 任务列表（或已完成/活动区）出现**两条同样的重复任务**。
4. 反复 完成→撤销 可**越积越多（数据爆炸）**。

---

## 1. 涉及代码
| 文件 | 作用 |
|---|---|
| `src/services/TaskService.ts` | `toggleTaskCompleted`、`spawnNextInstance`、`restoreTask` |
| `src/data/repositories/TaskRepository.ts` | `create`/`update`/`getById`/`softDelete`/`restore`/`getCompletedCountBySeries` |
| `src/data/types.ts` | `Task.repeatSeriesId` / `Task.repeatNextId` |
| `src/data/database.ts` | Task 建表 + 迁移（`migrateTaskAddReminderRepeat` 加 `repeatNextId`） |
| `src/App.tsx` | `handleToggleCompleted`（复选）、`handleRestore`（已完成区）、`handleUndo`（Ctrl+Z） |
| `src/components/completedSection.tsx` | 已完成区行 `onClick → onRestore` |
| `src-tauri/.../TaskWidgetProvider.kt` | **小部件**的完成/撤销（Kotlin，直写 DB，绕过 TS） |

---

## 2. 已做的修复（仍然无效）
### 2.1 思路：记录"自动生成的下一实例"，撤销时删它
- `Task` 新增 **`repeatNextId`**（完成时把自动生成的下一实例 id 写到父任务）。
- `spawnNextInstance`：创建 A2 后 `update(父任务, { repeatNextId: A2.id })`。
- **撤销完成清理**：若父任务是重复任务且 `repeatNextId` 存在，且该下一实例**仍未完成**，则 `softDelete` 它，并清空父任务 `repeatNextId`。

### 2.2 清理逻辑写在了**两条路径**：
- `toggleTaskCompleted`（勾选撤销 / Ctrl+Z 路径）：
  ```
  if (updated && !newCompleted && task.repeatRule && task.repeatNextId) { ... 删下一实例 ... }
  ```
- `restoreTask`（**已完成区点击**路径，这是用户撤销主要走的路）：
  ```
  const task = await taskRepository.getById(id);   // getById 只过滤 deleted=0，已完成任务能取到
  const ok = await taskRepository.restore(id);      // repo.restore 置 completed=0
  if (ok && task && !task.deleted && task.repeatRule && task.repeatNextId) { ... 删下一实例 ... }
  ```

### 2.3 为何理论可行却没生效（请重点排查）
1. **`repeatNextId` 是否真的被持久化？**
   - `spawnNextInstance` 用 `taskRepository.update(父task.id, { repeatNextId })` 写；`update` 内部 `getById` 能取到已完成任务（deleted=0）。**可先在完成一个重复任务后查 `Task` 表确认 `repeatNextId` 是否非空**（怀疑点）。
2. **旧库残留重复行**：
   - 早版本产生过大量重复实例（且旧副本**没有 `repeatNextId` 关联**）。本修复只删"当前 `repeatNextId` 指向的那一个"，**删不干净历史残留** → 用户仍看到多条。**建议：撤销时按 `repeatSeriesId` 删除所有未完成的同系列实例**（不只删 `repeatNextId` 那一条）。
3. **小部件完成路径绕过 TS**：
   - `TaskWidgetProvider.handleToggleComplete`（Kotlin）**直接写 DB `completed=1`**，**不经过** `TaskService.toggleTaskCompleted` → **不生成下一实例、也不写 `repeatNextId`**。这会造成：在小部件上完成的重复任务，App 里"下一实例"不会自动出现（不一致）；且该任务在 App 里撤销时 `repeatNextId=null` → 清理不触发。**两条路径需要统一**（要么小部件也走同一业务逻辑，要么小部件不做重复任务的完成/撤销并提示去 App）。
4. **同步合并"复活"已删实例**：
   - 若本机删了 A2（softDelete），但 WebDAV 远端快照里仍有 A2（删除墓碑未同步/未合并），下次 `syncMerge` 的 LWW 可能把 A2 又写回来 → 重复。需确认已删除墓碑是否随快照传播、合并时是否尊重墓碑。

---

## 3. 给下一位的建议（推荐方向）
### A. 稳健：撤销时删整系列未完成实例
```
// 撤销完成（restoreTask 或 toggleTaskCompleted 的 !newCompleted 分支）：
if (task.repeatRule && task.repeatSeriesId) {
  // 删除该系列下所有未完成、未删除的实例（历史残留也一并清掉）
  await repo.deleteIncompleteSeries(task.repeatSeriesId);
  await repo.update(task.id, { repeatNextId: null });
}
```
- 在 `TaskRepository` 加 `deleteIncompleteSeries(seriesId)`：`UPDATE Task SET deleted=1 WHERE repeatSeriesId=? AND completed=0 AND deleted=0 AND id != ?`。
- 这样能同时清掉**旧版残留**的多条重复实例。

### B. 重构：让"下一实例"不预先创建
- 另一种更干净的模型：**不要在完成时立即新建 A2**，而是把当前实例标记为"已完成"，渲染/列表在需要时**按重复规则推导出"下一截止"的待办**；当用户点"完成当前"才真正落一条新记录。可避免撤销与已建实例的耦合（但改动较大，需评估）。

### C. 统一小部件完成路径
- 让 `TaskWidgetProvider.handleToggleComplete`（完成重复任务）**也调用同一套业务逻辑**（或至少写入 `repeatNextId`）。当前 Kotlin 直写 DB，与 TS 业务分裂。

### D. 确保同步尊重墓碑
- 检查 `syncMerge` 是否把 `repeatNextId`/`repeatSeriesId` 一起合并，以及已删除实例的墓碑是否能覆盖远端旧版本（避免删了的 A2 被同步拉回）。

---

## 4. 复现/验证清单
1. 重装最新 APK（卸载→重装，避免旧数据干扰）。
2. 建「每天」重复任务（设截止）。
3. 在 **App 主列表**勾选完成 → 出现下一实例。
4. 在 **「已完成」区**点击该任务撤销完成 → **应只剩一条**。
5. 反复 完成→撤销 多次，确认不累积。
6. 若仍重复：在完成重复任务后查 `Task` 表 `repeatNextId` 是否非空；在撤销后查是否有多条 `repeatSeriesId` 相同的未完成行。

---

## 5. 分支/构建
- 修复代码在 `v2.1-rework`（`b47d3c2`），已重打 `release/desktop-task-manager-arm64-release.apk` + `release/DesktopTaskManager-v2.1.0-setup.exe`。
- 构建：`npm run build`（需 full access）→ `gradlew assembleArm64Release`；桌面 `npm run tauri build`（`bundle.targets="nsis"`，仅 NSIS）。
- 注意：`src-tauri/gen/android` 手写 Kotlin 在 gitignore（只有 `widget-perf` 分支 force-add 过，且那份 `TaskWidgetProvider.kt` 是**未补完**的 `loadTasksFromDb` 版本，需先修）。

---

## 6. 结论
- 复制于 `toggleTaskCompleted` + `restoreTask` 的"删下一实例"清理逻辑**方向正确**，但**仅删一个 `repeatNextId` 目标**，对**历史残留多实例**无能为力；且**小部件完成路径**与**同步合并**可能绕过/复活。
- **推荐先做 A（撤销时删整系列未完成实例）**，能直接清掉用户看到的多条；再视情况做 C（统一小部件路径）、D（同步墓碑）。
