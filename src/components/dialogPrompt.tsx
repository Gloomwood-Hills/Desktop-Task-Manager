import { useEffect, useRef, useState } from 'react';

interface PromptDialogProps {
  title: string;
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

/** 文本输入对话框（替代 WebView 不稳定的 window.prompt） */
export function PromptDialog({
  title, defaultValue = '', placeholder, confirmText = '确定', onConfirm, onCancel,
}: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const submit = () => {
    if (!value.trim()) return;
    onConfirm(value.trim());
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(6px)',
    }}>
      <div style={{
        width: 320, maxWidth: 'calc(100% - 48px)',
        borderRadius: 'calc(var(--radius) * 0.9)',
        background: 'var(--popover)', color: 'var(--popover-foreground)',
        boxShadow: 'var(--shadow-xl), 0 0 0 0.5px color-mix(in srgb, var(--border) 40%, transparent)',
        padding: 20,
      }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, marginBottom: 14 }}>{title}</h3>
        <input
          ref={inputRef}
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') onCancel();
          }}
          style={{
            width: '100%', height: 36, padding: '0 12px',
            border: '1px solid var(--input)', borderRadius: 'calc(var(--radius) * 0.6)',
            background: 'var(--background)', color: 'inherit',
            fontSize: 13.5, outline: 'none', boxSizing: 'border-box',
            fontFamily: 'var(--font-sans)',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button
            onClick={onCancel}
            style={{
              height: 32, padding: '0 14px', fontSize: 13,
              border: 'none', borderRadius: 999,
              background: 'transparent', color: 'var(--muted-foreground)',
              cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}
          >
            取消
          </button>
          <button
            onClick={submit}
            disabled={!value.trim()}
            style={{
              height: 32, padding: '0 18px', fontSize: 13, fontWeight: 600,
              border: 'none', borderRadius: 999,
              background: 'var(--primary)', color: 'var(--primary-foreground)',
              cursor: 'pointer', fontFamily: 'var(--font-sans)',
              opacity: value.trim() ? 1 : 0.4,
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmText?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** 确认对话框（替代 window.confirm） */
export function ConfirmDialog({
  title, message, confirmText = '确定', destructive, onConfirm, onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(6px)',
    }}>
      <div style={{
        width: 320, maxWidth: 'calc(100% - 48px)',
        borderRadius: 'calc(var(--radius) * 0.9)',
        background: 'var(--popover)', color: 'var(--popover-foreground)',
        boxShadow: 'var(--shadow-xl), 0 0 0 0.5px color-mix(in srgb, var(--border) 40%, transparent)',
        padding: 20,
      }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, marginBottom: 10 }}>{title}</h3>
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--muted-foreground)', lineHeight: 1.6 }}>{message}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button
            onClick={onCancel}
            style={{
              height: 32, padding: '0 14px', fontSize: 13,
              border: 'none', borderRadius: 999,
              background: 'transparent', color: 'var(--muted-foreground)',
              cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            style={{
              height: 32, padding: '0 18px', fontSize: 13, fontWeight: 600,
              border: 'none', borderRadius: 999,
              background: destructive ? 'var(--destructive)' : 'var(--primary)',
              color: destructive ? 'var(--destructive-foreground)' : 'var(--primary-foreground)',
              cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
