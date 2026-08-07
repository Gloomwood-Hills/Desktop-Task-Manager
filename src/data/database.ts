import Database from '@tauri-apps/plugin-sql';
import { appDataDir, join } from '@tauri-apps/api/path';

let db: Database | undefined = undefined;
let initError: Error | null = null;

export async function getDatabase(): Promise<Database> {
  if (initError) throw initError;
  if (db) return db;

  try {
    const appDir = await appDataDir();
    const dbPath = await join(appDir, 'desktop-task-manager', 'data.db');
    db = await Database.load(`sqlite:${dbPath}`);
    await db.execute('PRAGMA journal_mode = WAL');
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
      FOREIGN KEY (parentId) REFERENCES Folder(id) ON DELETE CASCADE
    )
  `);
  await db.execute('CREATE INDEX IF NOT EXISTS idx_folder_parentId ON Folder(parentId)');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_folder_sortOrder ON Folder(sortOrder)');

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
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    )
  `);

  // 旧库迁移：Settings 新增 importantTop 列（重要任务置顶）
  await migrateSettingsAddImportantTop(db);

  // 旧库迁移：Settings 新增 autoPin 列（提醒后自动置顶）
  await migrateSettingsAddAutoPin(db);

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
  await seedDemoData(db);
}

async function insertDefaultData(db: Database): Promise<void> {
  const now = Date.now();

  const existingFolder = await db.select<{ count: number }[]>(
    'SELECT COUNT(*) as count FROM Folder WHERE id = ?', ['default']
  );
  if (existingFolder[0].count === 0) {
    await db.execute(
      'INSERT INTO Folder (id, name, parentId, sortOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
      ['default', '默认文件夹', null, 0, now, now]
    );
  }

  const existingSettings = await db.select<{ count: number }[]>('SELECT COUNT(*) as count FROM Settings', []);
  if (existingSettings[0].count === 0) {
    await db.execute(
      `INSERT INTO Settings (id, theme, glassEffect, transparency, sortType, importantTop, reminderEnabled, reminderOffset, autoPin, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['default', 'light', 1, 0.8, 'deadline', 0, 1, 86400, 1, now, now]
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

/** 首次运行时插入演示文件夹和任务（与原 mock 数据一致） */
async function seedDemoData(db: Database): Promise<void> {
  // 幂等检查：演示文件夹已存在则不重复插入
  const demoFolder = await db.select<{ count: number }[]>(
    'SELECT COUNT(*) as count FROM Folder WHERE id = ?', ['folder-ky']
  );
  if (demoFolder[0].count > 0) return;

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  // 文件夹
  const folders: { id: string; name: string; parentId: string | null; sortOrder: number }[] = [
    { id: 'folder-ky', name: '科研', parentId: null, sortOrder: 0 },
    { id: 'folder-lw', name: '论文', parentId: 'folder-ky', sortOrder: 0 },
    { id: 'folder-sy', name: '实验', parentId: 'folder-ky', sortOrder: 1 },
    { id: 'folder-gp', name: '股票', parentId: null, sortOrder: 1 },
    { id: 'folder-sh', name: '生活', parentId: null, sortOrder: 2 },
  ];
  for (const f of folders) {
    await db.execute(
      'INSERT INTO Folder (id, name, parentId, sortOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
      [f.id, f.name, f.parentId, f.sortOrder, now, now]
    );
  }

  // 任务
  const tasks: {
    id: string; title: string; remark: string; folderId: string; parentId: string | null;
    startDate: number | null; deadline: number | null; priority: string;
    completed: number; completedAt: number | null;
  }[] = [
    { id: 'task-lw1', title: '修改论文第三章', remark: '需要根据导师反馈修改第三章的结构和论证逻辑，重点补充实验数据支撑。', folderId: 'folder-lw', parentId: null, startDate: null, deadline: now + day, priority: 'important', completed: 0, completedAt: null },
    { id: 'task-lw1-1', title: '检查参考文献格式', remark: '', folderId: 'folder-lw', parentId: 'task-lw1', startDate: null, deadline: null, priority: 'normal', completed: 1, completedAt: now - 2 * day },
    { id: 'task-lw1-2', title: '重写实验方法', remark: '', folderId: 'folder-lw', parentId: 'task-lw1', startDate: null, deadline: null, priority: 'normal', completed: 1, completedAt: now - day },
    { id: 'task-lw1-3', title: '补充数据图表', remark: '', folderId: 'folder-lw', parentId: 'task-lw1', startDate: null, deadline: null, priority: 'normal', completed: 0, completedAt: null },
    { id: 'task-lw1-4', title: '校对全文', remark: '', folderId: 'folder-lw', parentId: 'task-lw1', startDate: null, deadline: null, priority: 'normal', completed: 0, completedAt: null },
    { id: 'task-lw2', title: '提交实验报告', remark: '', folderId: 'folder-lw', parentId: null, startDate: null, deadline: now + 2 * day, priority: 'normal', completed: 0, completedAt: null },
    { id: 'task-lw3', title: '整理论文参考文献', remark: '', folderId: 'folder-lw', parentId: null, startDate: null, deadline: null, priority: 'normal', completed: 0, completedAt: null },
    { id: 'task-sy1', title: '记录实验数据', remark: '', folderId: 'folder-sy', parentId: null, startDate: null, deadline: null, priority: 'normal', completed: 0, completedAt: null },
    { id: 'task-gp1', title: '关注宁德时代走势', remark: '', folderId: 'folder-gp', parentId: null, startDate: null, deadline: now, priority: 'important', completed: 0, completedAt: null },
    { id: 'task-gp2', title: '研究光伏板块', remark: '', folderId: 'folder-gp', parentId: null, startDate: null, deadline: now + 7 * day, priority: 'normal', completed: 0, completedAt: null },
    { id: 'task-sh1', title: '预约牙医', remark: '', folderId: 'folder-sh', parentId: null, startDate: now + 3 * day, deadline: now + 4 * day, priority: 'normal', completed: 0, completedAt: null },
    { id: 'task-sh2', title: '买生日礼物', remark: '', folderId: 'folder-sh', parentId: null, startDate: null, deadline: null, priority: 'normal', completed: 0, completedAt: null },
    { id: 'task-done1', title: '修改摘要', remark: '', folderId: 'folder-lw', parentId: null, startDate: null, deadline: null, priority: 'normal', completed: 1, completedAt: now - 2 * day },
    { id: 'task-done2', title: '提交周报', remark: '', folderId: 'folder-ky', parentId: null, startDate: null, deadline: null, priority: 'normal', completed: 1, completedAt: now - 3 * day },
  ];

  for (const t of tasks) {
    await db.execute(
      `INSERT INTO Task (id, title, remark, folderId, parentId, startDate, deadline, priority, completed, completedAt, deleted, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [t.id, t.title, t.remark, t.folderId, t.parentId, t.startDate, t.deadline, t.priority, t.completed, t.completedAt, now, now]
    );
  }

  // 清理空的默认文件夹（演示数据已就位）
  const defaultCount = await db.select<{ count: number }[]>(
    'SELECT COUNT(*) as count FROM Task WHERE folderId = ?', ['default']
  );
  if (defaultCount[0].count === 0) {
    await db.execute('DELETE FROM Folder WHERE id = ?', ['default']);
  }
}
