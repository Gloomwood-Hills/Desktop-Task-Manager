import { useState } from 'react';
import { X, Cloud } from 'lucide-react';
import { Settings, SortType } from '../data/types';

export type ThemeMode = 'light' | 'dark';

interface SettingsPanelProps {
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  settings: Settings | null;
  onChange: (patch: Partial<Settings>) => void;
  onClose: () => void;
}

type TabId = '外观' | '排序' | '提醒' | '使用说明' | '同步';

const TABS: { id: TabId; disabled?: boolean }[] = [
  { id: '外观' },
  { id: '排序' },
  { id: '提醒' },
  { id: '使用说明' },
  { id: '同步', disabled: true },
];

const SORT_OPTIONS: { label: string; value: SortType }[] = [
  { label: '按创建时间', value: 'createdAt' },
  { label: '按截止时间', value: 'deadline' },
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
  const [sortType, setSortType] = useState<SortType>(settings?.sortType ?? 'deadline');
  const [priorityTop, setPriorityTop] = useState(settings?.importantTop ?? false);
  const [reminderOffset, setReminderOffset] = useState(settings?.reminderOffset ?? 86400);
  const [winNotify, setWinNotify] = useState(settings?.reminderEnabled ?? true);
  const [autoPin, setAutoPin] = useState(settings?.autoPin ?? true);
  const [autoStart, setAutoStart] = useState(settings?.autoStart ?? true);
  const [deadlineGradient, setDeadlineGradient] = useState(settings?.deadlineGradient ?? true);

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

              <div style={rowStyle}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <label style={labelStyle}>开机自启动</label>
                  <p style={descStyle}>登录 Windows 后自动在桌面层显示</p>
                </div>
                <div style={switchStyle} onClick={() => { setAutoStart(!autoStart); onChange({ autoStart: !autoStart }); }}>
                  <span style={switchTrack(autoStart)} />
                  <span style={{ ...switchThumb, transform: autoStart ? 'translateX(20px)' : 'none' }} />
                </div>
              </div>

              <div style={rowStyle}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <label style={labelStyle}>截止时间按日期渐变</label>
                  <p style={descStyle}>开启时随日期临近由白渐变至红色；关闭时直接显示红色</p>
                </div>
                <div style={switchStyle} onClick={() => { setDeadlineGradient(!deadlineGradient); onChange({ deadlineGradient: !deadlineGradient }); }}>
                  <span style={switchTrack(deadlineGradient)} />
                  <span style={{ ...switchThumb, transform: deadlineGradient ? 'translateX(20px)' : 'none' }} />
                </div>
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
                  <p style={descStyle}>标注"重要"的任务始终置顶在前列</p>
                </div>
                <div style={switchStyle} onClick={() => { setPriorityTop(!priorityTop); onChange({ importantTop: !priorityTop }); }}>
                  <span style={switchTrack(priorityTop)} />
                  <span style={{ ...switchThumb, transform: priorityTop ? 'translateX(20px)' : 'none' }} />
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
                <div style={switchStyle} onClick={() => { setAutoPin(!autoPin); onChange({ autoPin: !autoPin }); }}>
                  <span style={switchTrack(autoPin)} />
                  <span style={{ ...switchThumb, transform: autoPin ? 'translateX(20px)' : 'none' }} />
                </div>
              </div>
            </section>
          )}

          {/* ===== 使用说明 ===== */}
          {tab === '使用说明' && (
            <section>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)', marginBottom: 12 }}>基本操作</div>
              {[
                ['新建任务', '在窗口底部点击"+ 添加任务"，或在顶部输入框直接输入标题后回车。'],
                ['自然语言日期', '支持"明天"、"后天"、"下周一"、"月底"、"8月9日"、"2026.8.9"、"一小时后"等，并可在"今天下午三点"中解析具体时间。'],
                ['文件夹', '右键任务可选择"移动到文件夹"；右键文件夹可新建子文件夹、重命名、删除。'],
                ['重要任务', '新建/编辑任务时可勾选"重要"，重要任务将置顶显示。'],
                ['完成与恢复', '点击任务左侧复选框标记完成；已完成任务可在底部"已完成"区域查看，支持右键恢复。'],
              ].map(([title, desc]) => (
                <div key={title} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--foreground)' }}>{title}</div>
                  <p style={{ fontSize: 12, margin: '3px 0 0', color: 'var(--muted-foreground)', lineHeight: 1.6 }}>{desc}</p>
                </div>
              ))}

              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)', margin: '20px 0 12px' }}>排序与提醒</div>
              {[
                ['排序方式', '在"排序"页可设置默认排序（按创建时间/截止时间/名称/手动）；手动排序时可直接拖拽任务调整顺序。'],
                ['提醒', '在"提醒"页设置提前提醒时间与是否开启系统通知；任务到达提醒时间后应用内弹窗提示，并可选择自动置顶。'],
                ['截止时间渐变', '在"外观"页开启"截止时间按日期渐变"后，截止日期随临近由白色渐变为红色；关闭则直接显示红色。'],
              ].map(([title, desc]) => (
                <div key={title} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--foreground)' }}>{title}</div>
                  <p style={{ fontSize: 12, margin: '3px 0 0', color: 'var(--muted-foreground)', lineHeight: 1.6 }}>{desc}</p>
                </div>
              ))}

              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)', margin: '20px 0 12px' }}>数据说明</div>
              <p style={{ fontSize: 12, margin: 0, color: 'var(--muted-foreground)', lineHeight: 1.6 }}>
                所有数据仅保存在本机应用数据目录（SQLite），不会上传到任何服务器。卸载应用时如需保留数据，请使用卸载脚本的保留数据选项；如需彻底清除，可删除数据目录。
              </p>
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
