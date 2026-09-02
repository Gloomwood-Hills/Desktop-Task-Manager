import { useState } from 'react';
import { X, Cloud, BookOpen, ChevronDown } from 'lucide-react';
import { Settings, SortType } from '../data/types';
import { probeRemote, syncAuto } from '../data/sync';
import type { SyncSettings } from '../data/sync';

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
  const [autoSync, setAutoSync] = useState(settings?.autoSync ?? true);

  // ===== 同步 tab 状态 =====
  /** 最近一次同步/连接测试结果（ok 决定状态区颜色） */
  const [syncResult, setSyncResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  /** 坚果云账密获取指南是否展开 */
  const [guideOpen, setGuideOpen] = useState(false);

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
  /** 次级操作按钮（连接测试） */
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

  /** 一键更新：合并式同步（拉取→合并→写回两端），无需选择方向；成功后记录上次同步时间与操作 */
  const handleOneClickSync = async () => {
    if (syncBusy) return;
    setSyncBusy(true);
    try {
      const result = await syncAuto(buildSyncSettings(), settings?.lastSyncedAt ?? null);
      setSyncResult({ ok: result.status !== 'error', message: result.message });
      // merged→合并 / uploaded→上传 / downloaded→下载；skipped 无需写
      if (result.status === 'merged' || result.status === 'uploaded' || result.status === 'downloaded') {
        onChange({
          lastSyncedAt: Date.now(),
          lastSyncAction: result.status === 'merged' ? 'merged' : result.status === 'uploaded' ? 'upload' : 'download',
        });
      }
    } catch (error) {
      setSyncResult({ ok: false, message: `同步失败：${error instanceof Error ? error.message : String(error)}` });
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
        <div style={{
          flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 20px 24px',
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
          touchAction: 'pan-y',
        }}>

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
                  可开启下方「自动同步」，应用会在启动、数据变更（30 秒后）与每 60 分钟自动双向合并同步；
                  也可点击「一键更新」手动同步：自动合并云端与本地，无需选择方向。
                  密码仅保存在本机数据库，不会上传到任何地方。
                </p>
              </div>

              {/* 自动同步开关（V2.1 Task 7）：绑定 Settings.autoSync，切换即持久化 */}
              <div style={rowStyle}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <label style={labelStyle}>自动同步</label>
                  <p style={descStyle}>开启后应用会在启动、数据变更（30 秒后）与每 60 分钟自动双向合并同步</p>
                </div>
                <div style={switchStyle} onClick={() => { setAutoSync(!autoSync); onChange({ autoSync: !autoSync }); }}>
                  <span style={switchTrack(autoSync)} />
                  <span style={{ ...switchThumb, transform: autoSync ? 'translateX(20px)' : 'none' }} />
                </div>
              </div>

              {/* 坚果云账密获取指南（可展开） */}
              <div style={{ marginBottom: 20 }}>
                <button
                  onClick={() => setGuideOpen(!guideOpen)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    width: '100%', padding: '10px 14px', cursor: 'pointer',
                    borderRadius: 'calc(var(--radius) * 0.8)',
                    border: '1px solid var(--border)', background: 'transparent',
                    color: 'var(--foreground)', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600,
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <BookOpen style={{ width: 15, height: 15, color: 'var(--primary)' }} />
                    如何获取坚果云账密
                  </span>
                  <ChevronDown style={{
                    width: 15, height: 15, color: 'var(--muted-foreground)',
                    transition: 'transform .18s ease', transform: guideOpen ? 'rotate(180deg)' : 'none',
                  }} />
                </button>
                {guideOpen && (
                  <div style={{
                    marginTop: 8, padding: '12px 14px',
                    borderRadius: 'calc(var(--radius) * 0.8)',
                    background: 'var(--muted)', border: '1px solid var(--border)',
                  }}>
                    <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.8, color: 'var(--foreground)' }}>
                      <li>注册并登录坚果云（免费）：访问 <span style={{ color: 'var(--primary)' }}>jianguoyun.com</span>，用邮箱注册账号</li>
                      <li>点击右上角头像 → <b>账户信息</b></li>
                      <li>进入 <b>安全选项</b>，找到「第三方应用管理」</li>
                      <li>点击 <b>添加应用</b>，名称随意（如 DesktopTaskManager），确认后生成 16 位 <b>应用密码</b>（仅显示一次，请先复制保存）</li>
                      <li>回到本应用填写：
                        <div style={{ marginTop: 4, paddingLeft: 12, color: 'var(--muted-foreground)', lineHeight: 1.8 }}>
                          服务器地址：<code>https://dav.jianguoyun.com/dav/</code><br />
                          账号：坚果云<b>登录邮箱</b><br />
                          密码：第 4 步生成的<b>应用密码</b>
                        </div>
                      </li>
                    </ol>
                    <p style={{ ...descStyle, marginTop: 10, lineHeight: 1.6 }}>
                      提示：WebDAV 必须使用「应用密码」，坚果云不允许直接用登录密码访问；建议每台设备单独添加一个应用，密码可随时在「第三方应用管理」中撤销。
                    </p>
                  </div>
                )}
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

              {/* 操作区：一键更新（合并式同步）+ 连接测试 */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <button onClick={handleOneClickSync} disabled={syncBusy} style={secondaryBtn}>
                  一键更新
                </button>
                <button onClick={handleProbe} disabled={syncBusy} style={{ ...secondaryBtn, flex: '0 0 auto', padding: '0 16px' }}>
                  连接测试
                </button>
              </div>

              {/* 状态区：上次同步时间 + 操作 + 最近一次结果 */}
              <div style={{
                borderRadius: 'calc(var(--radius) * 0.8)', padding: '12px 14px',
                background: 'var(--muted)', border: '1px solid var(--border)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>上次同步</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)', fontVariantNumeric: 'tabular-nums' }}>
                    {settings?.lastSyncedAt
                      ? `${formatSyncTime(settings.lastSyncedAt)} · ${settings.lastSyncAction === 'download' ? '下载' : settings.lastSyncAction === 'upload' ? '上传' : settings.lastSyncAction === 'merged' ? '合并' : '未知'}`
                      : '尚未同步'}
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
