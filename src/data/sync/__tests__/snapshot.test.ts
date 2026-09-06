import { describe, it, expect } from 'vitest';
import { buildSnapshot, parseSnapshot, snapshotToJson } from '../snapshot';
import { SYNC_SCHEMA_VERSION } from '../types';
import type { Folder, Task } from '../../types';

/** 构造最小完整 Folder（应用数据层类型，含 deleted 墓碑） */
function makeFolder(overrides: Partial<Folder> = {}): Folder {
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

/** 构造最小完整 Task（应用数据层类型，含 deleted 墓碑） */
function makeTask(overrides: Partial<Task> = {}): Task {
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
    reminderAt: null,
    reminderFired: false,
    reminderOffsets: [],
    reminderFiredOffsets: [],
    reminderTimes: [],
    reminderFiredTimes: [],
    repeatRule: null,
    repeatIntervalDays: null,
    repeatSeriesId: null,
    repeatNextId: null,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

/** 构造 v2 快照 JSON 字符串（SyncFolder 含 deleted 字段） */
function makeV2SnapshotJson(): string {
  return JSON.stringify({
    schemaVersion: 2,
    exportedAt: 123456789,
    deviceId: 'test-device',
    folders: [{ ...makeFolder(), deleted: false }],
    tasks: [makeTask()],
  });
}

/** 构造 v1 快照 JSON 字符串（folders 无 deleted 字段） */
function makeV1SnapshotJson(): string {
  const { deleted, ...folderWithoutDeleted } = makeFolder();
  return JSON.stringify({
    schemaVersion: 1,
    exportedAt: 123456789,
    deviceId: 'test-device',
    folders: [folderWithoutDeleted],
    tasks: [makeTask()],
  });
}

describe('buildSnapshot', () => {
  it('输出 folders 含 deleted 字段且 schemaVersion = 5', () => {
    const folders = [makeFolder({ deleted: true })];
    const tasks = [makeTask()];

    const snapshot = buildSnapshot(folders, tasks, 'device-1');

    expect(snapshot.schemaVersion).toBe(5);
    expect(snapshot.deviceId).toBe('device-1');
    expect(typeof snapshot.exportedAt).toBe('number');
    expect(snapshot.folders).toHaveLength(1);
    expect(snapshot.folders[0].deleted).toBe(true);
    expect('deleted' in snapshot.folders[0]).toBe(true);
    expect(snapshot.tasks).toHaveLength(1);
    expect(snapshot.tasks[0].id).toBe('task-1');
  });

  it('显式逐字段映射：不携带来源对象多余字段', () => {
    const snapshot = buildSnapshot([makeFolder()], [makeTask()], 'device-1');

    expect(Object.keys(snapshot.folders[0]).sort()).toEqual(
      ['id', 'name', 'parentId', 'sortOrder', 'createdAt', 'updatedAt', 'deleted'].sort()
    );
  });
});

describe('parseSnapshot', () => {
  it('解析 v2 JSON 正常，字段完整返回', () => {
    const parsed = parseSnapshot(makeV2SnapshotJson());

    expect(parsed.schemaVersion).toBe(SYNC_SCHEMA_VERSION);
    expect(parsed.folders).toHaveLength(1);
    expect(parsed.folders[0].deleted).toBe(false);
    expect(parsed.tasks).toHaveLength(1);
    expect(parsed.tasks[0].title).toBe('测试任务');
  });

  it('解析 v1 JSON（folders 无 deleted）→ 规范化后 folders 均 deleted=false、schemaVersion=5', () => {
    const parsed = parseSnapshot(makeV1SnapshotJson());

    expect(parsed.schemaVersion).toBe(5);
    expect(parsed.folders).toHaveLength(1);
    expect(parsed.folders[0].deleted).toBe(false);
    expect('deleted' in parsed.folders[0]).toBe(true);
    // v1 任务原本就含 deleted，保持不变
    expect(parsed.tasks[0].deleted).toBe(false);
  });

  it('拒绝不支持的版本（schemaVersion=6）并抛错', () => {
    const v6Json = makeV2SnapshotJson().replace('"schemaVersion":2', '"schemaVersion":6');

    expect(() => parseSnapshot(v6Json)).toThrow(/版本不兼容/);
  });

  it('拒绝非法 JSON 并抛错', () => {
    expect(() => parseSnapshot('{ 这不是合法 JSON')).toThrow(/不是合法的 JSON/);
    expect(() => parseSnapshot('')).toThrow(/不是合法的 JSON/);
  });

  it('拒绝缺失 folders/tasks 数组的快照结构', () => {
    expect(() =>
      parseSnapshot(JSON.stringify({ schemaVersion: 2, exportedAt: 1, deviceId: 'd' }))
    ).toThrow(/缺少 folders 或 tasks/);
  });

  it('snapshotToJson 序列化后可被 parseSnapshot 往返解析', () => {
    const snapshot = buildSnapshot([makeFolder()], [makeTask()], 'device-1');
    const roundTripped = parseSnapshot(snapshotToJson(snapshot));

    expect(roundTripped).toEqual(snapshot);
  });
});
