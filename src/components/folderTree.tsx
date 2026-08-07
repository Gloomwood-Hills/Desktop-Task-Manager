import { useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Folder as FolderIcon, FolderOpen, GripVertical } from 'lucide-react';
import { FolderNode, TaskWithSubtasks, SortType } from '../data/types';
import { compareByName } from '../data/utils';
import TaskItem, { Highlight } from './taskItem';

interface FolderTreeProps {
  folders: FolderNode[];
  /** 顶层未分类任务（folderId 为 null），与文件夹同级显示 */
  rootTasks?: TaskWithSubtasks[];
  expandedFolders: Set<string>;
  expandedTasks: Set<string>;
  searchQuery: string;
  /** 默认排序方式：name/deadline/createdAt 时顶层未分类任务与文件夹合并排序；manual 保持各自容器顺序 */
  sortType: SortType;
  /** 重要任务置顶：重要未分类任务优先，含重要任务的文件夹次优先，其余默认排序 */
  importantTop?: boolean;
  /** 手动排序模式：允许拖动任务/文件夹调整顺序 */
  manualSort?: boolean;
  onReorderTasks?: (orderedIds: string[]) => void;
  onReorderFolders?: (orderedIds: string[]) => void;
  onToggleFolder: (id: string) => void;
  onToggleTaskExpanded: (id: string) => void;
  onToggleCompleted: (id: string) => void;
  onContextMenuTask: (e: React.MouseEvent, taskId: string) => void;
  onContextMenuFolder: (e: React.MouseEvent, folderId: string) => void;
}

/** 文件夹统计：直属任务数 + 子文件夹任务数 */
function countTasks(folder: FolderNode): number {
  const own = folder.tasks.length;
  const children = folder.children.reduce((acc, c) => acc + countTasks(c), 0);
  return own + children;
}

/** 文件夹内是否存在未完成的重要任务（含任意层级子任务） */
function folderHasImportant(folder: FolderNode): boolean {
  const walk = (tasks: TaskWithSubtasks[]): boolean =>
    tasks.some((t) => (t.priority === 'important' && !t.completed) || walk(t.subtasks));
  return walk(folder.tasks) || folder.children.some(folderHasImportant);
}

/** 顶层混合项：未分类任务或文件夹 */
type OuterItem = { kind: 'task'; task: TaskWithSubtasks } | { kind: 'folder'; folder: FolderNode };

/** 拖动中的交互状态（存于 ref，供 window 监听器读取最新值） */
interface DragState {
  kind: 'task' | 'folder';
  id: string;
  /** 来源容器标识（区分不同任务列表/文件夹列表） */
  containerKey: string;
  /** 来源容器的当前顺序（用于计算插入位置） */
  containerIds: string[];
  label: string;
  startX: number;
  startY: number;
  moved: boolean;
}

/** 落点指示：目标行 id（'' = 容器末尾）+ 插入位置 */
interface DropTarget {
  id: string;
  position: 'before' | 'after';
}

/** 拖动位移阈值：超过才视为拖动（区分单击与拖拽） */
const DRAG_THRESHOLD = 6;

/**
 * 文件夹树：递归渲染文件夹层级 + 任务项（对齐设计稿 main-view-v2 树视图）
 * - 名称排序时外层未分类任务与文件夹按名称合并排序
 * - 手动排序模式下任务/文件夹可通过鼠标事件拖动排序（桌面嵌入窗口内原生 DnD 不可靠，改用 pointer 事件）
 *   支持拖到目标行前/后插入，或拖到容器空白处追加到末尾；排序结果持久化 sortOrder
 */
export default function FolderTree({
  folders, rootTasks = [], expandedFolders, expandedTasks, searchQuery,
  sortType, importantTop = false, manualSort = false, onReorderTasks, onReorderFolders,
  onToggleFolder, onToggleTaskExpanded, onToggleCompleted, onContextMenuTask, onContextMenuFolder,
}: FolderTreeProps) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [drop, setDrop] = useState<DropTarget | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const dropRef = useRef<DropTarget | null>(null);

  const rootIds = rootTasks.map((t) => t.id);
  const rootFolderIds = folders.map((f) => f.id);

  // 顶层混合排序（name/deadline/createdAt）：未分类任务与文件夹同等级别按默认方式排序；
  // importantTop 时分区：重要未分类任务 → 含重要任务文件夹 → 普通未分类任务 → 普通文件夹
  const mergedOuter = useMemo(() => {
    if (sortType === 'manual') return null;
    const name = (i: OuterItem): string => (i.kind === 'task' ? i.task.title : i.folder.name);
    const compare = (a: OuterItem, b: OuterItem): number => {
      switch (sortType) {
        case 'name':
          return compareByName(name(a), name(b));
        case 'createdAt': {
          const at = a.kind === 'task' ? a.task.createdAt : a.folder.createdAt;
          const bt = b.kind === 'task' ? b.task.createdAt : b.folder.createdAt;
          return bt - at;
        }
        case 'deadline': {
          const ad = a.kind === 'task' ? a.task.deadline : null;
          const bd = b.kind === 'task' ? b.task.deadline : null;
          if (ad === null && bd === null) return compareByName(name(a), name(b));
          if (ad === null) return 1;
          if (bd === null) return -1;
          return ad - bd;
        }
        default:
          return 0;
      }
    };
    const all: OuterItem[] = [
      ...rootTasks.map((task) => ({ kind: 'task' as const, task })),
      ...folders.map((folder) => ({ kind: 'folder' as const, folder })),
    ];
    if (!importantTop) return all.sort(compare);
    const isImp = (i: OuterItem): boolean =>
      i.kind === 'task' ? i.task.priority === 'important' : folderHasImportant(i.folder);
    const imp = all.filter(isImp).sort(compare);
    const norm = all.filter((i) => !isImp(i)).sort(compare);
    return [...imp, ...norm];
  }, [rootTasks, folders, sortType, importantTop]);

  // ===== 鼠标事件驱动拖动 =====

  /** 拖动结束后抑制紧随其后的 click（避免误触任务详情/文件夹展开） */
  const suppressClickAfterDrag = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    document.removeEventListener('click', suppressClickAfterDrag, true);
  };

  /** 计算当前指针位置下的落点：目标行前/后，或来源容器末尾 */
  const computeDrop = (x: number, y: number, state: DragState): DropTarget | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    if (!el) return null;
    const row = el.closest<HTMLElement>('[data-drag-row]');
    if (row) {
      const kind = row.dataset.dragKind;
      const containerKey = row.dataset.containerKey;
      const id = row.dataset.dragId;
      if (kind !== state.kind || containerKey !== state.containerKey || !id) return null;
      if (id === state.id) return null;
      const rect = row.getBoundingClientRect();
      return { id, position: y < rect.top + rect.height / 2 ? 'before' : 'after' };
    }
    // 容器空白处 = 追加到末尾
    const list = el.closest<HTMLElement>(state.kind === 'task' ? '[data-task-list]' : '[data-folder-list]');
    if (list && list.dataset.containerKey === state.containerKey) {
      return { id: '', position: 'after' };
    }
    return null;
  };

  const handlePointerMove = (e: PointerEvent) => {
    const state = dragRef.current;
    if (!state) return;
    if (!state.moved) {
      if (Math.hypot(e.clientX - state.startX, e.clientY - state.startY) < DRAG_THRESHOLD) return;
      state.moved = true;
      setDrag({ ...state });
      document.addEventListener('click', suppressClickAfterDrag, true);
    }
    setGhost({ x: e.clientX, y: e.clientY });
    dropRef.current = computeDrop(e.clientX, e.clientY, state);
    setDrop(dropRef.current);
  };

  const handlePointerUp = () => {
    const state = dragRef.current;
    if (!state) return;
    dragRef.current = null;
    const target = dropRef.current;
    if (state.moved && target) {
      const next = state.containerIds.filter((x) => x !== state.id);
      if (target.id) {
        const idx = next.indexOf(target.id);
        if (idx >= 0) {
          next.splice(idx + (target.position === 'after' ? 1 : 0), 0, state.id);
        } else {
          next.push(state.id);
        }
      } else {
        next.push(state.id);
      }
      // 顺序未变化则不触发刷新
      if (next.join('|') !== state.containerIds.join('|')) {
        if (state.kind === 'task') onReorderTasks?.(next);
        else onReorderFolders?.(next);
      }
    }
    setDrag(null);
    setDrop(null);
    setGhost(null);
    dropRef.current = null;
  };

  /** 开始拖动（仅左键 + 手动排序模式） */
  const startDrag = (
    e: React.PointerEvent,
    kind: 'task' | 'folder',
    id: string,
    containerKey: string,
    containerIds: string[],
    label: string,
  ) => {
    if (!manualSort) return;
    if (e.button !== 0) return;
    e.preventDefault();
    const state: DragState = {
      kind, id, containerKey, containerIds, label,
      startX: e.clientX, startY: e.clientY, moved: false,
    };
    dragRef.current = state;
    setDrag(state);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  /** 插入指示线（2.5px 高亮条） */
  const insertLineStyle: React.CSSProperties = {
    position: 'absolute',
    left: 2, right: 2,
    height: 2.5,
    borderRadius: 2,
    background: 'var(--primary)',
    pointerEvents: 'none',
    zIndex: 5,
  };

  // ===== 渲染 =====

  /** 任务行：手动模式下可拖动（拖到某行上方 = 插入到该行前） */
  const renderTask = (task: TaskWithSubtasks, containerKey: string, ids: string[]) => {
    const isDragging = drag?.kind === 'task' && drag.id === task.id;
    const isTarget = drop?.id === task.id && drag?.kind === 'task';
    return (
      <div
        key={task.id}
        data-drag-row
        data-drag-kind="task"
        data-drag-id={task.id}
        data-container-key={containerKey}
        onPointerDown={(e) => startDrag(e, 'task', task.id, containerKey, ids, task.title)}
        style={{
          position: 'relative',
          cursor: isDragging && drag?.moved ? 'grabbing' : (manualSort ? 'grab' : undefined),
          opacity: isDragging && drag?.moved ? 0.35 : undefined,
          touchAction: 'none',
        }}
      >
        {isTarget && (
          <div style={{
            ...insertLineStyle,
            top: drop!.position === 'before' ? -1 : undefined,
            bottom: drop!.position === 'after' ? -1 : undefined,
          }} />
        )}
        <TaskItem
          task={task}
          expandedSet={expandedTasks}
          onToggleExpanded={onToggleTaskExpanded}
          onToggleCompleted={onToggleCompleted}
          onContextMenu={onContextMenuTask}
          searchQuery={searchQuery}
        />
      </div>
    );
  };

  /** 任务列表容器：拖动到容器空白处 = 追加到末尾 */
  const renderTaskList = (tasks: TaskWithSubtasks[], containerKey: string, ids: string[]) => {
    const showEndIndicator = drop?.id === '' && drag?.kind === 'task' && drag.containerKey === containerKey;
    return (
      <div
        data-task-list
        data-container-key={containerKey}
        style={{ position: 'relative' }}
      >
        {showEndIndicator && (
          <div style={{ ...insertLineStyle, left: 0, right: 0, bottom: -1, top: undefined }} />
        )}
        {tasks.map((task) => renderTask(task, containerKey, ids))}
      </div>
    );
  };

  /** 文件夹节点：header（可拖动）+ 子文件夹（同级容器内拖动）+ 任务列表 */
  const renderFolder = (folder: FolderNode, folderContainerKey: string, folderIds: string[]) => {
    const isExpanded = expandedFolders.has(folder.id);
    const total = countTasks(folder);
    const taskIds = folder.tasks.map((t) => t.id);
    const isDragging = drag?.kind === 'folder' && drag.id === folder.id;
    const isTarget = drop?.id === folder.id && drag?.kind === 'folder';

    return (
      <div key={folder.id} className="tree-folder" style={{ position: 'relative' }}>
        {/* 文件夹 header */}
        <div
          className="tree-node tree-folder-header"
          data-drag-row
          data-drag-kind="folder"
          data-drag-id={folder.id}
          data-container-key={folderContainerKey}
          onClick={() => onToggleFolder(folder.id)}
          onContextMenu={(e) => onContextMenuFolder(e, folder.id)}
          onPointerDown={(e) => startDrag(e, 'folder', folder.id, folderContainerKey, folderIds, folder.name)}
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 8px',
            borderRadius: 'calc(var(--radius) * 0.55)',
            cursor: isDragging && drag?.moved ? 'grabbing' : (manualSort ? 'grab' : 'pointer'),
            opacity: isDragging && drag?.moved ? 0.35 : undefined,
            transition: 'background-color 0.15s ease',
            userSelect: 'none',
            touchAction: 'none',
          }}
          onMouseOver={(e) => {
            if (!dragRef.current) e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 80%, transparent)';
          }}
          onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          {isTarget && (
            <div style={{
              ...insertLineStyle,
              top: drop!.position === 'before' ? -1 : undefined,
              bottom: drop!.position === 'after' ? -1 : undefined,
            }} />
          )}
          {isExpanded
            ? <ChevronDown style={{ width: 14, height: 14, color: 'var(--icon-muted)', flexShrink: 0 }} />
            : <ChevronRight style={{ width: 14, height: 14, color: 'var(--icon-muted)', flexShrink: 0 }} />}
          {isExpanded
            ? <FolderOpen style={{ width: 16, height: 16, color: 'var(--primary)', flexShrink: 0 }} />
            : <FolderIcon style={{ width: 16, height: 16, color: 'var(--icon-muted)', flexShrink: 0 }} />}
          <span style={{
            fontSize: folder.parentId ? 13 : 14,
            fontWeight: folder.parentId ? 600 : 700,
            color: 'var(--foreground)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            minWidth: 0,
          }}>
            <Highlight text={folder.name} query={searchQuery} />
          </span>
          <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 600, color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>
            ({total})
          </span>
        </div>

        {/* 子级容器 */}
        {isExpanded && (
          <div className="tree-children" style={{ marginLeft: 20, position: 'relative' }}>
            {/* 垂直连接线 */}
            <div style={{
              position: 'absolute',
              left: 6,
              top: 0,
              bottom: 16,
              width: 1,
              background: 'var(--border)',
              opacity: 0.5,
            }} />
            {/* 子文件夹（同一容器内可拖动排序） */}
            {renderFolderList(folder.children, `folder:${folder.id}`, true)}
            {/* 任务项 */}
            {renderTaskList(folder.tasks, `task:${folder.id}`, taskIds)}
          </div>
        )}
      </div>
    );
  };

  /** 文件夹列表容器：同一容器内可拖动排序；空白处 = 追加到末尾 */
  const renderFolderList = (list: FolderNode[], containerKey: string, nested: boolean) => {
    const showEndIndicator = drop?.id === '' && drag?.kind === 'folder' && drag.containerKey === containerKey;
    return (
      <div
        data-folder-list
        data-container-key={containerKey}
        style={{ position: 'relative' }}
      >
        {showEndIndicator && (
          <div style={{ ...insertLineStyle, left: 0, right: 0, bottom: -1, top: undefined }} />
        )}
        {list.map((folder) => (
          <div key={folder.id} style={{ position: 'relative' }}>
            {nested && (
              <div style={{ position: 'absolute', left: -14, top: 18, width: 14, height: 1, background: 'var(--border)', opacity: 0.5 }} />
            )}
            {renderFolder(folder, containerKey, list.map((f) => f.id))}
          </div>
        ))}
      </div>
    );
  };

  /** 拖动悬浮幽灵 */
  const renderGhost = () => (ghost && drag?.moved ? (
    <div style={{
      position: 'fixed',
      left: ghost.x + 14,
      top: ghost.y - 12,
      pointerEvents: 'none',
      zIndex: 1000,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      maxWidth: 260,
      padding: '6px 12px',
      borderRadius: 8,
      background: 'color-mix(in srgb, var(--background) 92%, transparent)',
      boxShadow: '0 8px 24px rgba(0,0,0,0.18), 0 0 0 0.5px var(--border)',
      fontSize: 12.5,
      fontWeight: 600,
      color: 'var(--foreground)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      WebkitBackdropFilter: 'blur(10px)',
      backdropFilter: 'blur(10px)',
    }}>
      {drag?.kind === 'folder'
        ? <FolderIcon style={{ width: 13, height: 13, color: 'var(--primary)', flexShrink: 0 }} />
        : <GripVertical style={{ width: 13, height: 13, color: 'var(--primary)', flexShrink: 0 }} />}
      <span>{drag?.label}</span>
    </div>
  ) : null);

  // 名称排序：外层合并排序渲染
  if (mergedOuter) {
    return (
      <>
        {mergedOuter.map((item) => (
          item.kind === 'task'
            ? renderTask(item.task, 'task:root', rootIds)
            : renderFolder(item.folder, 'folder:root', rootFolderIds)
        ))}
        {renderGhost()}
      </>
    );
  }

  // 默认/手动排序：未分类任务块 + 文件夹块
  return (
    <>
      {renderTaskList(rootTasks, 'task:root', rootIds)}
      {renderFolderList(folders, 'folder:root', false)}
      {renderGhost()}
    </>
  );
}
