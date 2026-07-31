import { Check, ChevronDown, ChevronRight } from 'lucide-react';
import { Task } from '../data/types';
import { formatCompletedAt } from './utils/formatDate';

interface CompletedSectionProps {
  tasks: Task[];
  expanded: boolean;
  onToggleExpanded: () => void;
  onRestore: (id: string) => void;
}

/** 已完成区域（默认折叠，对齐设计稿） */
export default function CompletedSection({ tasks, expanded, onToggleExpanded, onRestore }: CompletedSectionProps) {
  return (
    <div style={{ marginTop: 4 }}>
      {/* Header */}
      <div
        onClick={onToggleExpanded}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 8px',
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--muted-foreground)',
          cursor: 'pointer',
          borderRadius: 'calc(var(--radius) * 0.55)',
          transition: 'background-color 0.15s ease, color 0.15s ease',
          userSelect: 'none',
        }}
        onMouseOver={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 80%, transparent)'; e.currentTarget.style.color = 'var(--foreground)'; }}
        onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--muted-foreground)'; }}
      >
        {expanded
          ? <ChevronDown style={{ width: 14, height: 14 }} />
          : <ChevronRight style={{ width: 14, height: 14 }} />}
        <span>已完成</span>
        <span style={{ fontSize: 11, color: 'var(--muted-foreground)', marginLeft: 2 }}>({tasks.length})</span>
      </div>

      {/* Completed tasks */}
      {expanded && (
        <div className="tree-children" style={{ marginLeft: 20, position: 'relative' }}>
          <div style={{ position: 'absolute', left: 6, top: 0, bottom: 16, width: 1, background: 'var(--border)', opacity: 0.35 }} />

          {tasks.map((task) => (
            <div
              key={task.id}
              onClick={() => onRestore(task.id)}
              title="点击恢复任务"
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '7px 8px',
                opacity: 0.6,
                cursor: 'pointer',
              }}
            >
              <div style={{ position: 'absolute', left: -14, top: 15, width: 14, height: 1, background: 'var(--border)', opacity: 0.35 }} />
              <div style={{
                width: 18, height: 18, borderRadius: '50%',
                background: 'var(--state-success)',
                border: '1.5px solid var(--state-success)',
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--state-success-foreground)',
              }}>
                <Check style={{ width: 11, height: 11 }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{
                  fontSize: 13.5, fontWeight: 600,
                  textDecoration: 'line-through',
                  color: 'var(--muted-foreground)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  display: 'block',
                }}>
                  {task.title}
                </span>
              </div>
              <span style={{ fontSize: 11, color: 'var(--muted-foreground)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                完成于 {task.completedAt !== null ? formatCompletedAt(task.completedAt) : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
