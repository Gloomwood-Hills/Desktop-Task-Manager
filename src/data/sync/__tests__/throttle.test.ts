import { describe, it, expect } from 'vitest';
import { decompressContent, gzipText } from '../webdavClient';
import { snapshotRecordsEqual } from '../merge';
import type { SyncFolder, SyncSnapshot, SyncTask } from '../types';

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
    repeatRule: null,
    repeatIntervalDays: null,
    repeatSeriesId: null,
    repeatNextId: null,
    reminderAt: null,
    reminderFired: false,
    reminderOffsets: [],
    reminderFiredOffsets: [],
    reminderTimes: [],
    reminderFiredTimes: [],
    ...overrides,
  };
}

/** 构造完整 SyncSnapshot（folders/tasks 默认空数组，测试按需覆盖） */
function makeSnapshot(overrides: Partial<SyncSnapshot> = {}): SyncSnapshot {
  return {
    schemaVersion: 2,
    exportedAt: 123456789,
    deviceId: 'device-1',
    folders: [],
    tasks: [],
    ...overrides,
  };
}

describe('gzipText / decompressContent', () => {
  it('gzip 压缩后解压往返一致（含中文/emoji/长文本）', async () => {
    const text = '任务「買い物リスト」🛒🎉\n'.repeat(300) + '长文本测试：'.repeat(100);
    const compressed = await gzipText(text);
    const restored = await decompressContent(compressed);
    expect(restored).toBe(text);
  });

  it('decompressContent 对未压缩文本（无 gzip 魔数）原样返回', async () => {
    // 兼容历史未压缩快照：JSON 文本前两字节不是 0x1f 0x8b，直接按 UTF-8 解码
    const plain = JSON.stringify({ hello: '世界 🌍', list: [1, 2, 3] });
    const bytes = new TextEncoder().encode(plain);
    expect(await decompressContent(bytes)).toBe(plain);
  });

  it('压缩后体积显著小于原文（长重复文本压缩比 < 0.5）', async () => {
    const text = '同一个重复内容，用于验证 gzip 压缩效果。'.repeat(1000);
    const compressed = await gzipText(text);
    const ratio = compressed.length / new TextEncoder().encode(text).length;
    expect(ratio).toBeLessThan(0.5);
  });
});

describe('snapshotRecordsEqual', () => {
  it('同内容不同数组顺序 → true（按 id 排序后比较）', () => {
    const a = makeSnapshot({
      folders: [makeFolder({ id: 'folder-a' }), makeFolder({ id: 'folder-b' })],
      tasks: [makeTask({ id: 'task-1' }), makeTask({ id: 'task-2' })],
    });
    const b = makeSnapshot({
      folders: [makeFolder({ id: 'folder-b' }), makeFolder({ id: 'folder-a' })],
      tasks: [makeTask({ id: 'task-2' }), makeTask({ id: 'task-1' })],
    });
    expect(snapshotRecordsEqual(a, b)).toBe(true);
  });

  it('多一条记录 → false', () => {
    const a = makeSnapshot({ folders: [makeFolder({ id: 'folder-a' })] });
    const b = makeSnapshot({
      folders: [makeFolder({ id: 'folder-a' }), makeFolder({ id: 'folder-b' })],
    });
    expect(snapshotRecordsEqual(a, b)).toBe(false);
  });

  it('同 id 字段不同（updatedAt/标题不同）→ false', () => {
    const a = makeSnapshot({ tasks: [makeTask({ id: 'task-1', title: '标题A', updatedAt: 100 })] });
    const b = makeSnapshot({ tasks: [makeTask({ id: 'task-1', title: '标题B', updatedAt: 200 })] });
    expect(snapshotRecordsEqual(a, b)).toBe(false);
  });

  it('仅 exportedAt/deviceId 不同 → true（导出元数据不参与比较）', () => {
    const base = makeSnapshot({ folders: [makeFolder()], tasks: [makeTask()] });
    const other = makeSnapshot({
      ...base,
      exportedAt: base.exportedAt + 999,
      deviceId: 'device-2',
    });
    expect(snapshotRecordsEqual(base, other)).toBe(true);
  });
});
