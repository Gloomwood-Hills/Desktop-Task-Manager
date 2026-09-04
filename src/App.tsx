import { useEffect, useMemo, useRef, useState } from 'react';
import { getCurrentWindow, PhysicalPosition, PhysicalSize } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { enable as autostartEnable, disable as autostartDisable } from '@tauri-apps/plugin-autostart';
import TopBar from './components/topBar';
import FolderTree from './components/folderTree';
import CompletedSection from './components/completedSection';
import CalendarView from './components/calendarView';
import DayView from './components/dayView';
import ContextMenu, { ContextMenuState } from './components/contextMenu';
import QuickCapture from './components/quickCapture';
import EditTaskDialog from './components/editTaskDialog';
import SettingsPanel, { ThemeMode } from './components/settingsPanel';
import { PromptDialog, ConfirmDialog } from './components/dialogPrompt';
import { useTaskData } from './hooks/useTaskData';
import { getDatabase } from './data';
import { TaskService } from './services';
import { FolderNode, Priority, Task, TaskWithSubtasks, ViewMode, WindowState, SyncPolicy } from './data/types';
import { isMobile } from './data/platform';
import { formatDeadline } from './components/utils/formatDate';
import { syncAuto, configureAutoSync, startAutoSync, stopAutoSync, logSync } from './data/sync';

/** 视图切换入口：桌面为顶部胶囊按钮组；移动端（Android）为顶栏下方的分段控件
 * （不再做底部固定导航——回到顶部区域、靠近顶栏操作）。isMobile 为模块级常量，
 * 两套样式互不影响，桌面视觉零回归。 */
function ViewTabs({ mode, onChange, mobile }: {
  mode: ViewMode;
  onChange: (m: ViewMode) => void;
  mobile: boolean;
}) {
  return (
    <div style={mobile ? {
      display: 'flex',
      gap: 4,
      flexShrink: 0,
      padding: '6px 12px 8px',
    } : {
      display: 'flex', gap: 2, padding: '8px 20px 0', flexShrink: 0,
    }}>
      {(['list', 'calendar', 'day'] as ViewMode[]).map((m) => {
        const active = mode === m;
        const label = m === 'list' ? '列表' : m === 'calendar' ? '月' : '日';
        return (
          <button
            key={m}
            onClick={() => onChange(m)}
            aria-pressed={active}
            style={mobile ? {
              flex: 1,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: 32,
              border: 'none',
              borderRadius: 9,
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
              fontWeight: active ? 600 : 500,
              color: active ? 'var(--brand-400)' : 'var(--muted-foreground)',
              background: active ? 'color-mix(in srgb, var(--brand-400) 12%, transparent)' : 'transparent',
              transition: 'color 0.15s ease, background-color 0.15s ease',
            } : {
              display: 'inline-flex',
              alignItems: 'center',
              height: 26,
              padding: '0 12px',
              borderRadius: 999,
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              fontSize: 12.5,
              fontWeight: 600,
              color: active ? 'var(--brand-400)' : 'var(--muted-foreground)',
              background: active ? 'color-mix(in srgb, var(--brand-400) 12%, transparent)' : 'transparent',
              transition: 'color 0.15s ease, background-color 0.15s ease',
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

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
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set());
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(() => new Set());
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  /** 新建弹窗预选文件夹（右键文件夹 → 新建任务时记录；弹窗关闭/创建后清空） */
  const [captureFolder, setCaptureFolder] = useState<string | null>(null);
  /** 新建弹窗预填日期（日视图"新建任务"触发时记录；弹窗关闭/创建后清空） */
  const [prefillDate, setPrefillDate] = useState<number | null>(null);
  const [lastAction, setLastAction] = useState<LastAction>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  /** 编辑中的任务（右键菜单 → 编辑） */
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  /** 顶栏同步按钮状态：进行中禁用点击并旋转图标 */
  const [syncBusy, setSyncBusy] = useState(false);
  /** 已删除任务查看弹窗 */
  const [deletedOpen, setDeletedOpen] = useState(false);
  const [deletedTasks, setDeletedTasks] = useState<Task[]>([]);

  // ===== 视图切换（V2：列表 / 日历 / 日） =====
  /** 当前视图模式：从持久化 Settings 初始化，切换后回写 */
  const [viewMode, setViewMode] = useState<ViewMode>(settings?.viewMode ?? 'list');
  /** 日视图当前查看日（当天 00:00 时间戳） */
  const [calendarDate, setCalendarDate] = useState<number>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  });

  /** 切换视图并持久化到 Settings.viewMode */
  const changeViewMode = (m: ViewMode) => {
    setViewMode(m);
    void updateSettings({ viewMode: m });
  };

  // settings 异步加载完成或外部变更时，同步本地视图状态（ref 读取最新值避免闭包陈旧）
  const viewModeLatest = useRef(viewMode);
  viewModeLatest.current = viewMode;
  useEffect(() => {
    if (settings && settings.viewMode !== viewModeLatest.current) setViewMode(settings.viewMode);
  }, [settings]);

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

  // DeskPins：锁定/解锁窗口可调整大小（桌面专属：Android 全屏无窗口缩放概念，跳过）
  useEffect(() => {
    if (isMobile) return;
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
      if (key === 'n') { e.preventDefault(); setCaptureFolder(null); setCaptureOpen(true); }
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

  /** Rust WorkerW attach 完成后置为 true（此时坐标空间固定，可恢复/保存几何）。
   * 仅桌面存在该事件（Android 无 SetParent 桌面层），跳过监听。 */
  const [attached, setAttached] = useState(false);
  useEffect(() => {
    if (isMobile) return;
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

  // 仅首次恢复几何（避免保存后的 windowState 更新反复触发恢复覆盖用户操作）。
  // 窗口几何为桌面专属（Android 上由系统全屏管理），跳过。
  const geomRestored = useRef(false);
  useEffect(() => {
    if (isMobile || geomRestored.current || !attached || !windowState) return;
    geomRestored.current = true;
    const win = getCurrentWindow();
    win.setPosition(new PhysicalPosition(windowState.x, windowState.y)).catch(() => {});
    win.setSize(new PhysicalSize(windowState.width, windowState.height)).catch(() => {});
  }, [attached, windowState]);

  // attach 完成后监听移动/缩放 → 防抖保存（桌面专属，Android 跳过）
  useEffect(() => {
    if (isMobile || !attached) return;
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
  // 桌面专属（Android 无自启动注册能力，且对应 Rust 插件不随移动端构建），跳过调用。
  useEffect(() => {
    if (!settings || isMobile) return;
    if (settings.autoStart) autostartEnable().catch(() => {});
    else autostartDisable().catch(() => {});
  }, [settings]);

  // ===== 自动同步（V2.1 Task 6）：settings.autoSync 变化时联动调度器；startAutoSync 幂等不重复建 interval =====
  useEffect(() => {
    if (!settings) return;
    configureAutoSync(settings.autoSync);
    startAutoSync();
  }, [settings?.autoSync]);

  // 应用卸载时停止自动同步定时器
  useEffect(() => {
    return () => { stopAutoSync(); };
  }, []);

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
    setPrefillDate(null);
    setCaptureFolder(null);
    setCaptureOpen(false);
  };

  // ===== 一键更新（合并式同步，无需选择上传/下载方向） =====

  /** 校验 WebDAV 配置是否就绪（未配置时提示先到设置里配置） */
  const syncConfigReady = (): boolean =>
    !!settings?.webdavUrl && !!settings.webdavUsername && !!settings.webdavPassword;

  /** 一键更新：执行合并式同步（拉取→合并→写回两端），无需选择方向 */
  /** 以指定策略执行同步（一键更新按默认策略；上传/覆盖键强制特定策略） */
  const runSyncWithPolicy = async (policy: SyncPolicy, label: string) => {
    if (syncBusy || !settings) return;
    if (!syncConfigReady()) {
      logSync('warn', label, '未配置坚果云账号/应用密码（设置 → 同步）');
      setToast('请先在 设置 → 同步 中配置 WebDAV 账号');
      return;
    }
    setSyncBusy(true);
    const policyLabel = policy === 'uploadOnly' ? '仅上传云端' : policy === 'downloadOnly' ? '仅覆盖本地' : '双向合并';
    logSync('info', label, `开始（策略：${policyLabel}）`);
    try {
      const syncSettings = {
        webdavUrl: settings.webdavUrl,
        webdavUsername: settings.webdavUsername,
        webdavPassword: settings.webdavPassword,
      };
      const result = await syncAuto(syncSettings, settings.lastSyncedAt, policy);
      logSync(result.status === 'error' ? 'error' : 'success', label, result.message);
      setToast(result.message);
      if (result.status === 'merged' || result.status === 'uploaded' || result.status === 'downloaded') {
        await updateSettings({
          lastSyncedAt: Date.now(),
          lastSyncAction: result.status === 'merged' ? 'merged' : result.status === 'uploaded' ? 'upload' : 'download',
        });
      }
    } catch (error) {
      logSync('error', label, `异常：${error instanceof Error ? error.message : String(error)}`);
      setToast(`同步失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSyncBusy(false);
    }
  };

  /** 一键更新：按用户设置的默认同步策略执行（当前默认双向合并） */
  const handleOneClickSync = () => runSyncWithPolicy(settings?.syncPolicy ?? 'twoWay', '一键更新');
  /** 强制策略同步（顶栏 上传云端 / 覆盖本地 键） */
  const handleForceSync = (policy: SyncPolicy) =>
    runSyncWithPolicy(policy, policy === 'uploadOnly' ? '上传云端' : '覆盖本地');

  /** 打开已删除任务查看（30 天内保留） */
  const handleOpenDeleted = async () => {
    setDeletedOpen(true);
    try {
      const db = await getDatabase();
      setDeletedTasks(await new TaskService(db).getAllDeleted());
    } catch { /* 打开失败时忽略 */ }
  };

  // ===== 视图数据（V2）：日历 / 日视图共用的展平活动任务列表 =====

  /** 展平的未完成任务列表（递归收集文件夹树与未分类任务，含任意层级子任务，响应式随数据刷新） */
  const allActiveTasks = useMemo<TaskWithSubtasks[]>(() => {
    const out: TaskWithSubtasks[] = [];
    const walk = (list: TaskWithSubtasks[]) => {
      for (const t of list) {
        if (!t.completed) out.push(t);
        walk(t.subtasks);
      }
    };
    folderTree.forEach((n) => walk(n.tasks));
    walk(unclassifiedTasks);
    return out;
  }, [folderTree, unclassifiedTasks]);

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
        // 移动端全屏：去掉桌面窗口的圆角/阴影外观
        borderRadius: isMobile ? 0 : 'calc(var(--radius) * 1.1)',
        overflow: 'hidden',
      }}
      onContextMenu={(e) => {
        // 顶部栏右键不弹出菜单
        if ((e.target as HTMLElement).closest('header')) return;
        e.preventDefault();
        // 移动端：空白处长按不再弹桌面式右键菜单（新建/展开/退出等由顶栏与系统手势承担）
        if (isMobile) return;
        setContextMenu({ x: e.clientX, y: e.clientY, taskId: null });
      }}
    >
      {/* 毛玻璃主容器 */}
      <div style={{
        position: 'relative',
        zIndex: 1,
        width: '100%',
        // 移动端明确使用视口高度（Android WebView 全屏），桌面沿用父容器 100%
        height: isMobile ? '100vh' : '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: isMobile ? 0 : 'calc(var(--radius) * 1.1)',
        // 移动端 edge-to-edge：顶部留出状态栏高度空白（env 兜底 12px），避免内容被通知栏遮挡无法点击
        // 移动端系统栏避让由原生层（MainActivity 按 WindowInsets 内缩）统一处理，
        // CSS 不再依赖 env(safe-area-inset-*)（部分 WebView/鸿蒙返回 0），避免双重留白。
        paddingTop: isMobile ? 12 : 0,
        background: glassEnabled
          ? `color-mix(in srgb, var(--background) ${transparency}%, transparent)`
          : 'var(--background)',
        ...(glassEnabled ? {
          WebkitBackdropFilter: 'saturate(180%) blur(40px)',
          backdropFilter: 'saturate(180%) blur(40px)',
        } : {}),
        boxShadow: isMobile
          ? 'none'
          : 'var(--shadow-xl), 0 0 0 0.5px color-mix(in srgb, var(--border) 40%, transparent)',
        overflow: 'hidden',
        border: isMobile
          ? 'none'
          : '0.5px solid color-mix(in srgb, var(--border) 30%, transparent)',
      }}>
        <TopBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onOpenSettings={() => setSettingsOpen(true)}
          onNewTask={() => {
            // 日视图下通过顶部标题栏新建时，预填当前查看的日期
            if (viewMode === 'day') {
              setPrefillDate(calendarDate);
            }
            setCaptureFolder(null);
            setCaptureOpen(true);
          }}
          onNewFolder={() => setDialog({ type: 'create-folder', parentId: null })}
          pinned={pinned}
          onTogglePin={() => setPinned(!pinned)}
          onSync={handleOneClickSync}
          onUploadCloud={() => handleForceSync('uploadOnly')}
          onDownloadCloud={() => handleForceSync('downloadOnly')}
          onOpenDeleted={handleOpenDeleted}
          syncBusy={syncBusy}
        />

        {/* 分隔线 */}
        <div style={{ height: 0.5, background: 'var(--border)', margin: '0 20px', flexShrink: 0, opacity: 0.6 }} />

        {/* 视图切换（V2：列表 / 日历 / 日）；桌面顶部胶囊组，移动端同步键下方的分段控件 */}
        <ViewTabs mode={viewMode} onChange={changeViewMode} mobile={isMobile} />

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
            // Android WebView 触摸滚动：显式允许纵向滚动手势（触屏不启动拖拽排序）
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
            touchAction: 'pan-y',
            // 移动端系统栏（导航栏）避让由原生层处理，此处仅留视觉留白
            padding: isMobile ? '8px 16px 24px' : '8px 20px 20px',
          }}
        >
          {/* 列表视图：文件夹树 + 已完成区（现有行为保持不变） */}
          {viewMode === 'list' && (
            <>
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
                dark={theme === 'dark'}
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
            </>
          )}

          {/* 日历视图（V2） */}
          {viewMode === 'calendar' && (
            <CalendarView
              tasks={allActiveTasks}
              onSelectDay={(ts) => {
                setCalendarDate(ts);
                changeViewMode('day');
              }}
            />
          )}

          {/* 日视图（V2） */}
          {viewMode === 'day' && (
            <DayView
              tasks={allActiveTasks}
              date={calendarDate}
              onDateChange={setCalendarDate}
            />
          )}
        </main>

        {/* 移动端底部导航已移除：视图切换移到顶栏下方（同步键下），底部让给列表内容 + 手势区 */}
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
        onNewTask={() => {
          setCaptureFolder(null);
          setCaptureOpen(true);
        }}
        onNewTaskInFolder={(folderId) => {
          setCaptureFolder(folderId);
          setCaptureOpen(true);
        }}
        onRefresh={() => refresh()}
        onOpenSettings={() => setSettingsOpen(true)}
        onExit={() => { void invoke('exit_app'); }}
      />

      {/* Quick Capture */}
      {captureOpen && (
        <QuickCapture
          folders={folderTree}
          onClose={() => {
            setPrefillDate(null);
            setCaptureFolder(null);
            setCaptureOpen(false);
          }}
          onCreate={handleCreateTask}
          initialDate={prefillDate ?? undefined}
          initialFolderId={captureFolder}
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
          // 移动端上移，避免被底部视图导航遮挡
          bottom: isMobile ? 84 : 24,
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

      {/* 已删除任务查看（30 天内保留，到期自动清除） */}
      {deletedOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)' }} onClick={() => setDeletedOpen(false)} />
          <div style={{ position: 'relative', width: 'min(520px, 92vw)', maxHeight: '75vh', display: 'flex', flexDirection: 'column', background: 'var(--background)', borderRadius: 'calc(var(--radius)*1.1)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px 10px' }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--foreground)' }}>已删除任务</span>
              <button
                onClick={() => setDeletedOpen(false)}
                aria-label="关闭"
                style={{ width: 28, height: 28, border: 'none', background: 'transparent', color: 'var(--icon-muted)', borderRadius: 6, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
              >
                ×
              </button>
            </div>
            <div style={{ padding: '0 18px 6px', fontSize: 12, color: 'var(--muted-foreground)' }}>已删除任务仅保留 30 天，到期自动清除。</div>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '6px 18px 18px', touchAction: 'pan-y' }}>
              {deletedTasks.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--muted-foreground)', padding: '32px 0', fontSize: 13 }}>暂无已删除任务</div>
              ) : deletedTasks.map((t) => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 4px', borderBottom: '0.5px solid var(--border)' }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: 'var(--foreground)', textDecoration: 'line-through', opacity: 0.75 }}>{t.title}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>{t.updatedAt ? new Date(t.updatedAt).toLocaleString() : ''}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
