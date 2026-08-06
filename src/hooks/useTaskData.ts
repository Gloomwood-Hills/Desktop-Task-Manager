import { useState, useEffect, useCallback, useRef } from 'react';
import { getDatabase } from '../data/database';
import { FolderService } from '../services/FolderService';
import { TaskService } from '../services/TaskService';
import { SettingsService } from '../services/SettingsService';
import { buildFolderTree, buildTaskTree } from '../data/utils';
import { Folder, Task, TaskWithSubtasks, FolderNode, Theme, Priority } from '../data/types';

export interface UseTaskData {
  folderTree: FolderNode[];
  /** 未分类任务（folderId 为 null），与文件夹同级显示在顶层 */
  unclassifiedTasks: TaskWithSubtasks[];
  completedTasks: Task[];
  allFolders: Folder[];
  theme: Theme;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setTheme: (theme: Theme) => Promise<void>;
  createTask: (title: string, folderId: string | null, options?: {
    remark?: string; parentId?: string | null; startDate?: number | null;
    deadline?: number | null; priority?: Priority;
  }) => Promise<Task | null>;
  toggleCompleted: (id: string) => Promise<Task | null>;
  deleteTask: (id: string) => Promise<boolean>;
  restoreTask: (id: string) => Promise<boolean>;
  createFolder: (name: string, parentId?: string | null) => Promise<Folder | null>;
  renameFolder: (id: string, name: string) => Promise<Folder | null>;
  deleteFolder: (id: string) => Promise<boolean>;
}

export function useTaskData(): UseTaskData {
  const [folderTree, setFolderTree] = useState<FolderNode[]>([]);
  const [unclassifiedTasks, setUnclassifiedTasks] = useState<TaskWithSubtasks[]>([]);
  const [completedTasks, setCompletedTasks] = useState<Task[]>([]);
  const [allFolders, setAllFolders] = useState<Folder[]>([]);
  const [theme, setThemeState] = useState<Theme>('light');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const folderServiceRef = useRef<FolderService | null>(null);
  const taskServiceRef = useRef<TaskService | null>(null);
  const settingsServiceRef = useRef<SettingsService | null>(null);

  const refresh = useCallback(async () => {
    if (!folderServiceRef.current || !taskServiceRef.current) return;
    try {
      const [folders, tasks, completed] = await Promise.all([
        folderServiceRef.current.getAllFolders(),
        taskServiceRef.current.getAllTasks(),
        taskServiceRef.current.getCompletedTasks(),
      ]);
      setAllFolders(folders);
      // 构建完整树后过滤根级已完成任务；
      // 子任务保留在父任务下（划线样式），保证父任务进度统计 x/y 正确
      const fullTree = buildFolderTree(folders, tasks);
      const cleanTree = fullTree.map(cleanFolderRoot);
      setFolderTree(cleanTree);
      // 未分类任务（folderId 为 null）：顶层显示，与文件夹同级
      const unclassifiedTree = buildTaskTree(tasks.filter((t) => t.folderId === null))
        .filter((t) => !t.completed);
      setUnclassifiedTasks(unclassifiedTree);
      setCompletedTasks(completed);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  /** 过滤文件夹根级已完成任务，保留子任务结构 */
  function cleanFolderRoot(node: FolderNode): FolderNode {
    return {
      ...node,
      tasks: node.tasks.filter((t) => !t.completed),
      children: node.children.map(cleanFolderRoot),
    };
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = await getDatabase();
        folderServiceRef.current = new FolderService(db);
        taskServiceRef.current = new TaskService(db);
        settingsServiceRef.current = new SettingsService(db);

        // 加载设置
        const settings = await settingsServiceRef.current.getSettings();
        if (settings && !cancelled) {
          setThemeState(settings.theme);
        }

        await refresh();
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [refresh]);

  const setTheme = useCallback(async (newTheme: Theme) => {
    setThemeState(newTheme);
    if (settingsServiceRef.current) {
      await settingsServiceRef.current.setTheme(newTheme);
    }
  }, []);

  const createTask = useCallback(async (
    title: string, folderId: string | null, options?: {
      remark?: string; parentId?: string | null; startDate?: number | null;
      deadline?: number | null; priority?: Priority;
    }
  ): Promise<Task | null> => {
    if (!taskServiceRef.current) return null;
    const task = await taskServiceRef.current.createTask(title, folderId, options);
    await refresh();
    return task;
  }, [refresh]);

  const toggleCompleted = useCallback(async (id: string): Promise<Task | null> => {
    if (!taskServiceRef.current) return null;
    const task = await taskServiceRef.current.toggleTaskCompleted(id);
    await refresh();
    return task;
  }, [refresh]);

  const deleteTask = useCallback(async (id: string): Promise<boolean> => {
    if (!taskServiceRef.current) return false;
    const ok = await taskServiceRef.current.deleteTask(id);
    await refresh();
    return ok;
  }, [refresh]);

  const restoreTask = useCallback(async (id: string): Promise<boolean> => {
    if (!taskServiceRef.current) return false;
    const ok = await taskServiceRef.current.restoreTask(id);
    await refresh();
    return ok;
  }, [refresh]);

  const createFolder = useCallback(async (name: string, parentId: string | null = null): Promise<Folder | null> => {
    if (!folderServiceRef.current) return null;
    const folder = await folderServiceRef.current.createFolder(name, parentId);
    await refresh();
    return folder;
  }, [refresh]);

  const renameFolder = useCallback(async (id: string, name: string): Promise<Folder | null> => {
    if (!folderServiceRef.current) return null;
    const folder = await folderServiceRef.current.updateFolder(id, name);
    await refresh();
    return folder;
  }, [refresh]);

  const deleteFolder = useCallback(async (id: string): Promise<boolean> => {
    if (!folderServiceRef.current) return false;
    const ok = await folderServiceRef.current.deleteFolder(id);
    await refresh();
    return ok;
  }, [refresh]);

  return {
    folderTree, unclassifiedTasks, completedTasks, allFolders, theme, loading, error,
    refresh, setTheme, createTask, toggleCompleted, deleteTask, restoreTask,
    createFolder, renameFolder, deleteFolder,
  };
}
