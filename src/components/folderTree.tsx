import { ChevronDown, ChevronRight, Folder as FolderIcon, FolderOpen } from 'lucide-react';
import { FolderNode, TaskWithSubtasks } from '../data/types';
import TaskItem, { Highlight } from './taskItem';

interface FolderTreeProps {
  folders: FolderNode[];
  /** 顶层未分类任务（folderId 为 null），与文件夹同级显示 */
  rootTasks?: TaskWithSubtasks[];
  expandedFolders: Set<string>;
  expandedTasks: Set<string>;
  searchQuery: string;
  onToggleFolder: (id: string) => void;
  onToggleTaskExpanded: (id: string) => void;
  onToggleCompleted: (id: string) => void;
  onContextMenuTask: (e: React.MouseEvent, taskId: string) => void;
  onContextMenuFolder: (e: React.MouseEvent, folderId: string) => void;
}

/** 文件夹统计：直属任务数 + 子文件夹任务数 */
function countTasks(folder: FolderNode): number {
  const own = folder.tasks.length;
  const children = folder.children.reduce((acc, c) => acc + countTasks(c), 0);
  return own + children;
}

/**
 * 文件夹树：递归渲染文件夹层级 + 任务项（对齐设计稿 main-view-v2 树视图）
 */
export default function FolderTree({
  folders, rootTasks = [], expandedFolders, expandedTasks, searchQuery,
  onToggleFolder, onToggleTaskExpanded, onToggleCompleted, onContextMenuTask, onContextMenuFolder,
}: FolderTreeProps) {
  return (
    <>
      {/* 顶层未分类任务（与文件夹同级） */}
      {rootTasks.map((task) => (
        <TaskItem
          key={task.id}
          task={task}
          expandedSet={expandedTasks}
          onToggleExpanded={onToggleTaskExpanded}
          onToggleCompleted={onToggleCompleted}
          onContextMenu={onContextMenuTask}
          searchQuery={searchQuery}
        />
      ))}

      {folders.map((folder) => {
        const isExpanded = expandedFolders.has(folder.id);
        const total = countTasks(folder);

        return (
          <div key={folder.id} className="tree-folder" style={{ position: 'relative' }}>
            {/* 文件夹 header */}
            <div
              className="tree-node tree-folder-header"
              onClick={() => onToggleFolder(folder.id)}
              onContextMenu={(e) => onContextMenuFolder(e, folder.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 8px',
                borderRadius: 'calc(var(--radius) * 0.55)',
                cursor: 'pointer',
                transition: 'background-color 0.15s ease',
                userSelect: 'none',
              }}
              onMouseOver={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 80%, transparent)'; }}
              onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              {isExpanded
                ? <ChevronDown style={{ width: 14, height: 14, color: 'var(--icon-muted)', flexShrink: 0 }} />
                : <ChevronRight style={{ width: 14, height: 14, color: 'var(--icon-muted)', flexShrink: 0 }} />}
              {isExpanded
                ? <FolderOpen style={{ width: 16, height: 16, color: 'var(--primary)', flexShrink: 0 }} />
                : <FolderIcon style={{ width: 16, height: 16, color: 'var(--icon-muted)', flexShrink: 0 }} />}
              <span style={{
                fontSize: folder.parentId ? 13 : 14,
                fontWeight: folder.parentId ? 600 : 700,
                color: 'var(--foreground)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                minWidth: 0,
              }}>
                <Highlight text={folder.name} query={searchQuery} />
              </span>
              <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 600, color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>
                ({total})
              </span>
            </div>

            {/* 子级容器 */}
            {isExpanded && (
              <div className="tree-children" style={{ marginLeft: 20, position: 'relative' }}>
                {/* 垂直连接线 */}
                <div style={{
                  position: 'absolute',
                  left: 6,
                  top: 0,
                  bottom: 16,
                  width: 1,
                  background: 'var(--border)',
                  opacity: 0.5,
                }} />

                {/* 子文件夹（递归） */}
                {folder.children.map((child) => (
                  <div key={child.id} style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', left: -14, top: 18, width: 14, height: 1, background: 'var(--border)', opacity: 0.5 }} />
                    <FolderTree
                      folders={[child]}
                      expandedFolders={expandedFolders}
                      expandedTasks={expandedTasks}
                      searchQuery={searchQuery}
                      onToggleFolder={onToggleFolder}
                      onToggleTaskExpanded={onToggleTaskExpanded}
                      onToggleCompleted={onToggleCompleted}
                      onContextMenuTask={onContextMenuTask}
                      onContextMenuFolder={onContextMenuFolder}
                    />
                    {folder.tasks.length === 0 && (
                      <div style={{ position: 'absolute', left: 6, top: 0, bottom: 16, width: 1, background: 'var(--border)', opacity: 0.5 }} />
                    )}
                  </div>
                ))}

                {/* 任务项 */}
                {folder.tasks.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    expandedSet={expandedTasks}
                    onToggleExpanded={onToggleTaskExpanded}
                    onToggleCompleted={onToggleCompleted}
                    onContextMenu={onContextMenuTask}
                    searchQuery={searchQuery}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
