import { CalendarDays, ListTodo, Plus, Sparkles, Sun } from 'lucide-react';
import { ViewMode } from '../../data/types';

interface MobileBottomNavProps {
  viewMode: ViewMode;
  onChangeViewMode: (mode: ViewMode) => void;
  onNewTask: () => void;
}

/** 手机端底部导航：把常用视图和新建动作放到拇指可达区域。 */
export default function MobileBottomNav({ viewMode, onChangeViewMode, onNewTask }: MobileBottomNavProps) {
  const tabs: { mode: ViewMode; label: string; icon: typeof ListTodo }[] = [
    { mode: 'focus', label: '焦点', icon: Sparkles },
    { mode: 'list', label: '列表', icon: ListTodo },
    { mode: 'calendar', label: '月历', icon: CalendarDays },
    { mode: 'day', label: '今日', icon: Sun },
  ];

  return (
    <nav className="mobile-bottom-nav" aria-label="主导航">
      <div className="mobile-bottom-tabs">
        {tabs.map(({ mode, label, icon: Icon }) => {
          const active = viewMode === mode;
          return (
            <button
              type="button"
              key={mode}
              className={`mobile-bottom-tab ${active ? 'is-active' : ''}`}
              aria-current={active ? 'page' : undefined}
              onClick={() => onChangeViewMode(mode)}
            >
              <Icon />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
      <button type="button" className="mobile-fab" aria-label="新建任务" onClick={onNewTask}>
        <Plus />
      </button>
    </nav>
  );
}
