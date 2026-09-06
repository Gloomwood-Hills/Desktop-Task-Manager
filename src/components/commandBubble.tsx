import { useState } from 'react';
import { isMobile } from '../data/platform';

interface CommandBubbleProps {
  /** 提交命令文本（由调用方解析并执行） */
  onCommand: (text: string) => void;
}

/** 自然语言命令气泡：位于视图切换条旁，输入复杂指令后回车执行 */
export default function CommandBubble({ onCommand }: CommandBubbleProps) {
  const [value, setValue] = useState('');

  const submit = () => {
    const t = value.trim();
    if (!t) return;
    onCommand(t);
    setValue('');
  };

  return (
    <div style={{ flex: isMobile ? '1 1 auto' : '0 0 auto', display: 'flex', alignItems: 'center', minWidth: 0 }}>
      <input
        type="text"
        value={value}
        placeholder="试试：把XX设为每天重复 / 把XX提前1天提醒 / 明天下午去游泳"
        aria-label="自然语言命令"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') setValue('');
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--primary)'; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--input)'; }}
        style={{
          width: isMobile ? '100%' : 200,
          maxWidth: isMobile ? '100%' : 'calc(100vw - 200px)',
          height: 26,
          padding: '0 12px',
          border: '1px solid var(--input)',
          borderRadius: 999,
          background: 'var(--background)',
          color: 'inherit',
          fontSize: 12,
          outline: 'none',
          fontFamily: 'var(--font-sans)',
          boxSizing: 'border-box',
          transition: 'border-color 0.15s ease, width 0.15s ease',
        }}
      />
    </div>
  );
}
