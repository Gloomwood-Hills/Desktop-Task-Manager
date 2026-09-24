import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, Check, Cloud, BookOpen, ChevronDown } from 'lucide-react';
import { Settings, SyncPolicy, DEFAULT_WEBDAV_URL } from '../data/types';
import { glassSurface } from './utils/glass';
import { DEFAULT_AI_BASE_URL, testAiConnection } from '../services/aiClient';
import { probeRemote, syncAuto, logSync, getSyncLogs, clearSyncLogs, exportSyncLogsText, setSyncUiState } from '../data/sync';
import type { SyncSettings, SyncLogEntry } from '../data/sync';
import { isMobile } from '../data/platform';

export type ThemeMode = 'light' | 'dark';

interface SettingsPanelProps {
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  settings: Settings | null;
  onChange: (patch: Partial<Settings>) => void;
  /** 用户点击后请求系统通知权限并发送测试通知。 */
  onTestNotification: () => Promise<{ ok: boolean; message: string }>;
  onClose: () => void;
}

type TabId = '外观' | '提醒' | '同步' | 'AI' | '排障';

const TABS: { id: TabId; disabled?: boolean }[] = [
  { id: '外观' },
  { id: '提醒' },
  { id: '同步' },
  { id: 'AI' },
  { id: '排障' },
];

/** 常用 OpenAI 兼容 AI 服务预设：只帮助填写 BaseURL，不替用户决定模型。 */
const AI_PRESETS: { name: string; baseUrl: string }[] = [
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1' },
  { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
  { name: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { name: 'Moonshot', baseUrl: 'https://api.moonshot.cn/v1' },
  { name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
  { name: 'SiliconFlow', baseUrl: 'https://api.siliconflow.cn/v1' },
];

/** 设置面板（右侧滑入，对齐设计稿 settings） */
export default function SettingsPanel({ theme, onThemeChange, settings, onChange, onTestNotification, onClose }: SettingsPanelProps) {
  const [tab, setTab] = useState<TabId>('外观');
  // 从持久化设置初始化
  const [glassEffect, setGlassEffect] = useState(settings?.glassEffect ?? true);
  const [transparency, setTransparency] = useState(Math.round((settings?.transparency ?? 0.8) * 100));
  const [winNotify, setWinNotify] = useState(settings?.reminderEnabled ?? true);
  const [autoPin, setAutoPin] = useState(settings?.autoPin ?? true);
  const [importantTop, setImportantTop] = useState(settings?.importantTop ?? false);
  const [autoStart, setAutoStart] = useState(settings?.autoStart ?? true);
  const [autoSync, setAutoSync] = useState(settings?.autoSync ?? true);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [notificationResult, setNotificationResult] = useState<{ ok: boolean; message: string } | null>(null);

  const handleTestNotification = async () => {
    setNotificationBusy(true);
    setNotificationResult(null);
    try {
      setNotificationResult(await onTestNotification());
    } finally {
      setNotificationBusy(false);
    }
  };

  // AI tab 本地受控状态（输入即时响应，持久化异步不阻塞键入）
  const [aiBaseUrl, setAiBaseUrl] = useState(settings?.aiBaseUrl ?? '');
  const [aiApiKey, setAiApiKey] = useState(settings?.aiApiKey ?? '');
  const [aiModel, setAiModel] = useState(settings?.aiModel ?? '');

  // ===== 同步 tab 状态 =====
  /** 最近一次同步/连接测试结果（ok 决定状态区颜色） */
  const [syncResult, setSyncResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  /** 坚果云账密获取指南是否展开 */
  const [guideOpen, setGuideOpen] = useState(false);

  // ===== AI tab 状态 =====
  /** 最近一次 AI 连接测试结果 */
  const [aiResult, setAiResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  /** AI 测试连接：用当前已填配置发一条极短消息 */
  const handleTestAi = async () => {
    const baseUrl = aiBaseUrl.trim() || DEFAULT_AI_BASE_URL;
    const apiKey = aiApiKey;
    const model = aiModel.trim();
    if (!apiKey.trim()) { setAiResult({ ok: false, message: '请先填写 API Key' }); return; }
    if (!model) { setAiResult({ ok: false, message: '请先填写模型名' }); return; }
    setAiBusy(true);
    try {
      await testAiConnection({ baseUrl, apiKey, model });
      setAiResult({ ok: true, message: '连接成功，AI 助手可用' });
    } catch (error) {
      setAiResult({ ok: false, message: `连接失败：${error instanceof Error ? error.message : String(error)}` });
    } finally {
      setAiBusy(false);
    }
  };

  /** 点击常用服务预设：只填入 BaseURL（API Key 与模型均由用户自行填写） */
  const applyAiPreset = (p: { name: string; baseUrl: string }) => {
    setAiBaseUrl(p.baseUrl);
    onChange({ aiBaseUrl: p.baseUrl });
    setAiResult(null);
  };

  // ===== 排障 tab 状态 =====
  const [logs, setLogs] = useState<SyncLogEntry[]>([]);
  const [diagCopied, setDiagCopied] = useState(false);
  /** 进入排障 tab 时刷新日志 */
  useEffect(() => {
    if (tab === '排障') {
      setLogs(getSyncLogs());
      setDiagCopied(false);
    }
  }, [tab]);

  /** 构造"诊断信息"纯文本：状态自查摘要 + 全部日志 */
  const buildDiagText = (): string => {
    const s = settings;
    const lines: string[] = [
      '===== HiTask 同步诊断信息 =====',
      `服务器：${s?.webdavUrl || DEFAULT_WEBDAV_URL}`,
      `账号：${s?.webdavUsername ? '已填写' : '未填写'}`,
      `应用密码：${s?.webdavPassword ? '已填写' : '未填写'}`,
      `自动同步：${s?.autoSync ? '开' : '关'}`,
      `上次同步：${s?.lastSyncedAt ? formatSyncTime(s.lastSyncedAt) : '无'}${s?.lastSyncAction ? `（${s.lastSyncAction === 'download' ? '下载' : s.lastSyncAction === 'upload' ? '上传' : '合并'}）` : ''}`,
      '----------------------------------------',
    ];
    return lines.join('\n') + '\n' + exportSyncLogsText();
  };

  /** 复制诊断信息（剪贴板不可用时回退为选中文本） */
  const handleCopyDiag = () => {
    const text = buildDiagText();
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      setDiagCopied(ok);
      if (ok) logSync('info', '排障', '已复制诊断信息');
    } catch {
      setDiagCopied(false);
    }
  };

  const handleClearLogs = () => {
    clearSyncLogs();
    setLogs([]);
    logSync('info', '排障', '已清空日志');
  };

  const handleRefreshLogs = () => setLogs(getSyncLogs());

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
    logSync('info', '连接测试', '开始探测远端');
    try {
      const probe = await probeRemote(buildSyncSettings());
      setSyncResult({
        ok: true,
        message: probe.remoteExists
          ? `连接成功，远端存在备份${probe.remoteExportedAt ? `（最后导出 ${formatSyncTime(probe.remoteExportedAt)}）` : ''}`
          : '连接成功，远端暂无备份（首次同步将自动上传本地数据）',
      });
      logSync('success', '连接测试', probe.remoteExists ? '连接成功，远端存在备份' : '连接成功，远端暂无备份');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setSyncResult({ ok: false, message: `连接失败：${msg}` });
      logSync('error', '连接测试', `连接失败：${msg}`);
    } finally {
      setSyncBusy(false);
    }
  };

  /** 一键更新：合并式同步（拉取→合并→写回两端），无需选择方向；成功后记录上次同步时间与操作 */
  const handleOneClickSync = async () => {
    if (syncBusy) return;
    setSyncBusy(true);
    setSyncUiState({ kind: 'syncing' });
    logSync('info', '一键更新', '开始合并式同步（面板触发）');
    try {
      const result = await syncAuto(buildSyncSettings(), settings?.lastSyncedAt ?? null);
      logSync(result.status === 'error' ? 'error' : result.status === 'skipped' ? 'info' : 'success', '一键更新', result.message);
      setSyncResult({ ok: result.status !== 'error', message: result.message });
      // merged→合并 / uploaded→上传 / downloaded→下载；skipped 无需写
      if (result.status === 'merged' || result.status === 'uploaded' || result.status === 'downloaded') {
        onChange({
          lastSyncedAt: Date.now(),
          lastSyncAction: result.status === 'merged' ? 'merged' : result.status === 'uploaded' ? 'upload' : 'download',
        });
      }
      setSyncUiState(result.status === 'error' ? { kind: 'error', message: result.message } : { kind: 'synced', at: Date.now() });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logSync('error', '一键更新', `异常：${msg}`);
      setSyncResult({ ok: false, message: `同步失败：${msg}` });
      setSyncUiState({ kind: 'error', message: msg });
    } finally {
      setSyncBusy(false);
    }
  };

  return (
    <>
      {/* Scrim（进入淡入 / 退出淡出，与面板位移同时进行） */}
      <motion.div
        key="settings-scrim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 2,
          background: 'rgba(0,0,0,0.15)',
        }}
      />

      {/* 设置面板：进入从右侧滑入，退出反向滑出（AnimatePresence 承接 exit） */}
      <motion.div
        key="settings-panel"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
        style={{
          position: 'fixed',
          top: 0, right: 0, bottom: 0,
          zIndex: 10,
          width: 420,
          maxWidth: '92%',
          display: 'flex',
          flexDirection: 'column',
          ...glassSurface('var(--background)', 82, 60),
          borderRadius: '16px 0 0 16px',
          boxShadow: '-4px 0 32px rgba(0,0,0,0.12), -1px 0 0 color-mix(in srgb, var(--border) 50%, transparent)',
          color: 'var(--foreground)',
        }}
      >
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

              <div style={rowStyle}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <label style={labelStyle}>重要任务置顶</label>
                  <p style={descStyle}>开启后，重要任务会排在普通任务之前；关闭后仅按截止时间排序</p>
                </div>
                <div
                  role="switch"
                  aria-checked={importantTop}
                  tabIndex={0}
                  style={switchStyle}
                  onClick={() => { setImportantTop(!importantTop); onChange({ importantTop: !importantTop }); }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setImportantTop(!importantTop);
                      onChange({ importantTop: !importantTop });
                    }
                  }}
                >
                  <span style={switchTrack(importantTop)} />
                  <span style={{ ...switchThumb, transform: importantTop ? 'translateX(20px)' : 'none' }} />
                </div>
              </div>

              {/* 毛玻璃（仅桌面，移动端隐藏） */}
              {!isMobile && (
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
              )}

              {/* 透明度（仅桌面，移动端隐藏） */}
              {!isMobile && (
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
              )}

              {!isMobile && <div style={rowStyle}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <label style={labelStyle}>开机自启动</label>
                  <p style={descStyle}>登录 Windows 后自动在桌面层显示</p>
                </div>
                <div style={switchStyle} onClick={() => { setAutoStart(!autoStart); onChange({ autoStart: !autoStart }); }}>
                  <span style={switchTrack(autoStart)} />
                  <span style={{ ...switchThumb, transform: autoStart ? 'translateX(20px)' : 'none' }} />
                </div>
              </div>}

            </section>
          )}

          {/* ===== 提醒 ===== */}
          {tab === '提醒' && (
            <section>
              <div style={rowStyle}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <label style={labelStyle}>开启系统通知</label>
                  <p style={descStyle}>在系统通知中心显示任务提醒</p>
                </div>
                <div style={switchStyle} onClick={() => { setWinNotify(!winNotify); onChange({ reminderEnabled: !winNotify }); }}>
                  <span style={switchTrack(winNotify)} />
                  <span style={{ ...switchThumb, transform: winNotify ? 'translateX(20px)' : 'none' }} />
                </div>
              </div>

              <div style={{ margin: '-8px 0 20px' }}>
                <button
                  type="button"
                  disabled={notificationBusy}
                  onClick={() => { void handleTestNotification(); }}
                  style={{
                    width: isMobile ? '100%' : undefined, minHeight: isMobile ? 44 : 36, padding: '0 12px', border: '1px solid var(--primary)', borderRadius: 9,
                    background: 'color-mix(in srgb, var(--primary) 10%, transparent)', color: 'var(--primary)',
                    font: '600 12px var(--font-sans)', cursor: notificationBusy ? 'wait' : 'pointer',
                    opacity: notificationBusy ? 0.65 : 1,
                  }}
                >
                  {notificationBusy ? '正在检查通知权限…' : isMobile ? '授权并测试手机通知' : '授权并发送测试通知'}
                </button>
                <p style={{ ...descStyle, marginTop: 7, color: notificationResult ? (notificationResult.ok ? 'var(--primary)' : 'var(--destructive)') : 'var(--muted-foreground)' }}>
                  {notificationResult?.message ?? '首次使用请点击此按钮授权；若未弹出，请到系统设置中允许本应用通知。'}
                </p>
              </div>

              {!isMobile && <div style={rowStyle}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <label style={labelStyle}>提醒后自动置顶</label>
                  <p style={descStyle}>任务到达提醒时间后自动置顶显示</p>
                </div>
                <div style={switchStyle} onClick={() => { setAutoPin(!autoPin); onChange({ autoPin: !autoPin }); }}>
                  <span style={switchTrack(autoPin)} />
                  <span style={{ ...switchThumb, transform: autoPin ? 'translateX(20px)' : 'none' }} />
                </div>
              </div>}

              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>默认截止时刻</label>
                <p style={descStyle}>新建/编辑任务时，若只选择日期而未填写具体时刻，自动补为下面的时分</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <input
                    type="number" min={0} max={23}
                    value={settings?.defaultDeadlineHour ?? 18}
                    onChange={(e) => onChange({ defaultDeadlineHour: Math.max(0, Math.min(23, Number(e.target.value) || 0)) })}
                    style={{ ...inputStyle, width: 64, textAlign: 'center' }}
                    aria-label="默认截止小时"
                  />
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted-foreground)' }}>:</span>
                  <input
                    type="number" min={0} max={59}
                    value={settings?.defaultDeadlineMinute ?? 0}
                    onChange={(e) => onChange({ defaultDeadlineMinute: Math.max(0, Math.min(59, Number(e.target.value) || 0)) })}
                    style={{ ...inputStyle, width: 64, textAlign: 'center' }}
                    aria-label="默认截止分钟"
                  />
                  <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>时 : 分</span>
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
                  服务器地址已内置为坚果云免费空间（dav.jianguoyun.com/dav/），无需填写；只需在下填入坚果云账号与应用密码，即可把任务数据备份到云端。
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

              {/* 默认同步策略（新增）：双向合并 / 仅上传云端 / 仅覆盖本地 */}
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>默认同步策略</label>
                <p style={descStyle}>决定「自动同步」与「一键更新」的同步方式；顶栏「上传云端 / 覆盖本地」为手动强制，不受此影响</p>
                <div style={{ display: 'inline-flex', borderRadius: 999, padding: 2, background: 'var(--muted)', border: '1px solid var(--border)', marginTop: 8 }}>
                  {([
                    { id: 'twoWay', label: '双向同步' },
                    { id: 'uploadOnly', label: '仅上传云端' },
                    { id: 'downloadOnly', label: '仅覆盖本地' },
                  ] as { id: SyncPolicy; label: string }[]).map((opt) => {
                    const active = (settings?.syncPolicy ?? 'twoWay') === opt.id;
                    return (
                      <button
                        key={opt.id}
                        onClick={() => onChange({ syncPolicy: opt.id })}
                        style={{
                          flex: 1, padding: '6px 14px', border: 'none', borderRadius: 999,
                          cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
                          fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap',
                          color: active ? 'var(--foreground)' : 'var(--muted-foreground)',
                          background: active ? 'var(--background)' : 'transparent',
                          boxShadow: active ? 'var(--shadow-xs)' : 'none',
                          transition: 'color .15s ease, background-color .15s ease',
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
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
                          服务器地址：已内置 <code>https://dav.jianguoyun.com/dav/</code>（无需填写）<br />
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

              {/* WebDAV 配置（服务器地址已内置坚果云，不显示）：只填账号与应用密码；输入即保存 */}

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
                  type="text"
                  value={settings?.webdavPassword ?? ''}
                  placeholder="WebDAV 密码"
                  autoComplete="off"
                  onChange={(e) => onChange({ webdavPassword: e.target.value })}
                  style={{ ...inputStyle, marginTop: 8 }}
                  className="pw-mask"
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

              {/* 状态区：最近一次同步/连接测试结果（同步时间已在主界面移除） */}
              <div style={{
                borderRadius: 'calc(var(--radius) * 0.8)', padding: '12px 14px',
                background: 'var(--muted)', border: '1px solid var(--border)',
              }}>
                {syncResult && (
                  <p style={{
                    fontSize: 12.5, margin: 0, lineHeight: 1.6,
                    color: syncResult.ok ? 'var(--foreground)' : 'var(--destructive)',
                  }}>
                    {syncResult.message}
                  </p>
                )}
                {!syncResult && (
                  <p style={{ fontSize: 12.5, margin: 0, color: 'var(--muted-foreground)' }}>执行「连接测试」或「一键更新」后，这里显示最近一次结果。</p>
                )}
              </div>
            </section>
          )}

          {/* ===== AI 智能助手 ===== */}
          {tab === 'AI' && (
            <section>
              {/* 说明文案 */}
              <div style={{
                borderRadius: 'calc(var(--radius) * 0.8)', padding: '12px 14px',
                background: 'var(--muted)', border: '1px solid var(--border)', marginBottom: 20,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>AI 智能助手（OpenAI 兼容）</span>
                </div>
                <p style={{ ...descStyle, lineHeight: 1.6 }}>
                  填写任一 OpenAI 兼容服务的 BaseURL / API Key / 模型名（DeepSeek、OpenAI、通义、Moonshot 等均可）。配置后：
                  <br />· 新建任务时可用「一键生成子任务」自动拆分排期；
                  <br />· 命令栏可直接用自然语言执行复杂操作（如"新建一个重复三天的上课任务，8月4号结束"）。
                  <br />API Key 仅保存在本机数据库，不会上传到任何地方。
                </p>
              </div>

              {/* 常用服务预设：只填入 BaseURL，模型名由用户自行填写 */}
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>常用服务</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                  {AI_PRESETS.map((p) => {
                    const active = aiBaseUrl.trim().toLowerCase() === p.baseUrl.toLowerCase();
                    return (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() => applyAiPreset(p)}
                        title={p.baseUrl}
                        aria-pressed={active}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          padding: '6px 12px', borderRadius: 999, cursor: 'pointer',
                          border: '1px solid var(--border)',
                          background: active ? 'color-mix(in srgb, var(--primary) 18%, transparent)' : 'var(--background)',
                          color: active ? 'var(--primary)' : 'var(--foreground)',
                          fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-sans)',
                            transition: 'background-color 0.15s ease',
                        }}
                        onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--accent)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = active ? 'color-mix(in srgb, var(--primary) 18%, transparent)' : 'var(--background)'; }}
                      >
                        {p.name}
                        {active && <Check style={{ width: 12, height: 12 }} />}
                      </button>
                    );
                  })}
                </div>
                <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--muted-foreground)' }}>
                  点击填入接口地址，再自行填写 API Key 与模型名即可。
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>BaseURL</label>
                <input
                  type="text"
                  value={aiBaseUrl}
                  placeholder={DEFAULT_AI_BASE_URL}
                  autoComplete="off"
                  onChange={(e) => { setAiBaseUrl(e.target.value); onChange({ aiBaseUrl: e.target.value.trim() }); }}
                  style={{ ...inputStyle, marginTop: 8 }}
                  aria-label="AI BaseURL"
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>API Key</label>
                <input
                  type="text"
                  value={aiApiKey}
                  placeholder="sk-..."
                  autoComplete="off"
                  onChange={(e) => { setAiApiKey(e.target.value); onChange({ aiApiKey: e.target.value.trim() }); }}
                  style={{ ...inputStyle, marginTop: 8 }}
                  className="pw-mask"
                  aria-label="AI API Key"
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>模型</label>
                <input
                  type="text"
                  value={aiModel}
                  placeholder="例如：deepseek-chat、gpt-4o-mini"
                  autoComplete="off"
                  onChange={(e) => { setAiModel(e.target.value); onChange({ aiModel: e.target.value.trim() }); }}
                  style={{ ...inputStyle, marginTop: 8 }}
                  aria-label="AI 模型名"
                />
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <button onClick={handleTestAi} disabled={aiBusy} style={secondaryBtn}>
                  {aiBusy ? '正在测试…' : '测试连接'}
                </button>
              </div>

              {/* 状态区：正在测试时即时反馈，完成后展示结果 */}
              {aiBusy && (
                <div style={{ borderRadius: 'calc(var(--radius) * 0.8)', padding: '12px 14px', background: 'var(--muted)', border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 12.5, margin: 0, lineHeight: 1.6, color: 'var(--muted-foreground)' }}>
                    正在测试连接，请稍候…
                  </p>
                </div>
              )}
              {aiResult && !aiBusy && (
                <div style={{ borderRadius: 'calc(var(--radius) * 0.8)', padding: '12px 14px', background: 'var(--muted)', border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 12.5, margin: 0, lineHeight: 1.6, color: aiResult.ok ? 'var(--foreground)' : 'var(--destructive)' }}>
                    {aiResult.message}
                  </p>
                </div>
              )}
            </section>
          )}

          {/* ===== 排障 ===== */}
          {tab === '排障' && (
            <section>
              {/* 状态自查 */}
              <div style={{
                borderRadius: 'calc(var(--radius) * 0.8)', padding: '12px 14px',
                background: 'var(--muted)', border: '1px solid var(--border)', marginBottom: 16,
              }}>
                <div style={{ marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>状态自查</span>
                </div>
                {[
                  { label: '服务器', value: settings?.webdavUrl || DEFAULT_WEBDAV_URL },
                  { label: '账号', value: settings?.webdavUsername ? '已填写' : '未填写', ok: !!settings?.webdavUsername },
                  { label: '应用密码', value: settings?.webdavPassword ? '已填写' : '未填写', ok: !!settings?.webdavPassword },
                  { label: '自动同步', value: settings?.autoSync ? '开' : '关', ok: !!settings?.autoSync },
                  {
                    label: '上次同步',
                    value: settings?.lastSyncedAt
                      ? `${formatSyncTime(settings.lastSyncedAt)}${settings.lastSyncAction ? `（${settings.lastSyncAction === 'download' ? '下载' : settings.lastSyncAction === 'upload' ? '上传' : '合并'}）` : ''}`
                      : '无',
                    ok: !!settings?.lastSyncedAt,
                  },
                  { label: 'AI 服务', value: settings?.aiBaseUrl || '未配置', ok: !!settings?.aiBaseUrl },
                  { label: 'AI Key', value: settings?.aiApiKey ? '已填写' : '未填写', ok: !!settings?.aiApiKey },
                  { label: 'AI 模型', value: settings?.aiModel || '未配置', ok: !!settings?.aiModel },
                ].map((row) => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                    <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{row.label}</span>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: row.ok === false ? 'var(--destructive)' : 'var(--foreground)' }}>
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>

              {/* 操作 */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                <button onClick={handleCopyDiag} style={secondaryBtn}>
                  复制诊断信息
                </button>
                <button onClick={handleRefreshLogs} style={{ ...secondaryBtn, flex: '0 0 auto', padding: '0 16px' }}>
                  刷新
                </button>
                <button
                  onClick={handleClearLogs}
                  style={{ ...secondaryBtn, flex: '0 0 auto', padding: '0 16px', color: 'var(--destructive)', borderColor: 'color-mix(in srgb, var(--destructive) 40%, transparent)' }}
                >
                  清空
                </button>
              </div>
              {diagCopied && <p style={{ ...descStyle, marginBottom: 8, color: 'var(--primary)' }}>诊断信息已复制，可粘贴发送给开发者或留存备查</p>}

              {/* 最近日志 */}
              <label style={labelStyle}>最近日志（本地保留 400 条，重启不丢）</label>
              <div style={{
                marginTop: 8, marginBottom: 20, padding: '8px 10px',
                borderRadius: 'calc(var(--radius) * 0.8)',
                background: 'var(--background)', border: '1px solid var(--border)',
                maxHeight: 240, overflowY: 'auto',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                fontSize: 11, lineHeight: 1.7,
              }}>
                {logs.length === 0 ? (
                  <span style={{ color: 'var(--muted-foreground)' }}>暂无日志。执行一次"一键更新/连接测试"或等自动同步触发后，这里会记录每次同步的触发来源与结果。</span>
                ) : logs.map((e, i) => (
                  <div key={i} style={{
                    color: e.lvl === 'error' ? 'var(--destructive)' : e.lvl === 'warn' ? '#ff9500' : e.lvl === 'success' ? 'var(--primary)' : 'var(--foreground)',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                  }}>
                    {`${logTime(e.t)} [${e.lvl}] [${e.phase}] ${e.msg}`}
                  </div>
                ))}
              </div>

              {/* 常见问题速查 */}
              <label style={labelStyle}>常见问题速查</label>
              <div style={{
                marginTop: 8, borderRadius: 'calc(var(--radius) * 0.8)', padding: '4px 14px',
                background: 'var(--muted)', border: '1px solid var(--border)',
              }}>
                {[
                  { s: '连接失败 / 401', a: '坚果云必须使用「应用密码」而非登录密码：坚果云 → 账户信息 → 安全选项 → 第三方应用管理 → 添加应用' },
                  { s: '自动同步没触发', a: '确认「自动同步」开 + 账号/密码已填；本机变更后约 30 秒防抖触发，另有每 60 分钟兜底' },
                  { s: '同步慢 / 卡住', a: '在「同步」页点「连接测试」验证网络；查看上方日志里最近的错误类型' },
                  { s: '两台同改一任务丢内容', a: '本应用为记录级合并（Last-Write-Wins），后写覆盖先写；请避免两台同时编辑同一任务' },
                  { s: '想确认上次基准', a: '看「状态自查」的上次同步时间与操作（上传/下载/合并）' },
                ].map((f) => (
                  <div key={f.s} style={{ padding: '9px 0', borderBottom: '0.5px solid var(--border)' }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--foreground)' }}>{f.s}</div>
                    <div style={{ ...descStyle, marginTop: 2, lineHeight: 1.6 }}>{f.a}</div>
                  </div>
                ))}
                <p style={{ ...descStyle, marginTop: 8, lineHeight: 1.6 }}>
                  排障日志覆盖自动同步 / 一键更新 / 连接测试的触发来源与结果；如需更细的每文件级日志或导出最近 N 轮摘要，可在本页基础上继续扩展。
                </p>
              </div>
            </section>
          )}
        </div>
      </motion.div>
    </>
  );
}

/** 日志行内时间：HH:mm:ss */
function logTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 同步时间格式化：`2026.8.8 14:30`，无时间返回"尚未同步" */
function formatSyncTime(ts: number | null): string {
  if (!ts) return '尚未同步';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
