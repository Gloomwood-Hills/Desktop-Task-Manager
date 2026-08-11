import type { SyncFolder, SyncSnapshot, SyncTask } from './types';

/** 可合并记录的最小形状：合并引擎只依赖 id + updatedAt（Last-Write-Wins） */
export type MergableRecord = { id: string; updatedAt: number };

/**
 * 快照"记录内容"是否相等（忽略数组顺序与导出元数据）：
 * folders/tasks 各自按 id 排序后逐条比较（每条记录按键排序后稳定序列化再比对）。
 * 只比较记录内容，不比较 exportedAt/deviceId——两者是每次导出都变的元数据，
 * 参与比较会把"无数据变化"误判为"有变化"（见 engine.ts syncMerge 的节流判定）。
 * 稳定序列化（对每条记录按 key 排序后拼串）可避免 v1 规范化与 v2 键序差异导致的误判。
 */
export function snapshotRecordsEqual(a: SyncSnapshot, b: SyncSnapshot): boolean {
  return recordsEqual(a.folders, b.folders) && recordsEqual(a.tasks, b.tasks);
}

/** 记录数组内容是否相等：长度一致 + 按 id 排序后对应位置逐条比较（忽略数组原始顺序） */
function recordsEqual(a: SyncFolder[] | SyncTask[], b: SyncFolder[] | SyncTask[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort(byId);
  const sortedB = [...b].sort(byId);
  for (let i = 0; i < sortedA.length; i++) {
    if (stableSerialize(sortedA[i]) !== stableSerialize(sortedB[i])) return false;
  }
  return true;
}

function byId(x: { id: string }, y: { id: string }): number {
  return x.id < y.id ? -1 : x.id > y.id ? 1 : 0;
}

/** 按 key 排序后稳定序列化单条记录（SyncFolder/SyncTask 字段均为标量，一层排序即可消除键序差异） */
function stableSerialize(record: SyncFolder | SyncTask): string {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    sorted[key] = (record as unknown as Record<string, unknown>)[key];
  }
  return JSON.stringify(sorted);
}

/**
 * 按 id + updatedAt 双向合并（Last-Write-Wins）：
 * - 双端都有 → 取 updatedAt 较新者（相等时保留 local，避免无谓翻转）；
 * - 仅一端有 → 保留该端记录；
 * - deleted 墓碑作为普通字段参与 LWW：较新的删除墓碑会覆盖对端的存活记录，
 *   从而把"删除"传播到另一端；反之较新的存活记录也能覆盖对端旧墓碑（恢复）。
 * 顺序稳定性：返回顺序以 local 数组顺序为准，remote 独有记录追加在末尾，
 * 保证 UI 展示顺序不随合并抖动。
 */
export function mergeRecords<T extends MergableRecord>(local: T[], remote: T[]): T[] {
  const byId = new Map<string, T>();
  // 先按 local 顺序放入全部本地记录
  for (const item of local) byId.set(item.id, item);
  // 再逐条处理 remote：新 id 追加末尾；同 id 且 remote 较新则原地覆盖（不改变位置）
  for (const item of remote) {
    const existing = byId.get(item.id);
    if (!existing) {
      byId.set(item.id, item);
    } else if (item.updatedAt > existing.updatedAt) {
      byId.set(item.id, item);
    }
  }
  return Array.from(byId.values());
}

/** 文件夹便捷合并：按 id + updatedAt 做 Last-Write-Wins（含 deleted 墓碑传播） */
export function mergeFolders(local: SyncFolder[], remote: SyncFolder[]): SyncFolder[] {
  return mergeRecords(local, remote);
}

/** 任务便捷合并：按 id + updatedAt 做 Last-Write-Wins（含 deleted 墓碑传播） */
export function mergeTasks(local: SyncTask[], remote: SyncTask[]): SyncTask[] {
  return mergeRecords(local, remote);
}

/**
 * 合并引擎运行时自检（当前无测试框架，以内联断言替代单测）：
 * 覆盖核心合并语义场景，任一断言失败即 throw Error，
 * 防止合并逻辑被后续修改悄悄破坏。每次快照导出前调用（见 exporter.ts）。
 */
export function selfCheckMerge(): void {
  // 场景A：local 与 remote 各新增一条不同 id 的记录 → 合并后两条都在，remote 独有追加末尾
  const mergedA = mergeRecords(
    [{ id: 'local-only', updatedAt: 100 }],
    [{ id: 'remote-only', updatedAt: 200 }]
  );
  assert(
    mergedA.length === 2 && mergedA[0].id === 'local-only' && mergedA[1].id === 'remote-only',
    '场景A：不同 id 的记录应合并为两条且 remote 独有记录在末尾'
  );

  // 场景B：同一 id 双端都有 → 取 updatedAt 较新者（local 较新取 local，remote 较新取 remote）
  const mergedB1 = mergeRecords([{ id: 'x', updatedAt: 300 }], [{ id: 'x', updatedAt: 200 }]);
  assert(mergedB1.length === 1 && mergedB1[0].updatedAt === 300, '场景B：local 较新时应取 local');
  const mergedB2 = mergeRecords([{ id: 'x', updatedAt: 200 }], [{ id: 'x', updatedAt: 300 }]);
  assert(mergedB2.length === 1 && mergedB2[0].updatedAt === 300, '场景B：remote 较新时应取 remote');

  // 场景C：同一 id，local 为较新的删除墓碑（deleted=true），remote 为较旧存活记录 → 保留墓碑（删除传播）
  const mergedC = mergeRecords(
    [{ id: 'x', updatedAt: 500, deleted: true } as SyncFolder],
    [{ id: 'x', updatedAt: 400, deleted: false } as SyncFolder]
  );
  assert(mergedC.length === 1 && mergedC[0].deleted === true, '场景C：较新的删除墓碑应传播删除');

  // 场景D：v1→v2 兼容（模拟 parseSnapshot 的 v1 规范化结果：文件夹补 deleted=false，不依赖文件 IO）。
  // 规范化后的记录参与合并时行为应与 v2 原生记录一致（较新删除墓碑仍可传播）。
  const v1Normalized = [{ id: 'y', updatedAt: 100, deleted: false } as SyncFolder];
  const remoteTombstone = [{ id: 'y', updatedAt: 200, deleted: true } as SyncFolder];
  const mergedD = mergeRecords(v1Normalized, remoteTombstone);
  assert(mergedD.length === 1 && mergedD[0].deleted === true, '场景D：v1 规范化记录参与 LWW 时墓碑仍可传播');
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`merge.ts 自检失败：${message}`);
  }
}
