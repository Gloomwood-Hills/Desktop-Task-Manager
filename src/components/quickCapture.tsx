import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  Folder as FolderIcon, ChevronDown, Check, Star,
  Plus, CalendarDays, X, Sparkles,
} from 'lucide-react';
import { FolderNode, Priority, TaskRepeatRule } from '../data/types';
import { GeneratedSubtask, SubtaskPlanMode } from '../services/aiClient';
import { parseNaturalDateTime, formatDeadline, applyDefaultDeadlineTime, formatCompletedAt } from './utils/formatDate';
import { ReminderOffsetKey, REMINDER_OFFSET_OPTIONS, sanitizeOffsets } from '../data/reminderOffsets';
import { containerTransform } from './utils/motion';
import { glassSurface, glassBlur } from './utils/glass';
import { isMobile } from '../data/platform';

interface QuickCaptureProps {
  folders: FolderNode[];
  onClose: () => void;
  onCreate: (
    title: string,
    folderId: string | null,
    options: { priority?: Priority; deadline?: number | null; remark?: string; reminderOffsets?: string[]; reminderTimes?: number[]; repeatRule?: TaskRepeatRule | null; repeatIntervalDays?: number | null; subtasks?: GeneratedSubtask[] }
  ) => void;
  /** 预填的默认截止日期（归一化为当天 00:00）；不传时保持原有行为 */
  initialDate?: number;
  /** 预选的默认文件夹（如右键文件夹 → 新建任务）；null/不传时默认未分类 */
  initialFolderId?: string | null;
  /** 截止时间仅填日期时默认补上的时/分（设置 → 默认截止时刻） */
  defaultDeadlineHour?: number;
  defaultDeadlineMinute?: number;
  /** 已配置 AI（设置 → AI）：启用「一键生成子任务」按钮 */
  aiEnabled?: boolean;
  /** 一键生成子任务回调（App 注入，读取 AI 配置调用 aiClient）；opts 携带个数/补充要求 */
  onGenerateSubtasks?: (title: string, deadline: number | null, opts?: { count?: number | null; hint?: string; mode?: SubtaskPlanMode; existingSubtasks?: GeneratedSubtask[]; signal?: AbortSignal }) => Promise<GeneratedSubtask[]>;
  /** AI 预填：任务标题（AI 已解析好，直接填入） */
  initialTitle?: string;
  /** AI 预填：截止时间戳 */
  initialDeadline?: number | null;
  /** AI 预填：重要程度 */
  initialPriority?: Priority;
  /** AI 预填：备注 */
  initialRemark?: string;
  /** AI 预填：重复规则 */
  initialRepeatRule?: TaskRepeatRule | null;
  /** AI 预填：自定义重复间隔天数 */
  initialRepeatIntervalDays?: number | null;
  /** AI 预填：提前提醒偏移 */
  initialReminderOffsets?: string[];
  /** AI 预填：子任务（含截止与备注） */
  initialSubtasks?: GeneratedSubtask[];
}

/** 截止时间快捷项：一小时后为具体时刻，其余为日期（选择时按默认截止时刻补全） */
const DATE_QUICK_DEADLINE = ['一小时后', '明天', '后天', '下周一', '月底'];

/** 时:分 → time 输入值 */
function toTimeValue(h: number, m: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}`;
}

/** 提醒自定义时刻 · 月份日历网格（选择某一天），日期决定日，时刻由外层 hour/minute 决定 */
export function ReminderCalendar({
  selectedAt,
  hour,
  minute,
  onHourChange,
  onMinuteChange,
  onPickDay,
}: {
  selectedAt: number | null;
  hour: number;
  minute: number;
  onHourChange: (h: number) => void;
  onMinuteChange: (m: number) => void;
  onPickDay: (dayTs: number) => void;
}) {
  const base = selectedAt ?? Date.now();
  const [view, setView] = useState(() => {
    const d = new Date(base);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const dows = ['日', '一', '二', '三', '四', '五', '六'];
  const startDow = new Date(view.y, view.m, 1).getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: startDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const selDay = selectedAt ? new Date(selectedAt).getDate() : null;
  const selMonth = selectedAt ? new Date(selectedAt).getMonth() : null;
  const selYear = selectedAt ? new Date(selectedAt).getFullYear() : null;
  const monthLabel = `${view.y}年${view.m + 1}月`;

  return (
    <div className="reminder-cal">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span className="cal-label">{monthLabel}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            type="button"
            onClick={() => setView((v) => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }))}
            style={calNavStyle}
            aria-label="上个月"
          >‹</button>
          <button
            type="button"
            onClick={() => setView((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }))}
            style={calNavStyle}
            aria-label="下个月"
          >›</button>
        </div>
      </div>
      <div className="cal-days">
        {dows.map((d) => <div key={d} className="cal-dow">{d}</div>)}
        {cells.map((day, idx) => {
          if (day == null) return <div key={`e-${idx}`} className="cal-day empty" />;
          const isSel = selDay === day && selMonth === view.m && selYear === view.y;
          return (
            <div
              key={day}
              className={`cal-day ${isSel ? 'sel' : ''}`}
              onClick={() => onPickDay(new Date(view.y, view.m, day).getTime())}
            >
              {day}
            </div>
          );
        })}
      </div>
      <div className="cal-time-row">
        <input
          type="time"
          value={toTimeValue(hour, minute)}
          onChange={(e) => {
            const [h, m] = e.target.value.split(':').map((n) => Number(n));
            if (!Number.isNaN(h)) onHourChange(h);
            if (!Number.isNaN(m)) onMinuteChange(m);
          }}
          aria-label="自定义提醒时刻"
        />
      </div>
    </div>
  );
}

const calNavStyle: React.CSSProperties = {
  width: 20, height: 20, border: 'none', background: 'transparent', color: 'var(--muted-foreground)',
  cursor: 'pointer', borderRadius: 6, fontSize: 14, lineHeight: 1, padding: 0,
};

/** 由标题片段提取纯任务名：去除日期/时间段/时辰等自然语言修饰，仅保留命名主体（如"九月九日登山"→"登山"） */
function cleanPlusTitle(s: string): string {
  let t = s;
  // 具体日期：x月x日/x月x号（中文数字或阿拉伯数字）
  t = t.replace(/[0-9一二两三四五六七八九十]{1,2}\s*月\s*[0-9一二两三四五六七八九十]{1,2}\s*(?:日|号|天)?/g, '');
  t = t.replace(/\d{4}\s*年/g, '');
  // 相对日期
  t = t.replace(/今天|今日|明天|明日|后天|大后天|月底/g, '');
  t = t.replace(/(?:下个?周|周|星期|礼拜)\s*[一二三四五六日天]/g, '');
  // 时间段 / 时辰
  t = t.replace(/早晨|清晨|早上|上午|下午|晚上|傍晚|凌晨|中午|晚间|夜晚/g, '');
  t = t.replace(/[点时:：]/g, '');
  t = t.replace(/的/g, '');
  return t.trim();
}

/** 解析"任务+属性"串联输入（+ 分隔）：提取重复规则、提前提醒偏移，并净化出任务标题。
 * 无 "+" 时返回 null（保持原有输入即标题的行为）。 */
function parsePlusProperties(text: string): {
  cleanTitle: string; repeatRule: TaskRepeatRule | null; repeatIntervalDays: number | null; reminderOffsets: string[];
} | null {
  if (!text.includes('+')) return null;
  const segs = text.split('+').map((s) => s.trim()).filter(Boolean);
  if (segs.length === 0) return null;
  let repeatRule: TaskRepeatRule | null = null;
  let repeatIntervalDays: number | null = null;
  let reminderOffsets: string[] = [];
  const kept: string[] = [];
  for (const seg of segs) {
    // 重复规则
    if (/每天|每日|天天/.test(seg)) { repeatRule = 'daily'; continue; }
    if (/每周|每星期|每礼拜/.test(seg)) { repeatRule = 'weekly'; continue; }
    if (/每月|每个月/.test(seg)) { repeatRule = 'monthly'; continue; }
    if (/每年|每一年/.test(seg)) { repeatRule = 'yearly'; continue; }
    const cm = seg.match(/每(?:隔)?\s*(\d+)\s*天/);
    if (cm) { repeatRule = 'custom'; repeatIntervalDays = Math.max(1, parseInt(cm[1], 10)); continue; }
    // 提前提醒偏移
    if (/提前|提醒|当天/.test(seg) && /(?:天|小时|当天)/.test(seg)) {
      const o: string[] = [];
      if (/提前\s*1\s*天|提前一天|提前1日|当天提醒/.test(seg)) o.push('1d');
      if (/提前\s*3\s*天|提前三天|提前3日/.test(seg)) o.push('3d');
      if (/提前\s*6\s*小时|提前6小时/.test(seg)) o.push('6h');
      if (/提前\s*1\s*小时|提前一小时/.test(seg)) o.push('1h');
      if (o.length > 0) { reminderOffsets = o; continue; }
    }
    kept.push(seg);
  }
  const cleanTitle = cleanPlusTitle(kept.join(' '));
  return { cleanTitle: cleanTitle || text.trim(), repeatRule, repeatIntervalDays, reminderOffsets };
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 新建任务 · 双目标日历：左键=截止（深蓝）/ 右键=提醒（浅蓝，支持多选）。
 * 移动端无右键，因此提供「截止 / 提醒」模式切换：点击模式决定单击作用。桌面端右键仍可直接设提醒。 */
function DualCalendar({
  deadline,
  reminderTimes,
  onPickDeadline,
  onPickReminder,
}: {
  deadline: number | null;
  reminderTimes: number[];
  onPickDeadline: (dayTs: number) => void;
  onPickReminder: (dayTs: number) => void;
}) {
  const base = deadline ?? reminderTimes[0] ?? Date.now();
  const [view, setView] = useState(() => {
    const d = new Date(base);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  // 选择模式：'deadline' 单击=截止；'reminder' 单击=提醒（移动端无右键，必须显式切换）
  const [pickMode, setPickMode] = useState<'deadline' | 'reminder'>('deadline');
  const dows = ['日', '一', '二', '三', '四', '五', '六'];
  const startDow = new Date(view.y, view.m, 1).getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: startDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const monthLabel = `${view.y}年${view.m + 1}月`;

  return (
    <div className="reminder-cal">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
        <span className="cal-label">{monthLabel}</span>
        {/* 截止/提醒 模式切换（移动端核心交互：单击即设置对应目标） */}
        <div style={{ display: 'flex', gap: 2, padding: 2, background: 'var(--background-100)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <button
            type="button"
            onClick={() => setPickMode('deadline')}
            style={{
              border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700,
              padding: '4px 10px', borderRadius: 6, fontFamily: 'var(--font-sans)',
              background: pickMode === 'deadline' ? 'var(--brand-700)' : 'transparent',
              color: pickMode === 'deadline' ? '#fff' : 'var(--foreground)',
            }}
          >截止</button>
          <button
            type="button"
            onClick={() => setPickMode('reminder')}
            style={{
              border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700,
              padding: '4px 10px', borderRadius: 6, fontFamily: 'var(--font-sans)',
              background: pickMode === 'reminder' ? 'var(--brand-400)' : 'transparent',
              color: pickMode === 'reminder' ? '#fff' : 'var(--foreground)',
            }}
          >提醒</button>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            type="button"
            onClick={() => setView((v) => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }))}
            style={calNavStyle}
            aria-label="上个月"
          >‹</button>
          <button
            type="button"
            onClick={() => setView((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }))}
            style={calNavStyle}
            aria-label="下个月"
          >›</button>
        </div>
      </div>
      <div className="cal-days">
        {dows.map((d) => <div key={d} className="cal-dow">{d}</div>)}
        {cells.map((dayNum, idx) => {
          if (dayNum == null) return <div key={`e-${idx}`} className="cal-day empty" />;
          const ts = new Date(view.y, view.m, dayNum).getTime();
          const isDl = deadline != null && startOfDay(deadline) === startOfDay(ts);
          const isRm = reminderTimes.some((rt) => startOfDay(rt) === startOfDay(ts));
          return (
            <div
              key={dayNum}
              className={`cal-day ${isDl ? 'dl' : ''} ${isRm ? 'rm' : ''}`}
              onClick={() => (pickMode === 'deadline' ? onPickDeadline(ts) : onPickReminder(ts))}
              onContextMenu={(e) => { e.preventDefault(); onPickReminder(ts); }}
              title={isDl && isRm ? '截止+提醒(再点取消)' : isDl ? '截止(再点取消)' : isRm ? '提醒(再点取消)' : pickMode === 'deadline' ? '单击=截止' : '单击=提醒'}
            >
              {dayNum}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 新建任务弹窗（Quick Capture，对齐设计稿 side-0 quick-capture / modeTime 三列布局） */
export default function QuickCapture({ folders, onClose, onCreate, initialDate, initialFolderId = null, defaultDeadlineHour = 18, defaultDeadlineMinute = 0, aiEnabled = false, onGenerateSubtasks, initialTitle, initialDeadline, initialPriority, initialRemark, initialRepeatRule, initialRepeatIntervalDays, initialReminderOffsets, initialSubtasks }: QuickCaptureProps) {
  const [title, setTitle] = useState(initialTitle ?? '');
  const [remark, setRemark] = useState(initialRemark ?? '');
  const [folderId, setFolderId] = useState<string | null>(initialFolderId);
  const [folderOpen, setFolderOpen] = useState(false);
  /** 手动选择的截止时间；null 时回退到标题自然语言解析。提供 initialDate 时预填（归一化为当天 00:00） */
  const [manualDeadline, setManualDeadline] = useState<number | null>(() =>
    initialDate !== undefined ? new Date(initialDate).setHours(0, 0, 0, 0) : (initialDeadline ?? null)
  );
  /** 提前提醒偏移多选（'1d'/'3d'/'6h'），依赖截止时间 */
  const [reminderOffsets, setReminderOffsets] = useState<string[]>(initialReminderOffsets ?? []);
  /** 多选提醒时刻（绝对毫秒时间戳）：日历右键可设置任意多个，每个时刻对应一个独立气泡分别设置 */
  const [reminderTimes, setReminderTimes] = useState<number[]>([]);
  /** 时刻气泡：左键设置截止后浮现，供填写具体截止时刻 */
  const [deadlineEditOpen, setDeadlineEditOpen] = useState(false);
  const [repeatRule, setRepeatRule] = useState<TaskRepeatRule | null>(initialRepeatRule ?? null);
  const [repeatIntervalDays, setRepeatIntervalDays] = useState<number | null>(initialRepeatIntervalDays ?? null);
  const [important, setImportant] = useState(initialPriority === 'important');
  /** AI 生成的子任务草稿（预览可编辑；接受后在创建时随父任务插入） */
  const [subtasks, setSubtasks] = useState<GeneratedSubtask[]>(initialSubtasks ?? []);
  const [subtaskLoading, setSubtaskLoading] = useState(false);
  const [subtaskError, setSubtaskError] = useState<string | null>(null);
  /** AI 建议暂存区：用户确认后才合并到正式子任务列表，避免覆盖手动编辑。 */
  const [subtaskSuggestion, setSubtaskSuggestion] = useState<GeneratedSubtask[] | null>(null);
  const [subtaskMode, setSubtaskMode] = useState<SubtaskPlanMode>(initialSubtasks?.length ? 'optimize' : 'initial');
  const subtaskAbortRef = useRef<AbortController | null>(null);
  /** AI 生成参数：子任务个数 + 补充要求 */
  const [subtaskCount, setSubtaskCount] = useState<number | null>(null);
  const [subtaskHint, setSubtaskHint] = useState('');
  // 扁平化文件夹用于选择器（含"未分类"顶层项）
  const flatFolders: { id: string | null; name: string; depth: number }[] = [
    { id: null, name: '未分类', depth: 0 },
  ];
  const flatten = (nodes: FolderNode[], depth: number) => {
    nodes.forEach((n) => {
      flatFolders.push({ id: n.id, name: n.name, depth });
      flatten(n.children, depth + 1);
    });
  };
  flatten(folders, 0);

  const selectedFolder = flatFolders.find((f) => f.id === folderId);

  // 自然语言日期解析（实时，标题变化即更新），仅日期时按默认截止时刻补全
  const parsedDeadline = useMemo(
    () => applyDefaultDeadlineTime(parseNaturalDateTime(title), defaultDeadlineHour, defaultDeadlineMinute),
    [title, defaultDeadlineHour, defaultDeadlineMinute]
  );
  // 手动选择优先，其次标题解析；手动选择日期快捷项时同样补默认时刻
  const effectiveDeadline = manualDeadline !== null
    ? applyDefaultDeadlineTime(manualDeadline, defaultDeadlineHour, defaultDeadlineMinute)
    : parsedDeadline;
  const hasDeadline = effectiveDeadline !== null;
  /** 子任务时间强约束区间：[新建时间, 父任务截止]（无截止时上界为 null） */
  const subtaskMinTs = Date.now();
  const subtaskMaxTs = effectiveDeadline;
  /** 子任务时间是否越界：下界=现在，上界=父任务截止（若设置了） */
  const isSubtaskTimeOutOfRange = (ts: number): boolean => {
    if (ts < subtaskMinTs) return true;
    if (subtaskMaxTs != null && ts > subtaskMaxTs) return true;
    return false;
  };

  // "+"串联属性解析（如 "九月九日登山+每月重复+提前3天提醒"）：自动填充重复/提醒，并净化任务标题
  const plusProps = useMemo(() => parsePlusProperties(title), [title]);
  useEffect(() => {
    if (!plusProps) return;
    if (plusProps.repeatRule) {
      setRepeatRule(plusProps.repeatRule);
      setRepeatIntervalDays(plusProps.repeatIntervalDays);
    }
    if (plusProps.reminderOffsets.length > 0) {
      setReminderOffsets(plusProps.reminderOffsets);
      setReminderTimes([]);
    }
  }, [plusProps]);

  const offsetList = useMemo(() => sanitizeOffsets(hasDeadline ? reminderOffsets : []), [reminderOffsets, hasDeadline]);

  /** 选中偏移：若已有则取消，否则追加；选偏移时清空多选绝对提醒（互斥） */
  const toggleOffset = (key: ReminderOffsetKey) => {
    setReminderOffsets((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
    setReminderTimes([]);
  };

  /** 日历左键：设置截止时间（该天默认时刻）并浮现时刻气泡；再次点击同一截止日则取消设置 */
  const handlePickDeadlineDay = (dayTs: number) => {
    // 已选中的截止日 → 取消截止设置
    if (effectiveDeadline != null && startOfDay(effectiveDeadline) === startOfDay(dayTs)) {
      setManualDeadline(null);
      setDeadlineEditOpen(false);
      if (reminderTimes.length === 0) setReminderOffsets([]);
      return;
    }
    const d = new Date(dayTs);
    d.setHours(defaultDeadlineHour, defaultDeadlineMinute, 0, 0);
    setManualDeadline(d.getTime());
    setDeadlineEditOpen(true);
  };

  /** 日历右键：把一个提醒时刻加入多选（该天默认时刻），每个提醒对应一个独立气泡；再次点击同一天则移除该天提醒 */
  const handlePickReminderDay = (dayTs: number) => {
    const d = new Date(dayTs);
    d.setHours(defaultDeadlineHour, defaultDeadlineMinute, 0, 0);
    const ts = d.getTime();
    // 该天已有提醒 → 取消该天所有提醒时刻
    const hitIdx = reminderTimes
      .map((rt, i) => (startOfDay(rt) === startOfDay(dayTs) ? i : -1))
      .filter((i) => i >= 0);
    if (hitIdx.length) {
      setReminderTimes((prev) => prev.filter((_, i) => !hitIdx.includes(i)));
      return;
    }
    setReminderTimes((prev) => [...prev, ts]);
  };

  /** 截止时刻气泡变更（仅改时分，日期保留） */
  const handleDeadlineTimeChange = (v: string) => {
    const [h, m] = v.split(':').map((n) => Number(n));
    if (manualDeadline == null || Number.isNaN(h) || Number.isNaN(m)) return;
    const d = new Date(manualDeadline);
    d.setHours(h, m, 0, 0);
    setManualDeadline(d.getTime());
  };

  /** 指定提醒时刻的时分变更（仅改时分，日期保留），其余带选择提醒不动 */
  const handleReminderTimeChange = (idx: number, v: string) => {
    const [h, m] = v.split(':').map((n) => Number(n));
    if (Number.isNaN(h) || Number.isNaN(m)) return;
    setReminderTimes((prev) => prev.map((rt, i) => {
      if (i !== idx) return rt;
      const d = new Date(rt);
      d.setHours(h, m, 0, 0);
      return d.getTime();
    }));
  };

  /** 删除一个提醒时刻（独立气泡内 X） */
  const removeReminderAt = (idx: number) => {
    setReminderTimes((prev) => prev.filter((_, i) => i !== idx));
  };

  /** 由时间戳提取 HH:mm（用于时刻气泡） */
  const timeOf = (ts: number | null): string => {
    if (ts == null) return '';
    const d = new Date(ts);
    return toTimeValue(d.getHours(), d.getMinutes());
  };

  /** 净化后的纯任务标题（"+"串联输入时去除日期/重复/提醒修饰） */
  const resolvedTitle = useMemo(
    () => (plusProps ? (plusProps.cleanTitle || title.trim()) : title.trim()),
    [plusProps, title],
  );

  /** AI 规划：结果先放入建议区，用户确认后才新增/替换，支持依据现有子任务迭代。 */
  const handleGenerateSubtasks = async () => {
    if (!onGenerateSubtasks || !title.trim()) return;
    subtaskAbortRef.current?.abort();
    const controller = new AbortController();
    subtaskAbortRef.current = controller;
    setSubtaskLoading(true);
    setSubtaskError(null);
    setSubtaskSuggestion(null);
    try {
      const subs = await onGenerateSubtasks(resolvedTitle, effectiveDeadline, {
        count: subtaskCount,
        hint: subtaskHint,
        mode: subtaskMode,
        existingSubtasks: subtasks,
        signal: controller.signal,
      });
      setSubtaskSuggestion(subs);
      if (subs.length === 0) {
        setSubtaskError('未能生成子任务，请重试或检查任务截止时间');
      }
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') setSubtaskError(error instanceof Error ? error.message : String(error));
    } finally {
      setSubtaskLoading(false);
      if (subtaskAbortRef.current === controller) subtaskAbortRef.current = null;
    }
  };

  const acceptSubtaskSuggestion = () => {
    if (!subtaskSuggestion?.length) return;
    setSubtasks((prev) => subtaskMode === 'extend' ? [...prev, ...subtaskSuggestion] : [...subtaskSuggestion]);
    setSubtaskSuggestion(null);
    setSubtaskError(null);
  };

  const cancelSubtaskGeneration = () => {
    subtaskAbortRef.current?.abort();
    setSubtaskLoading(false);
  };

  /** datetime-local → 时间戳 / null */
  const localToTs = (v: string): number | null => (v ? new Date(v).getTime() : null);
  /** 时间戳 → datetime-local 值 */
  const tsToLocal = (ts: number | null): string => {
    if (ts == null) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const handleCreate = () => {
    if (!title.trim()) return;
    // 强约束：子任务时间必须在 [新建时间, 父任务截止] 之间
    for (const s of subtasks) {
      if (s.deadline != null && isSubtaskTimeOutOfRange(s.deadline)) {
        setSubtaskError(
          subtaskMaxTs != null
            ? '存在子任务时间超出范围，请调整为「现在 ~ 截止时间」之间'
            : '存在子任务时间早于当前时间，请调整'
        );
        return;
      }
    }
    // 互斥：设了多选提醒时刻则不携带偏移（单任务只需一种提醒配置）；无截止时间不保留偏移
    const customTimes = reminderTimes.length > 0;
    onCreate(resolvedTitle, folderId, {
      priority: important ? 'important' : 'normal',
      deadline: effectiveDeadline,
      remark: remark.trim(),
      reminderOffsets: customTimes ? [] : (hasDeadline ? offsetList : []),
      reminderTimes: customTimes ? reminderTimes : [],
      repeatRule: effectiveDeadline ? repeatRule : null,
      repeatIntervalDays: effectiveDeadline && repeatRule === 'custom' ? repeatIntervalDays : null,
      subtasks: subtasks.length > 0 ? subtasks : undefined,
    });
  };

  const reminderCount = offsetList.length + reminderTimes.length;

  const chipActive = (active: boolean) => ({
    className: active ? 'chip active' : 'chip',
  });

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 100,
      display: 'flex',
      alignItems: isMobile ? 'flex-end' : 'flex-start',
      justifyContent: 'center',
      paddingTop: isMobile ? 0 : 40,
    }}>
      {/* Scrim */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.25)', ...glassBlur(8) }} onClick={onClose} />

      {/* Popup */}
      <motion.div
        className={isMobile ? 'mobile-form-sheet' : undefined}
        variants={containerTransform}
        initial="initial"
        animate="animate"
        exit="exit"
        style={{
          position: 'relative',
          width: isMobile ? '100%' : 620,
        maxWidth: isMobile ? '100%' : 'calc(100% - 32px)',
        borderRadius: isMobile ? '22px 22px 0 0' : 'calc(var(--radius)*1.2)',
        ...glassSurface('var(--background)', 82, 40),
        boxShadow: 'var(--shadow-xl), 0 0 0 0.5px rgba(0,0,0,0.06)',
        // 移动端保留顶部空白作为可点击遮罩，表单内容在面板内部滚动，避免覆盖整个屏幕后无法退出。
        maxHeight: isMobile ? 'calc(100vh - 56px)' : 'calc(100vh - 80px)',
        overflowY: 'auto',
        color: 'var(--foreground)',
      }}>
        <div className="qc-scope">
          <div className="qc-body">
            {/* 首屏输入：标题回车可直接创建，减少首次使用的认知负担 */}
            <div className="task-input">
              <Plus />
              <input
                type="text"
                name="task-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                placeholder="输入任务，自动解析日期..."
                autoFocus
              />
            </div>
            <div className="qc-advanced">
            {/* 顶部选项行：文件夹 / 重要（提醒设置位于下方时间卡片，分类旁不再放提醒气泡） */}
            <div className="opt-row">
              <div
                onClick={() => { setFolderOpen(!folderOpen); }}
                {...chipActive(!!selectedFolder?.name || folderOpen)}
              >
                <FolderIcon />
                <span style={{ fontWeight: 600 }}>{selectedFolder?.name ?? '未分类'}</span>
                <ChevronDown />
              </div>
              <div
                onClick={() => setImportant(!important)}
                className="chip"
                style={{
                  marginLeft: 'auto',
                  background: important ? 'color-mix(in srgb, var(--chart-3) 8%, transparent)' : 'transparent',
                  border: `1px solid ${important ? 'color-mix(in srgb, var(--chart-3) 25%, transparent)' : 'var(--border)'}`,
                  color: important ? 'var(--chart-3)' : 'var(--muted-foreground)',
                }}
              >
                <Star style={{ fill: important ? 'var(--chart-3)' : 'none' }} />
                <span style={{ fontWeight: 600 }}>重要</span>
                {important && <Check style={{ width: 12, height: 12 }} />}
              </div>
            </div>

            {/* 展开面板：文件夹选择 */}
            {folderOpen && (
              <motion.div variants={containerTransform} initial="initial" animate="animate" exit="exit" style={{ paddingTop: 10 }}>
                <div style={{
                  borderRadius: 14, ...glassSurface('var(--background)', 78, 40),
                  boxShadow: 'var(--shadow-lg), 0 0 0 0.5px rgba(0,0,0,0.06)',
                  padding: 6, display: 'inline-flex', flexDirection: 'column',
                }}>
                  {flatFolders.map((f) => (
                    <div
                      key={f.id ?? 'unclassified'}
                      onClick={() => { setFolderId(f.id); setFolderOpen(false); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 10,
                        cursor: 'pointer', fontSize: 12.5, paddingLeft: 12 + f.depth * 14,
                        color: f.id === folderId ? 'var(--primary)' : 'var(--muted-foreground)',
                        background: f.id === folderId ? 'var(--brand-50)' : 'transparent',
                      }}
                    >
                      <FolderIcon style={{ width: 14, height: 14, flexShrink: 0 }} />
                      <span style={{ fontWeight: f.id === folderId ? 600 : 500 }}>{f.name}</span>
                      {f.id === folderId && <Check style={{ width: 14, height: 14, marginLeft: 'auto', flexShrink: 0 }} />}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* 子任务区（置顶于时间区域上方）：一键生成仅在配置 AI 后浮现；手动添加始终可用 */}
            <div className="qc-subtask-section" style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* AI 规划行：仅配置 AI 后浮现；默认仅生成建议，不覆盖用户已编辑内容 */}
              {aiEnabled && onGenerateSubtasks && (
                <div className="qc-subtask-ai" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="qc-subtask-mode-row" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {([
                      ['initial', '首次拆分'],
                      ['extend', '补充后续'],
                      ['optimize', '优化计划'],
                    ] as [SubtaskPlanMode, string][]).map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => { setSubtaskMode(mode); setSubtaskSuggestion(null); }}
                        aria-pressed={subtaskMode === mode}
                        style={{ height: 28, padding: '0 9px', borderRadius: 999, border: '1px solid var(--border)', background: subtaskMode === mode ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'transparent', color: subtaskMode === mode ? 'var(--primary)' : 'var(--muted-foreground)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
                      >{label}</button>
                    ))}
                  </div>
                  <div className="qc-subtask-actions" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    disabled={!title.trim() || subtaskLoading}
                    onClick={handleGenerateSubtasks}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      height: 34, padding: '0 14px', borderRadius: 999, cursor: 'pointer',
                      border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)',
                      background: 'transparent', color: 'var(--primary)',
                      fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--font-sans)',
                      opacity: !title.trim() || subtaskLoading ? 0.5 : 1,
                    }}
                  >
                    <Sparkles style={{ width: 13, height: 13 }} />
                    {subtaskLoading ? '正在生成…' : subtaskMode === 'extend' ? '生成后续步骤' : subtaskMode === 'optimize' ? '生成优化建议' : '生成拆分建议'}
                  </button>
                  {subtaskLoading && <button type="button" onClick={cancelSubtaskGeneration} style={{ height: 30, padding: '0 8px', border: 0, background: 'transparent', color: 'var(--muted-foreground)', cursor: 'pointer', fontSize: 11.5 }}>取消</button>}
                  <input
                    type="number" min={1}
                    value={subtaskCount ?? ''}
                    onChange={(e) => setSubtaskCount(e.target.value ? Number(e.target.value) : null)}
                    placeholder="个数"
                    title="期望生成的子任务个数（留空由 AI 决定）"
                    aria-label="子任务个数"
                    style={{
                      width: 56, height: 34, padding: '0 8px', boxSizing: 'border-box',
                      border: '1px solid var(--input)', borderRadius: 8, background: 'var(--background)',
                      color: 'inherit', fontSize: 12, outline: 'none', fontFamily: 'var(--font-sans)',
                    }}
                  />
                  <input
                    type="text"
                    value={subtaskHint}
                    onChange={(e) => setSubtaskHint(e.target.value)}
                    placeholder="补充要求（可选，如：侧重执行顺序）"
                    aria-label="子任务补充要求"
                    style={{
                      flex: 1, minWidth: 120, height: 34, padding: '0 10px', boxSizing: 'border-box',
                      border: '1px solid var(--input)', borderRadius: 8, background: 'var(--background)',
                      color: 'inherit', fontSize: 12, outline: 'none', fontFamily: 'var(--font-sans)',
                    }}
                  />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
                    {subtaskMode === 'extend' && subtasks.length > 0 ? 'AI 只补充当前列表之后的新步骤。' : subtaskMode === 'optimize' && subtasks.length > 0 ? 'AI 会参考现有步骤，结果需确认后才替换。' : '生成结果会先作为建议展示，不会直接覆盖手动编辑。'}
                  </div>
                </div>
              )}
              {subtaskError && (
                <p style={{ fontSize: 11.5, color: 'var(--state-error)', margin: '0 2px' }}>{subtaskError}</p>
              )}
              {subtaskSuggestion && subtaskSuggestion.length > 0 && (
                <div className="qc-subtask-suggestion" style={{ padding: '9px 10px', borderRadius: 10, background: 'color-mix(in srgb, var(--primary) 7%, var(--muted))', border: '1px solid color-mix(in srgb, var(--primary) 22%, transparent)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--primary)' }}>AI 建议（{subtaskSuggestion.length} 项）</span>
                    <div style={{ display: 'flex', gap: 5 }}>
                      <button type="button" onClick={acceptSubtaskSuggestion} style={{ border: 0, borderRadius: 999, padding: '4px 9px', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>采用建议</button>
                      <button type="button" onClick={() => setSubtaskSuggestion(null)} style={{ border: '1px solid var(--border)', borderRadius: 999, padding: '3px 8px', background: 'transparent', color: 'var(--muted-foreground)', cursor: 'pointer', fontSize: 11 }}>忽略</button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {subtaskSuggestion.map((s, i) => <div key={`${s.title}-${i}`} style={{ fontSize: 11.5, color: 'var(--foreground)', lineHeight: 1.4 }}>{i + 1}. {s.title}{s.deadline ? ` · ${formatDeadline(s.deadline)}` : ''}</div>)}
                  </div>
                </div>
              )}
              {/* 手动添加入口：无论是否配置 AI 始终可用 */}
              <button
                type="button"
                onClick={() => { setSubtasks((prev) => [...prev, { title: '', deadline: null, remark: '' }]); setSubtaskError(null); }}
                style={{
                  alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 5,
                  height: 32, padding: '0 12px', borderRadius: 999, cursor: 'pointer',
                  border: '1px solid var(--border)', background: 'transparent',
                  color: 'var(--muted-foreground)', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-sans)',
                }}
              >
                <Plus style={{ width: 13, height: 13 }} />添加子任务（手动）
              </button>
            </div>

            {/* 子任务草稿预览（可编辑、可增删、可清空） */}
            {subtasks.length > 0 && (
              <div className="qc-subtask-preview" style={{
                marginTop: 10, padding: '10px 12px', borderRadius: 12,
                background: 'var(--muted)', border: '1px solid var(--border)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)' }}>子任务（{subtasks.length} 项，随「创建任务」一起插入）</span>
                  <button
                    type="button"
                    onClick={() => { setSubtasks([]); setSubtaskError(null); }}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 3, border: 'none', background: 'transparent',
                      cursor: 'pointer', fontSize: 11.5, fontWeight: 600, color: 'var(--state-error)', fontFamily: 'var(--font-sans)',
                    }}
                  ><X style={{ width: 12, height: 12 }} />清空</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {subtasks.map((s, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input
                          type="text"
                          value={s.title}
                          onChange={(e) => setSubtasks((prev) => prev.map((x, idx) => idx === i ? { ...x, title: e.target.value } : x))}
                          aria-label={`子任务${i + 1}名称`}
                          style={{
                            flex: 1, minWidth: 0, height: 30, padding: '0 8px', boxSizing: 'border-box',
                            border: '1px solid var(--input)', borderRadius: 8, background: 'var(--background)',
                            color: 'inherit', fontSize: 12, outline: 'none', fontFamily: 'var(--font-sans)',
                          }}
                        />
                        <input
                          type="datetime-local"
                          value={tsToLocal(s.deadline)}
                          min={tsToLocal(subtaskMinTs)}
                          max={subtaskMaxTs != null ? tsToLocal(subtaskMaxTs) : undefined}
                          onChange={(e) => setSubtasks((prev) => prev.map((x, idx) => idx === i ? { ...x, deadline: localToTs(e.target.value) } : x))}
                          aria-label={`子任务${i + 1}截止时间`}
                          title="子任务时间须在「现在 ~ 截止时间」之间"
                          style={{
                            height: 30, padding: '0 4px', boxSizing: 'border-box',
                            border: '1px solid var(--input)', borderRadius: 8, background: 'var(--background)',
                            color: 'inherit', fontSize: 11.5, outline: 'none', fontFamily: 'var(--font-sans)',
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setSubtasks((prev) => prev.filter((_, idx) => idx !== i))}
                          aria-label={`删除子任务${i + 1}`}
                          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, border: 'none', background: 'transparent', color: 'var(--icon-muted)', cursor: 'pointer' }}
                        ><X style={{ width: 13, height: 13 }} /></button>
                      </div>
                      {/* 子任务备注：说明要做什么（AI 生成强制 20~50 字；手动可留空） */}
                      <input
                        type="text"
                        value={s.remark ?? ''}
                        onChange={(e) => setSubtasks((prev) => prev.map((x, idx) => idx === i ? { ...x, remark: e.target.value } : x))}
                        aria-label={`子任务${i + 1}备注`}
                        placeholder="备注（20~50 字，说明要做什么）"
                        style={{
                          height: 28, padding: '0 8px', boxSizing: 'border-box',
                          border: '1px dashed var(--input)', borderRadius: 8, background: 'var(--background)',
                          color: 'var(--muted-foreground)', fontSize: 11.5, outline: 'none', fontFamily: 'var(--font-sans)',
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 截止时间 & 提醒：共用以太历（左键=截止 / 右键=提醒），气泡分栏标明 */}
            <div className="field-card qc-deadline-card">
              <div className="card-head">
                <CalendarDays />
                <span className="t">截止时间 & 提醒</span>
                <span className={`badge ${hasDeadline || reminderCount > 0 ? 'ok' : 'warn'}`}>{hasDeadline || reminderCount > 0 ? '已设置' : '未设置'}</span>
              </div>

              {/* 分栏：截止时间（左） | 提醒时间（右） */}
              <div className="dy-cols">
                {/* 截止时间栏 */}
                <div className="dy-col">
                  <div className="dy-head"><span className="dl-dot" />截止时间</div>
                  <div className="mini-chips verse">
                    {DATE_QUICK_DEADLINE.map((label) => {
                      const ts = applyDefaultDeadlineTime(parseNaturalDateTime(label), defaultDeadlineHour, defaultDeadlineMinute);
                      const active = manualDeadline !== null && applyDefaultDeadlineTime(manualDeadline, defaultDeadlineHour, defaultDeadlineMinute) === ts;
                      return (
                        <button
                          key={label}
                          type="button"
                          className={`mini-chip ${active ? 'active' : ''}`}
                          onClick={() => { setManualDeadline(ts); setDeadlineEditOpen(true); }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  {deadlineEditOpen && (
                    <div className="time-bubble" onClick={() => setDeadlineEditOpen(true)}>
                      <span className="dl-dot" />
                      <span className="tb-label">截止时刻</span>
                      <input
                        type="time"
                        value={timeOf(manualDeadline)}
                        onChange={(e) => handleDeadlineTimeChange(e.target.value)}
                        aria-label="截止具体时刻"
                      />
                      <button type="button" onClick={() => { setManualDeadline(null); setDeadlineEditOpen(false); }} aria-label="取消截止时刻"><X /></button>
                    </div>
                  )}
                </div>
                {/* 提醒时间栏 */}
                <div className="dy-col">
                  <div className="dy-head"><span className="rm-dot" />提醒时间</div>
                  <div className="mini-chips verse">
                    {REMINDER_OFFSET_OPTIONS.map((opt) => {
                      const active = offsetList.includes(opt.key);
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          className={`mini-chip ${active ? 'active' : ''}`}
                          disabled={!hasDeadline}
                          onClick={() => toggleOffset(opt.key)}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="rem-indicator">{reminderTimes.length ? `${reminderTimes.length} 个提醒，可分别设置时分` : '未设提醒（右键日历添加）'}</div>
                  {/* 每个提醒时刻一个独立气泡：标签显示日期，可分别设置时分、单独删除 */}
                  {reminderTimes.map((rt, i) => (
                    <div key={`${rt}-${i}`} className="time-bubble" style={{ marginTop: 6 }}>
                      <span className="rm-dot" />
                      <span className="tb-label">{formatCompletedAt(rt)}</span>
                      <input
                        type="time"
                        value={timeOf(rt)}
                        onChange={(e) => handleReminderTimeChange(i, e.target.value)}
                        aria-label={`第${i + 1}个提醒具体时刻`}
                      />
                      <button type="button" onClick={() => removeReminderAt(i)} aria-label={`删除第${i + 1}个提醒`}><X /></button>
                    </div>
                  ))}
                </div>
              </div>

              <DualCalendar
                deadline={effectiveDeadline}
                reminderTimes={reminderTimes}
                onPickDeadline={handlePickDeadlineDay}
                onPickReminder={handlePickReminderDay}
              />

              <div style={{ fontSize: 10.5, color: 'var(--muted-foreground)', marginTop: 8, lineHeight: 1.5 }}>
                切换「截止/提醒」模式后单击日期（桌面端也可右键直接设提醒）· 再点已选日期可取消
                {!hasDeadline && <span> · 提前提醒需先设截止时间</span>}
              </div>
            </div>

            {/* 备注 */}
            <textarea
              className="qc-remark-field"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="备注（可选）"
              rows={1}
              aria-label="备注"
              style={{
                width: '100%', marginTop: 10, padding: '8px 12px', boxSizing: 'border-box', resize: 'none',
                border: '1px solid var(--input)', borderRadius: 10, background: 'var(--background)', color: 'inherit',
                fontSize: 12, outline: 'none', fontFamily: 'var(--font-sans)', lineHeight: 1.4,
              }}
            />

            {/* 重复规则（需先有截止时间） */}
            <div className="qc-repeat-row" style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>重复</span>
              <select
                value={repeatRule ?? ''}
                onChange={(e) => setRepeatRule((e.target.value || null) as TaskRepeatRule | null)}
                style={{
                  height: 30, padding: '0 8px', boxSizing: 'border-box',
                  border: '1px solid var(--input)', borderRadius: 8, background: 'var(--background)', color: 'inherit',
                  fontSize: 12, outline: 'none', fontFamily: 'var(--font-sans)', flex: 1,
                }}
                aria-label="重复规则"
              >
                <option value="">无（不重复）</option>
                <option value="daily">每天</option>
                <option value="weekly">每周（按截止日星期）</option>
                <option value="monthly">每月（按截止日）</option>
                <option value="yearly">每年（按截止日）</option>
                <option value="custom">自定义（每 N 天）</option>
              </select>
              {repeatRule === 'custom' && (
                <input
                  type="number" min={1}
                  value={repeatIntervalDays ?? ''}
                  onChange={(e) => setRepeatIntervalDays(e.target.value ? Number(e.target.value) : null)}
                  placeholder="天数"
                  style={{
                    width: 64, height: 30, padding: '0 8px', boxSizing: 'border-box',
                    border: '1px solid var(--input)', borderRadius: 8, background: 'var(--background)', color: 'inherit',
                    fontSize: 12, outline: 'none', fontFamily: 'var(--font-sans)',
                  }}
                  aria-label="重复间隔天数"
                />
              )}
            </div>

            {/* 解析日期预览（标题自然语言识别） */}
            {hasDeadline && !manualDeadline && (
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  识别到: {formatDeadline(effectiveDeadline)}
                </span>
              </div>
            )}

            </div>
            <div className="qc-action-bar">
              <button className="create-btn" disabled={!title.trim()} onClick={handleCreate}>
                创建任务
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
