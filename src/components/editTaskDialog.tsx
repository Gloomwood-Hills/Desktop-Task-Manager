import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { X, Calendar as CalendarIcon, Star, Check, ChevronDown, Bell } from 'lucide-react';
import { Task, TaskRepeatRule } from '../data/types';
import { parseNaturalDateTime, formatDeadline, applyDefaultDeadlineTime } from './utils/formatDate';
import { ReminderOffsetKey, REMINDER_OFFSET_OPTIONS, sanitizeOffsets } from '../data/reminderOffsets';
import { ReminderCalendar } from './quickCapture';
import { containerTransform } from './utils/motion';
import { glassSurface, glassBlur } from './utils/glass';
import { isMobile } from '../data/platform';

interface EditTaskDialogProps {
  task: Task;
  onSave: (updates: Partial<Pick<Task, 'title' | 'remark' | 'deadline' | 'priority' | 'reminderAt' | 'reminderOffsets' | 'repeatRule' | 'repeatIntervalDays'>>) => Promise<void>;
  onClose: () => void;
  /** 截止时间仅填日期时补上的默认时/分（设置 → 默认截止时刻） */
  defaultDeadlineHour?: number;
  defaultDeadlineMinute?: number;
}

/** 截止时间快捷项：一小时后为具体时刻，其余为日期（选择时按默认截止时刻补全） */
const DATE_QUICK_DEADLINE = ['一小时后', '明天', '后天', '下周一', '月底'];

/** 时间戳 → datetime-local 输入值（本地时区） */
function toLocalInputValue(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 偏移配置的展示文案：'提前一天' / '提前一天 · 提前6小时'；自定义时刻单独显示 */
function reminderLabel(offsets: string[], customAt: number | null): string {
  if (customAt != null) return `提醒 ${formatDeadline(customAt)}`;
  if (!offsets.length) return '提醒';
  return REMINDER_OFFSET_OPTIONS.filter((o) => offsets.includes(o.key)).map((o) => o.label).join(' · ');
}

/** 任务编辑弹窗：标题 / 备注 / 截止与提醒时间 / 重要（编辑任务，与新建弹窗时间视图保持一致） */
export default function EditTaskDialog({ task, onSave, onClose, defaultDeadlineHour = 18, defaultDeadlineMinute = 0 }: EditTaskDialogProps) {
  const [title, setTitle] = useState(task.title);
  const [remark, setRemark] = useState(task.remark);
  const [important, setImportant] = useState(task.priority === 'important');
  const [manualDeadline, setManualDeadline] = useState<number | null>(task.deadline);
  const [dateOpen, setDateOpen] = useState(false);
  /** 提前提醒偏移多选（'1d'/'3d'/'6h'）；空数组表示未设提醒 */
  const [reminderOffsets, setReminderOffsets] = useState<string[]>(() => sanitizeOffsets(task.reminderOffsets));
  const [reminderOpen, setReminderOpen] = useState(false);
  /** 自定义提醒时刻（显式时刻，无需截止时间即可设置） */
  const [reminderAt, setReminderAt] = useState<number | null>(task.reminderAt ?? null);
  /** 自定义提醒时刻日历弹层 */
  const [reminderCalOpen, setReminderCalOpen] = useState(false);
  /** 自定义提醒时刻的时/分 */
  const [hour, setHour] = useState(() => (task.reminderAt != null ? new Date(task.reminderAt).getHours() : defaultDeadlineHour));
  const [minute, setMinute] = useState(() => (task.reminderAt != null ? new Date(task.reminderAt).getMinutes() : defaultDeadlineMinute));
  const [repeatRule, setRepeatRule] = useState<TaskRepeatRule | null>(task.repeatRule);
  const [repeatIntervalDays, setRepeatIntervalDays] = useState<number | null>(task.repeatIntervalDays);

  // 视口过小时启用紧凑模式：缩小字号 / 输入框 / 按钮 / 内边距，保证窗口内完整显示
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const update = () => setCompact(window.innerHeight < 620 || window.innerWidth < 640);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // 紧凑模式尺寸集
  const s = {
    padX: compact ? 14 : 20,          // 左右内边距
    padTop: compact ? 9 : 12,         // 分区间距
    fieldHeight: compact ? 32 : 40,   // 标题输入框高度
    fieldFont: compact ? 13 : 14,     // 输入框字号
    titleFont: compact ? 14 : 16,     // 弹窗标题字号
    btnHeight: compact ? 30 : 36,     // 操作按钮高度
    btnPad: compact ? 12 : 16,        // 按钮内边距
    chipFont: compact ? 11.5 : 12.5,  // 快捷项/时间 chip 字号
    rows: compact ? 2 : 3,            // 备注行数
    dialogTop: compact ? 16 : 48,     // 顶部留白
  };

  // 截止时间补默认时刻（仅日期时按设置补全）
  const effectiveDeadline = manualDeadline !== null
    ? applyDefaultDeadlineTime(manualDeadline, defaultDeadlineHour, defaultDeadlineMinute)
    : null;

  /** 选中偏移：若已有则取消，否则追加；选偏移时清空自定义时刻（互斥） */
  const toggleOffset = (key: ReminderOffsetKey) => {
    setReminderOffsets((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
    setReminderAt(null);
    setReminderCalOpen(false);
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    // 互斥：设了自定义时刻则不携带偏移；未设自定义时刻才由截止+偏移派生
    const custom = reminderAt != null;
    const updates: Partial<Pick<Task, 'title' | 'remark' | 'deadline' | 'priority' | 'reminderAt' | 'reminderOffsets' | 'repeatRule' | 'repeatIntervalDays'>> = {
      title: title.trim(),
      remark: remark.trim(),
      priority: important ? 'important' : 'normal',
      deadline: effectiveDeadline,
      reminderOffsets: custom ? [] : sanitizeOffsets(reminderOffsets),
      repeatRule,
      repeatIntervalDays: repeatRule === 'custom' ? repeatIntervalDays : null,
    };
    if (custom) updates.reminderAt = reminderAt;
    await onSave(updates);
    onClose();
  };

  const chipStyle = (active: boolean, disabled = false): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 5, padding: compact ? '4px 8px' : '5px 10px', borderRadius: 10,
    background: active ? 'var(--brand-50)' : 'transparent',
    border: `1px solid ${active ? 'var(--brand-200)' : 'var(--border)'}`,
    cursor: disabled ? 'not-allowed' : 'pointer', fontSize: s.chipFont,
    color: disabled ? 'var(--muted-foreground)' : active ? 'var(--primary)' : 'var(--muted-foreground)',
    opacity: disabled ? 0.45 : 1,
  });

  /** 面板容器（q弹进场） */
  const panelWrap = (children: React.ReactNode) => (
    <motion.div variants={containerTransform} initial="initial" animate="animate" exit="exit" style={{ padding: `${s.padTop - 2}px ${s.padX}px 0` }}>
      {children}
    </motion.div>
  );

  const panelBox: React.CSSProperties = {
    borderRadius: 14,
    ...glassSurface('#ffffff', 78, 40),
    boxShadow: 'var(--shadow-lg), 0 0 0 0.5px rgba(0,0,0,0.06)',
    padding: 6,
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 150,
      display: 'flex', alignItems: isMobile ? 'flex-end' : 'flex-start', justifyContent: 'center', paddingTop: isMobile ? 0 : s.dialogTop,
    }}>
      {/* Scrim */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.25)', ...glassBlur(8) }} onClick={onClose} />

      {/* 弹窗 */}
      <div className={isMobile ? 'mobile-form-sheet' : undefined} style={{
        position: 'relative',
        width: isMobile ? '100%' : compact ? 440 : 520,
        maxWidth: isMobile ? '100%' : 'calc(100% - 24px)',
        maxHeight: isMobile ? 'calc(100vh - 8px)' : `calc(100vh - ${s.dialogTop * 2}px)`,
        overflowY: 'auto',
        borderRadius: isMobile ? '22px 22px 0 0' : 'calc(var(--radius)*1.2)',
        ...glassSurface('#ffffff', 82, 40),
        boxShadow: 'var(--shadow-xl), 0 0 0 0.5px rgba(0,0,0,0.06)',
        color: 'var(--foreground)',
      }}>
        {/* 头部 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${s.padTop + 4}px ${s.padX}px 0` }}>
          <span style={{ fontSize: s.titleFont, fontWeight: 700 }}>编辑任务</span>
          <button
            onClick={onClose}
            aria-label="关闭编辑"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, borderRadius: 'calc(var(--radius) * 0.6)',
              border: 'none', background: 'transparent', color: 'var(--icon-muted)', cursor: 'pointer',
            }}
          >
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* 标题 */}
        <div style={{ padding: `${s.padTop + 2}px ${s.padX}px 0` }}>
          <div style={{ fontSize: compact ? 11 : 12, color: 'var(--muted-foreground)', marginBottom: 6 }}>标题</div>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="任务标题"
            autoFocus
            style={{
              width: '100%', height: s.fieldHeight, padding: '0 12px', boxSizing: 'border-box',
              border: '1px solid var(--input)', borderRadius: 'calc(var(--radius) * 0.8)',
              background: 'var(--background)', color: 'inherit',
              fontSize: s.fieldFont, fontWeight: 500, outline: 'none', fontFamily: 'var(--font-sans)',
            }}
          />
        </div>

        {/* 备注 */}
        <div style={{ padding: `${s.padTop}px ${s.padX}px 0` }}>
          <div style={{ fontSize: compact ? 11 : 12, color: 'var(--muted-foreground)', marginBottom: 6 }}>备注</div>
          <textarea
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder="任务备注（可选）"
            rows={s.rows}
            style={{
              width: '100%', padding: '10px 12px', boxSizing: 'border-box', resize: 'vertical',
              border: '1px solid var(--input)', borderRadius: 'calc(var(--radius) * 0.8)',
              background: 'var(--background)', color: 'inherit',
              fontSize: compact ? 12 : 13, outline: 'none', fontFamily: 'var(--font-sans)', lineHeight: 1.5,
            }}
          />
        </div>

        {/* 选项行：截止时间 + 提醒 + 重要 */}
        <div style={{ padding: `${s.padTop}px ${s.padX}px 0`, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div
            onClick={() => { setDateOpen(!dateOpen); setReminderOpen(false); }}
            style={chipStyle(effectiveDeadline !== null)}
          >
            <CalendarIcon style={{ width: 13, height: 13, flexShrink: 0 }} />
            <span style={{ fontWeight: 600 }}>{effectiveDeadline ? formatDeadline(effectiveDeadline) : '截止时间'}</span>
            <ChevronDown style={{ width: 11, height: 11, flexShrink: 0 }} />
          </div>
          <div
            onClick={() => { setReminderOpen(!reminderOpen); setDateOpen(false); setReminderCalOpen(false); }}
            style={chipStyle(reminderOffsets.length > 0 || reminderAt != null || reminderOpen)}
          >
            <Bell style={{ width: 13, height: 13, flexShrink: 0 }} />
            <span style={{ fontWeight: 600 }}>{reminderLabel(reminderOffsets, reminderAt)}</span>
            <ChevronDown style={{ width: 11, height: 11, flexShrink: 0 }} />
          </div>
          <div
            onClick={() => setImportant(!important)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: compact ? '4px 8px' : '5px 10px', borderRadius: 10,
              background: important ? 'color-mix(in srgb, var(--chart-3) 8%, transparent)' : 'transparent',
              border: `1px solid ${important ? 'color-mix(in srgb, var(--chart-3) 25%, transparent)' : 'var(--border)'}`,
              cursor: 'pointer', fontSize: s.chipFont,
              color: important ? 'var(--chart-3)' : 'var(--muted-foreground)',
              marginLeft: 'auto',
            }}
          >
            <Star style={{ width: 13, height: 13, fill: important ? 'var(--chart-3)' : 'none', flexShrink: 0 }} />
            <span style={{ fontWeight: 600 }}>重要</span>
            {important && <Check style={{ width: 12, height: 12, flexShrink: 0 }} />}
          </div>
        </div>

        {/* 展开面板：截止时间 */}
        {dateOpen && (
          panelWrap(
            <div style={panelBox}>
              {DATE_QUICK_DEADLINE.map((label) => {
                const ts = applyDefaultDeadlineTime(parseNaturalDateTime(label), defaultDeadlineHour, defaultDeadlineMinute);
                const active = manualDeadline !== null && applyDefaultDeadlineTime(manualDeadline, defaultDeadlineHour, defaultDeadlineMinute) === ts;
                return (
                  <div
                    key={label}
                    onClick={() => { setManualDeadline(ts); setDateOpen(false); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: compact ? '5px 10px' : '7px 12px', borderRadius: 10,
                      cursor: 'pointer', fontSize: s.chipFont,
                      color: active ? 'var(--primary)' : 'var(--muted-foreground)',
                      background: active ? 'var(--brand-50)' : 'transparent',
                    }}
                  >
                    <span style={{ fontWeight: active ? 600 : 500 }}>{label}</span>
                    {ts && <span style={{ fontSize: 11, opacity: 0.8 }}>{formatDeadline(ts)}</span>}
                    {active && <Check style={{ width: 14, height: 14, marginLeft: 'auto', flexShrink: 0 }} />}
                  </div>
                );
              })}
              <div style={{ borderTop: '1px solid var(--border)', margin: '4px 8px' }} />
              <div style={{ padding: compact ? '5px 10px' : '7px 12px' }}>
                <div style={{ fontSize: compact ? 11 : 12, color: 'var(--muted-foreground)', marginBottom: 6 }}>自定义时间</div>
                <input
                  type="datetime-local"
                  value={manualDeadline !== null ? toLocalInputValue(manualDeadline) : ''}
                  onChange={(e) => { if (e.target.value) setManualDeadline(new Date(e.target.value).getTime()); }}
                  style={{
                    width: '100%', height: compact ? 26 : 30, padding: '0 8px', boxSizing: 'border-box',
                    border: '1px solid var(--input)', borderRadius: 8,
                    background: 'var(--background)', color: 'inherit',
                    fontSize: s.chipFont, outline: 'none', fontFamily: 'var(--font-sans)',
                  }}
                />
              </div>
              <div
                onClick={() => { setManualDeadline(null); setDateOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: compact ? '5px 10px' : '7px 12px', borderRadius: 10,
                  cursor: 'pointer', fontSize: s.chipFont,
                  color: manualDeadline === null ? 'var(--primary)' : 'var(--muted-foreground)',
                  background: manualDeadline === null ? 'var(--brand-50)' : 'transparent',
                }}
              >
                <span style={{ fontWeight: manualDeadline === null ? 600 : 500 }}>无截止日期</span>
                {manualDeadline === null && <Check style={{ width: 14, height: 14, marginLeft: 'auto', flexShrink: 0 }} />}
              </div>
            </div>
          )
        )}

        {/* 展开面板：提醒（提前偏移多选，未设截止则置灰；自定义时刻始终可用） */}
        {reminderOpen && (
          panelWrap(
            <div style={{ ...panelBox, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 600 }}>提前提醒（相对截止，可多选）</span>
                {effectiveDeadline && (
                  <span style={{ fontSize: 11.5, color: 'var(--primary)' }}>截止 {formatDeadline(effectiveDeadline)}</span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {REMINDER_OFFSET_OPTIONS.map((opt) => {
                  const disabled = !effectiveDeadline;
                  const active = reminderOffsets.includes(opt.key);
                  return (
                    <div
                      key={opt.key}
                      onClick={() => { if (!disabled) toggleOffset(opt.key); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '6px 12px', borderRadius: 999,
                        border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                        background: active ? 'var(--brand-50)' : 'transparent',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        fontSize: s.chipFont, fontWeight: 600,
                        color: disabled ? 'var(--muted-foreground)' : active ? 'var(--primary)' : 'var(--muted-foreground)',
                        opacity: disabled ? 0.45 : 1,
                        transition: 'background-color .15s ease, border-color .15s ease',
                      }}
                    >
                      {opt.label}
                      {active && <Check style={{ width: 13, height: 13, flexShrink: 0 }} />}
                    </div>
                  );
                })}
              </div>
              {!effectiveDeadline && (
                <div style={{ fontSize: 11.5, color: 'var(--destructive)', marginTop: 8 }}>提前提醒需先设置截止时间；自定义时刻无需截止</div>
              )}
              <div style={{ borderTop: '1px solid var(--border)', margin: '12px -12px 10px' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 600 }}>自定义提醒时刻（无需截止）</span>
                {reminderAt != null && (
                  <span style={{ fontSize: 11.5, color: 'var(--primary)' }}>{formatDeadline(reminderAt)}</span>
                )}
              </div>
              <div
                onClick={() => setReminderCalOpen((v) => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '6px 12px', borderRadius: 999, width: '100%', justifyContent: 'center',
                  border: `1px solid ${reminderAt != null ? 'var(--primary)' : 'var(--border)'}`,
                  background: reminderAt != null ? 'var(--brand-50)' : 'transparent',
                  cursor: 'pointer', fontSize: s.chipFont, fontWeight: 600,
                  color: reminderAt != null ? 'var(--primary)' : 'var(--muted-foreground)',
                  transition: 'background-color .15s ease, border-color .15s ease', boxSizing: 'border-box',
                }}
              >
                {reminderAt != null ? <Bell style={{ width: 13, height: 13, flexShrink: 0 }} /> : <CalendarIcon style={{ width: 13, height: 13, flexShrink: 0 }} />}
                <span>{reminderAt != null ? '已选自定义时刻' : '选择自定义时刻（日历）'}</span>
                {reminderAt != null && <Check style={{ width: 13, height: 13, flexShrink: 0 }} />}
              </div>
              {reminderCalOpen && (
                <div className="qc-scope" style={{ marginTop: 10 }}>
                  <ReminderCalendar
                    selectedAt={reminderAt}
                    hour={hour}
                    minute={minute}
                    onHourChange={setHour}
                    onMinuteChange={setMinute}
                    onPickDay={(dayTs) => {
                      const d = new Date(dayTs);
                      d.setHours(hour, minute, 0, 0);
                      setReminderAt(d.getTime());
                      setReminderOffsets([]);
                    }}
                  />
                </div>
              )}
              {reminderAt != null && (
                <div
                  onClick={() => { setReminderAt(null); setReminderCalOpen(false); }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 8, fontSize: 11.5, color: 'var(--muted-foreground)', cursor: 'pointer' }}
                >
                  清除自定义提醒
                </div>
              )}
            </div>
          )
        )}

        {/* 重复规则（需先有截止时间） */}
        <div style={{ padding: `${s.padTop}px ${s.padX}px 0` }}>
          <div style={{ fontSize: compact ? 11 : 12, color: 'var(--muted-foreground)', marginBottom: 6 }}>重复</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <select
              value={repeatRule ?? ''}
              onChange={(e) => setRepeatRule((e.target.value || null) as TaskRepeatRule | null)}
              style={{
                height: s.fieldHeight, padding: '0 10px', boxSizing: 'border-box',
                border: '1px solid var(--input)', borderRadius: 'calc(var(--radius) * 0.8)',
                background: 'var(--background)', color: 'inherit',
                fontSize: s.fieldFont, outline: 'none', fontFamily: 'var(--font-sans)',
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
                placeholder="间隔天数"
                style={{
                  width: 90, height: s.fieldHeight, padding: '0 10px', boxSizing: 'border-box',
                  border: '1px solid var(--input)', borderRadius: 'calc(var(--radius) * 0.8)',
                  background: 'var(--background)', color: 'inherit',
                  fontSize: s.fieldFont, outline: 'none', fontFamily: 'var(--font-sans)',
                }}
                aria-label="重复间隔天数"
              />
            )}
          </div>
          {repeatRule && !effectiveDeadline && (
            <div style={{ fontSize: 11, color: 'var(--destructive)', marginTop: 6 }}>设置重复前请先选择截止时间（重复按截止日顺延）</div>
          )}
        </div>

        {/* 操作按钮 */}
        <div style={{ padding: `${s.padTop + 4}px ${s.padX}px ${s.padTop + 4}px`, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              height: s.btnHeight, padding: `0 ${s.btnPad}px`, fontSize: compact ? 12 : 13, color: 'var(--muted-foreground)',
              border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim()}
            style={{
              height: s.btnHeight, padding: `0 ${s.btnPad + 4}px`, fontSize: compact ? 12 : 13, fontWeight: 600,
              borderRadius: 999, background: 'var(--primary)', color: 'var(--primary-foreground)',
              border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)',
              opacity: title.trim() ? 1 : 0.42,
            }}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
