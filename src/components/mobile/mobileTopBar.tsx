import { useState } from 'react';
import { Menu, PanelLeft, RefreshCw, Search, Settings, X } from 'lucide-react';
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
  onSync,
  syncBusy = false,
  sidebarOpen = false,
  onToggleSidebar,
}: Pick<TopBarProps, 'viewMode' | 'onCommand' | 'commandFocusSignal' | 'searchQuery' | 'onSearchChange' | 'onOpenSettings' | 'onSync' | 'syncBusy' | 'sidebarOpen' | 'onToggleSidebar'>) {
  const [searchOpen, setSearchOpen] = useState(Boolean(searchQuery));
  const label = viewMode === 'list' ? '任务' : viewMode === 'calendar' ? '月历' : '今日';

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
        <button type="button" className="mobile-icon-button" aria-label="设置" onClick={onOpenSettings}>
          <Settings />
        </button>
      </div>

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
