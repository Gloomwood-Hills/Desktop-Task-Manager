import { CheckCircle2 } from 'lucide-react';
import { TaskWithSubtasks } from '../data/types';
import TaskItem from './taskItem';

interface FocusSectionProps {
  tasks: TaskWithSubtasks[];
  expandedTasks: Set<string>;
  onToggleExpanded: (id: string) => void;
  onToggleCompleted: (id: string) => void;
  onContextMenu: (event: React.MouseEvent, taskId: string) => void;
  deadlineGradient: boolean;
  dark: boolean;
}

/** 独立的每日焦点视图：只呈现最需要处理的 3–5 项任务。 */
export default function FocusSection({ tasks, expandedTasks, onToggleExpanded, onToggleCompleted, onContextMenu, deadlineGradient, dark }: FocusSectionProps) {
  const dateLabel = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date());
  return (
    <section style={{ width: 'min(760px, 100%)', margin: '0 auto', padding: 'clamp(8px, 2vw, 24px) 0 28px' }}>
      <header style={{ padding: '8px 10px 20px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', padding: '6px 11px', borderRadius: 999, background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary)', fontSize: 12, fontWeight: 700 }}>{dateLabel}</div>
        <h1 style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap', margin: '14px 0 0', letterSpacing: '-0.035em', fontSize: 'clamp(24px, 4vw, 32px)', lineHeight: 1.12 }}>
          <span>今日值得看这</span><span style={{ color: '#0a84ff', fontWeight: 750 }}>{tasks.length}</span><span>件事</span>
        </h1>
      </header>

      <div style={{ overflow: 'hidden', border: '1px solid color-mix(in srgb, var(--border) 82%, transparent)', borderRadius: 22, background: 'color-mix(in srgb, var(--card) 92%, var(--background))', boxShadow: '0 14px 34px rgba(0,0,0,0.08)' }}>
        {tasks.length ? tasks.map((task, index) => (
          <div key={task.id} style={{ padding: '5px 8px', borderTop: index ? '1px solid color-mix(in srgb, var(--border) 70%, transparent)' : undefined }}>
            <TaskItem task={task} expandedSet={expandedTasks} onToggleExpanded={onToggleExpanded} onToggleCompleted={onToggleCompleted} onContextMenu={onContextMenu} searchQuery="" deadlineGradient={deadlineGradient} dark={dark} />
          </div>
        )) : (
          <div aria-label="暂无焦点任务" style={{ display: 'grid', justifyItems: 'center', padding: '42px 20px' }}>
            <CheckCircle2 style={{ width: 34, height: 34, color: '#30d158' }} />
          </div>
        )}
      </div>
    </section>
  );
}
