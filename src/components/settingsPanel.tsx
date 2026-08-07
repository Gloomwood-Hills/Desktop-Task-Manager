import { useState } from 'react';
import { X, Cloud, Check } from 'lucide-react';
import { Settings, SortType } from '../data/types';

export type ThemeMode = 'light' | 'dark';

interface SettingsPanelProps {
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  settings: Settings | null;
  onChange: (patch: Partial<Settings>) => void;
  onClose: () => void;
}

type TabId = '外观' | '排序' | '提醒' | '同步';

const TABS: { id: TabId; disabled?: boolean }[] = [
  { id: '外观' },
  { id: '排序' },
  { id: '提醒' },
  { id: '同步', disabled: true },
];

const SORT_OPTIONS: { label: string; value: SortType }[] = [
  { label: '按创建时间', value: 'createdAt' },
  { label: '按截止时间', value: 'deadline' },
  { label: '按优先级', value: 'priority' },
  { label: '按名称', value: 'name' },
  { label: '手动排序', value: 'manual' },
];

const REMINDER_OPTIONS: { label: string; value: number }[] = [
  { label: '提前1天', value: 86400 },
  { label: '提前3小时', value: 10800 },
  { label: '提前1小时', value: 3600 },
  { label: '提前30分钟', value: 1800 },
  { label: '不提醒', value: 0 },
];

/** 设置面板（右侧滑入，对齐设计稿 settings） */
export default function SettingsPanel({ theme, onThemeChange, settings, onChange, onClose }: SettingsPanelProps) {
  const [tab, setTab] = useState<TabId>('外观');
  // 从持久化设置初始化
  const [glassEffect, setGlassEffect] = useState(settings?.glassEffect ?? true);
  const [transparency, setTransparency] = useState(Math.round((settings?.transparency ?? 0.8) * 100));
  const [deadlineColor, setDeadlineColor] = useState('red');
  const [sortType, setSortType] = useState<SortType>(settings?.sortType ?? 'deadline');
  const [priorityTop, setPriorityTop] = useState(true);
  const [hideNotStarted, setHideNotStarted] = useState(true);
  const [reminderOffset, setReminderOffset] = useState(settings?.reminderOffset ?? 86400);
  const [winNotify, setWinNotify] = useState(settings?.reminderEnabled ?? true);
  const [autoPin, setAutoPin] = useState(true);

  const switchStyle: React.CSSProperties = {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    flexShrink: 0,
    marginLeft: 12,
  };
  const switchTrack = (on: boolean): React.CSSProperties => ({
    display: 'block',
    width: 44,
    height: 24,
    borderRadius: 999,
    cursor: 'pointer',
    transition: 'background-color .18s ease',
    background: on ? 'var(--primary)' : 'var(--border)',
  });
  const switchThumb: React.CSSProperties = {
    position: 'absolute',
    left: 2,
    top: 2,
    width: 20,
    height: 20,
    borderRadius: '50%',
    transition: 'transform .18s ease',
    background: 'var(--background)',
    boxShadow: 'var(--shadow-xs)',
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--foreground)' };
  const descStyle: React.CSSProperties = { fontSize: 12, margin: '2px 0 0', color: 'var(--muted-foreground)' };

  const selectWrapper: React.CSSProperties = { position: 'relative' };
  const selectStyle: React.CSSProperties = {
    width: '100%',
    height: 40,
    padding: '0 32px 0 12px',
    borderRadius: 'calc(var(--radius) * 0.8)',
    fontSize: 13,
    appearance: 'none',
    cursor: 'pointer',
    border: '1px solid var(--input)',
    background: 'var(--background)',
    color: 'var(--foreground)',
    fontFamily: 'var(--font-sans)',
  };

  const colorSchemes = [
    { id: 'red', bg: 'var(--state-error)', label: '红色方案' },
    { id: 'yellow', bg: '#ff9500', label: '黄色方案' },
    { id: 'blue', bg: 'var(--primary)', label: '蓝色方案' },
    { id: 'green', bg: 'var(--state-success)', label: '绿色方案' },
  ];

  return (
    <>
      {/* Scrim */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 2,
        background: 'rgba(0,0,0,0.15)',
        animation: 'settings-scrim-fade 0.2s ease',
      }} onClick={onClose} />

      {/* 设置面板 */}
      <div style={{
        position: 'fixed',
        top: 0, right: 0, bottom: 0,
        zIndex: 10,
        width: 420,
        maxWidth: '92%',
        display: 'flex',
        flexDirection: 'column',
        animation: 'settings-slide-in 0.22s cubic-bezier(0.32, 0.72, 0, 1)',
        background: 'color-mix(in srgb, var(--background) 82%, transparent)',
        WebkitBackdropFilter: 'saturate(180%) blur(60px)',
        backdropFilter: 'saturate(180%) blur(60px)',
        borderRadius: '16px 0 0 16px',
        boxShadow: '-4px 0 32px rgba(0,0,0,0.12), -1px 0 0 color-mix(in srgb, var(--border) 50%, transparent)',
        color: 'var(--foreground)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 12px', flexShrink: 0 }}>
          <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--foreground)', whiteSpace: 'nowrap' }}>设置</span>
          <button
            onClick={onClose}
            aria-label="关闭设置"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, borderRadius: 'calc(var(--radius) * 0.6)',
              border: 'none', background: 'transparent', color: 'var(--icon-muted)', cursor: 'pointer',
              transition: 'background-color .18s ease, color .18s ease',
            }}
          >
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', alignItems: 'stretch', padding: '0 20px', flexShrink: 0,
          borderBottom: '0.5px solid var(--border)',
        }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              disabled={t.disabled}
              onClick={() => setTab(t.id)}
              style={{
                padding: '8px 14px 10px',
                fontSize: 13,
                fontWeight: tab === t.id ? 600 : 500,
                color: tab === t.id ? 'var(--primary)' : 'var(--muted-foreground)',
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${tab === t.id ? 'var(--primary)' : 'transparent'}`,
                cursor: t.disabled ? 'not-allowed' : 'pointer',
                opacity: t.disabled ? 0.4 : 1,
                whiteSpace: 'nowrap',
                fontFamily: 'var(--font-sans)',
                transition: 'color .18s ease, border-color .18s ease',
              }}
            >
              {t.id}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 20px 24px' }}>

          {/* ===== 外观 ===== */}
          {tab === '外观' && (
            <section>
              {/* 主题 */}
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>主题</label>
                <div style={{ display: 'inline-flex', borderRadius: 999, padding: 2, background: 'var(--muted)', border: '1px solid var(--border)', marginTop: 8 }}>
                  {(['light', 'dark'] as ThemeMode[]).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => onThemeChange(mode)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '5px 16px', borderRadius: 999, fontSize: 13, fontWeight: 600,
                        border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)',
                        background: theme === mode ? 'var(--background)' : 'transparent',
                        color: theme === mode ? 'var(--foreground)' : 'var(--muted-foreground)',
                        boxShadow: theme === mode ? 'var(--shadow-sm)' : 'none',
                      }}
                    >
                      {mode === 'light' ? '浅色' : '深色'}
                    </button>
                  ))}
                </div>
              </div>

              {/* 毛玻璃 */}
              <div style={rowStyle}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <label style={labelStyle}>毛玻璃效果</label>
                  <p style={descStyle}>窗口背景启用 Mica 半透明效果</p>
                </div>
                <div style={switchStyle} onClick={() => { setGlassEffect(!glassEffect); onChange({ glassEffect: !glassEffect }); }}>
                  <span style={switchTrack(glassEffect)} />
                  <span style={{ ...switchThumb, transform: glassEffect ? 'translateX(20px)' : 'none' }} />
                </div>
              </div>

              {/* 透明度 */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <label style={labelStyle}>透明度</label>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--primary)', fontVariantNumeric: 'tabular-nums' }}>
                    {transparency}%
                  </span>
                </div>
                <input
                  type="range"
                  min={20}
                  max={100}
                  value={transparency}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setTransparency(v);
                    onChange({ transparency: v / 100 });
                  }}
                  style={{
                    width: '100%', height: 6, borderRadius: 999, appearance: 'none', cursor: 'pointer',
                    background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${(transparency - 20) / 80 * 100}%, var(--border) ${(transparency - 20) / 80 * 100}%, var(--border) 100%)`,
                  }}
                  aria-label="透明度"
                />
                <p style={descStyle}>调整窗口背景的不透明程度</p>
              </div>

              {/* 截止日期配色 */}
              <div>
                <label style={labelStyle}>截止日期配色</label>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginTop: 8 }}>
                  {colorSchemes.map((c) => (
                    <div key={c.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                      <button
                        onClick={() => setDeadlineColor(c.id)}
                        style={{
                          width: 32, height: 32, borderRadius: '50%', border: 'none',
                          background: c.bg, cursor: 'pointer', padding: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                        aria-label={c.label}
                      >
                        {deadlineColor === c.id && <Check style={{ width: 14, height: 14, color: '#fff' }} />}
                      </button>
                      <span style={{ fontSize: 11, whiteSpace: 'nowrap', color: 'var(--muted-foreground)' }}>{c.label}</span>
                    </div>
                  ))}
                </div>
                <p style={descStyle}>用于标记即将到期的任务颜色</p>
              </div>
            </section>
          )}

          {/* ===== 排序 ===== */}
          {tab === '排序' && (
            <section>
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>默认排序方式</label>
                <div style={selectWrapper}>
                  <select
                    value={sortType}
                    onChange={(e) => {
                      const v = e.target.value as SortType;
                      setSortType(v);
                      onChange({ sortType: v });
                    }}
                    style={{ ...selectStyle, marginTop: 8 }}
                    aria-label="默认排序方式"
                  >
                    {SORT_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                  <span style={{ position: 'absolute', right: 12, top: 'calc(50% + 4px)', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--icon-muted)' }}>
                    <span style={{ fontSize: 12 }}>▼</span>
                  </span>
                </div>
              </div>

              <div style={rowStyle}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <label style={labelStyle}>重要任务置顶</label>
                  <p style={descStyle}>高优先级任务始终显示在列表顶部</p>
                </div>
                <div style={switchStyle} onClick={() => setPriorityTop(!priorityTop)}>
                  <span style={switchTrack(priorityTop)} />
                  <span style={{ ...switchThumb, transform: priorityTop ? 'translateX(20px)' : 'none' }} />
                </div>
              </div>

              <div style={rowStyle}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <label style={labelStyle}>隐藏未开始任务</label>
                  <p style={descStyle}>开始日期之前的任务不显示在列表中</p>
                </div>
                <div style={switchStyle} onClick={() => setHideNotStarted(!hideNotStarted)}>
                  <span style={switchTrack(hideNotStarted)} />
                  <span style={{ ...switchThumb, transform: hideNotStarted ? 'translateX(20px)' : 'none' }} />
                </div>
              </div>
            </section>
          )}

          {/* ===== 提醒 ===== */}
          {tab === '提醒' && (
            <section>
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>默认提醒时间</label>
                <div style={selectWrapper}>
                  <select
                    value={reminderOffset}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setReminderOffset(v);
                      onChange({ reminderOffset: v });
                    }}
                    style={{ ...selectStyle, marginTop: 8 }}
                    aria-label="默认提醒时间"
                  >
                    {REMINDER_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                  <span style={{ position: 'absolute', right: 12, top: 'calc(50% + 4px)', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--icon-muted)' }}>
                    <span style={{ fontSize: 12 }}>▼</span>
                  </span>
                </div>
              </div>

              <div style={rowStyle}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <label style={labelStyle}>开启 Windows 通知</label>
                  <p style={descStyle}>在系统通知中心显示任务提醒</p>
                </div>
                <div style={switchStyle} onClick={() => { setWinNotify(!winNotify); onChange({ reminderEnabled: !winNotify }); }}>
                  <span style={switchTrack(winNotify)} />
                  <span style={{ ...switchThumb, transform: winNotify ? 'translateX(20px)' : 'none' }} />
                </div>
              </div>

              <div style={rowStyle}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <label style={labelStyle}>提醒后自动置顶</label>
                  <p style={descStyle}>任务到达提醒时间后自动置顶显示</p>
                </div>
                <div style={switchStyle} onClick={() => setAutoPin(!autoPin)}>
                  <span style={switchTrack(autoPin)} />
                  <span style={{ ...switchThumb, transform: autoPin ? 'translateX(20px)' : 'none' }} />
                </div>
              </div>
            </section>
          )}

          {/* ===== 同步（禁用） ===== */}
          {tab === '同步' && (
            <section style={{ opacity: 0.5 }}>
              <div style={{ borderRadius: 'calc(var(--radius) * 0.8)', padding: '14px 16px', background: 'var(--muted)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <Cloud style={{ width: 16, height: 16, color: 'var(--muted-foreground)' }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted-foreground)' }}>WebDAV 同步将在 V1.1 版本中推出</span>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
