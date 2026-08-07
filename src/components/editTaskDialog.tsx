import { useState } from 'react';
import { X, Calendar as CalendarIcon, CalendarClock, Star, Check, ChevronDown } from 'lucide-react';
import { Task } from '../data/types';
import { parseNaturalDateTime, formatDeadline } from './utils/formatDate';

interface EditTaskDialogProps {
  task: Task;
  onSave: (updates: Partial<Pick<Task, 'title' | 'remark' | 'startDate' | 'deadline' | 'priority'>>) => Promise<void>;
  onClose: () => void;
}

/** 开始时间快捷项（日期语义，归一化为当日 00:00） */
const DATE_QUICK_START = ['今天', '明天', '后天', '下周一', '月底'];
/** 截止时间快捷项：一小时后为具体时刻，其余为日期 */
const DATE_QUICK_DEADLINE = ['一小时后', '明天', '后天', '下周一', '月底'];

/** 时间戳 → datetime-local 输入值（本地时区） */
function toLocalInputValue(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 任务编辑弹窗：标题 / 备注 / 开始与截止时间 / 重要（TR-12.1 编辑任务） */
export default function EditTaskDialog({ task, onSave, onClose }: EditTaskDialogProps) {
  const [title, setTitle] = useState(task.title);
  const [remark, setRemark] = useState(task.remark);
  const [important, setImportant] = useState(task.priority === 'important');
  const [manualStart, setManualStart] = useState<number | null>(task.startDate);
  const [manualDeadline, setManualDeadline] = useState<number | null>(task.deadline);
  const [startOpen, setStartOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) return;
    await onSave({
      title: title.trim(),
      remark: remark.trim(),
      priority: important ? 'important' : 'normal',
      startDate: manualStart,
      deadline: manualDeadline,
    });
    onClose();
  };

  const chipStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 10,
    background: active ? 'var(--brand-50)' : 'transparent',
    border: `1px solid ${active ? 'var(--brand-200)' : 'var(--border)'}`,
    cursor: 'pointer', fontSize: 12.5,
    color: active ? 'var(--primary)' : 'var(--muted-foreground)',
  });

  /** 时间选择面板（快捷项 + 自定义 + 清除） */
  const timePanel = (
    quickLabel: string,
    value: number | null,
    setValue: (v: number | null) => void,
    close: () => void,
    normalizeToDayStart: boolean,
  ) => {
    const quicks = normalizeToDayStart ? DATE_QUICK_START : DATE_QUICK_DEADLINE;
    return (
    <div style={{
      borderRadius: 14,
      background: 'rgba(255,255,255,0.78)',
      backdropFilter: 'blur(40px) saturate(1.8)',
      WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
      boxShadow: 'var(--shadow-lg), 0 0 0 0.5px rgba(0,0,0,0.06)',
      padding: 6,
      display: 'inline-flex',
      flexDirection: 'column',
    }}>
      {quicks.map((label) => {
        const raw = parseNaturalDateTime(label);
        const ts = raw !== null && normalizeToDayStart ? new Date(raw).setHours(0, 0, 0, 0) : raw;
        const active = value === ts;
        return (
          <div
            key={label}
            onClick={() => { setValue(ts); close(); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 10,
              cursor: 'pointer', fontSize: 12.5,
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
      <div style={{ padding: '7px 12px' }}>
        <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 6 }}>自定义时间</div>
        <input
          type="datetime-local"
          value={value !== null ? toLocalInputValue(value) : ''}
          onChange={(e) => { if (e.target.value) setValue(new Date(e.target.value).getTime()); }}
          style={{
            width: '100%', height: 30, padding: '0 8px', boxSizing: 'border-box',
            border: '1px solid var(--input)', borderRadius: 8,
            background: 'var(--background)', color: 'inherit',
            fontSize: 12.5, outline: 'none', fontFamily: 'var(--font-sans)',
          }}
        />
      </div>
      <div
        onClick={() => { setValue(null); close(); }}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 10,
          cursor: 'pointer', fontSize: 12.5,
          color: value === null ? 'var(--primary)' : 'var(--muted-foreground)',
          background: value === null ? 'var(--brand-50)' : 'transparent',
        }}
      >
        <span style={{ fontWeight: value === null ? 600 : 500 }}>{quickLabel}</span>
        {value === null && <Check style={{ width: 14, height: 14, marginLeft: 'auto', flexShrink: 0 }} />}
      </div>
    </div>
    );
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 150,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 48,
    }}>
      {/* Scrim */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(8px)' }} onClick={onClose} />

      {/* 弹窗 */}
      <div style={{
        position: 'relative',
        width: 520,
        maxWidth: 'calc(100% - 32px)',
        maxHeight: 'calc(100vh - 96px)',
        overflowY: 'auto',
        borderRadius: 'calc(var(--radius)*1.2)',
        background: 'rgba(255,255,255,0.82)',
        backdropFilter: 'blur(40px) saturate(1.8)',
        WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
        boxShadow: 'var(--shadow-xl), 0 0 0 0.5px rgba(0,0,0,0.06)',
        color: 'var(--foreground)',
      }}>
        {/* 头部 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 0' }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>编辑任务</span>
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
        <div style={{ padding: '14px 20px 0' }}>
          <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 6 }}>标题</div>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="任务标题"
            autoFocus
            style={{
              width: '100%', height: 40, padding: '0 12px', boxSizing: 'border-box',
              border: '1px solid var(--input)', borderRadius: 'calc(var(--radius) * 0.8)',
              background: 'var(--background)', color: 'inherit',
              fontSize: 14, fontWeight: 500, outline: 'none', fontFamily: 'var(--font-sans)',
            }}
          />
        </div>

        {/* 备注 */}
        <div style={{ padding: '12px 20px 0' }}>
          <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 6 }}>备注</div>
          <textarea
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder="任务备注（可选）"
            rows={3}
            style={{
              width: '100%', padding: '10px 12px', boxSizing: 'border-box', resize: 'vertical',
              border: '1px solid var(--input)', borderRadius: 'calc(var(--radius) * 0.8)',
              background: 'var(--background)', color: 'inherit',
              fontSize: 13, outline: 'none', fontFamily: 'var(--font-sans)', lineHeight: 1.5,
            }}
          />
        </div>

        {/* 重要 */}
        <div style={{ padding: '12px 20px 0' }}>
          <div
            onClick={() => setImportant(!important)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 10,
              background: important ? 'color-mix(in srgb, var(--chart-3) 8%, transparent)' : 'transparent',
              border: `1px solid ${important ? 'color-mix(in srgb, var(--chart-3) 25%, transparent)' : 'var(--border)'}`,
              cursor: 'pointer', fontSize: 12.5,
              color: important ? 'var(--chart-3)' : 'var(--muted-foreground)',
            }}
          >
            <Star style={{ width: 13, height: 13, fill: important ? 'var(--chart-3)' : 'none', flexShrink: 0 }} />
            <span style={{ fontWeight: 600 }}>重要</span>
            {important && <Check style={{ width: 12, height: 12, flexShrink: 0 }} />}
          </div>
        </div>

        {/* 时间设置：开始时间 + 截止时间 */}
        <div style={{ padding: '12px 20px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            onClick={() => { setStartOpen(!startOpen); setDateOpen(false); }}
            style={chipStyle(manualStart !== null)}
          >
            <CalendarClock style={{ width: 13, height: 13, flexShrink: 0 }} />
            <span style={{ fontWeight: 600 }}>{manualStart !== null ? formatDeadline(manualStart) : '开始时间'}</span>
            <ChevronDown style={{ width: 11, height: 11, flexShrink: 0 }} />
          </div>
          <div
            onClick={() => { setDateOpen(!dateOpen); setStartOpen(false); }}
            style={chipStyle(manualDeadline !== null)}
          >
            <CalendarIcon style={{ width: 13, height: 13, flexShrink: 0 }} />
            <span style={{ fontWeight: 600 }}>{manualDeadline !== null ? formatDeadline(manualDeadline) : '截止时间'}</span>
            <ChevronDown style={{ width: 11, height: 11, flexShrink: 0 }} />
          </div>
        </div>

        {startOpen && (
          <div style={{ padding: '10px 20px 0' }}>
            {timePanel('无开始日期', manualStart, setManualStart, () => setStartOpen(false), true)}
          </div>
        )}
        {dateOpen && (
          <div style={{ padding: '10px 20px 0' }}>
            {timePanel('无截止日期', manualDeadline, setManualDeadline, () => setDateOpen(false), false)}
          </div>
        )}

        {/* 操作按钮 */}
        <div style={{ padding: '16px 20px 20px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              height: 36, padding: '0 16px', fontSize: 13, color: 'var(--muted-foreground)',
              border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim()}
            style={{
              height: 36, padding: '0 20px', fontSize: 13, fontWeight: 600,
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
