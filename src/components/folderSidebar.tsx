import { ChevronDown, ChevronRight, Folder as FolderIcon, FolderOpen, FolderPlus, LayoutList, Inbox } from 'lucide-react';
import { FolderNode } from '../data/types';
import { compareByName } from '../data/utils';
import { glassSurface } from './utils/glass';

/** 侧栏选中值：null=全部 / 'unclassified'=未分类 / 其它=文件夹 id */
export type SidebarSelection = string | 'unclassified' | null;

interface FolderSidebarProps {
  tree: FolderNode[];
  expandedFolders: Set<string>;
  /** 当前选中项（null=全部；'unclassified'=未分类） */
  active: SidebarSelection;
  onSelect: (sel: SidebarSelection) => void;
  onToggleFolder: (id: string) => void;
  /** 侧栏内"新建文件夹"入口 */
  onNewFolder: () => void;
}

/** 文件夹内未完成任务数（含任意层级子文件夹） */
function countTasks(folder: FolderNode): number {
  const own = folder.tasks.length;
  const children = folder.children.reduce((acc, c) => acc + countTasks(c), 0);
  return own + children;
}

/** 卡片项：全部/未分类/文件夹通用样式 */
const cardStyle = (activeSel: boolean, nested: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 8px',
  borderRadius: 'calc(var(--radius) * 0.7)',
  cursor: 'pointer',
  userSelect: 'none',
  minWidth: 0,
  fontSize: 12.5,
  fontWeight: activeSel ? 600 : 500,
  color: activeSel ? 'var(--primary)' : 'var(--foreground)',
  background: activeSel ? 'color-mix(in srgb, var(--brand-400) 12%, transparent)' : 'color-mix(in srgb, var(--background) 70%, transparent)',
  border: `1px solid ${activeSel ? 'color-mix(in srgb, var(--brand-400) 40%, transparent)' : 'var(--border)'}`,
  boxShadow: activeSel ? 'var(--shadow-xs)' : 'none',
  marginLeft: nested ? 10 : 0,
});

/**
 * 文件夹侧栏（悬浮形态，由父级暴露在左侧边缘）：鼠标悬停左缘浮现，移开隐藏。
 * 上级：全部 / 未分类；下方递归文件夹卡片（含未完成任务计数）。
 * 数据源为响应式 folderTree，新建/改名/删除文件夹即时反映。
 */
export default function FolderSidebar({
  tree, expandedFolders, active, onSelect, onToggleFolder, onNewFolder,
}: FolderSidebarProps) {
  const renderFolder = (folder: FolderNode, nested: boolean) => {
    const isExpanded = expandedFolders.has(folder.id) || active === folder.id;
    const isActive = active === folder.id;
    return (
      <div key={folder.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div
          role="button" tabIndex={0}
          onClick={() => onSelect(folder.id)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(folder.id); } }}
          style={cardStyle(isActive, nested)}
        >
          <span
            role="button" tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onToggleFolder(folder.id); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); onToggleFolder(folder.id); } }}
            style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--icon-muted)', flexShrink: 0 }}
          >
            {isExpanded
              ? <ChevronDown style={{ width: 12, height: 12 }} />
              : <ChevronRight style={{ width: 12, height: 12 }} />}
          </span>
          {isExpanded
            ? <FolderOpen style={{ width: 15, height: 15, color: 'var(--primary)', flexShrink: 0 }} />
            : <FolderIcon style={{ width: 15, height: 15, color: 'var(--icon-muted)', flexShrink: 0 }} />}
          <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{folder.name}</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: isActive ? 'var(--primary)' : 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>
            {countTasks(folder)}
          </span>
        </div>
        {isExpanded && folder.children.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {folder.children.map((c) => renderFolder(c, true))}
          </div>
        )}
      </div>
    );
  };

  const sorted = [...tree].sort((a, b) => compareByName(a.name, b.name));

  const topCard = (sel: SidebarSelection, label: string, icon: React.ReactNode) => (
    <div
      role="button" tabIndex={0}
      onClick={() => onSelect(sel)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(sel); } }}
      style={cardStyle(active === sel, false)}
    >
      {icon}
      <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
    </div>
  );

  return (
    <aside
      data-sidebar
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 5,
        padding: '10px 8px 12px',
        overflowY: 'auto',
        overscrollBehavior: 'contain',
        touchAction: 'pan-y',
        ...glassSurface('var(--background)', 88, 30, 1.6),
        boxShadow: 'var(--shadow-lg), 0 0 0 0.5px color-mix(in srgb, var(--border) 50%, transparent)',
        borderRadius: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px', fontSize: 11, fontWeight: 700, color: 'var(--muted-foreground)', letterSpacing: 0.4 }}>
        <span>文件夹</span>
        <button
          onClick={onNewFolder}
          aria-label="新建文件夹"
          title="新建文件夹"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 22, height: 22, borderRadius: 7, border: 'none', cursor: 'pointer',
            background: 'transparent', color: 'var(--primary)',
          }}
        >
          <FolderPlus style={{ width: 15, height: 15 }} />
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {topCard(null, '全部', <LayoutList style={{ width: 14, height: 14, flexShrink: 0 }} />)}
        {topCard('unclassified', '未分类', <Inbox style={{ width: 14, height: 14, flexShrink: 0 }} />)}
      </div>

      <div style={{ height: 0.5, background: 'var(--border)', margin: '2px 2px', opacity: 0.5 }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {sorted.map((f) => renderFolder(f, false))}
        {sorted.length === 0 && (
          <div style={{ padding: '4px 6px', fontSize: 11.5, color: 'var(--muted-foreground)' }}>暂无文件夹</div>
        )}
      </div>
    </aside>
  );
}
