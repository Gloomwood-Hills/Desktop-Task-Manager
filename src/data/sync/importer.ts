import { getDatabase } from '../database';
import { SyncSnapshot } from './types';

/**
 * 全量导入快照并覆盖本地库。
 * 为什么"全量替换"而非逐条 merge：同步采用快照覆盖模型
 * （Last-Modified Wins，较新快照整体覆盖旧数据），全量替换实现简单且结果可收敛；
 * 逐条 merge 会引入"删除 vs 修改"等无法自动裁决的冲突。
 * 注意：Settings/WindowState 表不在清空范围，外观设置、窗口布局不受同步影响。
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
    await db.execute(
      `INSERT OR REPLACE INTO Folder (id, name, parentId, sortOrder, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        folder.id,
        folder.name,
        folder.parentId,
        folder.sortOrder,
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
