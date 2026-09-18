import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { fadeThrough, toastUp, sharedAxis, DUR } from './components/utils/motion';
import { glassSurface } from './components/utils/glass';
import { getCurrentWindow, PhysicalPosition, PhysicalSize } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { enable as autostartEnable, disable as autostartDisable } from '@tauri-apps/plugin-autostart';
import TopBar from './components/topBar';
import FolderTree from './components/folderTree';
import FolderSidebar, { SidebarSelection } from './components/folderSidebar';
import CompletedSection from './components/completedSection';
import CalendarView from './components/calendarView';
import DayView from './components/dayView';
import ContextMenu, { ContextMenuState } from './components/contextMenu';
import { copyText, formatTaskClipboardText } from './components/utils/clipboard';
import QuickCapture from './components/quickCapture';
import EditTaskDialog from './components/editTaskDialog';
import SettingsPanel, { ThemeMode } from './components/settingsPanel';
import MobileBottomNav from './components/mobile/mobileBottomNav';
import MobileTaskList from './components/mobile/mobileTaskList';
import MobileTaskSheet from './components/mobile/mobileTaskSheet';
import { PromptDialog, ConfirmDialog } from './components/dialogPrompt';
import { useTaskData } from './hooks/useTaskData';
import { parseCommand, fuzzyScore } from './components/utils/commandParser';
import { applyDefaultDeadlineTime, formatDeadline } from './components/utils/formatDate';
import { getDatabase } from './data';
import { TaskService, FOLDER_NAME_MAX } from './services';
import { generateSubtasks, aiRunCommand, toTimestamp, DEFAULT_AI_BASE_URL } from './services/aiClient';
import type { AiToolCall, GeneratedSubtask } from './services/aiClient';
import { FolderNode, Priority, Task, TaskWithSubtasks, ViewMode, WindowState, SyncPolicy, TaskRepeatRule } from './data/types';
import { isMobile } from './data/platform';
import { syncAuto, configureAutoSync, startAutoSync, stopAutoSync, logSync } from './data/sync';

/** 对话框状态机 */
type DialogState =
  | { type: 'create-folder'; parentId: string | null }
  | { type: 'rename-folder'; folderId: string; defaultValue: string }
  | { type: 'delete-folder'; folderId: string; name: string }
  | null;

/** 可撤销的最近一次操作：任务完成、任务恢复、任务删除、结束重复 */
type LastAction =
  | { kind: 'completed'; taskId: string }
  | { kind: 'restored'; taskId: string }
  | { kind: 'deleted'; taskId: string; seriesId?: string }
  /** 结束重复：记录被清除的重复规则，使「撤销」能重新武装该系列 */
  | { kind: 'stoppedRepeat'; taskId: string; repeatRule: TaskRepeatRule; repeatIntervalDays: number | null }
  | null;

function App() {
  const {
    folderTree, unclassifiedTasks, completedTasks, allFolders, theme, settings, windowState, loading, error,
    refresh, setTheme, updateSettings, saveWindowState, createTask, toggleCompleted, updateTask,
    deleteTask, restoreTask, restoreSeries, stopRepeat, reorderTasks, reorderFolders, createFolder, renameFolder, deleteFolder,
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
  /** 命令框聚焦信号：小部件「快速记录」唤起主视图时自动聚焦命令栏 */
  const [commandFocusSignal, setCommandFocusSignal] = useState(0);
  /** AI 已解析好的「新建任务」草稿：弹出 QuickCapture 并预填（仅 create_task） */
  const [aiCreateDraft, setAiCreateDraft] = useState<null | {
    title: string; folderId: string | null; deadline: number | null; priority: Priority;
    remark: string; reminderOffsets: string[]; repeatRule: TaskRepeatRule | null; repeatIntervalDays: number | null; subtasks: GeneratedSubtask[];
  }>(null);
  /** AI 已解析好的「编辑任务」草稿：弹出 EditTaskDialog 并预填（仅 update_task） */
  const [aiEditDraft, setAiEditDraft] = useState<null | { task: Task; taskId: string; updates: Partial<Task> }>(null);
  const [pinned, setPinned] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  /** 编辑中的任务（右键菜单/移动端编辑 → 复用 QuickCapture 预填视图） */
  const [editingTask, setEditingTask] = useState<TaskWithSubtasks | null>(null);
  /** 移动端任务详情底部面板 */
  const [mobileTask, setMobileTask] = useState<TaskWithSubtasks | null>(null);
  /** 顶栏同步按钮状态：进行中禁用点击并旋转图标 */
  const [syncBusy, setSyncBusy] = useState(false);
  /** 已删除任务查看弹窗 */
  const [deletedOpen, setDeletedOpen] = useState(false);
  const [deletedTasks, setDeletedTasks] = useState<Task[]>([]);
  /** 是否已展开全部（顶栏同名功能键） */
  const [allExpanded, setAllExpanded] = useState(false);
  /** 文件夹侧栏「固定常开」开关（跨视图导航）；默认关闭 → 鼠标悬停左缘浮现，移开隐藏。持久化到 WindowState.sidebarOpen */
  const [folderSidebarPinned, setFolderSidebarPinned] = useState<boolean>(() => windowState?.sidebarOpen ?? false);
  /** 悬浮触发：鼠标悬停左侧边缘时置 true，移开置 false */
  const [sidebarHover, setSidebarHover] = useState(false);
  /** 侧栏选中的文件夹过滤（null=全部；'unclassified'=未分类；其它=文件夹 id） */
  const [activeFolderId, setActiveFolderId] = useState<SidebarSelection>(null);
  /** 自然语言命令：编辑任务前的确认（仅编辑操作弹确认框） */
  const [commandEdit, setCommandEdit] = useState<{ task: Task; newDeadline: number | null } | null>(null);

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

  /** 移动端详情需要保留子任务树；与仅需基础字段的菜单查找分开，避免扩大桌面调用的类型。 */
  const findTaskWithSubtasksAnywhere = (id: string): TaskWithSubtasks | undefined => {
    const walk = (tasks: TaskWithSubtasks[]): TaskWithSubtasks | undefined => {
      for (const task of tasks) {
        if (task.id === id) return task;
        const child = walk(task.subtasks);
        if (child) return child;
      }
      return undefined;
    };
    const inFolders = (nodes: FolderNode[]): TaskWithSubtasks | undefined => {
      for (const node of nodes) {
        const found = walk(node.tasks);
        if (found) return found;
        const child = inFolders(node.children);
        if (child) return child;
      }
      return undefined;
    };
    const active = inFolders(folderTree) || walk(unclassifiedTasks);
    if (active) return active;
    const completed = completedTasks.find((task) => task.id === id);
    return completed ? { ...completed, subtasks: [] } : undefined;
  };

  /** 返回当前任务以上的父任务链，供编辑子任务时注入 AI 提示词。 */
  const getParentTaskContext = (task: Task): string | undefined => {
    const chain: string[] = [];
    const seen = new Set<string>();
    let parentId = task.parentId;
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId);
      const parent = findTaskAnywhere(parentId);
      if (!parent) break;
      chain.unshift(parent.title);
      parentId = parent.parentId;
    }
    return chain.length > 0 ? chain.join(' > ') : undefined;
  };

  /** 切换完成/撤销完成：按当前状态给出正确 toast 与撤销动作（月视图面板也可点已完成任务撤销） */
  const handleToggleCompleted = async (id: string) => {
    const task = findTaskAnywhere(id);
    await toggleCompleted(id);
    if (task) {
      if (task.completed) {
        // 原状态已完成 → 本次是撤销完成（恢复）
        setLastAction({ kind: 'restored', taskId: id });
        setToast(`已恢复 "${task.title}"`);
      } else {
        setLastAction({ kind: 'completed', taskId: id });
        setToast(`已完成 "${task.title}"`);
      }
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
    // 重复任务：一次点击删除整个系列；记录 seriesId 使「撤销」能整体恢复
    const seriesId = task?.repeatSeriesId ?? undefined;
    await deleteTask(id);
    if (task) {
      setLastAction({ kind: 'deleted', taskId: id, seriesId });
      setToast(seriesId ? `已删除重复系列 "${task.title}"` : `已删除 "${task.title}"`);
    }
  };

  /** 右键 / 长按任务 → 打开任务菜单：附带完成态与「是否可结束重复」，供菜单项文案与显隐判断。
   * 已完成任务同样可走此菜单（用于撤销完成 / 删除），因此从「已完成」区域也要能打开。 */
  const openTaskMenu = (e: React.MouseEvent, taskId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const t = findTaskAnywhere(taskId);
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      taskId,
      canStopRepeat: !!t?.repeatRule,
      taskCompleted: !!t?.completed,
    });
  };

  /** 从任意主视图直接复制任务标题与备注，无需进入编辑页。 */
  const handleCopyTask = async (taskId: string) => {
    const task = findTaskAnywhere(taskId);
    if (!task) {
      setToast('未找到任务，复制失败');
      return;
    }
    const copied = await copyText(formatTaskClipboardText(task));
    setToast(copied ? `已复制“${task.title}”及备注` : '无法访问剪贴板，请检查系统权限');
  };

  /** 取消删除（恢复已删除任务），并在"已删除"列表实时移除 */
  const handleRestoreDeleted = async (id: string) => {
    const t = deletedTasks.find((x) => x.id === id);
    await restoreTask(id);
    setDeletedTasks((prev) => prev.filter((x) => x.id !== id));
    setToast(t ? `已恢复 "${t.title}"` : '已恢复任务');
  };

  const handleUndo = async () => {
    if (!lastAction) return;
    setLastAction(null);
    if (lastAction.kind === 'completed') {
      await toggleCompleted(lastAction.taskId); // 撤销完成：恢复未完成
    } else if (lastAction.kind === 'restored') {
      await toggleCompleted(lastAction.taskId); // 撤销恢复：重新标记完成
    } else if (lastAction.kind === 'stoppedRepeat') {
      // 撤销「结束重复」：先恢复重复规则（重新武装系列），再撤销完成
      await updateTask(lastAction.taskId, {
        repeatRule: lastAction.repeatRule,
        repeatIntervalDays: lastAction.repeatIntervalDays,
      });
      await toggleCompleted(lastAction.taskId);
    } else if (lastAction.kind === 'deleted') {
      // 撤销删除：重复系列整体恢复（保留完成态），普通任务恢复原任务
      if (lastAction.seriesId) await restoreSeries(lastAction.seriesId);
      else await restoreTask(lastAction.taskId);
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
    setAllExpanded(true);
  };

  /** 全部折叠：折叠所有文件夹与任务子列表 */
  const collapseAll = () => {
    setExpandedFolders(new Set());
    setExpandedTasks(new Set());
    setAllExpanded(false);
  };

  /** 顶栏：展开/折叠全部 切换（同一功能键） */
  const handleToggleExpandAll = () => {
    if (allExpanded) collapseAll();
    else expandAll();
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

  // ===== 文件夹侧栏（左缘悬浮浮现） =====

  // 「固定常开」开关持久化（默认悬停浮现；用户点击固定后才常开，旧值不再恢复）
  useEffect(() => {
    saveWindowState({ sidebarOpen: folderSidebarPinned });
  }, [folderSidebarPinned, saveWindowState]);

  // 移动端小部件「快速记录」：原生向 WebView 派发 DOM 事件 → 自动聚焦命令框
  useEffect(() => {
    const h = () => setCommandFocusSignal((s) => s + 1);
    window.addEventListener('open-command-bar', h);
    return () => window.removeEventListener('open-command-bar', h);
  }, []);

  // 移动端小部件「新建任务」统一打开当前 QuickCapture，避免落入旧版原生表单。
  useEffect(() => {
    const h = () => {
      setAiCreateDraft(null);
      setEditingTask(null);
      setMobileTask(null);
      setCaptureFolder(null);
      setCaptureOpen(true);
    };
    window.addEventListener('open-quick-capture', h);
    return () => window.removeEventListener('open-quick-capture', h);
  }, []);

  // 小部件点击任务标题后，移动端打开对应的详情底部面板。
  useEffect(() => {
    if (!isMobile) return;
    const h = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (!id) return;
      const task = findTaskWithSubtasksAnywhere(id);
      if (task) setMobileTask(task);
    };
    window.addEventListener('open-task', h);
    return () => window.removeEventListener('open-task', h);
  }, [folderTree, unclassifiedTasks, completedTasks]);

  /** 是否显示侧栏：固定常开 或 悬停触发 */
  const showSidebar = folderSidebarPinned || sidebarHover;
  /** 悬停离开后的隐藏延迟（避免移到卡片区时闪隐）；ref 供清理 */
  const sidebarHideTimer = useRef<number | null>(null);
  const handleSidebarEnter = () => {
    if (sidebarHideTimer.current !== null) { clearTimeout(sidebarHideTimer.current); sidebarHideTimer.current = null; }
    setSidebarHover(true);
  };
  const handleSidebarLeave = () => {
    if (sidebarHideTimer.current !== null) clearTimeout(sidebarHideTimer.current);
    sidebarHideTimer.current = window.setTimeout(() => setSidebarHover(false), 160);
  };

  // ===== 移动端：从左向右滑唤起「分类」侧栏（替代桌面悬停） =====
  // 屏幕上任意位置起手均可：横向位移占优且超过阈值即唤起；侧栏已开时向左滑即收起。
  // 纵向占优的手势不拦截，交回原生滚动。
  // 注意：不再使用「贴左缘的窄热区」——Android 手势导航会把最左侧约 24dp 的横向滑动
  // 优先判定为「返回」并消费掉，贴边热区经常收不到完整触摸序列，故改为整屏监听。
  const contentRef = useRef<HTMLDivElement | null>(null);
  const sidebarOpenRef = useRef(false);
  sidebarOpenRef.current = showSidebar;

  /** 收起侧栏（移动端同时取消「固定常开」，保证一次手势就能关掉） */
  const closeSidebar = () => {
    setSidebarHover(false);
    if (isMobile) setFolderSidebarPinned(false);
  };

  // Android 系统返回键回调：弹窗/抽屉打开时先关闭当前层，主视图才交给 Activity 退出。
  useEffect(() => {
    if (!isMobile) return undefined;
    type BackHandlerWindow = Window & { __dtmHandleBack?: () => boolean };
    const target = window as BackHandlerWindow;
    const previous = target.__dtmHandleBack;
    const handler = () => {
      if (captureOpen || aiCreateDraft) {
        setPrefillDate(null);
        setCaptureFolder(null);
        setCaptureOpen(false);
        setAiCreateDraft(null);
        return true;
      }
      if (editingTask || aiEditDraft) {
        setEditingTask(null);
        setAiEditDraft(null);
        return true;
      }
      if (mobileTask) {
        setMobileTask(null);
        return true;
      }
      if (settingsOpen) {
        setSettingsOpen(false);
        return true;
      }
      if (showSidebar) {
        closeSidebar();
        return true;
      }
      return false;
    };
    target.__dtmHandleBack = handler;
    return () => {
      if (target.__dtmHandleBack === handler) target.__dtmHandleBack = previous;
    };
  }, [captureOpen, aiCreateDraft, editingTask, aiEditDraft, mobileTask, settingsOpen, showSidebar]);

  /** 侧栏遮罩上的左滑起手 X（用于滑动手势关闭） */
  const scrimTouchX = useRef<number | null>(null);

  useEffect(() => {
    if (!isMobile) return;
    const el = contentRef.current;
    if (!el) return;

    let startX = 0;
    let startY = 0;
    let tracking = false;
    let decided = false;
    let mode: 'open' | 'close' | null = null;

    const onStart = (e: TouchEvent) => {
      // 任务行拥有独立的左右滑动；不要让全局右滑手势同时打开分类抽屉。
      if ((e.target as HTMLElement | null)?.closest('[data-mobile-task-row]')) {
        tracking = false;
        return;
      }
      // 抽屉只通过顶部菜单按钮打开；全局右滑不再抢占列表滚动或输入控件。
      // 抽屉打开后仍保留向左滑关闭，符合移动端的可发现性与可撤销性。
      if (!sidebarOpenRef.current) {
        tracking = false;
        return;
      }
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      tracking = true;
      decided = false;
      mode = null;
    };
    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (!decided) {
        // 位移过小先不定方向，避免轻微抖动误判
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        decided = true;
        // 纵向占优 → 交回原生滚动，本次跟踪放弃
        if (Math.abs(dy) > Math.abs(dx)) { tracking = false; return; }
        // 侧栏已开时只接受向左滑关闭。
        mode = 'close';
      }
      if (mode === 'close' && dx < -46) { closeSidebar(); tracking = false; }
    };
    const onEnd = () => { tracking = false; decided = false; mode = null; };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: true });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  /** 在文件夹树中定位节点 id 的祖先链（不含自身）；找到返回祖先 id 数组，找不到返回 null */
  const collectPath = (nodes: FolderNode[], id: string): string[] | null => {
    for (const n of nodes) {
      if (n.id === id) return [];
      const child = collectPath(n.children, id);
      if (child !== null) return [n.id, ...child];
    }
    return null;
  };

  // 选中文件夹 → 自动展开其父链与自身（主树可见其子级）
  useEffect(() => {
    if (activeFolderId == null || activeFolderId === 'unclassified') return;
    const path = collectPath(folderTree, activeFolderId);
    const ids = [...(path ?? []), activeFolderId];
    if (ids.length === 0) return;
    setExpandedFolders((prev) => {
      const s = new Set(prev);
      ids.forEach((p) => s.add(p));
      return s;
    });
  }, [activeFolderId, folderTree]);

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

  // ===== 任务提醒轮询（30s）：提醒时间到且未完成 → 发系统/手机通知并标记已触发 =====
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const db = await getDatabase();
        const svc = new TaskService(db);
        const due = await svc.getDueReminders(Date.now());
        if (due.length === 0) return;
        // 通知权限：Android 需 POST_NOTIFICATIONS；桌面直接发
        let granted = true;
        try {
          granted = await isPermissionGranted();
          if (!granted) {
            const p: unknown = await requestPermission();
            granted = p === 'granted' || p === true;
          }
        } catch { granted = true; }
        for (const item of due) {
          if (cancelled) return;
          if (granted) {
            try {
              await sendNotification({ title: '任务提醒', body: item.task.title });
            } catch { /* 忽略发送失败 */ }
          }
          await svc.markReminderFired(item.task.id, item.offsetKey, item.reminderTime);
        }
      } catch { /* 忽略轮询错误 */ }
    };
    // 启动后立即检查一次，再每 30 秒轮询
    check();
    const timer = setInterval(check, 30_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  // ===== 任务提醒（Task 13）：到达提前提醒窗口触发 Windows 通知 + 可选自动置顶 =====

  // 任务提醒已改为"按任务设置提醒时刻（reminderAt）"，由下方轮询 effect 统一处理；
  // 旧的"按默认提醒时间偏移"逻辑已移除（不再有"默认提醒时间"概念）。

  const handleCreateTask = async (
    title: string,
    folderId: string | null,
    options?: { priority?: Priority; deadline?: number | null; remark?: string; reminderOffsets?: string[]; reminderAt?: number | null; reminderTimes?: number[]; repeatRule?: TaskRepeatRule | null; repeatIntervalDays?: number | null; subtasks?: GeneratedSubtask[] }
  ) => {
    const parent = await createTask(title, folderId, options);
    if (parent && options?.subtasks && options.subtasks.length > 0) {
      const subs = options.subtasks.filter((s) => s.title.trim());
      for (const sub of subs) {
        await createTask(sub.title.trim(), parent.folderId, { parentId: parent.id, deadline: sub.deadline ?? null, remark: sub.remark });
      }
      if (subs.length > 0) setToast(`已创建任务及 ${subs.length} 个子任务`);
    }
    setPrefillDate(null);
    setCaptureFolder(null);
    setCaptureOpen(false);
    setAiCreateDraft(null);
  };

  /** 编辑视图保存：更新当前任务，并按预填列表同步直属子任务。 */
  const handleEditTask = async (
    task: TaskWithSubtasks,
    title: string,
    folderId: string | null,
    options: { priority?: Priority; deadline?: number | null; remark?: string; reminderOffsets?: string[]; reminderTimes?: number[]; repeatRule?: TaskRepeatRule | null; repeatIntervalDays?: number | null; subtasks?: GeneratedSubtask[] },
  ) => {
    await updateTask(task.id, {
      title: title.trim(),
      folderId,
      priority: options.priority ?? 'normal',
      deadline: options.deadline ?? null,
      remark: options.remark ?? '',
      reminderOffsets: options.reminderOffsets ?? [],
      reminderTimes: options.reminderTimes ?? [],
      repeatRule: options.repeatRule ?? null,
      repeatIntervalDays: options.repeatIntervalDays ?? null,
    });

    const existingChildren = task.subtasks ?? [];
    if (task.folderId !== folderId) {
      const descendants: TaskWithSubtasks[] = [];
      const collect = (items: TaskWithSubtasks[]) => items.forEach((item) => {
        descendants.push(item);
        collect(item.subtasks ?? []);
      });
      collect(existingChildren);
      for (const descendant of descendants) await updateTask(descendant.id, { folderId });
    }
    const existingById = new Map(existingChildren.map((child) => [child.id, child]));
    const retainedIds = new Set<string>();
    const nextSubtasks = options.subtasks ?? [];
    for (const sub of nextSubtasks) {
      const subTitle = sub.title.trim();
      if (!subTitle) continue;
      const existing = sub.id ? existingById.get(sub.id) : undefined;
      if (existing) {
        retainedIds.add(existing.id);
        await updateTask(existing.id, { title: subTitle, folderId, deadline: sub.deadline ?? null, remark: sub.remark ?? '' });
      } else {
        await createTask(subTitle, folderId, { parentId: task.id, deadline: sub.deadline ?? null, remark: sub.remark ?? '' });
      }
    }
    // 编辑列表中删除的直属子任务同步软删除；其下级子树由服务层一并处理。
    for (const child of existingChildren) {
      if (!retainedIds.has(child.id)) {
        await deleteTask(child.id);
      }
    }
    // 以上操作会分别刷新；最后再拉取一次完整快照，确保分类树、未分类列表
    // 与整棵子任务树来自同一数据库状态。
    await refresh();
    setEditingTask(null);
    setToast(`已更新任务及 ${nextSubtasks.filter((s) => s.title.trim()).length} 个子任务`);
  };

  // ===== 自然语言命令（视图切换条旁的命令气泡） =====

  /** 在活动任务中按标题模糊匹配最佳任务 */
  const fuzzyFindTask = (query: string): Task | undefined => {
    const q = query.trim().toLowerCase();
    if (!q) return undefined;
    let best: Task | undefined;
    let bestScore = 0;
    for (const t of allActiveTasks) {
      const score = fuzzyScore(t.title, q);
      if (score > bestScore) { best = t; bestScore = score; }
    }
    return best;
  };

  /** 命令栏也允许操作已完成任务（撤销完成），因此提供包含完成区的模糊匹配。 */
  const fuzzyFindAnyTask = (query: string): Task | undefined => {
    const q = query.trim().toLowerCase();
    if (!q) return undefined;
    const candidates = [...allActiveTasks, ...completedTasks];
    let best: Task | undefined;
    let bestScore = 0;
    for (const t of candidates) {
      const score = fuzzyScore(t.title, q);
      if (score > bestScore) { best = t; bestScore = score; }
    }
    return best;
  };

  // ===== AI 助手（工具调用） =====

  /** AI 是否已配置：BaseURL、Key、模型名均由用户明确填写 */
  const aiEnabled = !!settings?.aiBaseUrl?.trim() && !!settings?.aiApiKey?.trim() && !!settings?.aiModel?.trim();
  /** 组装 AI 配置：BaseURL 可使用兼容旧行为的默认地址，模型不做默认回退 */
  const aiConfig = {
    baseUrl: settings?.aiBaseUrl || DEFAULT_AI_BASE_URL,
    apiKey: settings?.aiApiKey || '',
    model: settings?.aiModel || '',
  };

  /** 文件夹名 → folderId（未分类/找不到 → null） */
  const folderIdByName = (name?: unknown): string | null => {
    if (typeof name !== 'string' || !name.trim()) return null;
    const f = allFolders.find((x) => !x.deleted && x.name === name.trim());
    return f ? f.id : null;
  };

  /** 兼容 AI 返回的重复规则 + 间隔天数 */
  const aiRepeat = (rule: unknown, interval?: unknown): { repeatRule: TaskRepeatRule | null; repeatIntervalDays: number | null } => {
    const r = String(rule ?? '');
    const allowed: TaskRepeatRule[] = ['daily', 'weekly', 'monthly', 'yearly', 'custom'];
    if (allowed.includes(r as TaskRepeatRule)) {
      const days = typeof interval === 'number' && interval > 0 ? Math.round(interval) : null;
      return { repeatRule: r as TaskRepeatRule, repeatIntervalDays: r === 'custom' ? days : null };
    }
    return { repeatRule: null, repeatIntervalDays: null };
  };

  /** 解析 AI 的 deadline（ISO/数值/自然串 → 时间戳） */
  const aiDeadline = (v: unknown): number | null => toTimestamp(v);

  /** AI 解析结果 → 打开对应的预填弹窗（QuickCapture / EditTaskDialog），用户确认后再落库 */
  const executeAiCalls = (calls: AiToolCall[]): void => {
    for (const call of calls) {
      const a = call.arguments;
      if (call.name === 'create_task') {
        const { repeatRule, repeatIntervalDays } = aiRepeat(a.repeat_rule, a.repeat_interval_days);
        setAiCreateDraft({
          title: String(a.title ?? '').trim(),
          folderId: folderIdByName(a.folder),
          deadline: aiDeadline(a.deadline),
          priority: a.priority === 'important' ? 'important' : 'normal',
          remark: typeof a.remark === 'string' ? a.remark : '',
          reminderOffsets: Array.isArray(a.reminder_offsets)
            ? a.reminder_offsets.filter((o): o is string => typeof o === 'string' && ['1d', '3d', '6h'].includes(o))
            : [],
          repeatRule,
          repeatIntervalDays: repeatRule === 'custom' ? repeatIntervalDays : null,
          subtasks: (Array.isArray(a.subtasks) ? a.subtasks : [])
            .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object' && typeof s.title === 'string' && !!(s.title as string).trim())
            .map((s) => ({ title: String(s.title).trim(), deadline: aiDeadline(s.deadline_iso ?? s.deadline), remark: typeof s.remark === 'string' ? s.remark : '' })),
        });
        return;
      }
      if (call.name === 'update_task') {
        const matched = fuzzyFindTask(String(a.query ?? ''));
        if (!matched) { setToast(`未找到任务「${a.query}」`); continue; }
        const patch: Partial<Task> = {};
        if (typeof a.title === 'string' && a.title.trim()) patch.title = a.title.trim();
        if (a.deadline !== undefined) patch.deadline = aiDeadline(a.deadline);
        if (a.priority !== undefined) patch.priority = a.priority === 'important' ? 'important' : 'normal';
        if (typeof a.remark === 'string') patch.remark = a.remark;
        const { repeatRule, repeatIntervalDays } = aiRepeat(a.repeat_rule, a.repeat_interval_days);
        if (a.repeat_rule !== undefined) { patch.repeatRule = repeatRule; patch.repeatIntervalDays = repeatRule === 'custom' ? repeatIntervalDays : null; }
        if (Array.isArray(a.reminder_offsets)) patch.reminderOffsets = a.reminder_offsets.filter((o): o is string => typeof o === 'string' && ['1d', '3d', '6h'].includes(o));
        setAiEditDraft({ task: { ...matched, ...patch }, taskId: matched.id, updates: patch });
        return;
      }
    }
  };

  /** 解析并执行自然语言命令 */
  const handleCommand = async (raw: string) => {
    const cmd = parseCommand(raw);
    const defaultHour = settings?.defaultDeadlineHour ?? 18;
    const defaultMinute = settings?.defaultDeadlineMinute ?? 0;

    // 轻量本地命令：视图、搜索、展开和任务状态无需调用 AI，立即反馈。
    if (cmd.kind === 'open-view') {
      changeViewMode(cmd.view);
      setToast(`已切换到${cmd.view === 'list' ? '列表' : cmd.view === 'calendar' ? '日历' : '日'}视图`);
      return;
    }
    if (cmd.kind === 'search') {
      setSearchQuery(cmd.query);
      setToast(`正在搜索「${cmd.query}」`);
      return;
    }
    if (cmd.kind === 'expand-all') {
      if (cmd.expanded) expandAll(); else collapseAll();
      setToast(cmd.expanded ? '已展开全部' : '已折叠全部');
      return;
    }

    // 需求4：新建文件夹/移动/删除 为简单操作，纯自然语言解析即可，不交给 AI 助手
    if (cmd.kind === 'create-folder') {
      const folder = await createFolder(cmd.folderName);
      setToast(folder ? `已创建文件夹「${cmd.folderName}」` : '创建文件夹失败');
      return;
    }
    if (cmd.kind === 'move-to-folder') {
      const matched = fuzzyFindAnyTask(cmd.query);
      if (!matched) { setToast('未找到匹配的任务'); return; }
      const folder = allFolders.find((f) => f.name === cmd.folderName && !f.deleted);
      if (!folder) { setToast(`未找到文件夹「${cmd.folderName}」`); return; }
      await updateTask(matched.id, { folderId: folder.id });
      setToast(`已将「${matched.title}」移入「${cmd.folderName}」`);
      return;
    }
    if (cmd.kind === 'delete-task') {
      const matched = fuzzyFindTask(cmd.query);
      if (!matched) { setToast(`未找到任务「${cmd.query}」`); return; }
      const ok = await deleteTask(matched.id); // 级联删除全部子任务（需求3）
      setToast(ok ? `已删除任务「${matched.title}」及其子任务` : '删除任务失败');
      return;
    }
    if (cmd.kind === 'delete-folder') {
      const folder = allFolders.find((f) => f.name === cmd.name && !f.deleted);
      if (!folder) { setToast(`未找到文件夹「${cmd.name}」`); return; }
      const ok = await deleteFolder(folder.id);
      setToast(ok ? `已删除文件夹「${cmd.name}」` : '删除文件夹失败');
      return;
    }

    if (cmd.kind === 'toggle-completed') {
      const matched = fuzzyFindAnyTask(cmd.query);
      if (!matched) { setToast(`未找到任务「${cmd.query}」`); return; }
      if (matched.completed !== cmd.completed) await handleToggleCompleted(matched.id);
      else setToast(`「${matched.title}」已经是${cmd.completed ? '已完成' : '未完成'}状态`);
      return;
    }
    if (cmd.kind === 'stop-repeat') {
      const matched = fuzzyFindAnyTask(cmd.query);
      if (!matched) { setToast(`未找到任务「${cmd.query}」`); return; }
      if (!matched.repeatRule) { setToast(`「${matched.title}」不是重复任务`); return; }
      const prevRule = matched.repeatRule;
      const prevInterval = matched.repeatIntervalDays;
      await stopRepeat(matched.id);
      setLastAction({ kind: 'stoppedRepeat', taskId: matched.id, repeatRule: prevRule, repeatIntervalDays: prevInterval });
      setToast(`已结束重复「${matched.title}」`);
      return;
    }
    if (cmd.kind === 'clear-reminder') {
      const matched = fuzzyFindAnyTask(cmd.query);
      if (!matched) { setToast(`未找到任务「${cmd.query}」`); return; }
      await updateTask(matched.id, { reminderAt: null, reminderOffsets: [], reminderTimes: [] });
      setToast(`已取消「${matched.title}」的提醒`);
      return;
    }

    // 需求1/2：新建/编辑任务（含未识别的复杂指令）→ 由 AI 解析全部字段，弹出预填窗口供确认
    if (aiEnabled && (cmd.kind === 'create-task' || cmd.kind === 'edit-task' || cmd.kind === 'unknown')) {
      try {
        const calls = await aiRunCommand(aiConfig, {
          command: raw,
          context: {
            taskTitles: allActiveTasks.map((t) => t.title),
            folderNames: allFolders.filter((f) => !f.deleted).map((f) => f.name),
            now: Date.now(),
          },
          now: Date.now(),
        });
        if (calls.length > 0) { executeAiCalls(calls); return; }
      } catch { /* AI 调用失败 → 兜底确定性解析 */ }
    }

    if (cmd.kind === 'create-task') {
      const deadline = applyDefaultDeadlineTime(cmd.deadline, defaultHour, defaultMinute);
      // 有截止时间才允许重复规则与提前偏移（与快速新建弹窗逻辑一致）
      const hasDeadline = deadline != null;
      const task = await createTask(cmd.title, null, {
        deadline,
        repeatRule: hasDeadline ? cmd.repeatRule : null,
        repeatIntervalDays: hasDeadline && cmd.repeatRule === 'custom' ? cmd.repeatIntervalDays : null,
        reminderOffsets: hasDeadline ? cmd.reminderOffsets : [],
        reminderAt: cmd.reminderAt,
      });
      setToast(task ? `已创建任务「${cmd.title}」` : '创建任务失败');
      return;
    }

    if (cmd.kind === 'edit-task') {
      const matched = fuzzyFindTask(cmd.query);
      if (!matched) {
        setToast('未找到匹配的任务，请尝试更精确的任务名');
        return;
      }
      const newDeadline = applyDefaultDeadlineTime(cmd.newDeadline, defaultHour, defaultMinute);
      setCommandEdit({ task: matched, newDeadline });
      return;
    }

    if (cmd.kind === 'set-repeat') {
      const matched = fuzzyFindTask(cmd.query);
      if (!matched) { setToast('未找到匹配的任务'); return; }
      await updateTask(matched.id, {
        repeatRule: cmd.repeatRule,
        repeatIntervalDays: cmd.repeatRule === 'custom' ? cmd.repeatIntervalDays : null,
      });
      setToast(`已将「${matched.title}」设为${cmd.repeatRule === 'custom' ? `每${cmd.repeatIntervalDays}天` : { daily: '每天', weekly: '每周', monthly: '每月', yearly: '每年' }[cmd.repeatRule]}重复`);
      return;
    }

    if (cmd.kind === 'set-reminder-offset') {
      const matched = fuzzyFindTask(cmd.query);
      if (!matched) { setToast('未找到匹配的任务'); return; }
      await updateTask(matched.id, { reminderOffsets: cmd.offsets, reminderAt: null });
      const label = cmd.offsets.map((o) => ({ '1d': '1天', '3d': '3天', '6h': '6小时', '1h': '1小时' }[o])).join('、');
      setToast(`已为「${matched.title}」设置提前${label}提醒`);
      return;
    }

    if (cmd.kind === 'set-reminder-at') {
      const matched = fuzzyFindTask(cmd.query);
      if (!matched) { setToast('未找到匹配的任务'); return; }
      await updateTask(matched.id, { reminderAt: cmd.reminderAt, reminderOffsets: [] });
      const d = new Date(cmd.reminderAt);
      setToast(`已为「${matched.title}」设置提醒：${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
      return;
    }

    if (cmd.kind === 'set-priority') {
      const matched = fuzzyFindTask(cmd.query);
      if (!matched) { setToast('未找到匹配的任务'); return; }
      await updateTask(matched.id, { priority: cmd.priority });
      setToast(`已将「${matched.title}」${cmd.priority === 'important' ? '设为重要' : '取消重要'}`);
      return;
    }

    setToast(`未能识别指令${aiEnabled ? '' : '（可在设置 → AI 配置 AI 助手）'}，试试：新建XX分类 / 明天下午去游泳 / 把XX设为每天重复`);
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

  /** 拖任务到文件夹：把任务及其所有子孙任务的 folderId 一并更新（保证 buildFolderTree 统计正确） */
  const handleMoveTaskToFolder = async (taskId: string, folderId: string) => {
    const task = findTaskAnywhere(taskId);
    if (!task) return;
    const ids: string[] = [task.id];
    const collect = (subs: TaskWithSubtasks[]) => subs.forEach((s) => { ids.push(s.id); collect(s.subtasks ?? []); });
    collect((task as TaskWithSubtasks).subtasks ?? []);
    for (const id of ids) await updateTask(id, { folderId });
    const folderName = allFolders.find((f) => f.id === folderId)?.name ?? '';
    setToast(`已将「${task.title}」移入「${folderName}」`);
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

  // ===== 文件夹侧栏过滤（跨列表/月/日视图） =====

  /** 选中文件夹自身及其所有子孙文件夹 id 集合；null=全部/未分类 */
  const activeFolderSet = useMemo(() => {
    if (activeFolderId == null || activeFolderId === 'unclassified') return null;
    const set = new Set<string>();
    const collectSubtree = (n: FolderNode) => {
      set.add(n.id);
      n.children.forEach(collectSubtree);
    };
    const find = (nodes: FolderNode[]): boolean => {
      for (const n of nodes) {
        if (n.id === activeFolderId) { collectSubtree(n); return true; }
        if (find(n.children)) return true;
      }
      return false;
    };
    if (find(folderTree)) return set;
    return null;
  }, [activeFolderId, folderTree]);

  /** 按月/日视图过滤后的活动任务（含文件夹过滤，不再过滤已完成的子树层面） */
  const filteredActiveTasks = useMemo<TaskWithSubtasks[]>(() => {
    if (activeFolderId == null) return allActiveTasks;
    if (activeFolderId === 'unclassified') return allActiveTasks.filter((t) => t.folderId == null);
    if (!activeFolderSet) return [];
    return allActiveTasks.filter((t) => t.folderId != null && activeFolderSet.has(t.folderId));
  }, [allActiveTasks, activeFolderId, activeFolderSet]);

  /** 当前选中文件夹的显示名（用于"仅看"条与 toast） */
  const activeFolderName = useMemo(
    () => activeFolderId && activeFolderId !== 'unclassified'
      ? (allFolders.find((f) => f.id === activeFolderId)?.name ?? '')
      : activeFolderId === 'unclassified' ? '未分类' : '',
    [activeFolderId, allFolders],
  );

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

  // 列表视图的文件夹隔离：全量 / 仅未分类 / 单文件夹子树
  const listRender = useMemo<{ tree: FolderNode[]; roots: TaskWithSubtasks[] }>(() => {
    if (activeFolderId == null) return { tree: treeToRender, roots: unclassifiedToRender };
    if (activeFolderId === 'unclassified') return { tree: [], roots: unclassifiedToRender };
    const find = (nodes: FolderNode[]): FolderNode | null => {
      for (const n of nodes) {
        if (n.id === activeFolderId) return n;
        const c = find(n.children);
        if (c) return c;
      }
      return null;
    };
    const node = find(treeToRender);
    return { tree: node ? [node] : [], roots: [] };
  }, [activeFolderId, treeToRender, unclassifiedToRender]);

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
  const editingSubtasks: GeneratedSubtask[] | undefined = editingTask
    ? editingTask.subtasks.map((sub) => ({ id: sub.id, title: sub.title, deadline: sub.deadline, remark: sub.remark }))
    : undefined;
  const editingParentContext = editingTask ? getParentTaskContext(editingTask) : undefined;

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
        // 毛玻璃底：移动端由 glassSurface 自动降级为不透明底（全屏模糊是掉帧主因）
        ...(glassEnabled
          ? glassSurface('var(--background)', transparency, 40, 1.8, 100)
          : { background: 'var(--background)' }),
        boxShadow: isMobile
          ? 'none'
          : 'var(--shadow-xl), 0 0 0 0.5px color-mix(in srgb, var(--border) 40%, transparent)',
        overflow: 'hidden',
        border: isMobile
          ? 'none'
          : '0.5px solid color-mix(in srgb, var(--border) 30%, transparent)',
      }}
    >
        <TopBar
          viewMode={viewMode}
          onChangeViewMode={changeViewMode}
          onCommand={handleCommand}
          commandFocusSignal={commandFocusSignal}
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
          allExpanded={allExpanded}
          onToggleExpandAll={handleToggleExpandAll}
          syncBusy={syncBusy}
          sidebarOpen={folderSidebarPinned}
          onToggleSidebar={() => setFolderSidebarPinned((v) => !v)}
        />

        {/* 分隔线 */}
        <div style={{ height: 0.5, background: 'var(--border)', margin: '0 20px', flexShrink: 0, opacity: 0.6 }} />

        {/* 主体：左侧边缘热区 + 悬浮文件夹侧栏 + 右侧视图区 */}
        <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', alignItems: 'stretch' }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            {/* 搜索提示（仅列表视图） */}
            {viewMode === 'list' && searchQuery.trim() && (
              <div style={{ padding: '8px 20px 2px', flexShrink: 0 }}>
                <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>找到 {matchCount} 个匹配结果</span>
              </div>
            )}

            {/* 月/日视图：显示当前文件夹过滤 + 一键回到全部 */}
            {viewMode !== 'list' && activeFolderId !== null && activeFolderName && (
              <div style={{ padding: '8px 20px 0', flexShrink: 0 }}>
                <div
                  onClick={() => setActiveFolderId(null)}
                  role="button"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '3px 10px', borderRadius: 999, cursor: 'pointer',
                    fontSize: 11.5, fontWeight: 600, color: 'var(--primary)',
                    background: 'var(--brand-50)', border: '1px solid color-mix(in srgb, var(--brand-400) 30%, transparent)',
                  }}
                >
                  仅看：{activeFolderName}
                  <span style={{ fontSize: 12, lineHeight: 1 }}>×</span>
                </div>
              </div>
            )}

            {/* 树视图（可滚动） */}
            <main
              ref={contentRef}
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
              padding: isMobile ? '8px 16px 88px' : '8px 20px 20px',
              }}
            >
          {/* 视图切换：Fade-through 过渡（列表/日历/日） */}
          <AnimatePresence mode="wait">
          {viewMode === 'list' && (
            <motion.div key="view-list" variants={fadeThrough} initial="initial" animate="animate" exit="exit">
              {isMobile ? (
                <MobileTaskList
                  folders={listRender.tree}
                  rootTasks={listRender.roots}
                  expandedTasks={expandedTasks}
                  onToggleTaskExpanded={(id) => setExpandedTasks((s) => toggleSet(s, id))}
                  onToggleCompleted={(task) => void handleToggleCompleted(task.id)}
                  onOpenTask={setMobileTask}
                  onEditTask={(task) => { setMobileTask(null); setEditingTask(task); }}
                />
              ) : (
              <FolderTree
                folders={listRender.tree}
                rootTasks={listRender.roots}
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
                onMoveTaskToFolder={handleMoveTaskToFolder}
                onToggleFolder={(id) => setExpandedFolders((s) => toggleSet(s, id))}
                onToggleTaskExpanded={(id) => setExpandedTasks((s) => toggleSet(s, id))}
                onToggleCompleted={handleToggleCompleted}
                onContextMenuTask={openTaskMenu}
                onContextMenuFolder={(e, folderId) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setContextMenu({ x: e.clientX, y: e.clientY, taskId: null, folderId });
                }}
              />
              )}

              <div className={isMobile ? 'mobile-completed-wrap' : undefined}>
                {/* 分隔线 */}
                <div style={{ height: 0.5, background: 'var(--border)', margin: '12px 0 8px', opacity: 0.5 }} />

                <CompletedSection
                  tasks={filteredCompleted}
                  expanded={completedExpanded}
                  onToggleExpanded={() => setCompletedExpanded(!completedExpanded)}
                  onRestore={handleRestore}
                  onContextMenuTask={openTaskMenu}
                />
              </div>
            </motion.div>
          )}

          {/* 日历视图（V3）：月历药丸标签 + 选中态详情面板 */}
          {viewMode === 'calendar' && (
            <motion.div key="view-calendar" variants={fadeThrough} initial="initial" animate="animate" exit="exit">
              <CalendarView
                tasks={filteredActiveTasks}
                completedTasks={completedTasks as TaskWithSubtasks[]}
                onToggleTask={(id) => void handleToggleCompleted(id)}
                onAddTask={(ts) => {
                  // 「+ 添加事项」：预填该日并打开快速新建
                  setPrefillDate(ts);
                  setCaptureFolder(null);
                  setCaptureOpen(true);
                }}
                onContextMenuTask={openTaskMenu}
              />
            </motion.div>
          )}

          {/* 日视图（V2） */}
          {viewMode === 'day' && (
            <motion.div key="view-day" variants={fadeThrough} initial="initial" animate="animate" exit="exit">
              <DayView
                tasks={filteredActiveTasks}
                completedTasks={completedTasks as TaskWithSubtasks[]}
                date={calendarDate}
                folderMap={new Map(allFolders.map((f) => [f.id, f.name]))}
                onDateChange={setCalendarDate}
                onToggleComplete={handleToggleCompleted}
                onContextMenuTask={openTaskMenu}
              />
            </motion.div>
          )}
          </AnimatePresence>
            </main>
          </div>

          {/* 左缘热区（始终存在捕获悬停）+ 悬浮文件夹卡片 */}
          <AnimatePresence>
            {isMobile && showSidebar && (
              <motion.div
                key="sidebar-scrim"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: DUR.short }}
                onClick={closeSidebar}
                onTouchStart={(e) => { scrimTouchX.current = e.touches[0].clientX; }}
                onTouchMove={(e) => {
                  if (scrimTouchX.current != null && e.touches[0].clientX - scrimTouchX.current < -46) {
                    closeSidebar();
                    scrimTouchX.current = null;
                  }
                }}
                onTouchEnd={() => { scrimTouchX.current = null; }}
                style={{ position: 'absolute', inset: 0, zIndex: 59, background: 'rgba(0,0,0,0.25)' }}
              />
            )}
          </AnimatePresence>
          <div
            onMouseEnter={handleSidebarEnter}
            onMouseLeave={handleSidebarLeave}
            style={{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              // 容器宽度只是鼠标命中区（可见把手是下方固定 10px 的细条，与宽度无关），
              // 因此不做 width 过渡 —— 过渡 width 会逐帧触发布局，是打开/关闭时的掉帧源。
              width: showSidebar ? 178 : 10,
              zIndex: 60,
            }}
          >
            {/* 边缘细条（可见把手）：悬停/固定时高亮 */}
            <div style={{
              position: 'absolute', left: 0, top: 0, bottom: 0, width: 10,
              background: 'var(--border)',
              opacity: showSidebar ? 0.9 : 0.5,
              borderRight: '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
            }} />
            <AnimatePresence>
              {showSidebar && (
                <motion.div
                  key="sidebar"
                  variants={sharedAxis}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  onTouchStart={(e) => { scrimTouchX.current = e.touches[0].clientX; }}
                  onTouchMove={(e) => {
                    if (scrimTouchX.current != null && e.touches[0].clientX - scrimTouchX.current < -52) {
                      closeSidebar();
                      scrimTouchX.current = null;
                    }
                  }}
                  onTouchEnd={() => { scrimTouchX.current = null; }}
                  style={{ position: 'absolute', left: 12, top: 6, bottom: 6, width: 166 }}
                >
                  <FolderSidebar
                    tree={treeToRender}
                    expandedFolders={expandedFolders}
                    active={activeFolderId}
                    onSelect={setActiveFolderId}
                    onToggleFolder={(id) => setExpandedFolders((s) => toggleSet(s, id))}
                    onNewFolder={() => setDialog({ type: 'create-folder', parentId: null })}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {isMobile && (
          <MobileBottomNav
            viewMode={viewMode}
            onChangeViewMode={changeViewMode}
            onNewTask={() => {
              setPrefillDate(viewMode === 'day' ? calendarDate : null);
              setCaptureFolder(null);
              setCaptureOpen(true);
            }}
          />
        )}
      </div>

      {/* 右键菜单 */}
      <ContextMenu
        state={contextMenu}
        onClose={() => setContextMenu(null)}
        onEditTask={(taskId) => {
          const task = findTaskWithSubtasksAnywhere(taskId);
          if (task) setEditingTask(task);
        }}
        onCopyTask={(taskId) => { void handleCopyTask(taskId); }}
        onToggleComplete={handleToggleCompleted}
        onDeleteTask={handleDeleteTask}
        onStopRepeat={async (taskId) => {
          // 结束重复：清除重复规则 + 标记已完成。记录原规则，令 Toast「撤销」可还原重复
          const t = findTaskAnywhere(taskId);
          const prevRule = t?.repeatRule ?? null;
          const prevInterval = t?.repeatIntervalDays ?? null;
          await stopRepeat(taskId);
          if (prevRule) {
            setLastAction({ kind: 'stoppedRepeat', taskId, repeatRule: prevRule, repeatIntervalDays: prevInterval });
            setToast(`已结束重复 "${t?.title ?? ''}"`);
          } else {
            setLastAction(null);
            setToast('已结束重复');
          }
        }}
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
      <MobileTaskSheet
        task={isMobile ? mobileTask : null}
        onClose={() => setMobileTask(null)}
        onToggleCompleted={(id) => { void handleToggleCompleted(id); setMobileTask(null); }}
        onEdit={(task) => { setMobileTask(null); setEditingTask(task); }}
        onCopy={(task) => { void handleCopyTask(task.id); }}
      />

      <AnimatePresence>
        {(captureOpen || aiCreateDraft || editingTask) && (
          <QuickCapture
            key={editingTask ? `edit-task-${editingTask.id}` : 'quick-capture'}
            folders={folderTree}
            onClose={() => {
              setPrefillDate(null);
              setCaptureFolder(null);
              setCaptureOpen(false);
              setAiCreateDraft(null);
              setEditingTask(null);
            }}
            onCreate={(title, folderId, options) => editingTask
              ? handleEditTask(editingTask, title, folderId, options)
              : handleCreateTask(title, folderId, options)}
            initialDate={prefillDate ?? undefined}
            initialFolderId={editingTask ? editingTask.folderId : aiCreateDraft ? aiCreateDraft.folderId : captureFolder}
            initialTitle={editingTask?.title ?? aiCreateDraft?.title}
            initialDeadline={editingTask ? editingTask.deadline : aiCreateDraft?.deadline}
            initialPriority={editingTask ? editingTask.priority : aiCreateDraft?.priority}
            initialRemark={editingTask?.remark ?? aiCreateDraft?.remark}
            initialRepeatRule={editingTask ? editingTask.repeatRule : aiCreateDraft?.repeatRule}
            initialRepeatIntervalDays={editingTask ? editingTask.repeatIntervalDays : aiCreateDraft?.repeatIntervalDays}
            initialReminderOffsets={editingTask ? editingTask.reminderOffsets : aiCreateDraft?.reminderOffsets}
            initialReminderTimes={editingTask ? editingTask.reminderTimes : undefined}
            initialSubtasks={editingTask ? editingSubtasks : aiCreateDraft?.subtasks}
            parentContext={editingParentContext}
            defaultDeadlineHour={settings?.defaultDeadlineHour ?? 18}
            defaultDeadlineMinute={settings?.defaultDeadlineMinute ?? 0}
            aiEnabled={aiEnabled}
            onGenerateSubtasks={async (title, deadline, opts) => {
              if (!aiConfig.apiKey || !aiConfig.model) throw new Error('请在 设置 → AI 中填写 API Key 与模型名');
              return generateSubtasks(aiConfig, { title, deadline, now: Date.now(), count: opts?.count, hint: opts?.hint, mode: opts?.mode, existingSubtasks: opts?.existingSubtasks, parentContext: opts?.parentContext, signal: opts?.signal });
            }}
          />
        )}

        {/* AI 命令编辑仍使用专用确认弹窗；手动编辑已统一进入 QuickCapture 预填视图。 */}
        {aiEditDraft && (
          <EditTaskDialog
            key="edit-task"
            task={aiEditDraft.task}
            onSave={async (updates) => {
              await updateTask(aiEditDraft.taskId, updates);
            }}
            onClose={() => { setEditingTask(null); setAiEditDraft(null); }}
            defaultDeadlineHour={settings?.defaultDeadlineHour ?? 18}
            defaultDeadlineMinute={settings?.defaultDeadlineMinute ?? 0}
          />
        )}
      </AnimatePresence>

      {/* 自然语言命令：编辑任务确认框（仅编辑操作弹确认框） */}
      {commandEdit && (
        <ConfirmDialog
          title="修改任务截止时间"
          message={`将「${commandEdit.task.title}」的截止时间改为 ${commandEdit.newDeadline != null ? formatDeadline(commandEdit.newDeadline) : '（清除截止时间）'}？`}
          confirmText="修改"
          onConfirm={async () => {
            await updateTask(commandEdit.task.id, { deadline: commandEdit.newDeadline });
            setToast(`已将「${commandEdit.task.title}」的截止时间改为 ${commandEdit.newDeadline != null ? formatDeadline(commandEdit.newDeadline) : '（清除截止时间）'}`);
            setCommandEdit(null);
          }}
          onCancel={() => setCommandEdit(null)}
        />
      )}

      {/* 设置面板（AnimatePresence：进入 + 退出动画成对） */}
      <AnimatePresence>
        {settingsOpen && (
          <SettingsPanel
            key="settings-panel"
            theme={theme as ThemeMode}
            onThemeChange={(t) => setTheme(t)}
            settings={settings}
            onChange={updateSettings}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* 文件夹对话框（替代 prompt/confirm） */}
      {dialog?.type === 'create-folder' && (
        <PromptDialog
          title="新建文件夹"
          placeholder="文件夹名称（≤20字）"
          confirmText="创建"
          maxLength={FOLDER_NAME_MAX}
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
          placeholder="文件夹名称（≤20字）"
          confirmText="保存"
          maxLength={FOLDER_NAME_MAX}
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
      {/* Undo Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            variants={toastUp}
            initial="initial"
            animate="animate"
            exit="exit"
            style={{
              position: 'fixed',
              // 移动端上移，避免被底部视图导航遮挡
              bottom: isMobile ? 84 : 24,
              left: '50%',
              x: '-50%',
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
            }}
          >
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
          </motion.div>
        )}
      </AnimatePresence>

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
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 4px', borderBottom: '0.5px solid var(--border)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      {t.priority === 'important' && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ff6b3d', flexShrink: 0 }} />}
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: 'var(--foreground)', textDecoration: 'line-through', opacity: 0.75, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                      >{t.title}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, fontSize: 11, color: 'var(--muted-foreground)' }}>
                      {t.deadline !== null && <span>截止 {new Date(t.deadline).toLocaleString()}</span>}
                      {t.deadline === null && <span>无截止日期</span>}
                      <span>{t.updatedAt ? `删除于 ${new Date(t.updatedAt).toLocaleString()}` : ''}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRestoreDeleted(t.id)}
                    style={{
                      flexShrink: 0, height: 28, padding: '0 12px', fontSize: 12, fontWeight: 600,
                      border: '1px solid var(--border)', borderRadius: 999, background: 'var(--muted)',
                      color: 'var(--primary)', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                    }}
                  >
                    取消删除
                  </button>
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
