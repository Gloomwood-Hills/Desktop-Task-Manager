import Database from 'better-sqlite3';
import path from 'path';
import { appDataDir } from '@tauri-apps/api/path';

let db: Database.Database | null = null;

export async function getDatabase(): Promise<Database.Database> {
  if (db) return db;
  
  const appDir = await appDataDir();
  const dbPath = path.join(appDir, 'desktop-task-manager', 'data.db');
  
  db = new Database(dbPath, { fileMustExist: false });
  db.pragma('journal_mode = WAL');
  
  initDatabase(db);
  return db;
}

function initDatabase(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS Folder (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parentId TEXT,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      FOREIGN KEY (parentId) REFERENCES Folder(id) ON DELETE CASCADE
    );
    
    CREATE INDEX IF NOT EXISTS idx_folder_parentId ON Folder(parentId);
    CREATE INDEX IF NOT EXISTS idx_folder_sortOrder ON Folder(sortOrder);
    
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
    );
    
    CREATE INDEX IF NOT EXISTS idx_task_folderId ON Task(folderId);
    CREATE INDEX IF NOT EXISTS idx_task_parentId ON Task(parentId);
    CREATE INDEX IF NOT EXISTS idx_task_completed ON Task(completed);
    CREATE INDEX IF NOT EXISTS idx_task_deleted ON Task(deleted);
    CREATE INDEX IF NOT EXISTS idx_task_deadline ON Task(deadline);
    
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
    );
    
    CREATE TABLE IF NOT EXISTS WindowState (
      id TEXT PRIMARY KEY,
      x INTEGER NOT NULL DEFAULT 0,
      y INTEGER NOT NULL DEFAULT 0,
      width INTEGER NOT NULL DEFAULT 420,
      height INTEGER NOT NULL DEFAULT 700,
      collapsedFolders TEXT DEFAULT '[]',
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );
  `);
  
  const hasDefaultFolder = db.prepare('SELECT COUNT(*) as count FROM Folder WHERE id = ?').get('default') as { count: number };
  if (hasDefaultFolder.count === 0) {
    const now = Date.now();
    db.prepare(`
      INSERT INTO Folder (id, name, parentId, sortOrder, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('default', '默认文件夹', null, 0, now, now);
  }
  
  const hasSettings = db.prepare('SELECT COUNT(*) as count FROM Settings').get() as { count: number };
  if (hasSettings.count === 0) {
    const now = Date.now();
    db.prepare(`
      INSERT INTO Settings (id, theme, glassEffect, transparency, sortType, reminderEnabled, reminderOffset, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('default', 'light', 1, 0.8, 'deadline', 1, 86400, now, now);
  }
  
  const hasWindowState = db.prepare('SELECT COUNT(*) as count FROM WindowState').get() as { count: number };
  if (hasWindowState.count === 0) {
    const now = Date.now();
    db.prepare(`
      INSERT INTO WindowState (id, x, y, width, height, collapsedFolders, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('default', 0, 0, 420, 700, '[]', now, now);
  }
}