import { useEffect, useMemo, useRef, useState } from 'react';
import { getCurrentWindow, PhysicalPosition, PhysicalSize } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { enable as autostartEnable, disable as autostartDisable } from '@tauri-apps/plugin-autostart';
import TopBar from './components/topBar';
import FolderTree from './components/folderTree';
import CompletedSection from './components/completedSection';
import ContextMenu, { ContextMenuState } from './components/contextMenu';
import QuickCapture from './components/quickCapture';
import EditTaskDialog from './components/editTaskDialog';
import SettingsPanel, { ThemeMode } from './components/settingsPanel';
import { PromptDialog, ConfirmDialog } from './components/dialogPrompt';
import { useTaskData } from './hooks/useTaskData';
import { FolderNode, Priority, Task, TaskWithSubtasks, WindowState } from './data/types';
import { formatDeadline } from './components/utils/formatDate';

/** 对话框状态机 */
type DialogState =
  | { type: 'create-folder'; parentId: string | null }
  | { type: 'rename-folder'; folderId: string; defaultValue: string }
  | { type: 'delete-folder'; folderId: string; name: string }
  | { type: 'add-subtask'; taskId: string; folderId: string | null }
  | null;

/** 可撤销的最近一次操作：任务完成、任务恢复、任务删除 */
type LastAction =
  | { kind: 'completed'; taskId: string }
  | { kind: 'restored'; taskId: string }
  | { kind: 'deleted'; taskId: string }
  | null;

function App() {
  const {
    folderTree, unclassifiedTasks, completedTasks, allFolders, theme, settings, windowState, loading, error,
    refresh, setTheme, updateSettings, saveWindowState, createTask, toggleCompleted, updateTask,
    deleteTask, restoreTask, reorderTasks, reorderFolders, createFolder, renameFolder, deleteFolder,
  } = useTaskData();

  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set(['folder-ky', 'folder-lw', 'folder-sy', 'folder-gp', 'folder-sh'])
  );
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(() => new Set(['task-lw1']));
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [lastAction, setLastAction] = useState<LastAction>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  /** 编辑中的任务（右键菜单 → 编辑） */
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // 提醒定时器读取最新值（避免 effect 闭包陈旧）
  const settingsLatest = useRef(settings);
  settingsLatest.current = settings;
  const folderTreeLatest = useRef(folderTree);
  folderTreeLatest.current = folderTree;
  const unclassifiedLatest = useRef(unclassifiedTasks);
  unclassifiedLatest.current = unclassifiedTasks;

  // 主题切换：挂载/切换 .dark class 到 document
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  // 撤销提示 5 秒自动消失（同时清除可撤销记录）
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => {
      setToast(null);
      setLastAction(null);
    }, 5000);
    return () => clearTimeout(t);
  }, [toast]);

  // DeskPins：锁定/解锁窗口可调整大小
  useEffect(() => {
    getCurrentWindow().setResizable(!pinned).catch(() => {});
  }, [pinned]);

  const toggleSet = (set: Set<string>, id: string): Set<string> => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  // ===== 任务操作 =====

  /** 在文件夹树、未分类任务、已完成区中查找任务（含任意层级子任务，递归） */
  const findTaskAnywhere = (id: string): Task | undefined => {
    const findInTasks = (list: TaskWithSubtasks[]): Task | undefined => {
      for (const t of list) {
        if (t.id === id) return t;
        const sub = findInTasks(t.subtasks);
        if (sub) return sub;
      }
      return undefined;
    };
    const findInTree = (nodes: FolderNode[]): Task | undefined => {
      for (const n of nodes) {
        const found = findInTasks(n.tasks);
        if (found) return found;
        const child = findInTree(n.children);
        if (child) return child;
      }
      return undefined;
    };
    return findInTree(folderTree)
      || findInTasks(unclassifiedTasks)
      || completedTasks.find((t) => t.id === id);
  };

  const handleToggleCompleted = async (id: string) => {
    const task = findTaskAnywhere(id);
    await toggleCompleted(id);
    if (task) {
      setLastAction({ kind: 'completed', taskId: id });
      setToast(`已完成 "${task.title}"`);
    }
  };

  const handleRestore = async (id: string) => {
    const task = completedTasks.find((t) => t.id === id);
    await restoreTask(id);
    if (task) {
      setLastAction({ kind: 'restored', taskId: id });
      setToast(`已恢复 "${task.title}"`);
    }
  };

  const handleDeleteTask = async (id: string) => {
    const task = findTaskAnywhere(id);
    await deleteTask(id);
    if (task) {
      setLastAction({ kind: 'deleted', taskId: id });
      setToast(`已删除 "${task.title}"`);
    }
  };

  const handleUndo = async () => {
    if (!lastAction) return;
    const { kind, taskId } = lastAction;
    setLastAction(null);
    if (kind === 'completed') {
      await toggleCompleted(taskId); // 撤销完成：恢复未完成
    } else if (kind === 'restored') {
      await toggleCompleted(taskId); // 撤销恢复：重新标记完成
    } else {
      await restoreTask(taskId); // 撤销删除：恢复任务到原位置
    }
    setToast(null);
  };

  /** 全部展开：展开所有文件夹（含嵌套） */
  const expandAll = () => {
    const allFolderIds = new Set<string>();
    const collect = (nodes: FolderNode[]) => {
      nodes.forEach((n) => {
        allFolderIds.add(n.id);
        collect(n.children);
      });
    };
    collect(folderTree);
    setExpandedFolders(allFolderIds);
  };

  /** 全部折叠：折叠所有文件夹与任务子列表 */
  const collapseAll = () => {
    setExpandedFolders(new Set());
    setExpandedTasks(new Set());
  };

  // Ctrl 快捷键撤销/展开/折叠/新建（输入框内不触发）
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;
      const key = e.key.toLowerCase();
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if (key === 'z') { e.preventDefault(); handleUndo(); return; }
      if (key === 'e') { e.preventDefault(); expandAll(); return; }
      if (key === 's') { e.preventDefault(); collapseAll(); return; }
      if (key === 'n') { e.preventDefault(); setCaptureOpen(true); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  // 全局快捷键（Ctrl+Shift+Space）触发快速创建弹窗（Rust 侧注册后 emit 事件）
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen('quick-capture-toggle', () => setCaptureOpen(true)).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, []);

  // ===== 窗口状态持久化（Task 14）：位置/大小 + 文件夹展开状态 =====

  /** 递归收集所有文件夹 id */
  const collectFolderIds = (nodes: FolderNode[]): string[] => {
    const ids: string[] = [];
    const walk = (list: FolderNode[]) => {
      for (const n of list) {
        ids.push(n.id);
        walk(n.children);
      }
    };
    walk(nodes);
    return ids;
  };

  /** Rust WorkerW attach 完成后置为 true（此时坐标空间固定，可恢复/保存几何） */
  const [attached, setAttached] = useState(false);
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen('window-attached', () => setAttached(true)).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, []);

  // 几何防抖保存（拖动/缩放高频触发，300ms 合并写库）
  const geomPending = useRef<Partial<WindowState>>({});
  const geomTimer = useRef<number | null>(null);
  const queueGeomSave = (patch: Partial<WindowState>) => {
    geomPending.current = { ...geomPending.current, ...patch };
    if (geomTimer.current !== null) clearTimeout(geomTimer.current);
    geomTimer.current = window.setTimeout(() => {
      const pending = geomPending.current;
      geomPending.current = {};
      saveWindowState(pending);
    }, 300);
  };

  // 仅首次恢复几何（避免保存后的 windowState 更新反复触发恢复覆盖用户操作）
  const geomRestored = useRef(false);
  useEffect(() => {
    if (geomRestored.current || !attached || !windowState) return;
    geomRestored.current = true;
    const win = getCurrentWindow();
    win.setPosition(new PhysicalPosition(windowState.x, windowState.y)).catch(() => {});
    win.setSize(new PhysicalSize(windowState.width, windowState.height)).catch(() => {});
  }, [attached, windowState]);

  // attach 完成后监听移动/缩放 → 防抖保存
  useEffect(() => {
    if (!attached) return;
    const win = getCurrentWindow();
    const unMoved = win.onMoved(({ payload }) => queueGeomSave({ x: payload.x, y: payload.y }));
    const unResized = win.onResized(({ payload }) => queueGeomSave({ width: payload.width, height: payload.height }));
    return () => {
      unMoved.then((fn) => fn());
      unResized.then((fn) => fn());
    };
  }, [attached, saveWindowState]);

  // 首次数据加载后，从保存的折叠集合恢复展开状态（默认全展开）
  const expandRestored = useRef(false);
  useEffect(() => {
    if (expandRestored.current || loading || !windowState || folderTree.length === 0) return;
    expandRestored.current = true;
    const all = collectFolderIds(folderTree);
    const collapsed = new Set(windowState.collapsedFolders);
    setExpandedFolders(new Set(all.filter((id) => !collapsed.has(id))));
  }, [loading, windowState, folderTree]);

  // 展开状态变化 → 防抖保存折叠文件夹集合（新增文件夹默认展开，不入折叠集）
  const expandTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!expandRestored.current) return;
    const all = collectFolderIds(folderTree);
    if (all.length === 0) return;
    const collapsed = all.filter((id) => !expandedFolders.has(id));
    if (expandTimer.current !== null) clearTimeout(expandTimer.current);
    expandTimer.current = window.setTimeout(() => {
      saveWindowState({ collapsedFolders: collapsed });
    }, 300);
  }, [expandedFolders, folderTree, saveWindowState]);

  // ===== 开机自启动：settings.autoStart 变化时同步注册/取消系统启动项 =====
  useEffect(() => {
    if (!settings) return;
    if (settings.autoStart) autostartEnable().catch(() => {});
    else autostartDisable().catch(() => {});
  }, [settings]);

  // ===== 任务提醒（Task 13）：到达提前提醒窗口触发 Windows 通知 + 可选自动置顶 =====

  /** 收集所有活动任务（含任意层级子任务） */
  const collectAllTasks = (): TaskWithSubtasks[] => {
    const out: TaskWithSubtasks[] = [];
    const walk = (list: TaskWithSubtasks[]) => {
      for (const t of list) {
        out.push(t);
        walk(t.subtasks);
      }
    };
    folderTreeLatest.current.forEach((n) => walk(n.tasks));
    walk(unclassifiedLatest.current);
    return out;
  };

  useEffect(() => {
    let notified = new Set<string>();
    let permChecked = false;
    const ensurePermission = async () => {
      if (permChecked) return;
      permChecked = true;
      try {
        if (!(await isPermissionGranted())) await requestPermission();
      } catch { /* 权限不可用时静默降级 */ }
    };
    ensurePermission();

    const checkReminders = async () => {
      try {
        const s = settingsLatest.current;
        if (!s) return;
        if (!s.reminderEnabled) return;
        const offset = s.reminderOffset ?? 86400;
        if (offset <= 0) return;
        // offset 单位为秒，deadline/now 为毫秒，统一转为毫秒比较
        const offsetMs = offset * 1000;
        const now = Date.now();
        const tasks = collectAllTasks();
        for (const t of tasks) {
          if (t.completed || t.deadline === null || notified.has(t.id)) continue;
          const lead = t.deadline - now;
          // 提醒窗口：截止前 offset 至 截止后 offset（刚过期的任务也提醒一次，久远过期不打扰）
          if (lead > offsetMs || lead < -offsetMs) continue;
          notified.add(t.id);
          const due = lead <= 0;
          const body = due
            ? `「${t.title}」已到截止时间（${formatDeadline(t.deadline)}）`
            : `「${t.title}」将于 ${formatDeadline(t.deadline)} 截止`;
          // 应用内提示先行（系统通知不可用/失败时仍可见）
          setToast(body);
          try {
            await sendNotification({ title: '任务提醒', body });
          } catch { /* 系统通知失败不影响应用内提示与自动置顶 */ }
          // 提醒后自动置顶：标记"重要"使其排到列表前列
          if (s.autoPin && t.priority !== 'important') {
            await updateTask(t.id, { priority: 'important' });
          }
        }
      } catch { /* 提醒异常静默忽略，不影响主流程 */ }
    };

    checkReminders();
    const timer = setInterval(checkReminders, 15_000);
    return () => clearInterval(timer);
  }, [updateTask]);

  const handleCreateTask = async (
    title: string,
    folderId: string | null,
    options?: { priority?: Priority; startDate?: number | null; deadline?: number | null; remark?: string }
  ) => {
    await createTask(title, folderId, options);
    setCaptureOpen(false);
  };

  // ===== 搜索过滤（标题/备注/子任务，递归） =====

  /** 任务是否匹配关键词（含任意层级子任务，递归） */
  const taskMatches = (t: TaskWithSubtasks, q: string): boolean =>
    t.title.toLowerCase().includes(q)
    || t.remark.toLowerCase().includes(q)
    || t.subtasks.some((s) => taskMatches(s, q));

  const filteredCompleted = useMemo(() => {
    if (!searchQuery.trim()) return completedTasks;
    const q = searchQuery.toLowerCase();
    return completedTasks.filter((t) => t.title.toLowerCase().includes(q));
  }, [completedTasks, searchQuery]);

  // 未分类任务过滤
  const unclassifiedToRender = useMemo(() => {
    if (!searchQuery.trim()) return unclassifiedTasks;
    const q = searchQuery.toLowerCase();
    return unclassifiedTasks.filter((t) => taskMatches(t, q));
  }, [unclassifiedTasks, searchQuery]);

  // ===== 递归过滤文件夹树（搜索时保留含匹配任务的路径；文件夹名匹配时保留该文件夹） =====
  const treeToRender = useMemo(() => {
    if (!searchQuery.trim()) return folderTree;
    const q = searchQuery.toLowerCase();
    const filterNode = (node: FolderNode): FolderNode | null => {
      const nameMatch = node.name.toLowerCase().includes(q);
      const tasks = node.tasks.filter((t) => taskMatches(t, q));
      const children = node.children.map(filterNode).filter((c): c is FolderNode => c !== null);
      if (!nameMatch && tasks.length === 0 && children.length === 0) return null;
      return { ...node, tasks, children };
    };
    return folderTree.map(filterNode).filter((n): n is FolderNode => n !== null);
  }, [folderTree, searchQuery]);

  const matchCount = useMemo(() => {
    const activeCount = treeToRender.reduce((acc, folder) => {
      const count = (node: FolderNode): number =>
        node.tasks.length + node.children.reduce((a, c) => a + count(c), 0);
      return acc + count(folder);
    }, 0);
    return activeCount + unclassifiedToRender.length + filteredCompleted.length;
  }, [treeToRender, unclassifiedToRender, filteredCompleted]);

  // 加载状态
  if (loading) {
    return (
      <div style={{
        width: '100%', height: '100%', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-sans)', color: 'var(--muted-foreground)',
        fontSize: 14,
      }}>
        加载中...
      </div>
    );
  }

  // 错误状态
  if (error) {
    return (
      <div style={{
        width: '100%', height: '100%', display: 'flex',
        alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
        gap: 8, fontFamily: 'var(--font-sans)', color: 'var(--destructive)',
        fontSize: 14, padding: 20, textAlign: 'center',
      }}>
        <span>数据库加载失败</span>
        <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{error}</span>
      </div>
    );
  }

  // 外观设置：毛玻璃 + 透明度（设置面板持久化后生效）
  const glassEnabled = settings?.glassEffect ?? true;
  const transparency = Math.round((settings?.transparency ?? 0.8) * 100);

  return (
    <div
      className={theme}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-sans)',
        color: 'var(--foreground)',
        borderRadius: 'calc(var(--radius) * 1.1)',
        overflow: 'hidden',
      }}
      onContextMenu={(e) => {
        // 顶部栏右键不弹出菜单
        if ((e.target as HTMLElement).closest('header')) return;
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, taskId: null });
      }}
    >
      {/* 毛玻璃主容器 */}
      <div style={{
        position: 'relative',
        zIndex: 1,
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 'calc(var(--radius) * 1.1)',
        background: glassEnabled
          ? `color-mix(in srgb, var(--background) ${transparency}%, transparent)`
          : 'var(--background)',
        ...(glassEnabled ? {
          WebkitBackdropFilter: 'saturate(180%) blur(40px)',
          backdropFilter: 'saturate(180%) blur(40px)',
        } : {}),
        boxShadow: 'var(--shadow-xl), 0 0 0 0.5px color-mix(in srgb, var(--border) 40%, transparent)',
        overflow: 'hidden',
        border: '0.5px solid color-mix(in srgb, var(--border) 30%, transparent)',
      }}>
        <TopBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onOpenSettings={() => setSettingsOpen(true)}
          onNewTask={() => setCaptureOpen(true)}
          pinned={pinned}
          onTogglePin={() => setPinned(!pinned)}
        />

        {/* 分隔线 */}
        <div style={{ height: 0.5, background: 'var(--border)', margin: '0 20px', flexShrink: 0, opacity: 0.6 }} />

        {/* 搜索提示 */}
        {searchQuery.trim() && (
          <div style={{ padding: '8px 20px 2px', flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>找到 {matchCount} 个匹配结果</span>
          </div>
        )}

        {/* 树视图（可滚动） */}
        <main
          data-tree
          style={{
            flex: 1,
            overflowY: 'auto',
            minHeight: 0,
            padding: '8px 20px 20px',
          }}
        >
          <FolderTree
            folders={treeToRender}
            rootTasks={unclassifiedToRender}
            expandedFolders={expandedFolders}
            expandedTasks={expandedTasks}
            searchQuery={searchQuery}
            sortType={settings?.sortType ?? 'deadline'}
            importantTop={settings?.importantTop ?? false}
            manualSort={settings?.sortType === 'manual'}
            deadlineGradient={settings?.deadlineGradient ?? true}
            onReorderTasks={reorderTasks}
            onReorderFolders={reorderFolders}
            onToggleFolder={(id) => setExpandedFolders((s) => toggleSet(s, id))}
            onToggleTaskExpanded={(id) => setExpandedTasks((s) => toggleSet(s, id))}
            onToggleCompleted={handleToggleCompleted}
            onContextMenuTask={(e, taskId) => {
              e.preventDefault();
              e.stopPropagation();
              setContextMenu({ x: e.clientX, y: e.clientY, taskId });
            }}
            onContextMenuFolder={(e, folderId) => {
              e.preventDefault();
              e.stopPropagation();
              setContextMenu({ x: e.clientX, y: e.clientY, taskId: null, folderId });
            }}
          />

          {/* 分隔线 */}
          <div style={{ height: 0.5, background: 'var(--border)', margin: '12px 0 8px', opacity: 0.5 }} />

          <CompletedSection
            tasks={filteredCompleted}
            expanded={completedExpanded}
            onToggleExpanded={() => setCompletedExpanded(!completedExpanded)}
            onRestore={handleRestore}
          />
        </main>
      </div>

      {/* 右键菜单 */}
      <ContextMenu
        state={contextMenu}
        onClose={() => setContextMenu(null)}
        onEditTask={(taskId) => {
          const task = findTaskAnywhere(taskId);
          if (task) setEditingTask(task);
        }}
        onAddSubtask={(taskId) => {
          const task = findTaskAnywhere(taskId);
          setDialog({ type: 'add-subtask', taskId, folderId: task?.folderId ?? null });
        }}
        onToggleComplete={handleToggleCompleted}
        onExpandAll={expandAll}
        onCollapseAll={collapseAll}
        onDeleteTask={handleDeleteTask}
        onCreateFolder={(parentId) => {
          setDialog({ type: 'create-folder', parentId });
        }}
        onRenameFolder={(folderId) => {
          const folder = allFolders.find((f) => f.id === folderId);
          setDialog({ type: 'rename-folder', folderId, defaultValue: folder?.name || '' });
        }}
        onDeleteFolder={(folderId) => {
          const folder = allFolders.find((f) => f.id === folderId);
          setDialog({ type: 'delete-folder', folderId, name: folder?.name || '' });
        }}
        onNewTask={() => setCaptureOpen(true)}
        onRefresh={() => refresh()}
        onOpenSettings={() => setSettingsOpen(true)}
        onExit={() => { void invoke('exit_app'); }}
      />

      {/* Quick Capture */}
      {captureOpen && (
        <QuickCapture
          folders={folderTree}
          onClose={() => setCaptureOpen(false)}
          onCreate={handleCreateTask}
        />
      )}

      {/* 编辑任务弹窗 */}
      {editingTask && (
        <EditTaskDialog
          task={editingTask}
          onSave={async (updates) => { await updateTask(editingTask.id, updates); }}
          onClose={() => setEditingTask(null)}
        />
      )}

      {/* 设置面板 */}
      {settingsOpen && (
        <SettingsPanel
          theme={theme as ThemeMode}
          onThemeChange={(t) => setTheme(t)}
          settings={settings}
          onChange={updateSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {/* 文件夹对话框（替代 prompt/confirm） */}
      {dialog?.type === 'create-folder' && (
        <PromptDialog
          title="新建文件夹"
          placeholder="文件夹名称"
          confirmText="创建"
          onConfirm={async (name) => {
            await createFolder(name, dialog.parentId);
            setDialog(null);
          }}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'rename-folder' && (
        <PromptDialog
          title="重命名文件夹"
          defaultValue={dialog.defaultValue}
          placeholder="文件夹名称"
          confirmText="保存"
          onConfirm={async (name) => {
            await renameFolder(dialog.folderId, name);
            setDialog(null);
          }}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'delete-folder' && (
        <ConfirmDialog
          title="删除文件夹"
          message={`确定删除文件夹 "${dialog.name}" 及其所有任务？此操作不可恢复。`}
          confirmText="删除"
          destructive
          onConfirm={async () => {
            await deleteFolder(dialog.folderId);
            setDialog(null);
          }}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'add-subtask' && (
        <PromptDialog
          title="添加子任务"
          placeholder="子任务名称"
          confirmText="添加"
          onConfirm={async (name) => {
            // 子任务继承父任务所在文件夹；完成后自动展开父任务便于查看
            await createTask(name, dialog.folderId, { parentId: dialog.taskId });
            setExpandedTasks((s) => new Set(s).add(dialog.taskId));
            setDialog(null);
          }}
          onCancel={() => setDialog(null)}
        />
      )}

      {/* Undo Toast */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 16,
          height: 40,
          padding: '0 20px',
          borderRadius: 'calc(var(--radius)*0.8)',
          background: 'var(--foreground)',
          color: 'var(--background)',
          fontSize: 13,
          fontWeight: 500,
          boxShadow: 'var(--shadow-lg)',
          zIndex: 200,
          whiteSpace: 'nowrap',
        }}>
          <span>{toast}</span>
          {lastAction && (
            <button
              onClick={handleUndo}
              style={{
                color: 'var(--brand-400)',
                fontWeight: 600,
                cursor: 'pointer',
                border: 'none',
                background: 'transparent',
                fontSize: 13,
                fontFamily: 'var(--font-sans)',
                padding: 0,
                whiteSpace: 'nowrap',
              }}
            >
              撤销
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
