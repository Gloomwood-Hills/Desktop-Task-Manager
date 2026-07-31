/** 快捷键提示条（底部悬浮，对齐设计稿） */
export default function ShortcutHint() {
  const kbdStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 20,
    height: 18,
    padding: '0 5px',
    borderRadius: 4,
    background: 'var(--secondary)',
    border: '0.5px solid var(--border)',
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--foreground)',
    lineHeight: 1,
  };

  const items = [
    { keys: ['N'], label: '新建' },
    { keys: ['E'], label: '编辑' },
    { keys: ['Del'], label: '删除' },
    { keys: ['Space'], label: '完成' },
    { keys: ['Ctrl+Z'], label: '撤销' },
  ];

  return (
    <div style={{
      position: 'fixed',
      bottom: 12,
      right: 16,
      zIndex: 50,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '6px 14px',
        borderRadius: 'calc(var(--radius)*0.6)',
        background: 'color-mix(in srgb, var(--background) 75%, transparent)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '0.5px solid color-mix(in srgb, var(--border) 40%, transparent)',
      }}>
        {items.map((item, i) => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>
            {i > 0 && <div style={{ width: 1, height: 12, background: 'var(--border)', opacity: 0.5, marginRight: 14 }} />}
            {item.keys.map((k) => (
              <kbd key={k} style={kbdStyle}>{k}</kbd>
            ))}
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
