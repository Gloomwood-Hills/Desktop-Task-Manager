import { Check, ChevronDown, ChevronRight, Clock, Calendar } from 'lucide-react';
import { Task, TaskWithSubtasks } from '../data/types';
import { formatDeadline, formatStartDate, deadlineUrgency } from './utils/formatDate';

interface TaskItemProps {
  task: TaskWithSubtasks;
  expanded: boolean;
  onToggleExpanded: (id: string) => void;
  onToggleCompleted: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, taskId: string) => void;
  searchQuery: string;
}

/** 高亮搜索关键词 */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: 'rgba(0,122,255,0.15)', color: 'var(--primary)', borderRadius: 3, padding: '0 2px' }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

/** 日期徽章 */
function DateBadge({ task }: { task: Task }) {
  const showStart = task.startDate !== null;
  const showDeadline = task.deadline !== null;

  if (!showStart && !showDeadline) {
    return (
      <span style={{ fontSize: 11, color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>无截止日期</span>
    );
  }

  const urgency = task.deadline !== null ? deadlineUrgency(task.deadline) : 'normal';
  const deadlineBg =
    urgency === 'danger' ? 'color-mix(in srgb, var(--destructive) 12%, transparent)' :
    urgency === 'warning' ? 'color-mix(in srgb, #ff9500 12%, transparent)' :
    'color-mix(in srgb, var(--border) 25%, transparent)';
  const deadlineColor =
    urgency === 'danger' ? 'var(--destructive)' :
    urgency === 'warning' ? '#cc7a00' :
    'var(--muted-foreground)';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 14 }}>
      {showStart && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '2px 8px', borderRadius: 999, fontSize: 11,
          background: 'color-mix(in srgb, var(--border) 25%, transparent)',
          border: '0.5px solid color-mix(in srgb, var(--border) 35%, transparent)',
        }}>
          <Calendar style={{ width: 10, height: 10, color: 'var(--muted-foreground)' }} />
          <span style={{ color: 'var(--muted-foreground)' }}>{formatStartDate(task.startDate!)}</span>
        </span>
      )}
      {showDeadline && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600,
          background: deadlineBg, color: deadlineColor,
        }}>
          <Clock style={{ width: 10, height: 10 }} />
          <span>{formatDeadline(task.deadline!)}</span>
        </span>
      )}
    </div>
  );
}

/**
 * 任务项：复选框 + 标题 + 优先级圆点 + 日期徽章 + 备注折叠 + 子任务
 */
export default function TaskItem({
  task, expanded, onToggleExpanded, onToggleCompleted, onContextMenu, searchQuery,
}: TaskItemProps) {
  const hasChildren = task.subtasks.length > 0;

  return (
    <div style={{ position: 'relative' }}>
      {/* 横向分支线 */}
      <div style={{
        position: 'absolute', left: -14, top: 18, width: 14, height: 1,
        background: 'var(--border)', opacity: 0.5,
      }} />

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          padding: '8px 8px 4px',
          opacity: task.startDate !== null && task.startDate > Date.now() ? 0.65 : 1,
        }}
        onContextMenu={(e) => onContextMenu(e, task.id)}
      >
        {/* 复选框 */}
        <div
          onClick={() => onToggleCompleted(task.id)}
          style={{
            width: 18, height: 18, borderRadius: '50%',
            border: task.completed
              ? `1.5px solid var(--state-success)`
              : `1.5px solid ${task.priority === 'important' ? '#ff6b3d' : 'var(--muted-foreground)'}`,
            background: task.completed
              ? 'var(--state-success)'
              : task.priority === 'important' ? 'color-mix(in srgb, #ff6b3d 10%, transparent)' : 'transparent',
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            marginTop: 2,
            color: 'var(--state-success-foreground)',
          }}
        >
          {task.completed && <Check style={{ width: 11, height: 11 }} />}
        </div>

        {/* 任务内容 */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* 标题行 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
            {task.priority === 'important' && !task.completed && (
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ff6b3d', flexShrink: 0 }} />
            )}
            <span
              style={{
                fontSize: 13.5,
                fontWeight: 600,
                color: task.completed ? 'var(--muted-foreground)' : 'var(--foreground)',
                textDecoration: task.completed ? 'line-through' : 'none',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                minWidth: 0,
              }}
            >
              <Highlight text={task.title} query={searchQuery} />
            </span>
            {hasChildren && (
              <span
                onClick={() => onToggleExpanded(task.id)}
                style={{ display: 'inline-flex', cursor: 'pointer', flexShrink: 0 }}
              >
                {expanded
                  ? <ChevronDown style={{ width: 12, height: 12, color: 'var(--icon-muted)' }} />
                  : <ChevronRight style={{ width: 12, height: 12, color: 'var(--icon-muted)' }} />}
              </span>
            )}
            {hasChildren && (
              <span style={{ fontSize: 11, color: 'var(--muted-foreground)', whiteSpace: 'nowrap', fontWeight: 500 }}>
                {task.subtasks.filter((s) => s.completed).length}/{task.subtasks.length}
              </span>
            )}
          </div>

          {/* 日期徽章 */}
          <DateBadge task={task} />
        </div>
      </div>

      {/* 备注折叠面板 */}
      {task.remark && (
        <div style={{
          margin: '4px 8px 6px 36px',
          padding: '8px 12px',
          borderRadius: 'calc(var(--radius) * 0.5)',
          background: 'color-mix(in srgb, var(--accent) 70%, transparent)',
          border: '0.5px solid color-mix(in srgb, var(--border) 50%, transparent)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 6,
        }}
        title="点击折叠备注"
        >
          <ChevronDown style={{ width: 11, height: 11, color: 'var(--muted-foreground)', flexShrink: 0, marginTop: 2 }} />
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-600)', lineHeight: 1.5 }}>{task.remark}</p>
        </div>
      )}

      {/* 子任务 */}
      {hasChildren && expanded && (
        <div style={{ marginLeft: 18, position: 'relative' }}>
          <div style={{ position: 'absolute', left: 6, top: 0, bottom: 16, width: 1, background: 'var(--border)', opacity: 0.4 }} />
          {task.subtasks.map((sub) => (
            <div key={sub.id} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px' }}>
              <div style={{ position: 'absolute', left: -12, top: 14, width: 12, height: 1, background: 'var(--border)', opacity: 0.4 }} />
              <div
                onClick={() => onToggleCompleted(sub.id)}
                style={{
                  width: 15, height: 15, borderRadius: '50%',
                  background: sub.completed ? 'var(--state-success)' : 'transparent',
                  border: `1.5px solid ${sub.completed ? 'var(--state-success)' : 'var(--muted-foreground)'}`,
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: 'var(--state-success-foreground)',
                }}
              >
                {sub.completed && <Check style={{ width: 9, height: 9 }} />}
              </div>
              <span
                style={{
                  fontSize: 12.5,
                  color: sub.completed ? 'var(--muted-foreground)' : 'var(--foreground)',
                  textDecoration: sub.completed ? 'line-through' : 'none',
                }}
              >
                <Highlight text={sub.title} query={searchQuery} />
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
