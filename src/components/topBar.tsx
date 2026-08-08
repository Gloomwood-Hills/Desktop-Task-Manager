import { Search, Settings, Plus, Pin, PinOff } from 'lucide-react';
import { isMobile } from '../data/platform';

interface TopBarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onOpenSettings: () => void;
  onNewTask: () => void;
  pinned: boolean;
  onTogglePin: () => void;
}

/** 顶栏：搜索框 + 设置按钮 + 新建按钮（对齐设计稿 main-view-v2）。
 * 移动端（Android）为全屏应用，无窗口可拖动，放大触控目标至 44px。 */
export default function TopBar({ searchQuery, onSearchChange, onOpenSettings, onNewTask, pinned, onTogglePin }: TopBarProps) {
  // 触控目标尺寸：桌面 34px，移动端 ≥44px（Apple HIG / Material 触控标准）
  const controlSize = isMobile ? 44 : 34;
  return (
    <header
      {...(!isMobile && !pinned ? { 'data-tauri-drag-region': true } : {})}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: isMobile ? '10px 12px 8px' : '14px 20px 10px',
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      {/* Search */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flex: 1,
        minWidth: 0,
        maxWidth: 480,
        height: controlSize,
        padding: '0 12px',
        border: `0.5px solid var(--border)`,
        borderRadius: 'calc(var(--radius) * 0.7)',
        background: 'color-mix(in srgb, var(--background) 60%, transparent)',
        transition: 'border-color 0.18s ease, box-shadow 0.18s ease',
      }}>
        <Search style={{ width: 14, height: 14, color: 'var(--icon-muted)', flexShrink: 0 }} />
        <input
          type="text"
          name="search"
          placeholder="搜索任务..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          style={{
            flex: 1,
            border: 0,
            outline: 0,
            background: 'transparent',
            font: 'inherit',
            color: 'inherit',
            fontSize: 13,
            minWidth: 0,
          }}
          aria-label="搜索任务"
        />
      </div>

      {/* Right actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 16, flexShrink: 0 }}>
        <button
          onClick={onTogglePin}
          aria-label={pinned ? "解锁位置" : "锁定位置"}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: controlSize,
            height: controlSize,
            borderRadius: 'calc(var(--radius) * 0.7)',
            cursor: 'pointer',
            transition: 'background-color 0.18s ease, color 0.18s ease',
            color: pinned ? 'var(--primary)' : 'var(--icon-muted)',
            background: 'transparent',
            border: 'none',
          }}
        >
          {pinned ? <PinOff style={{ width: 16, height: 16 }} /> : <Pin style={{ width: 16, height: 16 }} />}
        </button>
        <button
          onClick={onOpenSettings}
          aria-label="设置"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: controlSize,
            height: controlSize,
            borderRadius: 'calc(var(--radius) * 0.7)',
            cursor: 'pointer',
            transition: 'background-color 0.18s ease, color 0.18s ease',
            color: 'var(--icon-muted)',
            background: 'transparent',
            border: 'none',
          }}
        >
          <Settings style={{ width: 16, height: 16 }} />
        </button>
        <button
          onClick={onNewTask}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
            height: controlSize,
            padding: isMobile ? '0 18px' : '0 16px',
            border: 'none',
            borderRadius: 999,
            background: 'var(--primary)',
            color: 'var(--primary-foreground)',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            transition: 'filter 0.18s ease',
            boxShadow: 'var(--shadow-xs)',
            fontFamily: 'var(--font-sans)',
          }}
          onMouseOver={(e) => { e.currentTarget.style.filter = 'brightness(0.92)'; }}
          onMouseOut={(e) => { e.currentTarget.style.filter = 'none'; }}
        >
          <Plus style={{ width: 14, height: 14 }} />
          <span>新建</span>
        </button>
      </div>
    </header>
  );
}
