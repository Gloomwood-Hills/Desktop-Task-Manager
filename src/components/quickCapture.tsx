import { useState } from 'react';
import {
  Folder as FolderIcon, ChevronDown, Calendar as CalendarIcon, Bell, Check, Star,
  Plus, Sparkles,
} from 'lucide-react';
import { FolderNode } from '../mock/mockData';

interface QuickCaptureProps {
  folders: FolderNode[];
  onClose: () => void;
  onCreate: (title: string, folderId: string) => void;
}

const REMINDER_OPTIONS = ['提前30分钟', '提前1小时', '提前3小时', '提前1天', '不提醒'];

/** 新建任务弹窗（Quick Capture，对齐设计稿 quick-capture） */
export default function QuickCapture({ folders, onClose, onCreate }: QuickCaptureProps) {
  const [title, setTitle] = useState('');
  const [folderId, setFolderId] = useState(folders[0]?.id ?? '');
  const [folderOpen, setFolderOpen] = useState(false);
  const [reminderOn, setReminderOn] = useState(true);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderValue, setReminderValue] = useState(REMINDER_OPTIONS[0]);
  const [important, setImportant] = useState(false);

  // 扁平化文件夹用于选择器
  const flatFolders: { id: string; name: string; depth: number }[] = [];
  const flatten = (nodes: FolderNode[], depth: number) => {
    nodes.forEach((n) => {
      flatFolders.push({ id: n.id, name: n.name, depth });
      flatten(n.children, depth + 1);
    });
  };
  flatten(folders, 0);

  const selectedFolder = flatFolders.find((f) => f.id === folderId);
  const parsedDate = title.includes('明天') ? '明天下午三点' : null;

  const handleCreate = () => {
    if (!title.trim()) return;
    onCreate(title.trim(), folderId);
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
        overflow: 'hidden',
        color: 'var(--foreground)',
      }}>
        {/* Option buttons row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '18px 24px 0', flexWrap: 'nowrap' }}>
          {/* 文件夹选择 */}
          <div
            onClick={() => { setFolderOpen(!folderOpen); setReminderOpen(false); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 10,
              background: 'var(--brand-50)', border: '1px solid var(--brand-200)', cursor: 'pointer', fontSize: 12.5, color: 'var(--primary)',
            }}
          >
            <FolderIcon style={{ width: 13, height: 13, color: 'var(--primary)', flexShrink: 0 }} />
            <span style={{ fontWeight: 600 }}>{selectedFolder?.name ?? '选择文件夹'}</span>
            <ChevronDown style={{ width: 11, height: 11, color: 'var(--primary)', flexShrink: 0 }} />
          </div>

          {/* 日期按钮 */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 10,
            background: 'var(--brand-50)', border: '1px solid var(--brand-200)', cursor: 'pointer', fontSize: 12.5, color: 'var(--primary)',
          }}>
            <CalendarIcon style={{ width: 13, height: 13, color: 'var(--primary)', flexShrink: 0 }} />
            <span style={{ fontWeight: 600 }}>7月25日</span>
            <ChevronDown style={{ width: 11, height: 11, color: 'var(--primary)', flexShrink: 0 }} />
          </div>

          {/* 提醒 */}
          <div
            onClick={() => {
              setReminderOn(!reminderOn);
              if (reminderOn) setReminderOpen(false);
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 10,
              background: reminderOn ? 'var(--brand-50)' : 'transparent',
              border: `1px solid ${reminderOn ? 'var(--brand-200)' : 'var(--border)'}`,
              cursor: 'pointer', fontSize: 12.5,
              color: reminderOn ? 'var(--primary)' : 'var(--muted-foreground)',
            }}
          >
            <Bell style={{ width: 13, height: 13, flexShrink: 0 }} />
            <span style={{ fontWeight: 600 }}>提醒</span>
            {reminderOn && <Check style={{ width: 12, height: 12, flexShrink: 0 }} />}
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
                  key={f.id}
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

        {/* 展开面板：提醒选项 */}
        {reminderOpen && reminderOn && (
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
              {REMINDER_OPTIONS.map((opt, i) => (
                <div key={opt}>
                  {i === REMINDER_OPTIONS.length - 1 && (
                    <div style={{ borderTop: '1px solid var(--border)', margin: '4px 8px' }} />
                  )}
                  <div
                    onClick={() => { setReminderValue(opt); setReminderOpen(false); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 10,
                      cursor: 'pointer', fontSize: 12.5,
                      color: opt === reminderValue ? 'var(--primary)' : 'var(--muted-foreground)',
                      background: opt === reminderValue ? 'var(--brand-50)' : 'transparent',
                    }}
                  >
                    <span style={{ fontWeight: opt === reminderValue ? 600 : 500 }}>{opt}</span>
                    {opt === reminderValue && <Check style={{ width: 14, height: 14, marginLeft: 'auto', flexShrink: 0 }} />}
                  </div>
                </div>
              ))}
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

        {/* 解析日期预览 */}
        {parsedDate && (
          <div style={{ padding: '8px 24px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sparkles style={{ width: 13, height: 13, color: 'var(--primary)', flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              识别到: {parsedDate}
            </span>
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
