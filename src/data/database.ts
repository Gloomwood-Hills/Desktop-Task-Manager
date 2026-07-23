import Database from '@tauri-apps/plugin-sql';
import { appDataDir, join } from '@tauri-apps/api/path';

let db: Database | null = null;
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
      folderId TEXT NOT NULL,
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

  await db.execute(`
    CREATE TABLE IF NOT EXISTS Settings (
      id TEXT PRIMARY KEY,
      theme TEXT NOT NULL DEFAULT 'light',
      glassEffect INTEGER NOT NULL DEFAULT 1,
      transparency REAL NOT NULL DEFAULT 0.8,
      sortType TEXT NOT NULL DEFAULT 'deadline',
      reminderEnabled INTEGER NOT NULL DEFAULT 1,
      reminderOffset INTEGER NOT NULL DEFAULT 86400,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    )
  `);

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
      `INSERT INTO Settings (id, theme, glassEffect, transparency, sortType, reminderEnabled, reminderOffset, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['default', 'light', 1, 0.8, 'deadline', 1, 86400, now, now]
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
