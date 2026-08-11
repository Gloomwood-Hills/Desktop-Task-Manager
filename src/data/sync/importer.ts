import { getDatabase } from '../database';
import { SyncFolder, SyncSnapshot, SyncTask } from './types';

/**
 * 快照导入的两个入口，语义不同：
 * - importSnapshot：整库覆盖。先清空 Folder/Task 再全量重插，适用于"单侧全量导入"
 *   （较新快照整体覆盖旧数据，实现简单且结果可收敛）。注意：Settings/WindowState 表
 *   不在清空范围，外观设置、窗口布局不受同步影响。
 * - importMerged：合并写回。不清空本地表，将合并结果（本地+远端双方全部记录，
 *   含删除墓碑）逐条 INSERT OR REPLACE 收敛，适用于双向合并同步（见 merge.ts）。
 */
export async function importSnapshot(snapshot: SyncSnapshot): Promise<void> {
  const db = await getDatabase();

  // 先删 Task 再删 Folder：Task.folderId 外键引用 Folder，父表必须在子表之后清空。
  // 数据库连接已开启 PRAGMA foreign_keys=ON（见 database.ts），
  // 显式保证顺序删除，避免依赖级联删除链上出现意外。
  await db.execute('DELETE FROM Task');
  await db.execute('DELETE FROM Folder');

  // 文件夹先于任务插入：Task 的 folderId/parentId 引用 Folder 与 Task 两张表，
  // 被引用的父实体必须先存在。id 原样保留，跨端层级/父子关联才能一一对应。
  const folders = orderByParent(
    snapshot.folders,
    (f) => f.id,
    (f) => f.parentId
  );
  for (const folder of folders) {
    // SyncFolder.deleted 是 boolean，SQLite 列是 INTEGER，转 1/0
    // （v1 快照经 parseSnapshot 已补 deleted=false，v2 为真实值，覆盖导入不丢墓碑）
    await db.execute(
      `INSERT OR REPLACE INTO Folder (id, name, parentId, sortOrder, deleted, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        folder.id,
        folder.name,
        folder.parentId,
        folder.sortOrder,
        folder.deleted ? 1 : 0,
        folder.createdAt,
        folder.updatedAt,
      ]
    );
  }

  // 任务按层级拓扑排序后插入：Task.parentId 自引用本表，父任务必须在子任务之前插入，
  // 否则外键约束（PRAGMA foreign_keys=ON）会拒绝插入子任务。
  const tasks = orderByParent(
    snapshot.tasks,
    (t) => t.id,
    (t) => t.parentId
  );
  for (const task of tasks) {
    // SyncTask 的 completed/deleted 是 boolean，SQLite 列是 INTEGER，转 1/0
    await db.execute(
      `INSERT OR REPLACE INTO Task (id, title, remark, folderId, parentId, startDate, deadline,
                                   priority, sortOrder, completed, completedAt, deleted, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        task.id,
        task.title,
        task.remark,
        task.folderId,
        task.parentId,
        task.startDate,
        task.deadline,
        task.priority,
        task.sortOrder,
        task.completed ? 1 : 0,
        task.completedAt,
        task.deleted ? 1 : 0,
        task.createdAt,
        task.updatedAt,
      ]
    );
  }
}

/**
 * 将合并结果逐条写回本地库（含删除墓碑），不清空本地表。
 * 与 importSnapshot 的"整库覆盖"不同，合并结果已包含本地+远端双方的全部记录
 * （merge.ts 按 id + updatedAt 做 Last-Write-Wins），逐条 INSERT OR REPLACE 天然收敛，
 * 无需清空即可使本地达到合并后的一致状态。
 */
export async function importMerged(folders: SyncFolder[], tasks: SyncTask[]): Promise<void> {
  const db = await getDatabase();

  // 文件夹按层级拓扑排序后逐条写回：Task.folderId 外键要求父实体先存在；
  // deleted 墓碑一并写入（boolean → 1/0），较新的删除墓碑可覆盖本地存活记录
  const orderedFolders = orderByParent(
    folders,
    (f) => f.id,
    (f) => f.parentId
  );
  for (const folder of orderedFolders) {
    await db.execute(
      `INSERT OR REPLACE INTO Folder (id, name, parentId, sortOrder, deleted, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        folder.id,
        folder.name,
        folder.parentId,
        folder.sortOrder,
        folder.deleted ? 1 : 0,
        folder.createdAt,
        folder.updatedAt,
      ]
    );
  }

  // 任务按层级拓扑排序后逐条写回：Task.parentId 自引用本表，父任务必须先于子任务写入，
  // 否则外键约束（PRAGMA foreign_keys=ON）会拒绝插入子任务
  const orderedTasks = orderByParent(
    tasks,
    (t) => t.id,
    (t) => t.parentId
  );
  for (const task of orderedTasks) {
    await db.execute(
      `INSERT OR REPLACE INTO Task (id, title, remark, folderId, parentId, startDate, deadline,
                                   priority, sortOrder, completed, completedAt, deleted, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        task.id,
        task.title,
        task.remark,
        task.folderId,
        task.parentId,
        task.startDate,
        task.deadline,
        task.priority,
        task.sortOrder,
        task.completed ? 1 : 0,
        task.completedAt,
        task.deleted ? 1 : 0,
        task.createdAt,
        task.updatedAt,
      ]
    );
  }
}

/**
 * 拓扑排序：保证父实体先于子实体插入（Folder.parentId / Task.parentId 是自引用外键）。
 * 快照内数组顺序由导出时的查询排序决定（sortOrder 等），不保证父先于子，
 * 因此导入前必须重排。visited 集合同时防御数据中的循环引用导致死循环。
 */
function orderByParent<T>(
  items: T[],
  getId: (item: T) => string,
  getParentId: (item: T) => string | null
): T[] {
  const ids = new Set(items.map(getId));
  const visited = new Set<string>();
  const ordered: T[] = [];

  const visit = (item: T): void => {
    const id = getId(item);
    if (visited.has(id)) return;
    visited.add(id);

    const parentId = getParentId(item);
    if (parentId && ids.has(parentId)) {
      const parent = items.find((it) => getId(it) === parentId);
      if (parent) visit(parent);
    }
    ordered.push(item);
  };

  for (const item of items) visit(item);
  return ordered;
}
