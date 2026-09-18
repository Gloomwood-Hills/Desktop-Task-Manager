import {
  Pencil, Trash2, FolderPlus, Edit3, FolderMinus,
  Plus, RefreshCw, Settings, Power, CheckCircle2, Repeat, Copy,
} from 'lucide-react';
import { isMobile } from '../data/platform';

export interface ContextMenuState {
  x: number;
  y: number;
  /** 菜单关联的任务 ID；null 表示空白区域右键 */
  taskId: string | null;
  /** 菜单关联的文件夹 ID（右键文件夹时设置） */
  folderId?: string | null;
  /** 该任务是否设置了重复规则（决定是否显示"结束重复"） */
  canStopRepeat?: boolean;
  /** 该任务当前是否已完成（决定菜单显示「完成」还是「撤销完成」） */
  taskCompleted?: boolean;
}

interface ContextMenuProps {
  state: ContextMenuState | null;
  onClose: () => void;
  onEditTask: (taskId: string) => void;
  onCopyTask: (taskId: string) => void;
  onToggleComplete: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onCreateFolder: (parentId: string | null) => void;
  onRenameFolder: (folderId: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onNewTask: () => void;
  /** 在指定文件夹内新建任务（右键文件夹时点击"新建任务"） */
  onNewTaskInFolder: (folderId: string) => void;
  onRefresh: () => void;
  onOpenSettings: () => void;
  onExit: () => void;
  /** 结束重复：清除该任务重复规则（仅重复任务显示） */
  onStopRepeat: (taskId: string) => void;
}

interface MenuItem {
  key: string;
  icon: React.ReactNode;
  label: string;
  hint: string;
  visible: boolean;
  action: () => void;
  destructive?: boolean;
}

/** 右键菜单（对齐设计稿 context-menu，Task 12） */
export default function ContextMenu({
  state, onClose, onEditTask, onCopyTask, onToggleComplete,
  onDeleteTask, onCreateFolder, onRenameFolder, onDeleteFolder, onNewTask, onNewTaskInFolder,
  onRefresh, onOpenSettings, onExit, onStopRepeat,
}: ContextMenuProps) {
  if (!state) return null;

  const itemBase: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    borderRadius: 6,
    margin: '0 4px',
    padding: '6px 12px',
    cursor: 'default',
  };
  const iconStyle: React.CSSProperties = { width: 16, height: 16, color: 'var(--icon-muted)', flexShrink: 0 };
  const labelStyle: React.CSSProperties = { flex: 1, fontSize: 14, color: 'var(--popover-foreground)' };
  const hintStyle: React.CSSProperties = { fontSize: 12, color: 'var(--muted-foreground)' };

  const isTaskContext = state.taskId !== null;
  const isFolderContext = state.folderId !== null && state.folderId !== undefined;

  // 任务菜单项（右键任务）
  const taskItems: MenuItem[] = [
    {
      key: 'edit',
      icon: <Pencil style={iconStyle} />,
      label: '编辑',
      hint: 'Enter',
      visible: isTaskContext,
      action: () => state.taskId && onEditTask(state.taskId),
    },
    {
      key: 'copy-task',
      icon: <Copy style={iconStyle} />,
      label: '复制任务与备注',
      hint: '',
      visible: isTaskContext,
      action: () => state.taskId && onCopyTask(state.taskId),
    },
    {
      key: 'complete',
      icon: <CheckCircle2 style={iconStyle} />,
      label: state.taskCompleted ? '撤销完成' : '完成',
      hint: 'Space',
      visible: isTaskContext,
      action: () => state.taskId && onToggleComplete(state.taskId),
    },
    {
      key: 'stop-repeat',
      icon: <Repeat style={iconStyle} />,
      label: '结束重复',
      hint: '',
      // 已完成实例上「结束重复」不会影响整个系列，故不显示，避免误导
      visible: isTaskContext && !!state.canStopRepeat && !state.taskCompleted,
      action: () => state.taskId && onStopRepeat(state.taskId),
    },
  ];

  // 空白区/文件夹区菜单项（新建任务 / 新建文件夹）
  // 移动端：仅文件夹长按菜单保留这两项（在该文件夹内新建任务 / 新建子文件夹）；
  // 空白处长按已在 App 层不触发（新建由顶栏按钮承担，不照搬桌面右键菜单）。
  const blankItems: MenuItem[] = [
    {
      key: 'new-task',
      icon: <Plus style={iconStyle} />,
      label: '新建任务',
      hint: 'Ctrl+N',
      visible: !isTaskContext && (!isMobile || isFolderContext),
      // 右键文件夹时自动预选该文件夹（任务创建后归入该文件夹）
      action: () => isFolderContext && state.folderId
        ? onNewTaskInFolder(state.folderId)
        : onNewTask(),
    },
    {
      key: 'create-folder',
      icon: <FolderPlus style={iconStyle} />,
      label: '新建文件夹',
      hint: '',
      visible: !isTaskContext && (!isMobile || isFolderContext),
      action: () => onCreateFolder(state.folderId || null),
    },
  ];

  // 文件夹操作项
  const folderItems: MenuItem[] = [
    {
      key: 'rename-folder',
      icon: <Edit3 style={iconStyle} />,
      label: '重命名文件夹',
      hint: 'F2',
      visible: isFolderContext,
      action: () => state.folderId && onRenameFolder(state.folderId),
    },
    {
      key: 'delete-folder',
      icon: <FolderMinus style={iconStyle} />,
      label: '删除文件夹',
      hint: '',
      visible: isFolderContext,
      action: () => state.folderId && onDeleteFolder(state.folderId),
      destructive: true,
    },
  ];

  // 通用菜单项（空白区显示；移动端不显示——刷新、设置、退出为桌面概念；展开/折叠全部已移到顶栏功能键）
  const commonItems: MenuItem[] = [
    {
      key: 'refresh',
      icon: <RefreshCw style={iconStyle} />,
      label: '刷新',
      hint: '',
      visible: !isTaskContext && !isMobile,
      action: onRefresh,
    },
    {
      key: 'settings',
      icon: <Settings style={iconStyle} />,
      label: '设置',
      hint: '',
      visible: !isTaskContext && !isMobile,
      action: onOpenSettings,
    },
    {
      key: 'exit',
      icon: <Power style={iconStyle} />,
      label: '退出',
      hint: '',
      visible: !isTaskContext && !isMobile,
      action: onExit,
    },
  ];

  const groups: MenuItem[][] = [taskItems, blankItems, folderItems, commonItems]
    .map((g) => g.filter((i) => i.visible))
    .filter((g) => g.length > 0);

  const renderItem = (item: MenuItem) => (
    <div
      key={item.key}
      className="ctx-menu-item"
      style={itemBase}
      onClick={() => { item.action(); onClose(); }}
      onMouseOver={(e) => {
        e.currentTarget.style.background = item.destructive ? 'var(--destructive)' : 'var(--primary)';
        const spans = e.currentTarget.querySelectorAll('span');
        spans.forEach((s) => { s.style.color = item.destructive ? 'var(--destructive-foreground)' : 'var(--primary-foreground)'; });
        const icons = e.currentTarget.querySelectorAll('svg');
        icons.forEach((ic) => { ic.style.color = item.destructive ? 'var(--destructive-foreground)' : 'var(--primary-foreground)'; });
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.background = 'transparent';
        const spans = e.currentTarget.querySelectorAll('span');
        spans.forEach((s) => { s.style.color = ''; });
        const icons = e.currentTarget.querySelectorAll('svg');
        icons.forEach((ic) => { ic.style.color = ''; });
      }}
    >
      {item.icon}
      <span style={{ ...labelStyle, ...(item.destructive ? { color: 'var(--destructive)' } : {}) }}>{item.label}</span>
      {!isMobile && item.hint && <span style={{ ...hintStyle, ...(item.destructive ? { color: 'var(--destructive)', opacity: 0.7 } : {}) }}>{item.hint}</span>}
    </div>
  );

  return (
    <>
      {/* 点击外部关闭 */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 90 }}
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      />
      {/* 菜单本体 */}
      <div
        style={{
          position: 'fixed',
          top: Math.min(state.y, window.innerHeight - 280),
          left: Math.min(state.x, window.innerWidth - 230),
          zIndex: 100,
          minWidth: 210,
          padding: '4px 0',
          background: 'var(--popover)',
          color: 'var(--popover-foreground)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)',
        }}
      >
        {groups.map((group, gi) => (
          <div key={gi}>
            {gi > 0 && <div style={{ height: 1, background: 'var(--border)', margin: '4px 12px' }} />}
            {group.map(renderItem)}
          </div>
        ))}

        {/* 任务删除项（置于菜单最底部，红色） */}
        {isTaskContext && (
          <>
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 12px' }} />
            <div
              className="ctx-menu-item ctx-destructive"
              style={{ ...itemBase }}
              onClick={() => { state.taskId && onDeleteTask(state.taskId); onClose(); }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = 'var(--destructive)';
                const spans = e.currentTarget.querySelectorAll('span');
                spans.forEach((s) => { s.style.color = 'var(--destructive-foreground)'; });
                const icons = e.currentTarget.querySelectorAll('svg');
                icons.forEach((ic) => { ic.style.color = 'var(--destructive-foreground)'; });
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'transparent';
                const spans = e.currentTarget.querySelectorAll('span');
                spans.forEach((s) => { s.style.color = ''; });
                const icons = e.currentTarget.querySelectorAll('svg');
                icons.forEach((ic) => { ic.style.color = ''; });
              }}
            >
              <Trash2 style={{ ...iconStyle, color: 'var(--destructive)' }} />
              <span style={{ ...labelStyle, color: 'var(--destructive)' }}>删除</span>
              {!isMobile && <span style={{ ...hintStyle, color: 'var(--destructive)', opacity: 0.7 }}>Delete</span>}
            </div>
          </>
        )}
      </div>
    </>
  );
}
