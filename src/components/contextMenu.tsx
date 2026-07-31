import { Pencil, ChevronsDown, ChevronsUp, Trash2 } from 'lucide-react';

export interface ContextMenuState {
  x: number;
  y: number;
  /** 菜单关联的任务 ID；null 表示空白区域右键 */
  taskId: string | null;
}

interface ContextMenuProps {
  state: ContextMenuState | null;
  onClose: () => void;
  onEditTask: (taskId: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onDeleteTask: (taskId: string) => void;
}

/** 右键菜单（对齐设计稿 context-menu） */
export default function ContextMenu({ state, onClose, onEditTask, onExpandAll, onCollapseAll, onDeleteTask }: ContextMenuProps) {
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

  const items = [
    {
      key: 'edit',
      icon: <Pencil style={iconStyle} />,
      label: '编辑',
      hint: 'Enter',
      visible: state.taskId !== null,
      action: () => state.taskId && onEditTask(state.taskId),
    },
    {
      key: 'expand',
      icon: <ChevronsDown style={iconStyle} />,
      label: '全部展开',
      hint: 'Ctrl+E',
      visible: true,
      action: onExpandAll,
    },
    {
      key: 'collapse',
      icon: <ChevronsUp style={iconStyle} />,
      label: '全部折叠',
      hint: 'Ctrl+S',
      visible: true,
      action: onCollapseAll,
    },
  ];

  const visibleItems = items.filter((i) => i.visible);
  const showDelete = state.taskId !== null;

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
          top: Math.min(state.y, window.innerHeight - 220),
          left: Math.min(state.x, window.innerWidth - 230),
          zIndex: 100,
          minWidth: 210,
          padding: '4px 0',
          background: 'var(--popover)',
          color: 'var(--popover-foreground)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
      >
        {visibleItems.map((item) => (
          <div
            key={item.key}
            className="ctx-menu-item"
            style={itemBase}
            onClick={() => { item.action(); onClose(); }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'var(--primary)';
              const spans = e.currentTarget.querySelectorAll('span');
              spans.forEach((s) => { s.style.color = 'var(--primary-foreground)'; });
              const icons = e.currentTarget.querySelectorAll('svg');
              icons.forEach((ic) => { ic.style.color = 'var(--primary-foreground)'; });
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
            <span style={labelStyle}>{item.label}</span>
            <span style={hintStyle}>{item.hint}</span>
          </div>
        ))}

        {showDelete && (
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
              <span style={{ ...hintStyle, color: 'var(--destructive)', opacity: 0.7 }}>Delete</span>
            </div>
          </>
        )}
      </div>
    </>
  );
}
