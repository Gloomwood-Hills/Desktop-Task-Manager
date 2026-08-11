import { Search, Settings, Plus, Pin, PinOff, Upload, Download } from 'lucide-react';
import { isMobile } from '../data/platform';

interface TopBarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onOpenSettings: () => void;
  onNewTask: () => void;
  pinned: boolean;
  onTogglePin: () => void;
  /** 上传覆盖（标题栏手动同步，覆盖云端备份） */
  onSyncUpload: () => void;
  /** 下载覆盖（标题栏手动同步，覆盖本地数据） */
  onSyncDownload: () => void;
  /** 同步进行中：禁用同步按钮 */
  syncBusy?: boolean;
  /** 本设备上次成功同步时间戳（毫秒），null 表示尚未同步 */
  lastSyncedAt?: number | null;
  /** 本设备上次同步操作：upload=上传覆盖 / download=下载覆盖 */
  lastSyncAction?: 'upload' | 'download' | 'merged' | null;
}

/** 同步时间格式化：`2026.8.8 14:30`，无时间返回"尚未同步" */
function formatSyncTime(ts: number | null): string {
  if (!ts) return '尚未同步';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 顶栏（三行布局）：第一行搜索框+新建，第二行图标按钮（缩小），第三行上次同步信息。
 * 移动端（Android）为全屏应用，无窗口可拖动。 */
export default function TopBar({
  searchQuery, onSearchChange, onOpenSettings, onNewTask, pinned, onTogglePin,
  onSyncUpload, onSyncDownload, syncBusy = false, lastSyncedAt = null, lastSyncAction = null,
}: TopBarProps) {
  // 第一行控件（搜索框/新建）尺寸：桌面 34px，移动端 ≥44px（Apple HIG / Material 触控标准）
  const controlSize = isMobile ? 44 : 34;
  // 第二行图标按钮尺寸（缩小）：桌面 26px，移动端 36px
  const iconSize = isMobile ? 36 : 26;
  // 图标按钮统一样式（图钉/设置/上传/下载）
  const iconBtnStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: iconSize,
    height: iconSize,
    borderRadius: 'calc(var(--radius) * 0.7)',
    cursor: 'pointer',
    transition: 'background-color 0.18s ease, color 0.18s ease',
    background: 'transparent',
    border: 'none',
  };
  const iconGlyph = 14; // 第二行图标字形尺寸
  return (
    <header
      {...(!isMobile && !pinned ? { 'data-tauri-drag-region': true } : {})}
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: isMobile ? '10px 12px 6px' : '14px 20px 6px',
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      {/* 第一行：搜索框 + 新建任务 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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

        {/* 新建任务 */}
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
            flexShrink: 0,
          }}
          onMouseOver={(e) => { e.currentTarget.style.filter = 'brightness(0.92)'; }}
          onMouseOut={(e) => { e.currentTarget.style.filter = 'none'; }}
        >
          <Plus style={{ width: 14, height: 14 }} />
          <span>新建</span>
        </button>
      </div>

      {/* 第二行：图标按钮（图钉仅桌面端/设置/上传/下载，缩小） */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, paddingLeft: 2 }}>
        {/* 置顶（DeskPins）仅桌面有意义：移动端全屏应用无窗口可锁定，隐藏 */}
        {!isMobile && (
          <button
            onClick={onTogglePin}
            aria-label={pinned ? "解锁位置" : "锁定位置"}
            style={{ ...iconBtnStyle, color: pinned ? 'var(--primary)' : 'var(--icon-muted)' }}
          >
            {pinned ? <PinOff style={{ width: iconGlyph, height: iconGlyph }} /> : <Pin style={{ width: iconGlyph, height: iconGlyph }} />}
          </button>
        )}
        <button
          onClick={onOpenSettings}
          aria-label="设置"
          style={{ ...iconBtnStyle, color: 'var(--icon-muted)' }}
        >
          <Settings style={{ width: iconGlyph, height: iconGlyph }} />
        </button>
        <button
          onClick={onSyncUpload}
          disabled={syncBusy}
          aria-label="上传覆盖"
          title="上传覆盖"
          style={{ ...iconBtnStyle, color: syncBusy ? 'var(--muted-foreground)' : 'var(--icon-muted)', cursor: syncBusy ? 'default' : 'pointer' }}
        >
          <Upload style={{ width: iconGlyph, height: iconGlyph }} />
        </button>
        <button
          onClick={onSyncDownload}
          disabled={syncBusy}
          aria-label="下载覆盖"
          title="下载覆盖"
          style={{ ...iconBtnStyle, color: syncBusy ? 'var(--muted-foreground)' : 'var(--icon-muted)', cursor: syncBusy ? 'default' : 'pointer' }}
        >
          <Download style={{ width: iconGlyph, height: iconGlyph }} />
        </button>
      </div>

      {/* 第三行：本设备上次同步时间 + 操作 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4, paddingLeft: 4 }}>
        <span style={{ fontSize: 10.5, color: 'var(--muted-foreground)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
          {lastSyncedAt
            ? `上次同步 ${formatSyncTime(lastSyncedAt)} · ${lastSyncAction === 'download' ? '下载' : lastSyncAction === 'upload' ? '上传' : lastSyncAction === 'merged' ? '合并' : '未知'}`
            : '尚未同步'}
        </span>
        {syncBusy && (
          <span style={{ fontSize: 10.5, color: 'var(--primary)' }}>同步中…</span>
        )}
      </div>
    </header>
  );
}
