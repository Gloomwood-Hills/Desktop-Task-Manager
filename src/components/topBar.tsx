import { Search, Settings, Plus, FolderPlus, Pin, PinOff, RefreshCw, UploadCloud, DownloadCloud, Trash2, ChevronsUp, ChevronsDown, PanelLeft } from 'lucide-react';
import { ViewMode } from '../data/types';
import { isMobile } from '../data/platform';
import CommandBubble from './commandBubble';
import MobileTopBar from './mobile/mobileTopBar';

export interface TopBarProps {
  /** 当前视图模式（列表 / 月 / 日）-> 顶栏第一排 */
  viewMode: ViewMode;
  /** 切换视图（持久化到 settings.viewMode） */
  onChangeViewMode: (m: ViewMode) => void;
  /** 自然语言命令处理：在第一排视图切换条旁提供命令气泡 */
  onCommand?: (text: string) => void;
  /** 命令框聚焦信号（小部件"快速记录"唤起时自动聚焦） */
  commandFocusSignal?: number;
  /** 搜索（仅列表视图第三栏显示） */
  searchQuery: string;
  onSearchChange: (value: string) => void;
  /** 第二排功能按钮 */
  onOpenSettings: () => void;
  onNewTask: () => void;
  onNewFolder: () => void;
  pinned: boolean;
  onTogglePin: () => void;
  onSync: () => void;
  onUploadCloud: () => void;
  onDownloadCloud: () => void;
  onOpenDeleted: () => void;
  /** 是否已展开全部（切换「展开全部/折叠全部」）-> 仅列表视图第三栏 */
  allExpanded?: boolean;
  onToggleExpandAll?: () => void;
  syncBusy?: boolean;
  /** 文件夹侧栏开关（跨视图） */
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

/** 顶栏（分栏布局三行）：
 * 第一排：视图切换（列表 / 月 / 日）+ 命令气泡；
 * 第二排：功能按钮（设置/同步/上传/下载/已删除/置顶/新建文件夹/新建任务）；
 * 第三栏（仅列表视图）：折叠全部 + 搜索。
 * 移动端（Android）为全屏应用，无窗口可拖动。 */
export default function TopBar({
  viewMode, onChangeViewMode, onCommand, commandFocusSignal = 0,
  searchQuery, onSearchChange, onOpenSettings, onNewTask, onNewFolder, pinned, onTogglePin,
  onSync, onUploadCloud, onDownloadCloud, onOpenDeleted, allExpanded = false, onToggleExpandAll, syncBusy = false,
  sidebarOpen = true, onToggleSidebar,
}: TopBarProps) {
  if (isMobile) {
    return (
      <MobileTopBar
        viewMode={viewMode}
        onCommand={onCommand}
        commandFocusSignal={commandFocusSignal}
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        onOpenSettings={onOpenSettings}
        onSync={onSync}
        syncBusy={syncBusy}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={onToggleSidebar}
      />
    );
  }

  // 输入控件/文本按钮尺寸：桌面 34px，移动端 ≥44px（Apple HIG / Material 触控标准）
  const controlSize = isMobile ? 44 : 34;
  // 图标按钮尺寸（缩小）：桌面 26px，移动端 36px
  const iconSize = isMobile ? 36 : 26;
  // 图标按钮统一样式
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
  const iconGlyph = 14; // 功能按钮图标字形尺寸
  const isListView = viewMode === 'list';

  // 视图切换按钮（列表/月/日）
  const renderViewTabs = () => (
    <div style={isMobile ? {
      display: 'flex',
      gap: 4,
      flex: 1,
      minWidth: 0,
    } : {
      display: 'flex',
      gap: 2,
      alignItems: 'center',
    }}>
      {(['list', 'calendar', 'day'] as ViewMode[]).map((m) => {
        const active = viewMode === m;
        const label = m === 'list' ? '列表' : m === 'calendar' ? '月' : '日';
        return (
          <button
            key={m}
            onClick={() => onChangeViewMode(m)}
            aria-pressed={active}
            style={isMobile ? {
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
      {/* 第一排：侧栏开关 + 视图切换（列表 / 月 / 日）+ 命令气泡 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 4, paddingRight: 4 }}>
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            aria-label={sidebarOpen ? "取消固定文件夹侧栏" : "固定文件夹侧栏"}
            title={sidebarOpen ? "取消固定（改为悬停浮现）" : "固定侧栏（常开）"}
            style={{ ...iconBtnStyle, color: sidebarOpen ? 'var(--primary)' : 'var(--icon-muted)' }}
          >
            <PanelLeft style={{ width: iconGlyph, height: iconGlyph }} />
          </button>
        )}
        {renderViewTabs()}
        {onCommand && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', minWidth: 0, flexShrink: 0 }}>
            <CommandBubble onCommand={onCommand} focusSignal={commandFocusSignal} />
          </div>
        )}
      </div>

      {/* 第二排：功能按钮（设置/同步/上传/下载/已删除/置顶/新建文件夹/新建任务）— 不换行，由窗口最小宽度约束 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, flexWrap: 'nowrap', minWidth: 0 }}>
        <button
          onClick={onOpenSettings}
          aria-label="设置"
          style={{ ...iconBtnStyle, color: 'var(--icon-muted)' }}
        >
          <Settings style={{ width: iconGlyph, height: iconGlyph }} />
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

        {/* 右侧主操作：新建文件夹 / 新建任务 */}
        <div style={{ flex: 1 }} />

        {/* 新建文件夹（圆形描边） */}
        <button
          onClick={onNewFolder}
          aria-label="新建文件夹"
          title="新建文件夹"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: controlSize,
            width: controlSize,
            border: '0.5px solid var(--border)',
            borderRadius: 999,
            background: 'transparent',
            color: 'var(--primary)',
            cursor: 'pointer',
            transition: 'background-color 0.18s ease, border-color 0.18s ease',
            fontFamily: 'var(--font-sans)',
            flexShrink: 0,
          }}
          onMouseOver={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--foreground) 6%, transparent)'; }}
          onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <FolderPlus style={{ width: 13, height: 13 }} />
        </button>

        {/* 新建任务（圆形主色填充） */}
        <button
          onClick={onNewTask}
          aria-label="新建任务"
          title="新建任务"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: controlSize,
            width: controlSize,
            border: 'none',
            borderRadius: 999,
            background: 'var(--primary)',
            color: 'var(--primary-foreground)',
            cursor: 'pointer',
            transition: 'filter 0.18s ease',
            boxShadow: 'var(--shadow-xs)',
            fontFamily: 'var(--font-sans)',
            flexShrink: 0,
          }}
          onMouseOver={(e) => { e.currentTarget.style.filter = 'brightness(0.92)'; }}
          onMouseOut={(e) => { e.currentTarget.style.filter = 'none'; }}
        >
          <Plus style={{ width: 14, height: 14 }} />
        </button>
      </div>

      {/* 第三栏（仅列表视图）：折叠全部 + 搜索 */}
      {isListView && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          {/* 展开/折叠全部（同一功能键） */}
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

          {/* 搜索 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flex: 1,
            minWidth: 0,
            maxWidth: 480,
            height: controlSize,
            padding: '0 12px',
            border: '0.5px solid var(--border)',
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
        </div>
      )}
    </header>
  );
}
