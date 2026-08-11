import { describe, it, expect } from 'vitest';
import { mergeRecords, mergeFolders, mergeTasks, selfCheckMerge } from '../merge';
import type { SyncFolder, SyncTask } from '../types';

/** 构造最小完整 SyncFolder（全部字段显式给出，避免运行时 undefined 影响断言） */
function makeFolder(overrides: Partial<SyncFolder> = {}): SyncFolder {
  return {
    id: 'folder-1',
    name: '测试文件夹',
    parentId: null,
    sortOrder: 0,
    createdAt: 1000,
    updatedAt: 1000,
    deleted: false,
    ...overrides,
  };
}

/** 构造最小完整 SyncTask（全部字段显式给出，避免运行时 undefined 影响断言） */
function makeTask(overrides: Partial<SyncTask> = {}): SyncTask {
  return {
    id: 'task-1',
    title: '测试任务',
    remark: '',
    folderId: null,
    parentId: null,
    startDate: null,
    deadline: null,
    priority: 'normal',
    sortOrder: 0,
    completed: false,
    completedAt: null,
    deleted: false,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

describe('mergeRecords', () => {
  it('双端各自新增不同 id 记录 → 合并后都在，remote 独有记录追加末尾', () => {
    const local = [makeFolder({ id: 'local-only', name: '本地新建', updatedAt: 100 })];
    const remote = [makeFolder({ id: 'remote-only', name: '远端新建', updatedAt: 200 })];

    const merged = mergeRecords(local, remote);

    expect(merged).toHaveLength(2);
    expect(merged.map((f) => f.id)).toEqual(['local-only', 'remote-only']);
  });

  it('同一 id 双端都有且 local 较新 → 取 local', () => {
    const local = [makeFolder({ id: 'x', name: 'local 版本', updatedAt: 300 })];
    const remote = [makeFolder({ id: 'x', name: 'remote 版本', updatedAt: 200 })];

    const merged = mergeRecords(local, remote);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toEqual(local[0]);
  });

  it('同一 id 双端都有且 remote 较新 → 取 remote', () => {
    const local = [makeFolder({ id: 'x', name: 'local 版本', updatedAt: 200 })];
    const remote = [makeFolder({ id: 'x', name: 'remote 版本', updatedAt: 300 })];

    const merged = mergeRecords(local, remote);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toEqual(remote[0]);
  });

  it('删除墓碑传播：local 为较新 deleted=true、remote 为较旧存活记录 → 保留 deleted=true', () => {
    const local = [makeFolder({ id: 'x', deleted: true, updatedAt: 500 })];
    const remote = [makeFolder({ id: 'x', deleted: false, updatedAt: 400 })];

    const merged = mergeRecords(local, remote);

    expect(merged).toHaveLength(1);
    expect(merged[0].deleted).toBe(true);
    expect(merged[0].updatedAt).toBe(500);
  });

  it('删除墓碑反向：remote 为较新 deleted=true、local 为较旧存活记录 → 同样保留 deleted=true（远端删除传播到本地）', () => {
    const local = [makeFolder({ id: 'x', deleted: false, updatedAt: 400 })];
    const remote = [makeFolder({ id: 'x', deleted: true, updatedAt: 500 })];

    const merged = mergeRecords(local, remote);

    expect(merged).toHaveLength(1);
    expect(merged[0].deleted).toBe(true);
  });

  it('较新的存活记录可覆盖对端旧墓碑（恢复语义）', () => {
    const local = [makeFolder({ id: 'x', deleted: false, updatedAt: 600 })];
    const remote = [makeFolder({ id: 'x', deleted: true, updatedAt: 500 })];

    const merged = mergeRecords(local, remote);

    expect(merged).toHaveLength(1);
    expect(merged[0].deleted).toBe(false);
  });

  it('一方缺失记录 → 从另一端补齐', () => {
    const localOnly = [makeFolder({ id: 'only-local', updatedAt: 100 })];
    const remoteOnly = [makeFolder({ id: 'only-remote', updatedAt: 200 })];

    const fromLocalPerspective = mergeRecords(localOnly, remoteOnly);
    expect(fromLocalPerspective.map((f) => f.id)).toEqual(['only-local', 'only-remote']);

    const fromRemotePerspective = mergeRecords(remoteOnly, localOnly);
    expect(fromRemotePerspective.map((f) => f.id)).toEqual(['only-remote', 'only-local']);
  });

  it('updatedAt 相等时保留 local（避免无谓翻转）', () => {
    const local = [makeFolder({ id: 'x', name: 'local 版本', updatedAt: 100 })];
    const remote = [makeFolder({ id: 'x', name: 'remote 版本', updatedAt: 100 })];

    const merged = mergeRecords(local, remote);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toEqual(local[0]);
  });
});

describe('mergeFolders / mergeTasks', () => {
  it('mergeFolders 返回 SyncFolder[] 且按 id + updatedAt 合并（含 deleted 墓碑传播）', () => {
    const local: SyncFolder[] = [makeFolder({ id: 'a', name: '存活', updatedAt: 300 })];
    const remote: SyncFolder[] = [makeFolder({ id: 'b', name: '远端', updatedAt: 400 })];

    const merged = mergeFolders(local, remote);
    expect(merged).toHaveLength(2);
    expect(merged.every((f) => 'deleted' in f && typeof f.deleted === 'boolean')).toBe(true);

    // 墓碑传播经便捷函数同样生效
    const tombstone = mergeFolders(
      [makeFolder({ id: 'a', deleted: true, updatedAt: 500 })],
      [makeFolder({ id: 'a', deleted: false, updatedAt: 400 })]
    );
    expect(tombstone).toHaveLength(1);
    expect(tombstone[0].deleted).toBe(true);
  });

  it('mergeTasks 返回 SyncTask[] 且按 id + updatedAt 合并', () => {
    const local: SyncTask[] = [makeTask({ id: 't1', title: '本地任务', updatedAt: 300 })];
    const remote: SyncTask[] = [makeTask({ id: 't2', title: '远端任务', updatedAt: 400 })];

    const merged = mergeTasks(local, remote);
    expect(merged).toHaveLength(2);
    expect(merged[0].id).toBe('t1');
    expect(merged[1].id).toBe('t2');

    // 同 id 取较新者
    const conflicted = mergeTasks(
      [makeTask({ id: 't1', title: '本地较新', updatedAt: 500 })],
      [makeTask({ id: 't1', title: '远端较旧', updatedAt: 400 })]
    );
    expect(conflicted).toHaveLength(1);
    expect(conflicted[0].title).toBe('本地较新');
  });
});

describe('selfCheckMerge', () => {
  it('运行时自检全部场景断言通过（不抛错）', () => {
    expect(() => selfCheckMerge()).not.toThrow();
  });
});
