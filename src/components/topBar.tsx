import { Search, Settings, Plus, FolderPlus, Pin, PinOff, RefreshCw, UploadCloud, DownloadCloud, Trash2, ChevronsUp, ChevronsDown } from 'lucide-react';
import { isMobile } from '../data/platform';

interface TopBarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onOpenSettings: () => void;
  onNewTask: () => void;
  /** 顶栏「新建文件夹」入口（搜索栏与「新建」之间） */
  onNewFolder: () => void;
  pinned: boolean;
  onTogglePin: () => void;
  /** 一键更新（合并式同步：拉取→合并→写回两端，无需选择方向） */
  onSync: () => void;
  /** 仅上传云端（本地强推覆盖远端，不拉取/不合并） */
  onUploadCloud: () => void;
  /** 仅覆盖本地（下载远端覆盖本地，不上传） */
  onDownloadCloud: () => void;
  /** 查看已删除任务 */
  onOpenDeleted: () => void;
  /** 是否已展开全部（切换「展开全部/折叠全部」） */
  allExpanded?: boolean;
  /** 切换展开/折叠全部（同名功能键，替代右键菜单里的「展开全部/折叠全部」） */
  onToggleExpandAll?: () => void;
  /** 同步进行中：禁用同步按钮 */
  syncBusy?: boolean;
}

/** 顶栏（两行布局）：第一行搜索框+新建，第二行图标按钮（同步/上传/下载/删除/设置）。
 * 移动端（Android）为全屏应用，无窗口可拖动。 */
export default function TopBar({
  searchQuery, onSearchChange, onOpenSettings, onNewTask, onNewFolder, pinned, onTogglePin,
  onSync, onUploadCloud, onDownloadCloud, onOpenDeleted, allExpanded = false, onToggleExpandAll, syncBusy = false,
}: TopBarProps) {
  // 第一行控件（搜索框/新建）尺寸：桌面 34px，移动端 ≥44px（Apple HIG / Material 触控标准）
  const controlSize = isMobile ? 44 : 34;
  // 第二行图标按钮尺寸（缩小）：桌面 26px，移动端 36px
  const iconSize = isMobile ? 36 : 26;
  // 图标按钮统一样式（图钉/设置/一键更新）
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

        {/* 新建文件夹（搜索栏与「新建」之间） */}
        <button
          onClick={onNewFolder}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
            height: controlSize,
            padding: isMobile ? '0 14px' : '0 12px',
            border: '0.5px solid var(--border)',
            borderRadius: 999,
            background: 'transparent',
            color: 'var(--foreground)',
            fontSize: 12.5,
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            transition: 'background-color 0.18s ease, border-color 0.18s ease',
            fontFamily: 'var(--font-sans)',
            flexShrink: 0,
          }}
          onMouseOver={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--foreground) 6%, transparent)'; }}
          onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <FolderPlus style={{ width: 13, height: 13, color: 'var(--primary)' }} />
          <span>新建文件夹</span>
        </button>

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

      {/* 第二行：图标按钮（图钉仅桌面端/设置/一键更新，缩小） */}
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

        {/* 展开/折叠全部（同一功能键，替代右键菜单） */}
        <button
          onClick={onToggleExpandAll}
          aria-label={allExpanded ? "折叠全部" : "展开全部"}
          title={allExpanded ? "折叠全部" : "展开全部"}
          style={{ ...iconBtnStyle, color: allExpanded ? 'var(--primary)' : 'var(--icon-muted)' }}
        >
          {allExpanded
            ? <ChevronsUp style={{ width: iconGlyph, height: iconGlyph }} />
            : <ChevronsDown style={{ width: iconGlyph, height: iconGlyph }} />}
        </button>

        <button
          onClick={onSync}
          disabled={syncBusy}
          aria-label="一键更新云端与本地"
          title="一键更新（双向合并）"
          style={{ ...iconBtnStyle, color: syncBusy ? 'var(--muted-foreground)' : 'var(--icon-muted)', cursor: syncBusy ? 'default' : 'pointer' }}
        >
          <RefreshCw
            style={{
              width: iconGlyph,
              height: iconGlyph,
              animation: syncBusy ? 'dtm-spin 1s linear infinite' : 'none',
            }}
          />
        </button>

        {/* 仅上传云端 */}
        <button
          onClick={onUploadCloud}
          aria-label="仅上传云端"
          title="仅上传云端（本地强推覆盖远端）"
          style={{ ...iconBtnStyle, color: 'var(--icon-muted)' }}
        >
          <UploadCloud style={{ width: iconGlyph, height: iconGlyph }} />
        </button>

        {/* 仅覆盖本地 */}
        <button
          onClick={onDownloadCloud}
          aria-label="仅覆盖本地"
          title="仅覆盖本地（下载远端覆盖本地）"
          style={{ ...iconBtnStyle, color: 'var(--icon-muted)' }}
        >
          <DownloadCloud style={{ width: iconGlyph, height: iconGlyph }} />
        </button>

        {/* 已删除（查看 + 30 天保留清理） */}
        <button
          onClick={onOpenDeleted}
          aria-label="已删除任务"
          title="已删除任务"
          style={{ ...iconBtnStyle, color: 'var(--icon-muted)' }}
        >
          <Trash2 style={{ width: iconGlyph, height: iconGlyph }} />
        </button>
      </div>
    </header>
  );
}
