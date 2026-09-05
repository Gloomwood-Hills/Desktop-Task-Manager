import { useMemo, useState } from 'react';
import {
  Folder as FolderIcon, ChevronDown, Calendar as CalendarIcon, CalendarClock, Bell, Check, Star,
  Plus, Sparkles,
} from 'lucide-react';
import { FolderNode, Priority, TaskRepeatRule } from '../data/types';
import { parseNaturalDateTime, formatDeadline, formatDeadlineYMD } from './utils/formatDate';

interface QuickCaptureProps {
  folders: FolderNode[];
  onClose: () => void;
  onCreate: (
    title: string,
    folderId: string | null,
    options: { priority?: Priority; startDate?: number | null; deadline?: number | null; remark?: string; reminderAt?: number | null; repeatRule?: TaskRepeatRule | null; repeatIntervalDays?: number | null }
  ) => void;
  /** 预填的默认截止日期（归一化为当天 00:00）；不传时保持原有行为 */
  initialDate?: number;
  /** 预选的默认文件夹（如右键文件夹 → 新建任务）；null/不传时默认未分类 */
  initialFolderId?: string | null;
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

/** 新建任务弹窗（Quick Capture，对齐设计稿 quick-capture） */
export default function QuickCapture({ folders, onClose, onCreate, initialDate, initialFolderId = null }: QuickCaptureProps) {
  const [title, setTitle] = useState('');
  const [remark, setRemark] = useState('');
  const [folderId, setFolderId] = useState<string | null>(initialFolderId);
  const [folderOpen, setFolderOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  /** 手动选择的截止时间；null 时回退到标题自然语言解析。提供 initialDate 时预填（归一化为当天 00:00） */
  const [manualDeadline, setManualDeadline] = useState<number | null>(() =>
    initialDate !== undefined ? new Date(initialDate).setHours(0, 0, 0, 0) : null
  );
  /** 手动选择的开始时间面板 */
  const [startOpen, setStartOpen] = useState(false);
  /** 手动选择的开始时间；null 表示无开始日期 */
  const [manualStart, setManualStart] = useState<number | null>(null);
  const [reminderAt, setReminderAt] = useState<number | null>(null);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [repeatRule, setRepeatRule] = useState<TaskRepeatRule | null>(null);
  const [repeatIntervalDays, setRepeatIntervalDays] = useState<number | null>(null);
  const [important, setImportant] = useState(false);

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

  // 自然语言日期解析（实时，标题变化即更新）
  const parsedDeadline = useMemo(() => parseNaturalDateTime(title), [title]);
  // 手动选择优先，其次标题解析
  const effectiveDeadline = manualDeadline ?? parsedDeadline;

  const handleCreate = () => {
    if (!title.trim()) return;
    onCreate(title.trim(), folderId, {
      priority: important ? 'important' : 'normal',
      startDate: manualStart,
      deadline: effectiveDeadline,
      remark: remark.trim(),
      reminderAt: effectiveDeadline && reminderAt !== null ? reminderAt : null,
      repeatRule: effectiveDeadline ? repeatRule : null,
      repeatIntervalDays: effectiveDeadline && repeatRule === 'custom' ? repeatIntervalDays : null,
    });
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 100,
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      paddingTop: 40,
    }}>
      {/* Scrim */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(8px)' }} onClick={onClose} />

      {/* Popup */}
      <div style={{
        position: 'relative',
        width: 560,
        maxWidth: 'calc(100% - 32px)',
        borderRadius: 'calc(var(--radius)*1.2)',
        background: 'rgba(255,255,255,0.82)',
        backdropFilter: 'blur(40px) saturate(1.8)',
        WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
        boxShadow: 'var(--shadow-xl), 0 0 0 0.5px rgba(0,0,0,0.06)',
        maxHeight: 'calc(100vh - 80px)',
        overflowY: 'auto',
        color: 'var(--foreground)',
      }}>
        {/* Option buttons row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '18px 24px 0', flexWrap: 'nowrap' }}>
          {/* 文件夹选择 */}
          <div
            onClick={() => { setFolderOpen(!folderOpen); setReminderOpen(false); setStartOpen(false); setDateOpen(false); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 10,
              background: 'var(--brand-50)', border: '1px solid var(--brand-200)', cursor: 'pointer', fontSize: 12.5, color: 'var(--primary)',
            }}
          >
            <FolderIcon style={{ width: 13, height: 13, color: 'var(--primary)', flexShrink: 0 }} />
            <span style={{ fontWeight: 600 }}>{selectedFolder?.name ?? '选择文件夹'}</span>
            <ChevronDown style={{ width: 11, height: 11, color: 'var(--primary)', flexShrink: 0 }} />
          </div>

          {/* 提醒（需先有截止时间，选择 x月x日x时x分） */}
          <div
            onClick={() => setReminderOpen(!reminderOpen)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 10,
              background: (reminderAt !== null || reminderOpen) ? 'var(--brand-50)' : 'transparent',
              border: `1px solid ${(reminderAt !== null || reminderOpen) ? 'var(--brand-200)' : 'var(--border)'}`,
              cursor: 'pointer', fontSize: 12.5,
              color: (reminderAt !== null || reminderOpen) ? 'var(--primary)' : 'var(--muted-foreground)',
            }}
          >
            <Bell style={{ width: 13, height: 13, flexShrink: 0 }} />
            <span style={{ fontWeight: 600 }}>{reminderAt !== null ? formatDeadline(reminderAt) : '提醒'}</span>
            {(reminderAt !== null || reminderOpen) && <Check style={{ width: 12, height: 12, flexShrink: 0 }} />}
          </div>

          {/* 重要 */}
          <div
            onClick={() => setImportant(!important)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 10,
              background: important ? 'color-mix(in srgb, var(--chart-3) 8%, transparent)' : 'transparent',
              border: `1px solid ${important ? 'color-mix(in srgb, var(--chart-3) 25%, transparent)' : 'var(--border)'}`,
              cursor: 'pointer', fontSize: 12.5,
              color: important ? 'var(--chart-3)' : 'var(--muted-foreground)',
              marginLeft: 'auto',
            }}
          >
            <Star style={{ width: 13, height: 13, fill: important ? 'var(--chart-3)' : 'none', flexShrink: 0 }} />
            <span style={{ fontWeight: 600 }}>重要</span>
            {important && <Check style={{ width: 12, height: 12, flexShrink: 0 }} />}
          </div>
        </div>

        {/* 展开面板：文件夹选择 */}
        {folderOpen && (
          <div style={{ padding: '10px 24px 0' }}>
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
          </div>
        )}

        {/* 展开面板：提醒（按截止时间选具体时刻，未设截止则提示） */}
        {reminderOpen && (
          <div style={{ padding: '10px 24px 0' }}>
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
              <div style={{ padding: '7px 12px', fontSize: 12, color: effectiveDeadline ? 'var(--primary)' : 'var(--destructive)', fontWeight: 600 }}>
                {effectiveDeadline ? `截止时间：${formatDeadline(effectiveDeadline)}（提醒默认等同截止）` : '请先设置截止时间，才能设置提醒'}
              </div>
              <div style={{ padding: '4px 12px 8px' }}>
                <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 6 }}>提醒时刻（x月x日x时x分）</div>
                <input
                  type="datetime-local"
                  disabled={!effectiveDeadline}
                  value={reminderAt !== null ? toLocalInputValue(reminderAt) : (effectiveDeadline ? toLocalInputValue(effectiveDeadline) : '')}
                  onChange={(e) => { if (e.target.value) setReminderAt(new Date(e.target.value).getTime()); }}
                  style={{
                    width: '100%', height: 30, padding: '0 8px', boxSizing: 'border-box',
                    border: '1px solid var(--input)', borderRadius: 8,
                    background: 'var(--background)', color: 'inherit',
                    fontSize: 12.5, outline: 'none', fontFamily: 'var(--font-sans)', opacity: effectiveDeadline ? 1 : 0.5,
                  }}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <button
                    onClick={() => { if (effectiveDeadline) { setReminderAt(effectiveDeadline); setReminderOpen(false); } }}
                    style={{ height: 26, padding: '0 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 999, background: 'var(--muted)', color: 'var(--foreground)', cursor: 'pointer', fontWeight: 600 }}
                  >提醒=截止</button>
                  <button
                    onClick={() => { setReminderAt(null); setReminderOpen(false); }}
                    style={{ height: 26, padding: '0 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 999, background: 'transparent', color: 'var(--muted-foreground)', cursor: 'pointer' }}
                  >无提醒</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 输入区域 */}
        <div style={{ padding: '14px 24px 0' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            width: '100%', height: 52, padding: '0 16px',
            border: '1px solid var(--input)', borderRadius: 'var(--radius)',
            background: 'var(--background)', color: 'var(--foreground)',
            boxShadow: 'var(--shadow-xs)',
          }}>
            <Plus style={{ width: 16, height: 16, color: 'var(--icon-muted)', flexShrink: 0 }} />
            <input
              type="text"
              name="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              placeholder="输入任务，自动解析日期..."
              autoFocus
              style={{
                flex: 1, border: 0, outline: 0, background: 'transparent',
                color: 'inherit', font: 'inherit', fontSize: 15, fontWeight: 500,
              }}
            />
          </div>
        </div>

        {/* 备注输入 */}
        <div style={{ padding: '10px 24px 0' }}>
          <textarea
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder="备注（可选）"
            rows={2}
            style={{
              width: '100%', padding: '10px 12px', boxSizing: 'border-box', resize: 'none',
              border: '1px solid var(--input)', borderRadius: 'calc(var(--radius) * 0.8)',
              background: 'var(--background)', color: 'inherit',
              fontSize: 13, outline: 'none', fontFamily: 'var(--font-sans)', lineHeight: 1.5,
            }}
          />
        </div>

        {/* 解析日期预览 */}
        {parsedDeadline && (
          <div style={{ padding: '8px 24px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sparkles style={{ width: 13, height: 13, color: 'var(--primary)', flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              识别到: {formatDeadlineYMD(parsedDeadline)}
            </span>
          </div>
        )}

        {/* 时间设置：开始时间 + 截止时间（置于输入框下方，弹窗可完整显示） */}
        <div style={{ padding: '14px 24px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* 开始时间 */}
          <div
            onClick={() => { setStartOpen(!startOpen); setDateOpen(false); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 10,
              background: manualStart ? 'var(--brand-50)' : 'transparent',
              border: `1px solid ${manualStart ? 'var(--brand-200)' : 'var(--border)'}`,
              cursor: 'pointer', fontSize: 12.5,
              color: manualStart ? 'var(--primary)' : 'var(--muted-foreground)',
            }}
          >
            <CalendarClock style={{ width: 13, height: 13, flexShrink: 0 }} />
            <span style={{ fontWeight: 600 }}>{manualStart ? formatDeadline(manualStart) : '开始时间'}</span>
            <ChevronDown style={{ width: 11, height: 11, flexShrink: 0 }} />
          </div>

          {/* 截止时间（手动选择或显示解析日期） */}
          <div
            onClick={() => { setDateOpen(!dateOpen); setStartOpen(false); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 10,
              background: effectiveDeadline ? 'var(--brand-50)' : 'transparent',
              border: `1px solid ${effectiveDeadline ? 'var(--brand-200)' : 'var(--border)'}`,
              cursor: 'pointer', fontSize: 12.5,
              color: effectiveDeadline ? 'var(--primary)' : 'var(--muted-foreground)',
            }}
          >
            <CalendarIcon style={{ width: 13, height: 13, flexShrink: 0 }} />
            <span style={{ fontWeight: 600 }}>{effectiveDeadline ? formatDeadline(effectiveDeadline) : '截止时间'}</span>
            <ChevronDown style={{ width: 11, height: 11, flexShrink: 0 }} />
          </div>
        </div>

        {/* 重复规则（需先有截止时间） */}
        <div style={{ padding: '10px 24px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>重复</span>
          <select
            value={repeatRule ?? ''}
            onChange={(e) => setRepeatRule((e.target.value || null) as TaskRepeatRule | null)}
            style={{
              height: 32, padding: '0 10px', boxSizing: 'border-box',
              border: '1px solid var(--input)', borderRadius: 'calc(var(--radius) * 0.8)',
              background: 'var(--background)', color: 'inherit',
              fontSize: 12.5, outline: 'none', fontFamily: 'var(--font-sans)',
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
                width: 70, height: 32, padding: '0 8px', boxSizing: 'border-box',
                border: '1px solid var(--input)', borderRadius: 'calc(var(--radius) * 0.8)',
                background: 'var(--background)', color: 'inherit',
                fontSize: 12.5, outline: 'none', fontFamily: 'var(--font-sans)',
              }}
              aria-label="重复间隔天数"
            />
          )}
          {repeatRule && !effectiveDeadline && (
            <span style={{ fontSize: 11, color: 'var(--destructive)' }}>先设截止时间</span>
          )}
        </div>

        {/* 展开面板：开始时间选择 */}
        {startOpen && (
          <div style={{ padding: '10px 24px 0' }}>
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
              {DATE_QUICK_START.map((label) => {
                const raw = parseNaturalDateTime(label);
                // 开始时间快捷项归一化为当日 00:00（开始日期语义）
                const ts = raw !== null ? new Date(raw).setHours(0, 0, 0, 0) : null;
                const active = manualStart === ts;
                return (
                  <div
                    key={label}
                    onClick={() => { setManualStart(ts); setStartOpen(false); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 10,
                      cursor: 'pointer', fontSize: 12.5,
                      color: active ? 'var(--primary)' : 'var(--muted-foreground)',
                      background: active ? 'var(--brand-50)' : 'transparent',
                    }}
                  >
                    <span style={{ fontWeight: active ? 600 : 500 }}>{label}</span>
                    {ts && (
                      <span style={{ fontSize: 11, opacity: 0.8 }}>{formatDeadline(ts)}</span>
                    )}
                    {active && <Check style={{ width: 14, height: 14, marginLeft: 'auto', flexShrink: 0 }} />}
                  </div>
                );
              })}
              <div style={{ borderTop: '1px solid var(--border)', margin: '4px 8px' }} />
              {/* 自定义时间 */}
              <div style={{ padding: '7px 12px' }}>
                <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 6 }}>自定义时间</div>
                <input
                  type="datetime-local"
                  value={manualStart !== null ? toLocalInputValue(manualStart) : ''}
                  onChange={(e) => {
                    if (e.target.value) setManualStart(new Date(e.target.value).getTime());
                  }}
                  style={{
                    width: '100%', height: 30, padding: '0 8px', boxSizing: 'border-box',
                    border: '1px solid var(--input)', borderRadius: 8,
                    background: 'var(--background)', color: 'inherit',
                    fontSize: 12.5, outline: 'none', fontFamily: 'var(--font-sans)',
                  }}
                />
              </div>
              {/* 清除开始日期 */}
              <div
                onClick={() => { setManualStart(null); setStartOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 10,
                  cursor: 'pointer', fontSize: 12.5,
                  color: manualStart === null ? 'var(--primary)' : 'var(--muted-foreground)',
                  background: manualStart === null ? 'var(--brand-50)' : 'transparent',
                }}
              >
                <span style={{ fontWeight: manualStart === null ? 600 : 500 }}>无开始日期</span>
                {manualStart === null && <Check style={{ width: 14, height: 14, marginLeft: 'auto', flexShrink: 0 }} />}
              </div>
            </div>
          </div>
        )}

        {/* 展开面板：截止时间选择 */}
        {dateOpen && (
          <div style={{ padding: '10px 24px 0' }}>
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
              {DATE_QUICK_DEADLINE.map((label) => {
                const ts = parseNaturalDateTime(label);
                const active = manualDeadline === ts;
                return (
                  <div
                    key={label}
                    onClick={() => { setManualDeadline(ts); setDateOpen(false); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 10,
                      cursor: 'pointer', fontSize: 12.5,
                      color: active ? 'var(--primary)' : 'var(--muted-foreground)',
                      background: active ? 'var(--brand-50)' : 'transparent',
                    }}
                  >
                    <span style={{ fontWeight: active ? 600 : 500 }}>{label}</span>
                    {ts && (
                      <span style={{ fontSize: 11, opacity: 0.8 }}>{formatDeadline(ts)}</span>
                    )}
                    {active && <Check style={{ width: 14, height: 14, marginLeft: 'auto', flexShrink: 0 }} />}
                  </div>
                );
              })}
              <div style={{ borderTop: '1px solid var(--border)', margin: '4px 8px' }} />
              {/* 自定义时间 */}
              <div style={{ padding: '7px 12px' }}>
                <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 6 }}>自定义时间</div>
                <input
                  type="datetime-local"
                  value={manualDeadline !== null ? toLocalInputValue(manualDeadline) : ''}
                  onChange={(e) => {
                    if (e.target.value) setManualDeadline(new Date(e.target.value).getTime());
                  }}
                  style={{
                    width: '100%', height: 30, padding: '0 8px', boxSizing: 'border-box',
                    border: '1px solid var(--input)', borderRadius: 8,
                    background: 'var(--background)', color: 'inherit',
                    fontSize: 12.5, outline: 'none', fontFamily: 'var(--font-sans)',
                  }}
                />
              </div>
              {/* 清除日期 */}
              <div
                onClick={() => { setManualDeadline(null); setDateOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 10,
                  cursor: 'pointer', fontSize: 12.5,
                  color: manualDeadline === null ? 'var(--primary)' : 'var(--muted-foreground)',
                  background: manualDeadline === null ? 'var(--brand-50)' : 'transparent',
                }}
              >
                <span style={{ fontWeight: manualDeadline === null ? 600 : 500 }}>无截止日期</span>
                {manualDeadline === null && <Check style={{ width: 14, height: 14, marginLeft: 'auto', flexShrink: 0 }} />}
              </div>
            </div>
          </div>
        )}

        {/* 操作按钮 */}
        <div style={{ padding: '16px 24px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <button
            onClick={onClose}
            style={{
              height: 36, fontSize: 13, color: 'var(--muted-foreground)', padding: '0 4px',
              border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}
          >
            取消
          </button>
          <button
            onClick={handleCreate}
            disabled={!title.trim()}
            style={{
              height: 40, padding: '0 24px', fontSize: 14, fontWeight: 600,
              borderRadius: 999, background: 'var(--primary)', color: 'var(--primary-foreground)',
              border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)',
              opacity: title.trim() ? 1 : 0.42,
            }}
          >
            创建任务
          </button>
        </div>
      </div>
    </div>
  );
}
