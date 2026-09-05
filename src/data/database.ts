import Database from '@tauri-apps/plugin-sql';
import { appDataDir, join } from '@tauri-apps/api/path';
import { DEFAULT_WEBDAV_URL } from './types';

let db: Database | undefined = undefined;
let initError: Error | null = null;

export async function getDatabase(): Promise<Database> {
  if (initError) throw initError;
  if (db) return db;

  try {
    const appDir = await appDataDir();
    const dbPath = await join(appDir, 'desktop-task-manager', 'data.db');
    db = await Database.load(`sqlite:${dbPath}`);
    // 使用 DELETE 日志模式而非 WAL：Android 桌面小部件跨进程只读 data.db，
    // WAL 下新写入在 -wal 日志中，小部件读不到未 checkpoint 的数据（表现为刷新无效）。
    // DELETE 模式每次写入直接落主库，单进程、低频写场景性能无影响。
    await db.execute('PRAGMA journal_mode = DELETE');
    await db.execute('PRAGMA foreign_keys = ON');
    await initDatabase(db);
    return db;
  } catch (error) {
    initError = error as Error;
    console.error('[Database] Failed to initialize:', initError.message);
    throw initError;
  }
}

async function initDatabase(db: Database): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS Folder (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parentId TEXT,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (parentId) REFERENCES Folder(id) ON DELETE CASCADE
    )
  `);
  await db.execute('CREATE INDEX IF NOT EXISTS idx_folder_parentId ON Folder(parentId)');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_folder_sortOrder ON Folder(sortOrder)');

  // 旧库迁移：Folder 新增 deleted 列（软删墓碑，已删除记录用于跨端同步传播）
  await migrateFolderAddDeleted(db);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS Task (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      remark TEXT DEFAULT '',
      folderId TEXT,
      parentId TEXT,
      startDate INTEGER,
      deadline INTEGER,
      priority TEXT NOT NULL DEFAULT 'normal',
      completed INTEGER NOT NULL DEFAULT 0,
      completedAt INTEGER,
      deleted INTEGER NOT NULL DEFAULT 0,
      reminderAt INTEGER,
      reminderFired INTEGER NOT NULL DEFAULT 0,
      repeatRule TEXT,
      repeatIntervalDays INTEGER,
      repeatSeriesId TEXT,
      repeatNextId TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      FOREIGN KEY (folderId) REFERENCES Folder(id) ON DELETE CASCADE,
      FOREIGN KEY (parentId) REFERENCES Task(id) ON DELETE CASCADE
    )
  `);
  await db.execute('CREATE INDEX IF NOT EXISTS idx_task_folderId ON Task(folderId)');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_task_parentId ON Task(parentId)');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_task_completed ON Task(completed)');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_task_deleted ON Task(deleted)');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_task_deadline ON Task(deadline)');

  // 旧库迁移：Task.folderId 曾为 NOT NULL，需要重建表使其可空（SQLite 不支持 ALTER COLUMN）
  await migrateTaskFolderNullable(db);

  // 旧库迁移：Task 新增 sortOrder 列（手动排序）
  await migrateTaskAddSortOrder(db);

  // 旧库迁移：Task 新增 提醒(repeatRule/reminderAt/reminderFired) + 重复(repeatRule/repeatIntervalDays) 列
  await migrateTaskAddReminderRepeat(db);

  // 数据修复：旧版同步快照遗漏 repeatSeriesId 等字段，导致同步后这些字段被清空为 NULL。
  // 对 repeatRule 非空但 repeatSeriesId 为空的重复任务，将 repeatSeriesId 设为自身 id
  // （视为该系列首实例），使撤销完成时的系列清理逻辑能正常工作。
  await migrateTaskRepairRepeatSeriesId(db);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS Settings (
      id TEXT PRIMARY KEY,
      theme TEXT NOT NULL DEFAULT 'light',
      glassEffect INTEGER NOT NULL DEFAULT 1,
      transparency REAL NOT NULL DEFAULT 0.8,
      sortType TEXT NOT NULL DEFAULT 'deadline',
      importantTop INTEGER NOT NULL DEFAULT 0,
      reminderEnabled INTEGER NOT NULL DEFAULT 1,
      reminderOffset INTEGER NOT NULL DEFAULT 86400,
      autoPin INTEGER NOT NULL DEFAULT 1,
      autoStart INTEGER NOT NULL DEFAULT 1,
      deadlineGradient INTEGER NOT NULL DEFAULT 1,
      viewMode TEXT NOT NULL DEFAULT 'list',
      autoSync INTEGER NOT NULL DEFAULT 1,
      syncPolicy TEXT NOT NULL DEFAULT 'twoWay',
      webdavUrl TEXT NOT NULL DEFAULT '${DEFAULT_WEBDAV_URL}',
      webdavUsername TEXT NOT NULL DEFAULT '',
      webdavPassword TEXT NOT NULL DEFAULT '',
      lastSyncedAt INTEGER,
      lastSyncAction TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    )
  `);

  // 旧库迁移：Settings 新增 importantTop 列（重要任务置顶）
  await migrateSettingsAddImportantTop(db);

  // 旧库迁移：Settings 新增 autoPin 列（提醒后自动置顶）
  await migrateSettingsAddAutoPin(db);

  // 旧库迁移：Settings 新增 autoStart 列（开机自启动）
  await migrateSettingsAddAutoStart(db);

  // 旧库迁移：Settings 新增 deadlineGradient 列（截止时间按日期渐变）
  await migrateSettingsAddDeadlineGradient(db);

  // 旧库迁移：Settings 新增 viewMode 列（当前视图模式）
  await migrateSettingsAddViewMode(db);

  // 旧库迁移：Settings 新增 WebDAV 同步列（地址/账号/密码/上次同步时间）
  await migrateSettingsAddSync(db);

  // 旧库迁移：Settings 新增 lastSyncAction 列（上次同步操作）
  await migrateSettingsAddSyncAction(db);

  // 旧库迁移：Settings 新增 autoSync 列（自动同步开关，默认开启）
  await migrateSettingsAddAutoSync(db);

  // 旧库迁移：webdavUrl 为空 → 填内置坚果云地址（V2.1.1：服务器地址内嵌，无需用户输入）
  await migrateSettingsFillDefaultWebdavUrl(db);

  // 旧库迁移：Settings 新增 syncPolicy 列（默认同步策略，默认为双向合并）
  await migrateSettingsAddSyncPolicy(db);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS WindowState (
      id TEXT PRIMARY KEY,
      x INTEGER NOT NULL DEFAULT 0,
      y INTEGER NOT NULL DEFAULT 0,
      width INTEGER NOT NULL DEFAULT 420,
      height INTEGER NOT NULL DEFAULT 700,
      collapsedFolders TEXT DEFAULT '[]',
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    )
  `);

  await insertDefaultData(db);

  // 数据保留策略：已删除任务仅保留 30 天，到期物理清除（软删墓碑不再需要时回收）
  await db.execute('DELETE FROM Task WHERE deleted = 1 AND updatedAt <= ?', [Date.now() - 30 * 24 * 60 * 60 * 1000]);
}

async function insertDefaultData(db: Database): Promise<void> {
  const now = Date.now();

  const existingSettings = await db.select<{ count: number }[]>('SELECT COUNT(*) as count FROM Settings', []);
  if (existingSettings[0].count === 0) {
    await db.execute(
      `INSERT INTO Settings (id, theme, glassEffect, transparency, sortType, importantTop, reminderEnabled, reminderOffset, autoPin, autoStart, deadlineGradient, viewMode, autoSync, syncPolicy, webdavUrl, webdavUsername, webdavPassword, lastSyncedAt, lastSyncAction, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['default', 'light', 1, 0.8, 'deadline', 0, 1, 86400, 1, 1, 1, 'list', 1, 'twoWay', DEFAULT_WEBDAV_URL, '', '', null, null, now, now]
    );
  }

  const existingWindowState = await db.select<{ count: number }[]>('SELECT COUNT(*) as count FROM WindowState', []);
  if (existingWindowState[0].count === 0) {
    await db.execute(
      'INSERT INTO WindowState (id, x, y, width, height, collapsedFolders, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ['default', 0, 0, 420, 700, '[]', now, now]
    );
  }
}

/** 旧库迁移：Task.folderId 从 NOT NULL 改为可空（SQLite 需重建表） */
async function migrateTaskFolderNullable(db: Database): Promise<void> {
  const cols = await db.select<{ name: string; notnull: number }[]>(
    'PRAGMA table_info(Task)'
  );
  const folderIdCol = cols.find((c) => c.name === 'folderId');
  if (!folderIdCol || folderIdCol.notnull !== 1) return; // 已是可空或表不存在

  await db.execute('ALTER TABLE Task RENAME TO Task_old');
  await db.execute(`
    CREATE TABLE Task (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      remark TEXT DEFAULT '',
      folderId TEXT,
      parentId TEXT,
      startDate INTEGER,
      deadline INTEGER,
      priority TEXT NOT NULL DEFAULT 'normal',
      completed INTEGER NOT NULL DEFAULT 0,
      completedAt INTEGER,
      deleted INTEGER NOT NULL DEFAULT 0,
      reminderAt INTEGER,
      reminderFired INTEGER NOT NULL DEFAULT 0,
      repeatRule TEXT,
      repeatIntervalDays INTEGER,
      repeatSeriesId TEXT,
      repeatNextId TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      FOREIGN KEY (folderId) REFERENCES Folder(id) ON DELETE CASCADE,
      FOREIGN KEY (parentId) REFERENCES Task(id) ON DELETE CASCADE
    )
  `);
  await db.execute(`
    INSERT INTO Task (id, title, remark, folderId, parentId, startDate, deadline, priority,
                      completed, completedAt, deleted, createdAt, updatedAt)
    SELECT id, title, remark, folderId, parentId, startDate, deadline, priority,
           completed, completedAt, deleted, createdAt, updatedAt
    FROM Task_old
  `);
  await db.execute('DROP TABLE Task_old');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_task_folderId ON Task(folderId)');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_task_parentId ON Task(parentId)');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_task_completed ON Task(completed)');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_task_deleted ON Task(deleted)');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_task_deadline ON Task(deadline)');
}

/** 旧库迁移：Task 新增 sortOrder 列（手动排序） */
async function migrateTaskAddSortOrder(db: Database): Promise<void> {
  const cols = await db.select<{ name: string }[]>('PRAGMA table_info(Task)');
  if (!cols.some((c) => c.name === 'sortOrder')) {
    await db.execute('ALTER TABLE Task ADD COLUMN sortOrder INTEGER NOT NULL DEFAULT 0');
  }
}

/** 旧库迁移：Task 新增 提醒 + 重复 列（V2.1.2） */
async function migrateTaskAddReminderRepeat(db: Database): Promise<void> {
  const cols = await db.select<{ name: string }[]>('PRAGMA table_info(Task)');
  if (!cols.some((c) => c.name === 'reminderAt')) {
    await db.execute('ALTER TABLE Task ADD COLUMN reminderAt INTEGER');
  }
  if (!cols.some((c) => c.name === 'reminderFired')) {
    await db.execute('ALTER TABLE Task ADD COLUMN reminderFired INTEGER NOT NULL DEFAULT 0');
  }
  if (!cols.some((c) => c.name === 'repeatRule')) {
    await db.execute('ALTER TABLE Task ADD COLUMN repeatRule TEXT');
  }
  if (!cols.some((c) => c.name === 'repeatIntervalDays')) {
    await db.execute('ALTER TABLE Task ADD COLUMN repeatIntervalDays INTEGER');
  }
  if (!cols.some((c) => c.name === 'repeatSeriesId')) {
    await db.execute('ALTER TABLE Task ADD COLUMN repeatSeriesId TEXT');
  }
  if (!cols.some((c) => c.name === 'repeatNextId')) {
    await db.execute('ALTER TABLE Task ADD COLUMN repeatNextId TEXT');
  }
}

/**
 * 数据修复迁移：旧版同步快照（v1/v2）遗漏 repeatSeriesId 字段，
 * 每次同步都会把重复任务的 repeatSeriesId 清空为 NULL，
 * 导致撤销完成时无法按系列清理未完成实例（重复任务累积 bug）。
 * 对 repeatRule 非空但 repeatSeriesId 为空的任务，将 repeatSeriesId 设为自身 id
 * （视为该系列首实例），使系列清理逻辑恢复正常。
 */
async function migrateTaskRepairRepeatSeriesId(db: Database): Promise<void> {
  await db.execute(
    `UPDATE Task SET repeatSeriesId = id
     WHERE repeatRule IS NOT NULL AND repeatRule != ''
       AND (repeatSeriesId IS NULL OR repeatSeriesId = '')`
  );
}

/** 旧库迁移：Settings 新增 importantTop 列（重要任务置顶） */
async function migrateSettingsAddImportantTop(db: Database): Promise<void> {
  const cols = await db.select<{ name: string }[]>('PRAGMA table_info(Settings)');
  if (!cols.some((c) => c.name === 'importantTop')) {
    await db.execute('ALTER TABLE Settings ADD COLUMN importantTop INTEGER NOT NULL DEFAULT 0');
  }
}

/** 旧库迁移：Settings 新增 autoPin 列（提醒后自动置顶） */
async function migrateSettingsAddAutoPin(db: Database): Promise<void> {
  const cols = await db.select<{ name: string }[]>('PRAGMA table_info(Settings)');
  if (!cols.some((c) => c.name === 'autoPin')) {
    await db.execute('ALTER TABLE Settings ADD COLUMN autoPin INTEGER NOT NULL DEFAULT 1');
  }
}

/** 旧库迁移：Settings 新增 autoStart 列（开机自启动，默认开启） */
async function migrateSettingsAddAutoStart(db: Database): Promise<void> {
  const cols = await db.select<{ name: string }[]>('PRAGMA table_info(Settings)');
  if (!cols.some((c) => c.name === 'autoStart')) {
    await db.execute('ALTER TABLE Settings ADD COLUMN autoStart INTEGER NOT NULL DEFAULT 1');
  }
}

/** 旧库迁移：Settings 新增 deadlineGradient 列（截止时间按日期渐变，默认开启） */
async function migrateSettingsAddDeadlineGradient(db: Database): Promise<void> {
  const cols = await db.select<{ name: string }[]>('PRAGMA table_info(Settings)');
  if (!cols.some((c) => c.name === 'deadlineGradient')) {
    await db.execute('ALTER TABLE Settings ADD COLUMN deadlineGradient INTEGER NOT NULL DEFAULT 1');
  }
}

/** 旧库迁移：Settings 新增 viewMode 列（当前视图模式，默认 list） */
async function migrateSettingsAddViewMode(db: Database): Promise<void> {
  const cols = await db.select<{ name: string }[]>('PRAGMA table_info(Settings)');
  if (!cols.some((c) => c.name === 'viewMode')) {
    await db.execute('ALTER TABLE Settings ADD COLUMN viewMode TEXT NOT NULL DEFAULT \'list\'');
  }
}

/** 旧库迁移：Settings 新增 WebDAV 同步列（地址/账号/密码默认空串，lastSyncedAt 可空） */
async function migrateSettingsAddSync(db: Database): Promise<void> {
  const cols = await db.select<{ name: string }[]>('PRAGMA table_info(Settings)');
  const has = (name: string) => cols.some((c) => c.name === name);
  if (!has('webdavUrl')) {
    await db.execute("ALTER TABLE Settings ADD COLUMN webdavUrl TEXT NOT NULL DEFAULT ''");
  }
  if (!has('webdavUsername')) {
    await db.execute("ALTER TABLE Settings ADD COLUMN webdavUsername TEXT NOT NULL DEFAULT ''");
  }
  if (!has('webdavPassword')) {
    await db.execute("ALTER TABLE Settings ADD COLUMN webdavPassword TEXT NOT NULL DEFAULT ''");
  }
  if (!has('lastSyncedAt')) {
    // 可空列，null 表示尚未同步过
    await db.execute('ALTER TABLE Settings ADD COLUMN lastSyncedAt INTEGER');
  }
}

/** 旧库迁移：Settings 新增 lastSyncAction 列（上次同步操作 upload/download，可空） */
async function migrateSettingsAddSyncAction(db: Database): Promise<void> {
  const cols = await db.select<{ name: string }[]>('PRAGMA table_info(Settings)');
  if (!cols.some((c) => c.name === 'lastSyncAction')) {
    // 可空列，null 表示尚未同步过
    await db.execute('ALTER TABLE Settings ADD COLUMN lastSyncAction TEXT');
  }
}

/** 旧库迁移：Folder 新增 deleted 列（软删墓碑，默认未删除；已删除记录用于跨端同步传播） */
async function migrateFolderAddDeleted(db: Database): Promise<void> {
  const cols = await db.select<{ name: string }[]>('PRAGMA table_info(Folder)');
  if (!cols.some((c) => c.name === 'deleted')) {
    await db.execute('ALTER TABLE Folder ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0');
  }
}

/** 旧库迁移：Settings 新增 autoSync 列（自动同步开关，默认开启） */
async function migrateSettingsAddAutoSync(db: Database): Promise<void> {
  const cols = await db.select<{ name: string }[]>('PRAGMA table_info(Settings)');
  if (!cols.some((c) => c.name === 'autoSync')) {
    await db.execute('ALTER TABLE Settings ADD COLUMN autoSync INTEGER NOT NULL DEFAULT 1');
  }
}

/** 旧库迁移：webdavUrl 为空 → 填内置坚果云地址（V2.1.1 内嵌服务器，幂等） */
async function migrateSettingsFillDefaultWebdavUrl(db: Database): Promise<void> {
  const cols = await db.select<{ name: string }[]>('PRAGMA table_info(Settings)');
  if (!cols.some((c) => c.name === 'webdavUrl')) return;
  await db.execute(
    `UPDATE Settings SET webdavUrl = ? WHERE webdavUrl = '' OR webdavUrl IS NULL`,
    [DEFAULT_WEBDAV_URL]
  );
}

/** 旧库迁移：Settings 新增 syncPolicy 列（默认同步策略，默认双向合并） */
async function migrateSettingsAddSyncPolicy(db: Database): Promise<void> {
  const cols = await db.select<{ name: string }[]>('PRAGMA table_info(Settings)');
  if (!cols.some((c) => c.name === 'syncPolicy')) {
    await db.execute("ALTER TABLE Settings ADD COLUMN syncPolicy TEXT NOT NULL DEFAULT 'twoWay'");
  }
}
