import { useState, useEffect, useCallback, useRef } from 'react';
import { getDatabase } from '../data/database';
import { FolderService } from '../services/FolderService';
import { TaskService } from '../services/TaskService';
import { SettingsService } from '../services/SettingsService';
import { WindowStateService } from '../services/WindowStateService';
import { buildFolderTree, buildTaskTree, sortTasksByType, sortFolders } from '../data/utils';
import { Folder, Task, TaskWithSubtasks, FolderNode, Theme, Priority, Settings, WindowState, TaskRepeatRule } from '../data/types';
import { notifyDataChanged } from '../data/sync';

export interface UseTaskData {
  folderTree: FolderNode[];
  /** 未分类任务（folderId 为 null），与文件夹同级显示在顶层 */
  unclassifiedTasks: TaskWithSubtasks[];
  completedTasks: Task[];
  allFolders: Folder[];
  theme: Theme;
  settings: Settings | null;
  /** 窗口状态（位置/大小/折叠文件夹），Task 14 持久化 */
  windowState: WindowState | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setTheme: (theme: Theme) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  /** 保存窗口状态（位置/大小/折叠文件夹） */
  saveWindowState: (patch: Partial<WindowState>) => Promise<void>;
  createTask: (title: string, folderId: string | null, options?: {
    remark?: string; parentId?: string | null;
    deadline?: number | null; priority?: Priority;
    reminderOffsets?: string[]; reminderAt?: number | null; reminderTimes?: number[];
    repeatRule?: TaskRepeatRule | null; repeatIntervalDays?: number | null;
  }) => Promise<Task | null>;
  toggleCompleted: (id: string) => Promise<Task | null>;
  /** 编辑任务：更新标题/备注/截止/优先级/提醒偏移等字段 */
  updateTask: (
    id: string,
    updates: Partial<Pick<Task, 'title' | 'remark' | 'folderId' | 'deadline' | 'priority' | 'reminderAt' | 'reminderFired' | 'reminderOffsets' | 'reminderFiredOffsets' | 'reminderTimes' | 'reminderFiredTimes' | 'repeatRule' | 'repeatIntervalDays'>>
  ) => Promise<Task | null>;
  deleteTask: (id: string) => Promise<boolean>;
  restoreTask: (id: string) => Promise<boolean>;
  /** 撤销「删除重复系列」：恢复该系列全部被删实例（保留完成态），返回恢复条数 */
  restoreSeries: (seriesId: string) => Promise<number>;
  /** 结束重复：清除重复规则并标记已完成（移入"已完成"区） */
  stopRepeat: (id: string) => Promise<Task | null>;
  /** 手动排序：按给定顺序持久化任务顺序 */
  reorderTasks: (orderedIds: string[]) => Promise<boolean>;
  /** 手动排序：按给定顺序持久化同级文件夹顺序 */
  reorderFolders: (orderedIds: string[]) => Promise<boolean>;
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
  const [settings, setSettings] = useState<Settings | null>(null);
  const [windowState, setWindowState] = useState<WindowState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const folderServiceRef = useRef<FolderService | null>(null);
  const taskServiceRef = useRef<TaskService | null>(null);
  const settingsServiceRef = useRef<SettingsService | null>(null);
  const windowStateServiceRef = useRef<WindowStateService | null>(null);
  /** 排序等设置经 ref 供 refresh 读取，避免刷新时重建服务 */
  const settingsRef = useRef<Settings | null>(null);

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
      // 按设置排序（仅排序任务列表本身，子任务不参与排序）
      const sortType = settingsRef.current?.sortType ?? 'deadline';
      const importantTop = settingsRef.current?.importantTop ?? false;
      const sortTaskList = (list: TaskWithSubtasks[]): TaskWithSubtasks[] =>
        sortTasksByType(list, sortType, importantTop);
      const sortFolderNode = (node: FolderNode): FolderNode => ({
        ...node,
        tasks: sortTaskList(node.tasks),
        // 同级子文件夹也按当前默认排序方式排序（manual 保持 sortOrder）
        children: sortFolders(node.children.map(sortFolderNode), sortType),
      });
      // 已重复次数：同一重复系列已完成实例数（tasks 含已完成，deleted=0）
      const repeatCountMap = new Map<string, number>();
      for (const t of tasks) {
        if (t.completed && t.repeatSeriesId) {
          repeatCountMap.set(t.repeatSeriesId, (repeatCountMap.get(t.repeatSeriesId) ?? 0) + 1);
        }
      }
      const annotate = (list: TaskWithSubtasks[]): TaskWithSubtasks[] =>
        list.map((t) => ({
          ...t,
          repeatCount: t.repeatSeriesId ? (repeatCountMap.get(t.repeatSeriesId) ?? 0) : 0,
          // 已完成任务等无 subtasks 数组时兜底为空数组，避免对 undefined 调 .map
          subtasks: annotate(t.subtasks ?? []),
        }));
      const annotateFolder = (n: FolderNode): FolderNode => ({
        ...n,
        tasks: annotate(n.tasks),
        children: (n.children ?? []).map(annotateFolder),
      });
      setFolderTree(cleanTree.map(sortFolderNode).map(annotateFolder));
      // 未分类任务（folderId 为 null）：顶层显示，与文件夹同级
      const unclassifiedTree = buildTaskTree(tasks.filter((t) => t.folderId === null))
        .filter((t) => !t.completed);
      setUnclassifiedTasks(annotate(sortTaskList(unclassifiedTree)));
      setCompletedTasks(annotate(completed as TaskWithSubtasks[]));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  /** 数据变更统一收尾：刷新视图 + 通知自动同步调度器（内部 30s 防抖） */
  const afterMutation = async (): Promise<void> => {
    await refresh();
    notifyDataChanged();
  };

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
        windowStateServiceRef.current = new WindowStateService(db);

        // 并行加载设置与窗口状态（缩短启动串行等待）
        const [settings, windowState] = await Promise.all([
          settingsServiceRef.current.getSettings(),
          windowStateServiceRef.current.getWindowState(),
        ]);
        if (settings && !cancelled) {
          settingsRef.current = settings;
          setSettings(settings);
          setThemeState(settings.theme);
        }
        if (windowState && !cancelled) setWindowState(windowState);

        await refresh();
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [refresh]);

  /** 小部件（Android 桌面小部件）等外部进程直接改库后，应用回到前台时重新拉取数据，
   * 否则 React 内存态停留在旧数据（表现为"小部件完成/撤销/新建不同步到应用"）。 */
  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [refresh]);

  const setTheme = useCallback(async (newTheme: Theme) => {
    setThemeState(newTheme);
    if (settingsServiceRef.current) {
      await settingsServiceRef.current.setTheme(newTheme);
    }
  }, []);

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    if (!settingsServiceRef.current) return;
    const updated = await settingsServiceRef.current.updateSettings(patch);
    if (updated) {
      settingsRef.current = updated;
      setSettings(updated);
      if (updated.theme) setThemeState(updated.theme);
      await refresh(); // 排序等变化时重建任务树
    }
  }, [refresh]);

  const saveWindowState = useCallback(async (patch: Partial<WindowState>) => {
    if (!windowStateServiceRef.current) return;
    const updated = await windowStateServiceRef.current.saveWindowState(patch);
    if (updated) setWindowState(updated);
  }, []);

  const createTask = useCallback(async (
    title: string, folderId: string | null, options?: {
      remark?: string; parentId?: string | null;
      deadline?: number | null; priority?: Priority;
      reminderOffsets?: string[]; reminderAt?: number | null; reminderTimes?: number[];
      repeatRule?: TaskRepeatRule | null; repeatIntervalDays?: number | null;
    }
  ): Promise<Task | null> => {
    if (!taskServiceRef.current) return null;
    const task = await taskServiceRef.current.createTask(title, folderId, options);
    await afterMutation();
    return task;
  }, [refresh]);

  const toggleCompleted = useCallback(async (id: string): Promise<Task | null> => {
    if (!taskServiceRef.current) return null;
    const task = await taskServiceRef.current.toggleTaskCompleted(id);
    await afterMutation();
    return task;
  }, [refresh]);

  const updateTask = useCallback(async (
    id: string,
    updates: Partial<Pick<Task, 'title' | 'remark' | 'folderId' | 'deadline' | 'priority' | 'reminderAt' | 'reminderFired' | 'reminderOffsets' | 'reminderFiredOffsets' | 'reminderTimes' | 'reminderFiredTimes' | 'repeatRule' | 'repeatIntervalDays'>>
  ): Promise<Task | null> => {
    if (!taskServiceRef.current) return null;
    const task = await taskServiceRef.current.updateTask(id, updates);
    await afterMutation();
    return task;
  }, [refresh]);

  const deleteTask = useCallback(async (id: string): Promise<boolean> => {
    if (!taskServiceRef.current) return false;
    const ok = await taskServiceRef.current.deleteTask(id);
    await afterMutation();
    return ok;
  }, [refresh]);

  const restoreTask = useCallback(async (id: string): Promise<boolean> => {
    if (!taskServiceRef.current) return false;
    const ok = await taskServiceRef.current.restoreTask(id);
    await afterMutation();
    return ok;
  }, [refresh]);

  const restoreSeries = useCallback(async (seriesId: string): Promise<number> => {
    if (!taskServiceRef.current) return 0;
    const n = await taskServiceRef.current.restoreSeries(seriesId);
    await afterMutation();
    return n;
  }, [refresh]);

  const stopRepeat = useCallback(async (id: string): Promise<Task | null> => {
    if (!taskServiceRef.current) return null;
    const task = await taskServiceRef.current.stopRepeat(id);
    await afterMutation();
    return task;
  }, [refresh]);

  const reorderTasks = useCallback(async (orderedIds: string[]): Promise<boolean> => {
    if (!taskServiceRef.current) return false;
    const ok = await taskServiceRef.current.reorderTasks(orderedIds);
    await afterMutation();
    return ok;
  }, [refresh]);

  const reorderFolders = useCallback(async (orderedIds: string[]): Promise<boolean> => {
    if (!folderServiceRef.current) return false;
    const ok = await folderServiceRef.current.reorderFolders(orderedIds);
    await afterMutation();
    return ok;
  }, [refresh]);

  const createFolder = useCallback(async (name: string, parentId: string | null = null): Promise<Folder | null> => {
    if (!folderServiceRef.current) return null;
    const folder = await folderServiceRef.current.createFolder(name, parentId);
    await afterMutation();
    return folder;
  }, [refresh]);

  const renameFolder = useCallback(async (id: string, name: string): Promise<Folder | null> => {
    if (!folderServiceRef.current) return null;
    const folder = await folderServiceRef.current.updateFolder(id, name);
    await afterMutation();
    return folder;
  }, [refresh]);

  const deleteFolder = useCallback(async (id: string): Promise<boolean> => {
    if (!folderServiceRef.current) return false;
    const ok = await folderServiceRef.current.deleteFolder(id);
    await afterMutation();
    return ok;
  }, [refresh]);

  return {
    folderTree, unclassifiedTasks, completedTasks, allFolders, theme, settings, windowState, loading, error,
    refresh, setTheme, updateSettings, saveWindowState, createTask, toggleCompleted, updateTask,
    deleteTask, restoreTask, restoreSeries, stopRepeat, reorderTasks, reorderFolders, createFolder, renameFolder, deleteFolder,
  };
}
