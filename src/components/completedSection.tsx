import { useState } from 'react';
import { Check, ChevronDown, ChevronRight } from 'lucide-react';
import { Task } from '../data/types';
import { formatCompletedAt } from './utils/formatDate';

interface CompletedSectionProps {
  tasks: Task[];
  expanded: boolean;
  onToggleExpanded: () => void;
  onRestore: (id: string) => void;
}

/** 单条已完成任务行（可点击恢复） */
function Row({ task, onRestore, showBranch }: { task: Task; onRestore: (id: string) => void; showBranch?: boolean }) {
  return (
    <div
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
        borderRadius: 'calc(var(--radius) * 0.5)',
        transition: 'background-color 0.15s ease, opacity 0.15s ease',
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 70%, transparent)';
        e.currentTarget.style.opacity = '0.85';
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.opacity = '0.6';
      }}
    >
      {showBranch !== false && (
        <div style={{ position: 'absolute', left: -14, top: 15, width: 14, height: 1, background: 'var(--border)', opacity: 0.35 }} />
      )}
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
  );
}

/** 已完成区域（默认折叠）：无重复系列的任务平铺；重复系列自动聚类且可展开 */
export default function CompletedSection({ tasks, expanded, onToggleExpanded, onRestore }: CompletedSectionProps) {
  const [openSeries, setOpenSeries] = useState<Set<string>>(new Set());

  // 按重复系列聚类
  const seriesMap = new Map<string, Task[]>();
  const singles: Task[] = [];
  for (const t of tasks) {
    if (t.repeatSeriesId) {
      const arr = seriesMap.get(t.repeatSeriesId);
      if (arr) arr.push(t); else seriesMap.set(t.repeatSeriesId, [t]);
    } else {
      singles.push(t);
    }
  }

  const toggleSeries = (id: string) =>
    setOpenSeries((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

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

          {/* 无重复系列：普通平铺 */}
          {singles.map((task) => (
            <Row key={task.id} task={task} onRestore={onRestore} />
          ))}

          {/* 重复系列：聚类 + 点击展开 */}
          {[...seriesMap.values()].map((group) => {
            const first = group[0];
            const open = openSeries.has(first.repeatSeriesId!);
            return (
              <div key={first.repeatSeriesId!}>
                {/* 聚类头 */}
                <div
                  onClick={() => toggleSeries(first.repeatSeriesId!)}
                  style={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '7px 8px',
                    opacity: 0.7,
                    cursor: 'pointer',
                    borderRadius: 'calc(var(--radius) * 0.5)',
                    transition: 'background-color 0.15s ease, opacity 0.15s ease',
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 70%, transparent)'; e.currentTarget.style.opacity = '0.9'; }}
                  onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.opacity = '0.7'; }}
                >
                  <div style={{ position: 'absolute', left: -14, top: 15, width: 14, height: 1, background: 'var(--border)', opacity: 0.35 }} />
                  <div style={{
                    width: 18, height: 18, borderRadius: '50%',
                    background: 'var(--state-success)', border: '1.5px solid var(--state-success)',
                    flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--state-success-foreground)',
                  }}>
                    <Check style={{ width: 11, height: 11 }} />
                  </div>
                  <span style={{
                    flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600,
                    textDecoration: 'line-through', color: 'var(--muted-foreground)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {first.title}
                  </span>
                  <span style={{
                    flexShrink: 0, fontSize: 10.5, fontWeight: 600,
                    padding: '1px 6px', borderRadius: 7,
                    background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
                    color: 'var(--primary)',
                  }}>
                    累计完成×{group.length}
                  </span>
                  {open ? <ChevronDown style={{ width: 13, height: 13, color: 'var(--icon-muted)', flexShrink: 0 }} />
                    : <ChevronRight style={{ width: 13, height: 13, color: 'var(--icon-muted)', flexShrink: 0 }} />}
                </div>

                {/* 展开的系列实例 */}
                {open && group.map((task) => (
                  <div key={task.id} style={{ marginLeft: 20, position: 'relative' }}>
                    <div style={{ position: 'absolute', left: 6, top: 0, bottom: 16, width: 1, background: 'var(--border)', opacity: 0.35 }} />
                    <Row task={task} onRestore={onRestore} showBranch={false} />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
