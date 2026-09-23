import { useState } from 'react';
import { Menu, PanelLeft, RefreshCw, Search, Settings, Trash2, X } from 'lucide-react';
import type { TopBarProps } from '../topBar';
import CommandBubble from '../commandBubble';

/** 手机端顶部栏：只保留导航、搜索、同步和设置；视图切换交给底部导航。 */
export default function MobileTopBar({
  viewMode,
  onCommand,
  commandFocusSignal = 0,
  searchQuery,
  onSearchChange,
  onOpenSettings,
  onOpenDeleted,
  onSync,
  syncBusy = false,
  syncUiState = { kind: 'idle' },
  syncConfigured = false,
  sidebarOpen = false,
  onToggleSidebar,
}: Pick<TopBarProps, 'viewMode' | 'onCommand' | 'commandFocusSignal' | 'searchQuery' | 'onSearchChange' | 'onOpenSettings' | 'onOpenDeleted' | 'onSync' | 'syncBusy' | 'syncUiState' | 'syncConfigured' | 'sidebarOpen' | 'onToggleSidebar'>) {
  const [searchOpen, setSearchOpen] = useState(Boolean(searchQuery));
  const [syncDetailsOpen, setSyncDetailsOpen] = useState(false);
  const label = viewMode === 'focus' ? '焦点' : viewMode === 'list' ? '任务' : viewMode === 'calendar' ? '月历' : '今日';

  return (
    <header className="mobile-topbar">
      <div className="mobile-topbar-main">
        <button
          type="button"
          className="mobile-icon-button"
          aria-label={sidebarOpen ? '关闭分类' : '打开分类'}
          onClick={onToggleSidebar}
        >
          {sidebarOpen ? <PanelLeft /> : <Menu />}
        </button>
        <span className="mobile-topbar-title">{label}</span>
        <div className="mobile-topbar-spacer" />
        <button
          type="button"
          className={`mobile-icon-button ${searchOpen ? 'is-active' : ''}`}
          aria-label={searchOpen ? '关闭搜索' : '搜索任务'}
          onClick={() => setSearchOpen((open) => !open)}
        >
          {searchOpen ? <X /> : <Search />}
        </button>
        <button
          type="button"
          className="mobile-icon-button"
          aria-label="同步任务"
          disabled={syncBusy}
          onClick={onSync}
        >
          <RefreshCw className={syncBusy ? 'is-spinning' : ''} />
        </button>
        <button type="button" onClick={() => syncUiState.kind === 'error' && setSyncDetailsOpen((open) => !open)} style={{ border: 0, padding: 0, background: 'transparent', font: '500 10.5px var(--font-sans)', color: syncUiState.kind === 'error' ? 'var(--destructive)' : 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>
          {syncUiState.kind === 'pending' ? '本地有变更' : syncUiState.kind === 'syncing' ? '同步中' : syncUiState.kind === 'error' ? '同步失败' : syncConfigured ? '已同步' : '未配置'}
        </button>
        <button type="button" className="mobile-icon-button" aria-label="设置" onClick={onOpenSettings}>
          <Settings />
        </button>
        <button type="button" className="mobile-icon-button" aria-label="回收站" onClick={onOpenDeleted}>
          <Trash2 />
        </button>
      </div>

      {syncUiState.kind === 'error' && syncDetailsOpen && (
        <div style={{ margin: '0 4px 6px', padding: '7px 9px', borderRadius: 8, background: 'color-mix(in srgb, var(--destructive) 8%, var(--background))', color: 'var(--foreground)', fontSize: 11.5, lineHeight: 1.4 }}>
          {syncUiState.message}
          <button type="button" onClick={() => { setSyncDetailsOpen(false); onSync(); }} style={{ marginLeft: 8, border: 0, borderRadius: 5, padding: '4px 7px', background: 'var(--primary)', color: 'var(--primary-foreground)', font: '600 11px var(--font-sans)' }}>重试</button>
        </div>
      )}

      {searchOpen && (
        <label className="mobile-search-field">
          <Search />
          <input
            autoFocus
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="搜索任务..."
            aria-label="搜索任务"
          />
          {searchQuery && (
            <button type="button" aria-label="清除搜索" onClick={() => onSearchChange('')}>
              <X />
            </button>
          )}
        </label>
      )}

      {onCommand && (
        <div className="mobile-command-field">
          <CommandBubble onCommand={onCommand} focusSignal={commandFocusSignal} />
        </div>
      )}
    </header>
  );
}
