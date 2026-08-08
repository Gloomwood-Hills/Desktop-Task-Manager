import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { TaskWithSubtasks } from '../data/types';

export interface CalendarViewProps {
  tasks: TaskWithSubtasks[];
  /** 选中某一天：回调当天 00:00 时间戳（App 中切换至日视图） */
  onSelectDay: (timestamp: number) => void;
}

/** 周标头：周一起始 */
const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];
/** 月历固定 6 行 × 7 列，翻页时布局稳定不变 */
const GRID_CELLS = 42;

/**
 * 归一化到"年-月-日"的日期 key，仅用于判断任务是否命中某一天。
 * 全部基于本地时区（new Date(ts) 的年/月/日），避免 UTC 时区偏移造成错日。
 */
function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
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

interface DayCellProps {
  /** 当天 00:00 的本地时间戳 */
  ts: number;
  /** 是否属于当前查看月（跨月日期灰显） */
  inMonth: boolean;
  isToday: boolean;
  count: number;
  onSelectDay: (timestamp: number) => void;
}

/** 单个日期格：悬停反馈 + 今天品牌色高亮 + 任务数徽标；点击回调当天 00:00 时间戳 */
function DayCell({ ts, inMonth, isToday, count, onSelectDay }: DayCellProps) {
  const [hovered, setHovered] = useState(false);
  const day = new Date(ts).getDate();
  const muted = !inMonth;
  const numberColor = isToday ? 'var(--primary)' : muted ? 'var(--muted-foreground)' : 'var(--foreground)';

  return (
    <button
      type="button"
      onClick={() => onSelectDay(ts)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={`${new Date(ts).getMonth() + 1}月${day}日${count > 0 ? `，${count} 个任务` : ''}`}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        aspectRatio: '1 / 1',
        padding: 6,
        border: isToday ? '1px solid var(--primary)' : '1px solid transparent',
        borderRadius: 'calc(var(--radius) * 0.55)',
        background: isToday
          ? 'color-mix(in srgb, var(--primary) 12%, transparent)'
          : hovered ? 'var(--accent)' : 'transparent',
        cursor: 'pointer',
        opacity: muted ? 0.55 : 1,
        fontFamily: 'var(--font-sans)',
        color: 'inherit',
        transition: 'background-color 0.15s ease',
      }}
    >
      <span
        style={{
          fontSize: 13,
          lineHeight: 1.2,
          fontWeight: isToday ? 700 : 500,
          color: numberColor,
          textAlign: 'left',
        }}
      >
        {day}
      </span>
      {count > 0 && (
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
          <span
            style={{
              width: 4,
              height: 4,
              borderRadius: 999,
              background: 'var(--primary)',
              opacity: muted ? 0.7 : 1,
            }}
          />
          <span style={{ fontSize: 11, lineHeight: 1, fontWeight: 600, color: 'var(--primary)' }}>{count}</span>
        </span>
      )}
    </button>
  );
}

/** 日历视图（V2）：月历网格 + 任务数标记，点击任意日期切换至日视图 */
export default function CalendarView({ tasks, onSelectDay }: CalendarViewProps) {
  const now = new Date();
  // 查看中的月（0-11）：翻页只改变查看月，不自动跳回今天
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  /**
   * 每个日期 key → 命中任务数。
   * 一个任务若 startDate 或 deadline 命中该日即计入；同一任务同一天只计一次
   *（用 Set 去重，避免 startDate 与 deadline 都落在同一天时重复计数）。
   */
  const countByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const task of tasks) {
      const keys = new Set<string>();
      if (task.startDate !== null) keys.add(dayKey(task.startDate));
      if (task.deadline !== null) keys.add(dayKey(task.deadline));
      for (const key of keys) {
        map.set(key, (map.get(key) ?? 0) + 1);
      }
    }
    return map;
  }, [tasks]);

  /** 生成 6×7 网格：当月 1 号对齐到所在周的周一，首尾自动补齐相邻月日期（均取当天 00:00） */
  const cells = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    // getDay()：0=周日。周一起始 → 周日需前移 6 天，其余前移 (getDay()-1) 天
    const lead = first.getDay() === 0 ? 6 : first.getDay() - 1;
    const gridStart = new Date(viewYear, viewMonth, 1 - lead); // 负数/0 由 Date 自动回退到上月
    return Array.from({ length: GRID_CELLS }, (_, i) => {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      return { ts: d.getTime(), inMonth: d.getMonth() === viewMonth };
    });
  }, [viewYear, viewMonth]);

  const todayKey = dayKey(Date.now());

  /** 平移查看月：用 Date 的月份溢出自动处理跨年（如 12月-1 → 去年11月） */
  const shiftMonth = (delta: number) => {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  /** "今天"按钮：回到当前月（今天自动高亮） */
  const goToday = () => {
    const d = new Date();
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  return (
    <div>
      {/* 顶部工具条：← 月份 → + 今天 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10 }}>
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          aria-label="上个月"
          style={NAV_BUTTON}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <ChevronLeft style={{ width: 16, height: 16 }} />
        </button>
        <span
          style={{
            flex: 1,
            textAlign: 'center',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--foreground)',
            userSelect: 'none',
          }}
        >
          {viewYear}年{viewMonth + 1}月
        </span>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          aria-label="下个月"
          style={NAV_BUTTON}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <ChevronRight style={{ width: 16, height: 16 }} />
        </button>
        <button
          type="button"
          onClick={goToday}
          style={{
            marginLeft: 8,
            padding: '5px 12px',
            border: '0.5px solid var(--border)',
            borderRadius: 999,
            background: 'var(--background)',
            color: 'var(--foreground)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
            transition: 'background-color 0.15s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--background)'; }}
        >
          今天
        </button>
      </div>

      {/* 周标头（周一起始） */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 6 }}>
        {WEEKDAY_LABELS.map((label) => (
          <span
            key={label}
            style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted-foreground)', userSelect: 'none' }}
          >
            {label}
          </span>
        ))}
      </div>

      {/* 月历网格：7 列，点击任意日期（含跨月）回调当天 00:00 时间戳 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {cells.map((cell) => {
          const key = dayKey(cell.ts);
          return (
            <DayCell
              key={cell.ts}
              ts={cell.ts}
              inMonth={cell.inMonth}
              isToday={key === todayKey}
              count={countByDay.get(key) ?? 0}
              onSelectDay={onSelectDay}
            />
          );
        })}
      </div>
    </div>
  );
}
