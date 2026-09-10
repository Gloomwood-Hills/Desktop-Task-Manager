import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, ChevronRight, Plus, Check } from 'lucide-react';
import { Task, TaskWithSubtasks } from '../data/types';
import { generateRepeatOccurrences } from './utils/repeatUtils';
import { panelSpring } from './utils/motion';

export interface CalendarViewProps {
  /** 活动（未完成）任务：用于月格药丸与面板的未完成部分 */
  tasks: TaskWithSubtasks[];
  /** 已完成任务（App 传已完成的根级任务列表）：仅在选中日详情面板中展示（月格药丸不占位） */
  completedTasks?: Task[];
  /** 「+ 添加事项」：预填该日作为任务开始/截止候选（App 中打开 QuickCapture 弹窗） */
  onAddTask?: (timestamp: number) => void;
  /** 详情面板勾选/撤销勾选（App 中复用 toggleCompleted 业务逻辑） */
  onToggleTask?: (id: string) => void;
  /** 任务右键菜单（与列表视图一致），月格药丸 / 详情面板行触发 */
  onContextMenuTask?: (e: ReactMouseEvent, taskId: string) => void;
}

/** 周标头：周一起始 */
const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];
/** 月历固定 6 行 × 7 列，翻页时布局稳定不变 */
const GRID_CELLS = 42;
/** 网格间隙：周标头与日期网格共用，保证两行格子严格对齐 */
const GRID_GAP = 4;
/** 单格最多直接渲染的药丸数；超出显示 "+N" */
const MAX_PILLS_PER_CELL = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

/** 归一化为当天 00:00 时间戳（本地时区） */
function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 归一化到"年-月-日"的日期 key，仅用于判断任务是否命中某一天。
 * 全部基于本地时区（new Date(ts) 的年/月/日），避免 UTC 时区偏移造成错日。 */
function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** 把已完成任务（可能无 subtasks 字段）规范化为 DetailRow 可用的结构 */
function toDetail(t: TaskWithSubtasks | Task): TaskWithSubtasks {
  const anyT = t as TaskWithSubtasks;
  return { ...anyT, subtasks: anyT.subtasks ?? [] };
}

/** 当日事件药丸视觉层 */
type PillTone = 'soft' | 'solid';

/** 药丸配色：重要任务实心蓝（白字），普通任务浅蓝底深蓝字（iOS 日历蓝色系） */
function pillStyleFor(tone: PillTone): CSSProperties {
  if (tone === 'solid') {
    return {
      background: '#0a84ff',
      color: '#ffffff',
    };
  }
  // soft：浅蓝底 + 深蓝字
  return {
    background: '#d4e6ff',
    color: '#0b3e8f',
  };
}

interface PillProps {
  /** 截断用最长字符数（按字符宽度粗算；中文按 1、英文按 0.55） */
  maxChars: number;
  title: string;
  tone: PillTone;
  /** 是否已完成（显示对勾 + 删除线 + 降透明度） */
  completed?: boolean;
  /** 点击事件回调（详情面板里的勾选 / 列表项也复用） */
  onClick?: (e: React.MouseEvent) => void;
  /** 右键事件回调（与列表视图一致的任务菜单） */
  onContextMenu?: (e: ReactMouseEvent) => void;
}

/** 当日事件药丸：勾号 + 标题（截断），优先级 important 用实心蓝底白字、其他用浅蓝底深蓝字；
 * 已完成实例显示对勾 + 删除线 + 半透明（重复任务历史出现日） */
function Pill({ maxChars, title, tone, completed, onClick, onContextMenu }: PillProps) {
  const truncated = truncateTitle(title, maxChars);
  const baseStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    width: 'calc(100% - 4px)',
    height: 16,
    margin: '1px 2px',
    padding: '0 5px',
    borderRadius: 5,
    fontSize: 9.5,
    lineHeight: '14px',
    fontWeight: 500,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textDecoration: completed ? 'line-through' : 'none',
    textOverflow: 'ellipsis',
    border: 'none',
    cursor: onClick ? 'pointer' : 'default',
    fontFamily: 'var(--font-sans)',
    textAlign: 'left',
    opacity: completed ? 0.55 : 1,
  };
  return (
    <div
      role={onClick ? 'button' : undefined}
      onClick={onClick}
      onContextMenu={onContextMenu}
      style={{ ...baseStyle, ...pillStyleFor(tone) }}
    >
      {completed && (
        <motion.span initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={panelSpring} style={{ display: 'inline-flex' }}>
          <Check style={{ width: 9, height: 9, marginRight: 2, flexShrink: 0 }} />
        </motion.span>
      )}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{truncated}</span>
    </div>
  );
}

/** 按字符宽度粗略截断（中文 1 字 = 1，英文/数字按 0.55 折算） */
function truncateTitle(title: string, maxChars: number): string {
  if (maxChars <= 0) return '';
  let total = 0;
  let out = '';
  for (const ch of title) {
    const w = ch.charCodeAt(0) > 0x7f ? 1 : 0.55;
    if (total + w > maxChars) break;
    total += w;
    out += ch;
  }
  if (out.length < title.length) out += '…';
  return out;
}

interface DayCellProps {
  /** 当天 00:00 的本地时间戳 */
  ts: number;
  /** 是否属于当前查看月（跨月日期灰显） */
  inMonth: boolean;
  isToday: boolean;
  /** 该日命中任务列表（按 deadline 排序，空格置后） */
  dayTasks: TaskWithSubtasks[];
  /** 是否处于选中态（详情面板展开目标日） */
  isSelected: boolean;
  onClickCell: (ts: number, e: React.MouseEvent) => void;
  /** 任务右键菜单（与列表视图一致），药丸触发 */
  onTaskContextMenu?: (e: ReactMouseEvent, taskId: string) => void;
}

/** 单个日期格：悬停反馈 + 今天品牌色高亮 + 选中蓝填充 + 三条药丸任务标签 */
function DayCell({ ts, inMonth, isToday, dayTasks, isSelected, onClickCell, onTaskContextMenu }: DayCellProps) {
  const [hovered, setHovered] = useState(false);
  const day = new Date(ts).getDate();
  const muted = !inMonth;

  const numberColor = isSelected
    ? '#1c4d8a'
    : isToday
      ? 'var(--primary)'
      : muted
        ? 'var(--muted-foreground)'
        : 'var(--foreground)';

  // 选中蓝底 / 今天浅蓝底 / 跨月透明 / 悬停浅灰
  const cellBg = isSelected
    ? '#d6e8ff'
    : isToday
      ? 'color-mix(in srgb, var(--primary) 8%, transparent)'
      : hovered
        ? 'var(--accent)'
        : 'transparent';

  const borderColor = isSelected
    ? '#9cc6ff'
    : isToday
      ? 'var(--primary)'
      : 'transparent';

  // 限定每格最多 3 个药丸；超出显示 "+N"
  const visible = dayTasks.slice(0, MAX_PILLS_PER_CELL);
  const overflow = dayTasks.length - visible.length;

  return (
    <button
      type="button"
      onClick={(e) => onClickCell(ts, e)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={`${new Date(ts).getMonth() + 1}月${day}日${dayTasks.length > 0 ? `，${dayTasks.length} 个任务` : ''}`}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 92,
        padding: '4px 4px 4px',
        border: `1px solid ${borderColor}`,
        borderRadius: 7,
        background: cellBg,
        cursor: 'pointer',
        opacity: muted ? 0.55 : 1,
        fontFamily: 'var(--font-sans)',
        color: 'inherit',
        overflow: 'hidden',
        textAlign: 'left',
        transition: 'background-color 0.15s ease',
      }}
    >
      {/* 顶部行：日期数字 + 选中态下右上角的对勾指示 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{
            fontSize: 15,
            lineHeight: '20px',
            fontWeight: isToday || isSelected ? 700 : 500,
            color: numberColor,
          }}
        >
          {day}
        </span>
      </div>

      {/* 任务药丸列表 */}
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 2, overflow: 'hidden' }}>
        {visible.map((t) => (
          <Pill
            key={t.id}
            title={t.title}
            maxChars={8}
            tone={t.priority === 'important' ? 'solid' : 'soft'}
            completed={t.completed}
            onContextMenu={onTaskContextMenu ? (e) => onTaskContextMenu(e, t.id) : undefined}
          />
        ))}
        {overflow > 0 && (
          <div
            style={{
              fontSize: 9.5,
              lineHeight: '16px',
              color: 'var(--muted-foreground)',
              padding: '0 6px',
              margin: '1px 2px',
              fontWeight: 600,
            }}
          >
            +{overflow}
          </div>
        )}
      </div>
    </button>
  );
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

/** 详情面板里的一行：勾号 + 标题 + 「日程」小标 + 右侧时间戳；已完成任务显示灰色删除线样式 */
function DetailRow({ task, onToggle, onContextMenu, parentTitle }: {
  task: TaskWithSubtasks;
  onToggle: (id: string) => void;
  onContextMenu?: (e: ReactMouseEvent) => void;
  parentTitle?: string;
}) {
  // 时间戳显示：取任务截止/开始中更接近当天的时间点
  const deadline = task.deadline;
  const dayStart = startOfDay(task.deadline ?? task.startDate ?? Date.now());
  const labelTime = formatDayRowTime(deadline, dayStart);
  const hasSubtasks = task.subtasks.length > 0;
  return (
    <div
      onContextMenu={onContextMenu}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 16px',
        background: 'var(--card)',
        borderRadius: 'calc(var(--radius) * 0.55)',
        border: '0.5px solid color-mix(in srgb, var(--border) 60%, transparent)',
      }}
    >
      <button
        type="button"
        onClick={() => onToggle(task.id)}
        aria-label={task.completed ? '撤销完成' : '标记完成'}
        onMouseEnter={(e) => {
          if (!task.completed) {
            e.currentTarget.style.borderColor = 'var(--primary)';
            e.currentTarget.style.background = 'color-mix(in srgb, var(--primary) 10%, transparent)';
          }
        }}
        onMouseLeave={(e) => {
          if (!task.completed) {
            e.currentTarget.style.borderColor = task.priority === 'important' ? '#ff6b3d' : 'var(--muted-foreground)';
            e.currentTarget.style.background =
              task.priority === 'important' ? 'color-mix(in srgb, #ff6b3d 10%, transparent)' : 'transparent';
          }
        }}
        style={{
          flexShrink: 0,
          width: 18,
          height: 18,
          borderRadius: '50%',
          // 与列表视图（TaskItem 勾选圈）一致：完成=深蓝实心、无描边；未完成=描边圆（重要任务橙色、普通灰）
          border: task.completed
            ? 'none'
            : `1.5px solid ${task.priority === 'important' ? '#ff6b3d' : 'var(--muted-foreground)'}`,
          background: task.completed
            ? 'var(--primary)'
            : task.priority === 'important'
              ? 'color-mix(in srgb, #ff6b3d 10%, transparent)'
              : 'transparent',
          color: '#ffffff',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        {task.completed && (
          <motion.span initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={panelSpring} style={{ display: 'inline-flex' }}>
            <Check style={{ width: 11, height: 11, strokeWidth: 3 }} />
          </motion.span>
        )}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* 子任务归属气泡（需求4）：表明它属于哪个父任务 */}
        {parentTitle && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 8px', borderRadius: 999, background: 'color-mix(in srgb, var(--chart-3) 12%, transparent)', color: 'var(--chart-3)', fontSize: 11, fontWeight: 600, lineHeight: 1.5, whiteSpace: 'nowrap', maxWidth: '100%', marginBottom: 4 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{parentTitle}</span>
          </div>
        )}
        <div
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: task.completed ? 'var(--muted-foreground)' : 'var(--foreground)',
            textDecoration: task.completed ? 'line-through' : 'none',
            lineHeight: 1.3,
            wordBreak: 'break-word',
            overflowWrap: 'anywhere',
          }}
        >
          {task.title}
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 2 }}>
          {task.completed
            ? '已完成'
            : `日程${hasSubtasks ? ` · ${task.subtasks.filter((s) => s.completed).length}/${task.subtasks.length}` : ''}`}
        </div>
        {/* 任务备注（需求2，内联常显） */}
        {task.remark.trim().length > 0 && (
          <div style={{ marginTop: 4, fontSize: 11.5, color: 'var(--muted-foreground)', lineHeight: 1.4, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
            {task.remark}
          </div>
        )}
        {/* 子任务展开：查看每个子任务的标题与备注（需求2） */}
        {hasSubtasks && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
            {task.subtasks.map((s) => (
              <div key={s.id} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.completed ? 'var(--primary)' : 'var(--muted-foreground)', flexShrink: 0, marginTop: 5 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color: s.completed ? 'var(--muted-foreground)' : 'var(--foreground)', textDecoration: s.completed ? 'line-through' : 'none', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{s.title}</div>
                  {s.remark.trim().length > 0 && (
                    <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 1, lineHeight: 1.3, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{s.remark}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div
        style={{
          fontSize: 12.5,
          fontWeight: 500,
          color: 'var(--muted-foreground)',
          flexShrink: 0,
        }}
      >
        {labelTime}
      </div>
    </div>
  );
}

/** 把时间戳格式化为「23:00」式 HH:mm（24 小时制） */
function formatDayRowTime(ts: number | null, dayStart: number): string {
  if (ts === null) return '';
  const d = new Date(ts);
  if (ts < dayStart || ts >= dayStart + DAY_MS) {
    // 跨天任务：显示完整日期更稳妥
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

/** 月历视图（V3）：月历网格 + 每格药丸标签 + 选中详情面板 */
export default function CalendarView({ tasks, completedTasks, onAddTask, onToggleTask, onContextMenuTask }: CalendarViewProps) {
  const now = new Date();
  // 查看中的月（0-11）：翻页只改变查看月，不自动跳回今天
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  // 选中的日期（点击单元格切换；同一格再次点击取消）
  const [selectedTs, setSelectedTs] = useState<number | null>(null);

  /**
   * 每个日期 key → 命中任务列表（含活动任务 + 已完成实例）。
   * - 普通任务：startDate 或 deadline 命中该日即计入。
   * - 重复任务：在可见月历区间内的所有出现日都计入（虚拟出现，不创建 DB 记录）。
   * - 已完成实例：按 deadline 命中日计入（药丸显示对勾 + 删除线）。
   * 同一任务同一天只计一次。
   * 排序：有截止时间在前 / 标题字典序。
   */
  const tasksByDay = useMemo(() => {
    const map = new Map<string, TaskWithSubtasks[]>();
    // 可见区间：6×7 网格覆盖的起止日（含跨月补齐）
    const first = new Date(viewYear, viewMonth, 1);
    const lead = first.getDay() === 0 ? 6 : first.getDay() - 1;
    const gridStart = new Date(viewYear, viewMonth, 1 - lead);
    const rangeStart = gridStart.getTime();
    const rangeEnd = rangeStart + GRID_CELLS * DAY_MS - 1;

    const addTask = (task: TaskWithSubtasks, key: string) => {
      const list = map.get(key) ?? [];
      if (!list.some((t) => t.id === task.id)) list.push(task);
      map.set(key, list);
    };

    // 活动任务（含子任务）：凡命中当天的节点（顶层或子任务）都作为独立条目，子任务带归属气泡
    const walkActive = (list: TaskWithSubtasks[]) => {
      for (const task of list) {
        const keys = new Set<string>();
        if (task.startDate !== null) keys.add(dayKey(task.startDate));
        if (task.deadline !== null) keys.add(dayKey(task.deadline));
        // 重复任务：补全可见区间内所有出现日
        if (task.repeatRule && task.deadline) {
          for (const occ of generateRepeatOccurrences(task, rangeStart, rangeEnd)) {
            keys.add(dayKey(occ));
          }
        }
        for (const key of keys) addTask(task, key);
        if ((task.subtasks ?? []).length > 0) walkActive(task.subtasks);
      }
    };
    walkActive(tasks);

    // 已完成实例（含已完成子任务，需求3）—— 按 deadline 命中日计入
    const walkDone = (list: TaskWithSubtasks[]) => {
      for (const t of list) {
        if (t.deleted) continue;
        const key = t.deadline !== null ? dayKey(t.deadline) : null;
        if (key) addTask(toDetail(t), key);
        if ((t.subtasks ?? []).length > 0) walkDone(t.subtasks);
      }
    };
    walkDone((completedTasks ?? []) as TaskWithSubtasks[]);

    // 排序：未完成在前 / priority 重要优先 / 截止早者在前 / 标题字典序
    for (const list of map.values()) {
      list.sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        const ai = a.priority === 'important' ? 0 : 1;
        const bi = b.priority === 'important' ? 0 : 1;
        if (ai !== bi) return ai - bi;
        const ad = a.deadline ?? Number.POSITIVE_INFINITY;
        const bd = b.deadline ?? Number.POSITIVE_INFINITY;
        if (ad !== bd) return ad - bd;
        return a.title.localeCompare(b.title);
      });
    }
    return map;
  }, [tasks, completedTasks, viewYear, viewMonth]);

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

  /** 6 周 × 7 列：按行切分，便于在选中行下方行内插入详情面板 */
  const weekRows = useMemo(() => {
    const rows: typeof cells[] = [];
    for (let i = 0; i < GRID_CELLS; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [cells]);

  /** 详情面板 DOM 引用：展开后把自身滚进可视区（滚动 main 容器而非窗口） */
  const panelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (selectedTs === null) return;
    // 等面板插入 DOM 后再滚动；nearest 保证最小滚动量
    const id = requestAnimationFrame(() => {
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    return () => cancelAnimationFrame(id);
  }, [selectedTs]);

  const titleById = useMemo(() => {
    const m = new Map<string, string>();
    const walk = (list: TaskWithSubtasks[]) => {
      for (const t of list) {
        m.set(t.id, t.title);
        for (const s of t.subtasks ?? []) walk([s]);
      }
    };
    walk(tasks);
    walk((completedTasks ?? []) as TaskWithSubtasks[]);
    return m;
  }, [tasks, completedTasks]);

  const todayKey = dayKey(Date.now());
  const selectedKey = selectedTs !== null ? dayKey(selectedTs) : null;

  /** 选中日的任务列表（供详情面板用）：未完成在前（截止早者先），已完成在后（按完成时间新→旧）。
   * 活动任务与已完成实例均已在 tasksByDay 中按日归集，此处直接取用并按完成态分组排序。 */
  const selectedDayTasks = useMemo<TaskWithSubtasks[]>(() => {
    if (selectedTs === null) return [];
    const key = dayKey(selectedTs);
    const all = tasksByDay.get(key) ?? [];
    const active = all.filter((t) => !t.completed);
    const done = all.filter((t) => t.completed).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
    return [...active, ...done];
  }, [selectedTs, tasksByDay]);

  /** 平移查看月：用 Date 的月份溢出自动处理跨年（如 12月-1 → 去年11月）；翻月后收起选中面板 */
  const shiftMonth = (delta: number) => {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setSelectedTs(null);
  };

  /** "今天"按钮：回到当前月（今天自动高亮）；收起选中面板 */
  const goToday = () => {
    const d = new Date();
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setSelectedTs(null);
  };

  /** 点击日期格：同一格再次点击 → 取消选择 */
  const handleClickCell = (ts: number) => {
    if (selectedTs !== null && dayKey(selectedTs) === dayKey(ts)) {
      setSelectedTs(null);
    } else {
      setSelectedTs(ts);
    }
  };

  /** 选区变更时滚动到面板（只滚动容器，不滚动主窗口） */
  const handleAddTask = () => {
    if (selectedTs !== null && onAddTask) {
      onAddTask(selectedTs);
    }
  };

  /** 详情面板里勾选完成/撤销完成：委托给 App 层 toggleCompleted（完成后 tasks 刷新自动重渲染） */
  const handleToggleFromDetail = (id: string) => {
    onToggleTask?.(id);
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: GRID_GAP, marginBottom: 6 }}>
        {WEEKDAY_LABELS.map((label) => (
          <span
            key={label}
            style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted-foreground)', userSelect: 'none' }}
          >
            {label}
          </span>
        ))}
      </div>

      {/* 月历网格：逐行渲染 6 周；某行内日期被选中时，在「该行与下一行之间」插入详情面板 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: GRID_GAP }}>
        {weekRows.map((row, rowIdx) => {
          const rowHasSelected = selectedKey !== null && row.some((c) => dayKey(c.ts) === selectedKey);
          return (
            <div key={rowIdx} style={{ display: 'flex', flexDirection: 'column', gap: GRID_GAP }}>
              {/* 本行 7 个日期格 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: GRID_GAP }}>
                {row.map((cell) => {
                  const key = dayKey(cell.ts);
                  return (
                    <DayCell
                      key={cell.ts}
                      ts={cell.ts}
                      inMonth={cell.inMonth}
                      isToday={key === todayKey}
                      dayTasks={tasksByDay.get(key) ?? []}
                      isSelected={selectedKey !== null && key === selectedKey}
                      onClickCell={handleClickCell}
                    />
                  );
                })}
              </div>

              {/* 行内详情面板：紧跟选中所在周，把下一行向下推开 */}
              {rowHasSelected && selectedTs !== null && (
                <div
                  ref={panelRef}
                  style={{
                    padding: '10px 10px 12px',
                    background: 'color-mix(in srgb, var(--card) 75%, transparent)',
                    borderRadius: 12,
                    border: '0.5px solid color-mix(in srgb, var(--border) 60%, transparent)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  {/* 选中态日期标题 */}
                  <div
                    style={{
                      padding: '2px 12px 0',
                      fontSize: 12.5,
                      color: 'var(--muted-foreground)',
                      fontWeight: 500,
                      userSelect: 'none',
                    }}
                  >
                    {new Date(selectedTs).toLocaleDateString('zh-CN', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      weekday: 'long',
                    })}
                  </div>

                  {selectedDayTasks.length === 0 ? (
                    <div
                      style={{
                        padding: '18px 0',
                        textAlign: 'center',
                        fontSize: 13,
                        color: 'var(--muted-foreground)',
                      }}
                    >
                      当天没有任务
                    </div>
                  ) : (
                    selectedDayTasks.map((t) => (
                      <DetailRow
                        key={t.id}
                        task={t}
                        onToggle={handleToggleFromDetail}
                        onContextMenu={onContextMenuTask ? (e) => onContextMenuTask(e, t.id) : undefined}
                        parentTitle={t.parentId ? titleById.get(t.parentId) : undefined}
                      />
                    ))
                  )}

                  {/* 添加事项按钮：月视图选中态下唯一的新建入口；点了直接打开 QuickCapture 并预填日期 */}
                  <button
                    type="button"
                    disabled={!onAddTask}
                    onClick={handleAddTask}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      padding: '10px 0',
                      borderRadius: 10,
                      border: 'none',
                      background: 'transparent',
                      color: onAddTask ? 'var(--foreground)' : 'var(--muted-foreground)',
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: onAddTask ? 'pointer' : 'not-allowed',
                      fontFamily: 'var(--font-sans)',
                      transition: 'background-color 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (onAddTask) e.currentTarget.style.background = 'var(--accent)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <Plus style={{ width: 16, height: 16 }} />
                    添加事项
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
