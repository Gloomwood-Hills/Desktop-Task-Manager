import { useMemo } from 'react';
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
  /** 名称排序时：外层未分类任务与文件夹按名称合并排序 */
  outerNameSort?: boolean;
  /** 手动排序模式：允许拖动任务调整顺序 */
  manualSort?: boolean;
  onReorderTasks?: (orderedIds: string[]) => void;
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

/** 拖动源任务 id（经 dataTransfer 传递，跨组件实例可用） */
function getDragSourceId(e: React.DragEvent): string {
  return e.dataTransfer.getData('text/plain');
}

/**
 * 文件夹树：递归渲染文件夹层级 + 任务项（对齐设计稿 main-view-v2 树视图）
 * - 名称排序时外层未分类任务与文件夹按名称合并排序
 * - 手动排序模式下任务可拖动调整顺序（持久化 sortOrder）
 */
export default function FolderTree({
  folders, rootTasks = [], expandedFolders, expandedTasks, searchQuery,
  outerNameSort = false, manualSort = false, onReorderTasks,
  onToggleFolder, onToggleTaskExpanded, onToggleCompleted, onContextMenuTask, onContextMenuFolder,
}: FolderTreeProps) {
  const rootIds = rootTasks.map((t) => t.id);

  // 名称排序：外层未分类任务 + 文件夹按名称合并排序（A-Z）
  const mergedOuter = useMemo(() => {
    if (!outerNameSort) return null;
    const all: Array<{ kind: 'task'; task: TaskWithSubtasks } | { kind: 'folder'; folder: FolderNode }> = [
      ...rootTasks.map((task) => ({ kind: 'task' as const, task })),
      ...folders.map((folder) => ({ kind: 'folder' as const, folder })),
    ];
    return all.sort((a, b) => {
      const nameA = a.kind === 'task' ? a.task.title : a.folder.name;
      const nameB = b.kind === 'task' ? b.task.title : b.folder.name;
      return nameA.localeCompare(nameB, 'zh');
    });
  }, [rootTasks, folders, outerNameSort]);

  /** 任务行：手动模式下可拖动（拖到某行上方 = 插入到该行前） */
  const renderTask = (task: TaskWithSubtasks, ids: string[]) => (
    <div
      key={task.id}
      draggable={manualSort}
      onDragStart={manualSort ? (e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', task.id);
      } : undefined}
      onDragOver={manualSort ? (e) => e.preventDefault() : undefined}
      onDrop={manualSort ? (e) => {
        e.preventDefault();
        e.stopPropagation();
        const src = getDragSourceId(e);
        if (!src || src === task.id || !onReorderTasks) return;
        const next = ids.filter((x) => x !== src);
        next.splice(next.indexOf(task.id), 0, src);
        onReorderTasks(next);
      } : undefined}
      style={manualSort ? { cursor: 'grab' } : undefined}
    >
      <TaskItem
        task={task}
        expandedSet={expandedTasks}
        onToggleExpanded={onToggleTaskExpanded}
        onToggleCompleted={onToggleCompleted}
        onContextMenu={onContextMenuTask}
        searchQuery={searchQuery}
      />
    </div>
  );

  /** 任务列表容器：拖动到容器空白处 = 追加到末尾 */
  const renderTaskList = (tasks: TaskWithSubtasks[], ids: string[]) => (
    <div
      onDragOver={manualSort ? (e) => e.preventDefault() : undefined}
      onDrop={manualSort ? (e) => {
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        const src = getDragSourceId(e);
        if (!src || !onReorderTasks) return;
        const next = ids.filter((x) => x !== src);
        next.push(src);
        onReorderTasks(next);
      } : undefined}
    >
      {tasks.map((task) => renderTask(task, ids))}
    </div>
  );

  /** 文件夹节点：header + 子文件夹（递归）+ 任务列表 */
  const renderFolder = (folder: FolderNode) => {
    const isExpanded = expandedFolders.has(folder.id);
    const total = countTasks(folder);
    const taskIds = folder.tasks.map((t) => t.id);

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
                  manualSort={manualSort}
                  onReorderTasks={onReorderTasks}
                />
                {folder.tasks.length === 0 && (
                  <div style={{ position: 'absolute', left: 6, top: 0, bottom: 16, width: 1, background: 'var(--border)', opacity: 0.5 }} />
                )}
              </div>
            ))}

            {/* 任务项 */}
            {renderTaskList(folder.tasks, taskIds)}
          </div>
        )}
      </div>
    );
  };

  // 名称排序：外层合并排序渲染
  if (mergedOuter) {
    return (
      <>
        {mergedOuter.map((item) => (
          item.kind === 'task'
            ? renderTask(item.task, rootIds)
            : renderFolder(item.folder)
        ))}
      </>
    );
  }

  // 默认/手动排序：未分类任务块 + 文件夹块
  return (
    <>
      {renderTaskList(rootTasks, rootIds)}
      {folders.map((folder) => renderFolder(folder))}
    </>
  );
}
