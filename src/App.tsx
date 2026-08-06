import { useEffect, useMemo, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import TopBar from './components/topBar';
import FolderTree from './components/folderTree';
import CompletedSection from './components/completedSection';
import ContextMenu, { ContextMenuState } from './components/contextMenu';
import QuickCapture from './components/quickCapture';
import SettingsPanel, { ThemeMode } from './components/settingsPanel';
import { PromptDialog, ConfirmDialog } from './components/dialogPrompt';
import { useTaskData } from './hooks/useTaskData';
import { FolderNode, Task, TaskWithSubtasks } from './data/types';

/** 对话框状态机 */
type DialogState =
  | { type: 'create-folder'; parentId: string | null }
  | { type: 'rename-folder'; folderId: string; defaultValue: string }
  | { type: 'delete-folder'; folderId: string; name: string }
  | { type: 'add-subtask'; taskId: string; folderId: string | null }
  | null;

/** 可撤销的最近一次操作：仅任务完成与任务恢复 */
type LastAction =
  | { kind: 'completed'; taskId: string }
  | { kind: 'restored'; taskId: string }
  | null;

function App() {
  const {
    folderTree, unclassifiedTasks, completedTasks, allFolders, theme, loading, error,
    setTheme, createTask, toggleCompleted, deleteTask, restoreTask,
    createFolder, renameFolder, deleteFolder,
  } = useTaskData();

  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set(['folder-ky', 'folder-lw', 'folder-sy', 'folder-gp', 'folder-sh'])
  );
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(() => new Set(['task-lw1']));
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [lastAction, setLastAction] = useState<LastAction>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);

  // 主题切换：挂载/切换 .dark class 到 document
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  // 撤销提示 5 秒自动消失（同时清除可撤销记录）
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => {
      setToast(null);
      setLastAction(null);
    }, 5000);
    return () => clearTimeout(t);
  }, [toast]);

  // DeskPins：锁定/解锁窗口可调整大小
  useEffect(() => {
    getCurrentWindow().setResizable(!pinned).catch(() => {});
  }, [pinned]);

  const toggleSet = (set: Set<string>, id: string): Set<string> => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  // ===== 任务操作 =====

  /** 在文件夹树、未分类任务、已完成区中查找任务（含任意层级子任务，递归） */
  const findTaskAnywhere = (id: string): Task | undefined => {
    const findInTasks = (list: TaskWithSubtasks[]): Task | undefined => {
      for (const t of list) {
        if (t.id === id) return t;
        const sub = findInTasks(t.subtasks);
        if (sub) return sub;
      }
      return undefined;
    };
    const findInTree = (nodes: FolderNode[]): Task | undefined => {
      for (const n of nodes) {
        const found = findInTasks(n.tasks);
        if (found) return found;
        const child = findInTree(n.children);
        if (child) return child;
      }
      return undefined;
    };
    return findInTree(folderTree)
      || findInTasks(unclassifiedTasks)
      || completedTasks.find((t) => t.id === id);
  };

  const handleToggleCompleted = async (id: string) => {
    const task = findTaskAnywhere(id);
    await toggleCompleted(id);
    if (task) {
      setLastAction({ kind: 'completed', taskId: id });
      setToast(`已完成 "${task.title}"`);
    }
  };

  const handleRestore = async (id: string) => {
    const task = completedTasks.find((t) => t.id === id);
    await restoreTask(id);
    if (task) {
      setLastAction({ kind: 'restored', taskId: id });
      setToast(`已恢复 "${task.title}"`);
    }
  };

  const handleDeleteTask = async (id: string) => {
    await deleteTask(id);
  };

  const handleUndo = async () => {
    if (!lastAction) return;
    const { kind, taskId } = lastAction;
    setLastAction(null);
    if (kind === 'completed') {
      await toggleCompleted(taskId); // 撤销完成：恢复未完成
    } else {
      await toggleCompleted(taskId); // 撤销恢复：重新标记完成
    }
    setToast(null);
  };

  const handleCreateTask = async (title: string, folderId: string | null) => {
    await createTask(title, folderId);
    setCaptureOpen(false);
  };

  // ===== 搜索过滤（标题/备注匹配） =====
  const filteredCompleted = useMemo(() => {
    if (!searchQuery.trim()) return completedTasks;
    const q = searchQuery.toLowerCase();
    return completedTasks.filter((t) => t.title.toLowerCase().includes(q));
  }, [completedTasks, searchQuery]);

  // 未分类任务过滤
  const unclassifiedToRender = useMemo(() => {
    if (!searchQuery.trim()) return unclassifiedTasks;
    const q = searchQuery.toLowerCase();
    return unclassifiedTasks.filter(
      (t) => t.title.toLowerCase().includes(q) || t.remark.toLowerCase().includes(q)
      || t.subtasks.some((s) => s.title.toLowerCase().includes(q))
    );
  }, [unclassifiedTasks, searchQuery]);

  // ===== 递归过滤文件夹树（搜索时保留含匹配任务的路径） =====
  const treeToRender = useMemo(() => {
    if (!searchQuery.trim()) return folderTree;
    const q = searchQuery.toLowerCase();
    const filterNode = (node: FolderNode): FolderNode | null => {
      const tasks = node.tasks.filter(
        (t) => t.title.toLowerCase().includes(q) || t.remark.toLowerCase().includes(q) || t.subtasks.some((s) => s.title.toLowerCase().includes(q))
      );
      const children = node.children.map(filterNode).filter((c): c is FolderNode => c !== null);
      if (tasks.length === 0 && children.length === 0) return null;
      return { ...node, tasks, children };
    };
    return folderTree.map(filterNode).filter((n): n is FolderNode => n !== null);
  }, [folderTree, searchQuery]);

  const matchCount = useMemo(() => {
    const activeCount = treeToRender.reduce((acc, folder) => {
      const count = (node: FolderNode): number =>
        node.tasks.length + node.children.reduce((a, c) => a + count(c), 0);
      return acc + count(folder);
    }, 0);
    return activeCount + unclassifiedToRender.length + filteredCompleted.length;
  }, [treeToRender, unclassifiedToRender, filteredCompleted]);

  // 加载状态
  if (loading) {
    return (
      <div style={{
        width: '100%', height: '100%', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-sans)', color: 'var(--muted-foreground)',
        fontSize: 14,
      }}>
        加载中...
      </div>
    );
  }

  // 错误状态
  if (error) {
    return (
      <div style={{
        width: '100%', height: '100%', display: 'flex',
        alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
        gap: 8, fontFamily: 'var(--font-sans)', color: 'var(--destructive)',
        fontSize: 14, padding: 20, textAlign: 'center',
      }}>
        <span>数据库加载失败</span>
        <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{error}</span>
      </div>
    );
  }

  return (
    <div
      className={theme}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-sans)',
        color: 'var(--foreground)',
        borderRadius: 'calc(var(--radius) * 1.1)',
        overflow: 'hidden',
      }}
      onContextMenu={(e) => {
        // 顶部栏右键不弹出菜单
        if ((e.target as HTMLElement).closest('header')) return;
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, taskId: null });
      }}
    >
      {/* 毛玻璃主容器 */}
      <div style={{
        position: 'relative',
        zIndex: 1,
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 'calc(var(--radius) * 1.1)',
        background: 'color-mix(in srgb, var(--background) 85%, transparent)',
        WebkitBackdropFilter: 'saturate(180%) blur(40px)',
        backdropFilter: 'saturate(180%) blur(40px)',
        boxShadow: 'var(--shadow-xl), 0 0 0 0.5px color-mix(in srgb, var(--border) 40%, transparent)',
        overflow: 'hidden',
        border: '0.5px solid color-mix(in srgb, var(--border) 30%, transparent)',
      }}>
        <TopBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onOpenSettings={() => setSettingsOpen(true)}
          onNewTask={() => setCaptureOpen(true)}
          pinned={pinned}
          onTogglePin={() => setPinned(!pinned)}
        />

        {/* 分隔线 */}
        <div style={{ height: 0.5, background: 'var(--border)', margin: '0 20px', flexShrink: 0, opacity: 0.6 }} />

        {/* 搜索提示 */}
        {searchQuery.trim() && (
          <div style={{ padding: '8px 20px 2px', flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>找到 {matchCount} 个匹配结果</span>
          </div>
        )}

        {/* 树视图（可滚动） */}
        <main
          data-tree
          style={{
            flex: 1,
            overflowY: 'auto',
            minHeight: 0,
            padding: '8px 20px 20px',
          }}
        >
          <FolderTree
            folders={treeToRender}
            rootTasks={unclassifiedToRender}
            expandedFolders={expandedFolders}
            expandedTasks={expandedTasks}
            searchQuery={searchQuery}
            onToggleFolder={(id) => setExpandedFolders((s) => toggleSet(s, id))}
            onToggleTaskExpanded={(id) => setExpandedTasks((s) => toggleSet(s, id))}
            onToggleCompleted={handleToggleCompleted}
            onContextMenuTask={(e, taskId) => {
              e.preventDefault();
              e.stopPropagation();
              setContextMenu({ x: e.clientX, y: e.clientY, taskId });
            }}
            onContextMenuFolder={(e, folderId) => {
              e.preventDefault();
              e.stopPropagation();
              setContextMenu({ x: e.clientX, y: e.clientY, taskId: null, folderId });
            }}
          />

          {/* 分隔线 */}
          <div style={{ height: 0.5, background: 'var(--border)', margin: '12px 0 8px', opacity: 0.5 }} />

          <CompletedSection
            tasks={filteredCompleted}
            expanded={completedExpanded}
            onToggleExpanded={() => setCompletedExpanded(!completedExpanded)}
            onRestore={handleRestore}
          />
        </main>
      </div>

      {/* 右键菜单 */}
      <ContextMenu
        state={contextMenu}
        onClose={() => setContextMenu(null)}
        onEditTask={(_taskId) => {
          setToast(`编辑功能开发中`);
        }}
        onAddSubtask={(taskId) => {
          const task = findTaskAnywhere(taskId);
          setDialog({ type: 'add-subtask', taskId, folderId: task?.folderId ?? null });
        }}
        onExpandAll={() => {
          const allFolderIds = new Set<string>();
          const collect = (nodes: FolderNode[]) => {
            nodes.forEach((n) => {
              allFolderIds.add(n.id);
              collect(n.children);
            });
          };
          collect(folderTree);
          setExpandedFolders(allFolderIds);
        }}
        onCollapseAll={() => {
          setExpandedFolders(new Set());
          setExpandedTasks(new Set());
        }}
        onDeleteTask={handleDeleteTask}
        onCreateFolder={(parentId) => {
          setDialog({ type: 'create-folder', parentId });
        }}
        onRenameFolder={(folderId) => {
          const folder = allFolders.find((f) => f.id === folderId);
          setDialog({ type: 'rename-folder', folderId, defaultValue: folder?.name || '' });
        }}
        onDeleteFolder={(folderId) => {
          const folder = allFolders.find((f) => f.id === folderId);
          setDialog({ type: 'delete-folder', folderId, name: folder?.name || '' });
        }}
      />

      {/* Quick Capture */}
      {captureOpen && (
        <QuickCapture
          folders={folderTree}
          onClose={() => setCaptureOpen(false)}
          onCreate={handleCreateTask}
        />
      )}

      {/* 设置面板 */}
      {settingsOpen && (
        <SettingsPanel
          theme={theme as ThemeMode}
          onThemeChange={(t) => setTheme(t)}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {/* 文件夹对话框（替代 prompt/confirm） */}
      {dialog?.type === 'create-folder' && (
        <PromptDialog
          title="新建文件夹"
          placeholder="文件夹名称"
          confirmText="创建"
          onConfirm={async (name) => {
            await createFolder(name, dialog.parentId);
            setDialog(null);
          }}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'rename-folder' && (
        <PromptDialog
          title="重命名文件夹"
          defaultValue={dialog.defaultValue}
          placeholder="文件夹名称"
          confirmText="保存"
          onConfirm={async (name) => {
            await renameFolder(dialog.folderId, name);
            setDialog(null);
          }}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'delete-folder' && (
        <ConfirmDialog
          title="删除文件夹"
          message={`确定删除文件夹 "${dialog.name}" 及其所有任务？此操作不可恢复。`}
          confirmText="删除"
          destructive
          onConfirm={async () => {
            await deleteFolder(dialog.folderId);
            setDialog(null);
          }}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'add-subtask' && (
        <PromptDialog
          title="添加子任务"
          placeholder="子任务名称"
          confirmText="添加"
          onConfirm={async (name) => {
            // 子任务继承父任务所在文件夹；完成后自动展开父任务便于查看
            await createTask(name, dialog.folderId, { parentId: dialog.taskId });
            setExpandedTasks((s) => new Set(s).add(dialog.taskId));
            setDialog(null);
          }}
          onCancel={() => setDialog(null)}
        />
      )}

      {/* Undo Toast */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 16,
          height: 40,
          padding: '0 20px',
          borderRadius: 'calc(var(--radius)*0.8)',
          background: 'var(--foreground)',
          color: 'var(--background)',
          fontSize: 13,
          fontWeight: 500,
          boxShadow: 'var(--shadow-lg)',
          zIndex: 200,
          whiteSpace: 'nowrap',
        }}>
          <span>{toast}</span>
          <button
            onClick={handleUndo}
            disabled={!lastAction}
            style={{
              color: 'var(--brand-400)',
              fontWeight: 600,
              cursor: 'pointer',
              border: 'none',
              background: 'transparent',
              fontSize: 13,
              fontFamily: 'var(--font-sans)',
              padding: 0,
              whiteSpace: 'nowrap',
              opacity: lastAction ? 1 : 0.4,
            }}
          >
            撤销
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
