import { useEffect, useMemo, useState } from 'react';
import TopBar from './components/topBar';
import FolderTree from './components/folderTree';
import CompletedSection from './components/completedSection';
import ShortcutHint from './components/shortcutHint';
import ContextMenu, { ContextMenuState } from './components/contextMenu';
import QuickCapture from './components/quickCapture';
import SettingsPanel, { ThemeMode } from './components/settingsPanel';
import { mockFolderTree, mockCompletedTasks, FolderNode } from './mock/mockData';
import { Task, TaskWithSubtasks } from './data/types';

function App() {
  const [theme, setTheme] = useState<ThemeMode>('light');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set(['folder-ky', 'folder-lw', 'folder-sy', 'folder-gp', 'folder-sh'])
  );
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(() => new Set(['task-lw1']));
  const [completedExpanded, setCompletedExpanded] = useState(true);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [completedTasks, setCompletedTasks] = useState<Task[]>(mockCompletedTasks);
  const [deletedTasks, setDeletedTasks] = useState<Map<string, Task>>(new Map());
  const [toast, setToast] = useState<string | null>(null);

  // 主题切换：挂载/切换 .dark class 到 document
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  // 撤销提示 5 秒自动消失
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const toggleSet = (set: Set<string>, id: string): Set<string> => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  // ===== 模拟任务数据（动态副本，用于完成/删除交互） =====
  const [activeTasks, setActiveTasks] = useState<Task[]>(() => {
    const all: Task[] = [];
    const collect = (nodes: FolderNode[]) => {
      nodes.forEach((n) => {
        const flatten = (tasks: TaskWithSubtasks[]) => {
          tasks.forEach((t) => {
            all.push(t);
            flatten(t.subtasks);
          });
        };
        flatten(n.tasks);
        collect(n.children);
      });
    };
    collect(mockFolderTree);
    return all;
  });

  const handleToggleCompleted = (id: string) => {
    setActiveTasks((prev) => {
      const task = prev.find((t) => t.id === id);
      if (!task) return prev;
      const completed = !task.completed;
      let next = prev.map((t) =>
        t.id === id ? { ...t, completed, completedAt: completed ? Date.now() : null } : t
      );
      if (completed) {
        const done = next.find((t) => t.id === id)!;
        setCompletedTasks((c) => [done, ...c]);
        next = next.filter((t) => t.id !== id);
      } else {
        setCompletedTasks((c) => c.filter((t) => t.id !== id));
      }
      return next;
    });
  };

  const handleRestore = (id: string) => {
    const task = completedTasks.find((t) => t.id === id);
    if (!task) return;
    setCompletedTasks((c) => c.filter((t) => t.id !== id));
    setActiveTasks((prev) => [...prev, { ...task, completed: false, completedAt: null }]);
    setToast('已恢复 1 个任务');
  };

  const handleDeleteTask = (id: string) => {
    setActiveTasks((prev) => {
      const task = prev.find((t) => t.id === id);
      if (!task) return prev;
      setDeletedTasks((m) => new Map(m).set(id, task));
      setToast(`已删除 "${task.title}"`);
      return prev.filter((t) => t.id !== id);
    });
  };

  const handleUndo = () => {
    if (deletedTasks.size === 0) return;
    const last = Array.from(deletedTasks.entries()).pop()!;
    setDeletedTasks((m) => {
      const next = new Map(m);
      next.delete(last[0]);
      return next;
    });
    setActiveTasks((prev) => [...prev, last[1]]);
    setToast(null);
  };

  const handleCreateTask = (title: string, folderId: string) => {
    const id = `task-${Date.now()}`;
    const now = Date.now();
    const task: Task = {
      id, title, remark: '', folderId, parentId: null,
      startDate: null, deadline: null, priority: 'normal',
      completed: false, completedAt: null, deleted: false,
      createdAt: now, updatedAt: now,
    };
    setActiveTasks((prev) => [...prev, task]);
    setCaptureOpen(false);
    setToast(`已创建 "${title}"`);
  };

  // ===== 搜索过滤（标题/备注匹配） =====
  const filteredTasks = useMemo(() => {
    if (!searchQuery.trim()) return activeTasks;
    const q = searchQuery.toLowerCase();
    return activeTasks.filter((t) => t.title.toLowerCase().includes(q) || t.remark.toLowerCase().includes(q));
  }, [activeTasks, searchQuery]);

  const filteredCompleted = useMemo(() => {
    if (!searchQuery.trim()) return completedTasks;
    const q = searchQuery.toLowerCase();
    return completedTasks.filter((t) => t.title.toLowerCase().includes(q));
  }, [completedTasks, searchQuery]);

  // ===== 递归过滤文件夹树（搜索时保留含匹配任务的路径） =====
  const treeToRender = useMemo(() => {
    if (!searchQuery.trim()) return mockFolderTree;
    const q = searchQuery.toLowerCase();
    const filterNode = (node: FolderNode): FolderNode | null => {
      const tasks = node.tasks.filter(
        (t) => t.title.toLowerCase().includes(q) || t.remark.toLowerCase().includes(q) || t.subtasks.some((s) => s.title.toLowerCase().includes(q))
      );
      const children = node.children.map(filterNode).filter((c): c is FolderNode => c !== null);
      if (tasks.length === 0 && children.length === 0) return null;
      return { ...node, tasks, children };
    };
    return mockFolderTree.map(filterNode).filter((n): n is FolderNode => n !== null);
  }, [searchQuery]);

  const matchCount = filteredTasks.length + filteredCompleted.length;

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
      }}
      onContextMenu={(e) => {
        // 空白区域右键：显示通用菜单
        if ((e.target as HTMLElement).closest('[data-tree]')) return;
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

      {/* 快捷键提示 */}
      <ShortcutHint />

      {/* 右键菜单 */}
      <ContextMenu
        state={contextMenu}
        onClose={() => setContextMenu(null)}
        onEditTask={(taskId) => {
          const task = activeTasks.find((t) => t.id === taskId);
          setToast(task ? `编辑 "${task.title}"（演示）` : null);
        }}
        onExpandAll={() => {
          setExpandedFolders(new Set(['folder-ky', 'folder-lw', 'folder-sy', 'folder-gp', 'folder-sh']));
          setExpandedTasks(new Set(activeTasks.filter((t) => t.parentId === null).map((t) => t.id)));
        }}
        onCollapseAll={() => {
          setExpandedFolders(new Set());
          setExpandedTasks(new Set());
        }}
        onDeleteTask={handleDeleteTask}
      />

      {/* Quick Capture */}
      {captureOpen && (
        <QuickCapture
          folders={mockFolderTree}
          onClose={() => setCaptureOpen(false)}
          onCreate={handleCreateTask}
        />
      )}

      {/* 设置面板 */}
      {settingsOpen && (
        <SettingsPanel
          theme={theme}
          onThemeChange={setTheme}
          onClose={() => setSettingsOpen(false)}
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
            disabled={deletedTasks.size === 0}
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
              opacity: deletedTasks.size === 0 ? 0.4 : 1,
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
