import { useEffect, useRef, useState } from 'react';
import { isMobile } from '../data/platform';

interface CommandBubbleProps {
  /** 提交命令文本（由调用方解析并执行） */
  onCommand: (text: string) => void;
  /** 聚焦信号：数值变化时自动聚焦输入框（用于小部件唤起等外部触发） */
  focusSignal?: number;
}

/** 自然语言命令气泡：位于视图切换条旁，输入复杂指令后回车执行 */
export default function CommandBubble({ onCommand, focusSignal }: CommandBubbleProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  // 外部信号变化 → 聚焦命令输入框（小部件"快速记录"唤起时）
  useEffect(() => {
    if (focusSignal && focusSignal > 0) {
      inputRef.current?.focus();
    }
  }, [focusSignal]);

  const submit = () => {
    const t = value.trim();
    if (!t) return;
    onCommand(t);
    setValue('');
  };

  return (
    <div style={{ flex: isMobile ? '1 1 auto' : '0 0 auto', display: 'flex', alignItems: 'center', minWidth: 0 }}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        list="dtm-command-suggestions"
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
      <datalist id="dtm-command-suggestions">
        <option value="完成任务 " />
        <option value="撤销完成任务 " />
        <option value="把任务设为重要" />
        <option value="把任务移到工作分类" />
        <option value="搜索 " />
        <option value="打开日历视图" />
        <option value="展开全部" />
        <option value="取消提醒 " />
      </datalist>
    </div>
  );
}
