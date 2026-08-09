import { useMemo } from 'react';
import { ChevronLeft, ChevronRight, Clock, Calendar } from 'lucide-react';
import { TaskWithSubtasks } from '../data/types';
import { formatDeadline } from './utils/formatDate';

export interface DayViewProps {
  tasks: TaskWithSubtasks[];
  /** 当前查看的日期（当天 00:00 时间戳） */
  date: number;
  /** 切换查看日期（按天前后翻动） */
  onDateChange: (timestamp: number) => void;
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

/** 子任务完成进度文案（如 "2/4"）；无子任务时返回 null */
function subtaskProgress(t: TaskWithSubtasks): string | null {
  if (t.subtasks.length === 0) return null;
  return `${t.subtasks.filter((s) => s.completed).length}/${t.subtasks.length}`;
}

/** 日视图任务行：优先级圆点 + 标题 + 时间信息 + 子任务进度 */
function DayTaskRow({ task }: { task: TaskWithSubtasks }) {
  const progress = subtaskProgress(task);
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '9px 12px',
      borderRadius: 'calc(var(--radius) * 0.5)',
      background: 'color-mix(in srgb, var(--card) 75%, transparent)',
      border: '0.5px solid color-mix(in srgb, var(--border) 35%, transparent)',
    }}>
      {task.priority === 'important' && (
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ff6b3d', flexShrink: 0 }} />
      )}
      <span style={{
        flex: 1,
        minWidth: 0,
        fontSize: 13.5,
        fontWeight: 600,
        color: 'var(--foreground)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {task.title}
      </span>
      {task.deadline !== null && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>
          <Clock style={{ width: 11, height: 11, flexShrink: 0 }} />
          截止 {formatDeadline(task.deadline)}
        </span>
      )}
      {task.startDate !== null && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>
          <Calendar style={{ width: 11, height: 11, flexShrink: 0 }} />
          开始 {formatDeadline(task.startDate)}
        </span>
      )}
      {progress && (
        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>
          {progress}
        </span>
      )}
    </div>
  );
}

/** 日视图：按天查看当日任务（V2） */
export default function DayView({ tasks, date, onDateChange }: DayViewProps) {
  const dayStart = useMemo(() => startOfDay(date), [date]);
  const dayTasks = useMemo(() => tasks.filter((t) => hitsDay(t, dayStart)), [tasks, dayStart]);
  const isToday = dayStart === startOfDay(Date.now());

  const d = new Date(date);
  const title = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 周${WEEKDAYS[d.getDay()]}`;

  const navBtnStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 26,
    height: 26,
    borderRadius: 999,
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
    color: 'var(--muted-foreground)',
    background: 'transparent',
    flexShrink: 0,
  } as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 2px' }}>
      {/* 顶部工具条：前后翻日 + 日期标题 + 今天 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          onClick={() => onDateChange(dayStart - DAY_MS)}
          aria-label="前一天"
          style={navBtnStyle}
          onMouseOver={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 60%, transparent)'; }}
          onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <ChevronLeft style={{ width: 15, height: 15 }} />
        </button>
        <button
          onClick={() => onDateChange(dayStart + DAY_MS)}
          aria-label="后一天"
          style={navBtnStyle}
          onMouseOver={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 60%, transparent)'; }}
          onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <ChevronRight style={{ width: 15, height: 15 }} />
        </button>
        <span style={{ flex: 1, textAlign: 'center', fontSize: 14, fontWeight: 600, color: 'var(--foreground)', whiteSpace: 'nowrap' }}>
          {title}
        </span>
        <button
          onClick={() => onDateChange(startOfDay(Date.now()))}
          disabled={isToday}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            height: 26,
            padding: '0 12px',
            borderRadius: 999,
            border: '1px solid var(--border)',
            cursor: isToday ? 'default' : 'pointer',
            fontFamily: 'var(--font-sans)',
            fontSize: 12.5,
            fontWeight: 600,
            color: 'var(--muted-foreground)',
            background: 'transparent',
            opacity: isToday ? 0.4 : 1,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          今天
        </button>
      </div>

      {/* 当日任务列表 / 空态 */}
      {dayTasks.length === 0 ? (
        <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 13, color: 'var(--muted-foreground)' }}>
          当天没有任务
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {dayTasks.map((t) => (
            <DayTaskRow key={t.id} task={t} />
          ))}
        </div>
      )}
    </div>
  );
}
