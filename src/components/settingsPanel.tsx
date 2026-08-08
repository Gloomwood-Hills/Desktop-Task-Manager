import { useState } from 'react';
import { X, Cloud } from 'lucide-react';
import { Settings, SortType } from '../data/types';
import { probeRemote, uploadLocal, downloadRemote, syncAuto } from '../data/sync';
import type { SyncSettings } from '../data/sync';
import { ConfirmDialog } from './dialogPrompt';

export type ThemeMode = 'light' | 'dark';

interface SettingsPanelProps {
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  settings: Settings | null;
  onChange: (patch: Partial<Settings>) => void;
  onClose: () => void;
  /** 同步写库完成后回调（App 侧刷新任务数据） */
  onSyncComplete?: () => void;
}

type TabId = '外观' | '排序' | '提醒' | '同步';

const TABS: { id: TabId; disabled?: boolean }[] = [
  { id: '外观' },
  { id: '排序' },
  { id: '提醒' },
  { id: '同步' },
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
export default function SettingsPanel({ theme, onThemeChange, settings, onChange, onClose, onSyncComplete }: SettingsPanelProps) {
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

  // ===== 同步 tab 状态 =====
  /** 最近一次同步/连接测试结果（ok 决定状态区颜色） */
  const [syncResult, setSyncResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  /** 待确认的强制覆盖操作：upload=上传覆盖 / download=下载覆盖，null 表示无 */
  const [pendingForce, setPendingForce] = useState<'upload' | 'download' | null>(null);

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

  // ===== 同步 tab 样式 =====
  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: 40,
    padding: '0 12px',
    borderRadius: 'calc(var(--radius) * 0.8)',
    fontSize: 13,
    border: '1px solid var(--input)',
    background: 'var(--background)',
    color: 'var(--foreground)',
    fontFamily: 'var(--font-sans)',
    outline: 'none',
    boxSizing: 'border-box',
  };
  /** 主操作按钮（立即同步） */
  const primaryBtn: React.CSSProperties = {
    flex: 1,
    height: 38,
    borderRadius: 999,
    border: 'none',
    background: 'var(--primary)',
    color: 'var(--primary-foreground)',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
  };
  /** 次级操作按钮（连接测试/上传覆盖/下载覆盖） */
  const secondaryBtn: React.CSSProperties = {
    flex: 1,
    height: 38,
    borderRadius: 999,
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--foreground)',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
  };

  // ===== 同步操作 =====

  /** 由持久化 Settings 构造 WebDAV 同步设置（密码只读自本地 Settings，不落日志） */
  const buildSyncSettings = (): SyncSettings => ({
    webdavUrl: settings?.webdavUrl ?? '',
    webdavUsername: settings?.webdavUsername ?? '',
    webdavPassword: settings?.webdavPassword ?? '',
  });

  /** 同步成功后统一收尾：记录上次同步时间戳 + 通知 App 刷新数据 */
  const handleSyncSuccess = () => {
    onChange({ lastSyncedAt: Date.now() });
    onSyncComplete?.();
  };

  /** 立即同步：由引擎按时间戳做增量决策（本地/远端较新者胜） */
  const handleSyncNow = async () => {
    if (!settings || syncBusy) return;
    setSyncBusy(true);
    try {
      const result = await syncAuto(buildSyncSettings(), settings.lastSyncedAt ?? null);
      setSyncResult({ ok: result.status !== 'error', message: result.message });
      if (result.status === 'uploaded' || result.status === 'downloaded') handleSyncSuccess();
    } catch (error) {
      setSyncResult({ ok: false, message: error instanceof Error ? error.message : String(error) });
    } finally {
      setSyncBusy(false);
    }
  };

  /** 连接测试：探测远端备份是否存在及最后导出时间 */
  const handleProbe = async () => {
    if (syncBusy) return;
    setSyncBusy(true);
    try {
      const probe = await probeRemote(buildSyncSettings());
      setSyncResult({
        ok: true,
        message: probe.remoteExists
          ? `连接成功，远端存在备份${probe.remoteExportedAt ? `（最后导出 ${formatSyncTime(probe.remoteExportedAt)}）` : ''}`
          : '连接成功，远端暂无备份（首次同步将自动上传本地数据）',
      });
    } catch (error) {
      setSyncResult({ ok: false, message: `连接失败：${error instanceof Error ? error.message : String(error)}` });
    } finally {
      setSyncBusy(false);
    }
  };

  /** 强制上传/下载：确认后执行整体覆盖（下载会覆盖本地，故需二次确认） */
  const handleForceSync = async (action: 'upload' | 'download') => {
    setPendingForce(null);
    if (syncBusy) return;
    setSyncBusy(true);
    try {
      const result = action === 'upload'
        ? await uploadLocal(buildSyncSettings())
        : await downloadRemote(buildSyncSettings());
      setSyncResult({ ok: result.status !== 'error', message: result.message });
      if (result.status === 'uploaded' || result.status === 'downloaded') handleSyncSuccess();
    } catch (error) {
      setSyncResult({ ok: false, message: error instanceof Error ? error.message : String(error) });
    } finally {
      setSyncBusy(false);
    }
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

          {/* ===== 同步 ===== */}
          {tab === '同步' && (
            <section>
              {/* 说明文案 */}
              <div style={{
                borderRadius: 'calc(var(--radius) * 0.8)', padding: '12px 14px',
                background: 'var(--muted)', border: '1px solid var(--border)', marginBottom: 20,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Cloud style={{ width: 16, height: 16, color: 'var(--primary)' }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>WebDAV 云备份</span>
                </div>
                <p style={{ ...descStyle, lineHeight: 1.6 }}>
                  填写任意 WebDAV 服务器（如坚果云免费空间 dav.jianguoyun.com/dav/），即可把任务数据备份到云端。
                  本应用采用手动同步，不会自动实时上传；建议重要操作后点击「立即同步」。
                  密码仅保存在本机数据库，不会上传到任何地方。
                </p>
              </div>

              {/* WebDAV 配置：输入即保存（沿用其他 tab 的 onChange 持久化模式） */}
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>服务器地址</label>
                <input
                  type="url"
                  value={settings?.webdavUrl ?? ''}
                  placeholder="https://dav.jianguoyun.com/dav/"
                  onChange={(e) => onChange({ webdavUrl: e.target.value })}
                  style={{ ...inputStyle, marginTop: 8 }}
                  aria-label="WebDAV 服务器地址"
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>账号</label>
                <input
                  type="text"
                  value={settings?.webdavUsername ?? ''}
                  placeholder="WebDAV 账号"
                  autoComplete="off"
                  onChange={(e) => onChange({ webdavUsername: e.target.value })}
                  style={{ ...inputStyle, marginTop: 8 }}
                  aria-label="WebDAV 账号"
                />
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>密码</label>
                <input
                  type="password"
                  value={settings?.webdavPassword ?? ''}
                  placeholder="WebDAV 密码"
                  autoComplete="off"
                  onChange={(e) => onChange({ webdavPassword: e.target.value })}
                  style={{ ...inputStyle, marginTop: 8 }}
                  aria-label="WebDAV 密码"
                />
              </div>

              {/* 操作区 */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <button onClick={handleSyncNow} disabled={syncBusy} style={{ ...primaryBtn, opacity: syncBusy ? 0.6 : 1 }}>
                  {syncBusy ? '同步中…' : '立即同步'}
                </button>
                <button onClick={handleProbe} disabled={syncBusy} style={{ ...secondaryBtn, flex: '0 0 auto', padding: '0 16px' }}>
                  连接测试
                </button>
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <button onClick={() => setPendingForce('upload')} disabled={syncBusy} style={secondaryBtn}>上传覆盖</button>
                <button onClick={() => setPendingForce('download')} disabled={syncBusy} style={secondaryBtn}>下载覆盖</button>
              </div>

              {/* 状态区：上次同步时间 + 最近一次结果 */}
              <div style={{
                borderRadius: 'calc(var(--radius) * 0.8)', padding: '12px 14px',
                background: 'var(--muted)', border: '1px solid var(--border)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>上次同步</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)', fontVariantNumeric: 'tabular-nums' }}>
                    {formatSyncTime(settings?.lastSyncedAt ?? null)}
                  </span>
                </div>
                {syncResult && (
                  <p style={{
                    fontSize: 12.5, margin: 0, lineHeight: 1.6,
                    color: syncResult.ok ? 'var(--foreground)' : 'var(--destructive)',
                  }}>
                    {syncResult.message}
                  </p>
                )}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* 强制覆盖二次确认：渲染在面板外层，避免面板 backdrop-filter 影响 fixed 定位 */}
      {pendingForce && (
        <ConfirmDialog
          title={pendingForce === 'upload' ? '上传覆盖' : '下载覆盖'}
          message={pendingForce === 'upload'
            ? '将本地全部数据上传并覆盖云端备份。若云端存在其他设备更新的数据，将以本地为准覆盖。'
            : '将云端备份下载并覆盖本地全部数据，本地尚未同步的修改将丢失。'}
          confirmText="确认"
          destructive={pendingForce === 'download'}
          onConfirm={() => handleForceSync(pendingForce)}
          onCancel={() => setPendingForce(null)}
        />
      )}
    </>
  );
}

/** 同步时间格式化：`2026.8.8 14:30`，无时间返回"尚未同步" */
function formatSyncTime(ts: number | null): string {
  if (!ts) return '尚未同步';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
