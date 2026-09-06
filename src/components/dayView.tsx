import { useMemo } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import { ChevronLeft, ChevronRight, AlignLeft, Tag, Check } from 'lucide-react';
import { TaskWithSubtasks } from '../data/types';
import { generateRepeatOccurrences } from './utils/repeatUtils';

export interface DayViewProps {
  /** 当天活动任务（顶层，含子任务） */
  tasks: TaskWithSubtasks[];
  /** 当天已完成任务（顶层，含子任务，用于划线展示） */
  completedTasks: TaskWithSubtasks[];
  /** 当前查看的日期（当天 00:00 时间戳） */
  date: number;
  /** 文件夹 id → 名称 映射（用于分类气泡） */
  folderMap: Map<string, string>;
  /** 切换查看日期（按天前后翻动） */
  onDateChange: (timestamp: number) => void;
  /** 切换完成/未完成（圆圈勾选） */
  onToggleComplete: (id: string) => void;
  /** 任务右键菜单（与列表视图一致） */
  onContextMenuTask?: (e: ReactMouseEvent, taskId: string) => void;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

/** 归一化为当天 00:00（本地时区） */
function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 时间戳是否落在 [dayStart, dayStart + 24h) 区间内 */
function inDayRange(ts: number | null, dayStart: number): boolean {
  return ts !== null && ts >= dayStart && ts < dayStart + DAY_MS;
}

/** 任务是否命中该日：开始日期或截止日期落在当天 */
function hitsDay(t: TaskWithSubtasks, dayStart: number): boolean {
  return inDayRange(t.startDate, dayStart) || inDayRange(t.deadline, dayStart);
}

/** 时间药丸显示时刻：优先截止、其次开始；两者均无具体时刻时标记为全天 */
function entryTime(task: TaskWithSubtasks, dayStart: number): { label: string; ts: number | null } {
  const ts = inDayRange(task.deadline, dayStart)
    ? task.deadline
    : inDayRange(task.startDate, dayStart)
      ? task.startDate
      : null;
  if (ts === null) return { label: '全天', ts: null };
  const d = new Date(ts);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return { label: `${hh}:${mm}`, ts };
}

const NAV_BUTTON: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  flexShrink: 0,
  border: 'none',
  borderRadius: 'calc(var(--radius) * 0.55)',
  background: 'transparent',
  color: 'var(--icon-muted)',
  cursor: 'pointer',
  fontFamily: 'var(--font-sans)',
  transition: 'background-color 0.15s ease',
};

/** 勾选圆圈样式：完成=深蓝填充+白勾，未完成=灰色填充（无描边） */
function circleStyle(completed: boolean): CSSProperties {
  if (completed) {
    return {
      background: 'var(--primary)',
      color: '#ffffff',
    };
  }
  return {
    background: 'color-mix(in srgb, var(--muted-foreground) 18%, transparent)',
  };
}

/** 可勾选的子任务行（支持任意层级递归） */
function SubtaskRow({ task, onToggleComplete, onContextMenuTask }: {
  task: TaskWithSubtasks;
  onToggleComplete: (id: string) => void;
  onContextMenuTask?: (e: ReactMouseEvent, taskId: string) => void;
}) {
  const completed = task.completed;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        onContextMenu={onContextMenuTask ? (e) => onContextMenuTask(e, task.id) : undefined}
      >
        <div
          onClick={(e) => { e.stopPropagation(); onToggleComplete(task.id); }}
          role="checkbox"
          aria-checked={completed}
          style={{
            width: 15,
            height: 15,
            borderRadius: '50%',
            boxSizing: 'border-box',
            flexShrink: 0,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            ...circleStyle(completed),
          }}
        >
          {completed && <Check style={{ width: 9, height: 9, strokeWidth: 3 }} />}
        </div>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 12.5,
            color: completed ? 'var(--muted-foreground)' : 'var(--foreground)',
            textDecoration: completed ? 'line-through' : 'none',
            lineHeight: 1.3,
            wordBreak: 'break-word',
            overflowWrap: 'anywhere',
          }}
        >
          {task.title}
        </span>
      </div>
      {task.subtasks.length > 0 && (
        <div style={{ marginLeft: 23, display: 'flex', flexDirection: 'column', gap: 4, position: 'relative' }}>
          {task.subtasks.map((s) => (
            <SubtaskRow key={s.id} task={s} onToggleComplete={onToggleComplete} onContextMenuTask={onContextMenuTask} />
          ))}
        </div>
      )}
    </div>
  );
}

/** 单条时间轴事件：轨道节点圆圈（可勾选） + 时刻药丸 + 内容卡片（备注/分类/子任务，主题色沿用列表视图） */
function TimelineEntry({
  task, dayStart, folderMap, onToggleComplete, isLast, onContextMenuTask,
}: {
  task: TaskWithSubtasks;
  dayStart: number;
  folderMap: Map<string, string>;
  onToggleComplete: (id: string) => void;
  isLast: boolean;
  onContextMenuTask?: (e: ReactMouseEvent, taskId: string) => void;
}) {
  const time = entryTime(task, dayStart);
  const important = task.priority === 'important';
  const completed = task.completed;
  const folderName = task.folderId !== null ? folderMap.get(task.folderId) : undefined;

  return (
    <div
      style={{ display: 'flex', gap: 12 }}
      onContextMenu={onContextMenuTask ? (e) => onContextMenuTask(e, task.id) : undefined}
    >
      {/* 时间轴轨道：节点圆圈（可勾选）+ 节点之间的段间连线（节点处保留背景色） */}
      <div style={{ position: 'relative', width: 16, flexShrink: 0 }}>
        {/* 下段连线：仅连接当前节点与下一个节点，最后一个节点不再向下延伸 */}
        {!isLast && (
          <div
            style={{
              position: 'absolute',
              left: 7.25,
              top: 23,
              bottom: 0,
              width: 1.5,
              borderRadius: 999,
              background: 'color-mix(in srgb, var(--day-timeline-line) 42%, transparent)',
            }}
          />
        )}
        <div
          onClick={(e) => { e.stopPropagation(); onToggleComplete(task.id); }}
          role="checkbox"
          aria-checked={completed}
          title={completed ? '点击恢复' : '点击完成'}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.12)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          style={{
            position: 'absolute',
            left: 0,
            top: 4,
            width: 16,
            height: 16,
            borderRadius: '50%',
            boxSizing: 'border-box',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            ...circleStyle(completed),
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.16)',
            transition: 'transform 0.12s ease',
          }}
        >
          {completed && <Check style={{ width: 10, height: 10, strokeWidth: 3 }} />}
        </div>
      </div>

      {/* 内容列：时刻药丸 + 内容卡片 */}
      <div style={{ flex: 1, minWidth: 0, paddingBottom: 18 }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '3px 12px',
            borderRadius: 999,
            background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
            color: 'var(--primary)',
            fontSize: 12.5,
            fontWeight: 600,
            lineHeight: 1.4,
          }}
        >
          {time.label}
        </div>

        <div
          style={{
            marginTop: 8,
            padding: '12px 14px',
            borderRadius: 'calc(var(--radius) * 0.55)',
            background: 'color-mix(in srgb, var(--card) 75%, transparent)',
            border: '0.5px solid color-mix(in srgb, var(--border) 35%, transparent)',
            opacity: completed ? 0.55 : 1,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            {important && !completed && (
              <span
                style={{
                  flexShrink: 0,
                  marginTop: 1,
                  padding: '1px 8px',
                  borderRadius: 999,
                  background: 'color-mix(in srgb, #ff6b3d 14%, transparent)',
                  color: '#ff6b3d',
                  fontSize: 11,
                  fontWeight: 600,
                  lineHeight: 1.5,
                  whiteSpace: 'nowrap',
                }}
              >
                重要
              </span>
            )}
            <span
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: 13.5,
                fontWeight: 600,
                color: completed ? 'var(--muted-foreground)' : 'var(--foreground)',
                textDecoration: completed ? 'line-through' : 'none',
                lineHeight: 1.4,
                wordBreak: 'break-word',
                overflowWrap: 'anywhere',
              }}
            >
              {task.title}
            </span>
          </div>

          {/* 备注（若有） */}
          {task.remark.trim().length > 0 && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 8 }}>
              <AlignLeft style={{ width: 12, height: 12, color: 'var(--muted-foreground)', flexShrink: 0, marginTop: 3 }} />
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 12.5,
                  color: 'var(--foreground)',
                  lineHeight: 1.4,
                  wordBreak: 'break-word',
                  overflowWrap: 'anywhere',
                }}
              >
                {task.remark}
              </span>
            </div>
          )}

          {/* 分类气泡（若有） */}
          {folderName && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                marginTop: 8,
                padding: '2px 8px',
                borderRadius: 999,
                background: 'color-mix(in srgb, var(--primary) 10%, transparent)',
                color: 'var(--primary)',
                fontSize: 11,
                fontWeight: 600,
                lineHeight: 1.4,
                whiteSpace: 'nowrap',
              }}
            >
              <Tag style={{ width: 10, height: 10 }} />
              {folderName}
            </span>
          )}

          {/* 子任务（若有，且可勾选） */}
          {task.subtasks.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {task.subtasks.map((sub) => (
                <SubtaskRow key={sub.id} task={sub} onToggleComplete={onToggleComplete} onContextMenuTask={onContextMenuTask} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** 日视图（时间轴风格）：竖向时间线 + 时刻药丸 + 内容卡片，主题色沿用列表视图 */
export default function DayView({
  tasks, completedTasks, date, folderMap, onDateChange, onToggleComplete, onContextMenuTask,
}: DayViewProps) {
  const dayStart = useMemo(() => startOfDay(date), [date]);
  const isToday = dayStart === startOfDay(Date.now());

  // 当天条目 = 活动 + 已完成（均为顶层，子任务放在气泡内展示），按截止时间排序。
  // 重复任务：若其任意出现日命中当天，则计入（虚拟出现，不创建 DB 记录）。
  const sorted = useMemo(() => {
    const dayEnd = dayStart + DAY_MS - 1;
    const hitsRepeatDay = (t: TaskWithSubtasks): boolean => {
      if (!t.repeatRule || !t.deadline) return false;
      return generateRepeatOccurrences(t, dayStart, dayEnd).some(
        (ts) => ts >= dayStart && ts < dayStart + DAY_MS
      );
    };
    const active = tasks.filter((t) => t.parentId === null && (hitsDay(t, dayStart) || hitsRepeatDay(t)));
    const done = completedTasks.filter((t) => t.parentId === null && hitsDay(t, dayStart));
    return [...active, ...done].sort((a, b) => {
      const da = a.deadline ?? Number.POSITIVE_INFINITY;
      const db = b.deadline ?? Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;
      const sa = a.startDate ?? Number.POSITIVE_INFINITY;
      const sb = b.startDate ?? Number.POSITIVE_INFINITY;
      if (sa !== sb) return sa - sb;
      return a.title.localeCompare(b.title);
    });
  }, [tasks, completedTasks, dayStart]);

  const d = new Date(date);
  const title = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 · 周${WEEKDAYS[d.getDay()]}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* 顶部：日期大标题 + 事项计数 + 前后翻日/今天 */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, paddingBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 19,
              fontWeight: 700,
              color: 'var(--foreground)',
              lineHeight: 1.3,
              letterSpacing: '0.2px',
              wordBreak: 'break-word',
            }}
          >
            {title}
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted-foreground)', marginTop: 4 }}>
            {sorted.length} 个事项
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => onDateChange(dayStart - DAY_MS)}
            aria-label="前一天"
            style={NAV_BUTTON}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <ChevronLeft style={{ width: 16, height: 16 }} />
          </button>
          <button
            type="button"
            onClick={() => onDateChange(dayStart + DAY_MS)}
            aria-label="后一天"
            style={NAV_BUTTON}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <ChevronRight style={{ width: 16, height: 16 }} />
          </button>
          <button
            type="button"
            onClick={() => onDateChange(startOfDay(Date.now()))}
            disabled={isToday}
            aria-label="回到今天"
            title="回到今天"
            style={{
              marginLeft: 8,
              padding: '5px 12px',
              border: '0.5px solid var(--border)',
              borderRadius: 999,
              background: 'var(--background)',
              color: 'var(--foreground)',
              fontSize: 12,
              fontWeight: 600,
              cursor: isToday ? 'default' : 'pointer',
              fontFamily: 'var(--font-sans)',
              opacity: isToday ? 0.4 : 1,
              transition: 'background-color 0.15s ease',
            }}
            onMouseEnter={(e) => { if (!isToday) e.currentTarget.style.background = 'var(--accent)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--background)'; }}
          >
            今天
          </button>
        </div>
      </div>

      {/* 时间轴列表 / 空态 */}
      {sorted.length === 0 ? (
        <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 13, color: 'var(--muted-foreground)' }}>
          当天没有事项
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {sorted.map((t, i) => (
            <TimelineEntry
              key={t.id}
              task={t}
              dayStart={dayStart}
              folderMap={folderMap}
              onToggleComplete={onToggleComplete}
              isLast={i === sorted.length - 1}
              onContextMenuTask={onContextMenuTask}
            />
          ))}
        </div>
      )}
    </div>
  );
}
