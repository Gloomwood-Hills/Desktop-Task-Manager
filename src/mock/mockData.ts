import { Folder, Task, TaskWithSubtasks, FolderWithTasks } from '../data/types';

/**
 * 模拟数据：与 .design-taskmanager-ui 设计稿保持一致
 * 后续阶段接入真实数据层后移除本文件
 */

const now = Date.now();
const day = 24 * 60 * 60 * 1000;

// 任务基准时间（相对当前时间计算，保证日期徽章始终合理）
const mkTask = (
  id: string,
  title: string,
  folderId: string,
  parentId: string | null,
  opts: Partial<Task> = {}
): Task => ({
  id,
  title,
  remark: '',
  folderId,
  parentId,
  startDate: null,
  deadline: null,
  priority: 'normal',
  completed: false,
  completedAt: null,
  deleted: false,
  createdAt: now,
  updatedAt: now,
  ...opts,
});

// ===== 文件夹 =====
export const mockFolders: Folder[] = [
  { id: 'folder-ky', name: '科研', parentId: null, sortOrder: 0, createdAt: now, updatedAt: now },
  { id: 'folder-lw', name: '论文', parentId: 'folder-ky', sortOrder: 0, createdAt: now, updatedAt: now },
  { id: 'folder-sy', name: '实验', parentId: 'folder-ky', sortOrder: 1, createdAt: now, updatedAt: now },
  { id: 'folder-gp', name: '股票', parentId: null, sortOrder: 1, createdAt: now, updatedAt: now },
  { id: 'folder-sh', name: '生活', parentId: null, sortOrder: 2, createdAt: now, updatedAt: now },
];

// ===== 任务（含子任务） =====
export const mockTasks: Task[] = [
  // 科研 > 论文
  mkTask('task-lw1', '修改论文第三章', 'folder-lw', null, {
    remark: '需要根据导师反馈修改第三章的结构和论证逻辑，重点补充实验数据支撑。',
    priority: 'important',
    deadline: now + day, // 明天
  }),
  mkTask('task-lw1-1', '检查参考文献格式', 'folder-lw', 'task-lw1', {
    completed: true,
    completedAt: now - 2 * day,
  }),
  mkTask('task-lw1-2', '重写实验方法', 'folder-lw', 'task-lw1', {
    completed: true,
    completedAt: now - day,
  }),
  mkTask('task-lw1-3', '补充数据图表', 'folder-lw', 'task-lw1'),
  mkTask('task-lw1-4', '校对全文', 'folder-lw', 'task-lw1'),
  mkTask('task-lw2', '提交实验报告', 'folder-lw', null, {
    deadline: now + 2 * day, // 后天
  }),
  mkTask('task-lw3', '整理论文参考文献', 'folder-lw', null),

  // 科研 > 实验
  mkTask('task-sy1', '记录实验数据', 'folder-sy', null),

  // 股票
  mkTask('task-gp1', '关注宁德时代走势', 'folder-gp', null, {
    priority: 'important',
    deadline: now, // 今天
  }),
  mkTask('task-gp2', '研究光伏板块', 'folder-gp', null, {
    deadline: now + 7 * day, // 下周
  }),

  // 生活
  mkTask('task-sh1', '预约牙医', 'folder-sh', null, {
    deadline: now + 4 * day, // 本周六左右
    startDate: now + 3 * day,
  }),
  mkTask('task-sh2', '买生日礼物', 'folder-sh', null),
];

// ===== 已完成任务 =====
export const mockCompletedTasks: Task[] = [
  mkTask('task-done1', '修改摘要', 'folder-lw', null, {
    completed: true,
    completedAt: now - 2 * day,
  }),
  mkTask('task-done2', '提交周报', 'folder-ky', null, {
    completed: true,
    completedAt: now - 3 * day,
  }),
];

// ===== 构建树 =====
function buildTaskTree(tasks: Task[]): TaskWithSubtasks[] {
  const taskMap = new Map<string, TaskWithSubtasks>();
  const rootTasks: TaskWithSubtasks[] = [];

  tasks.forEach((task) => {
    taskMap.set(task.id, { ...task, subtasks: [] });
  });

  tasks.forEach((task) => {
    const node = taskMap.get(task.id)!;
    if (task.parentId && taskMap.has(task.parentId)) {
      taskMap.get(task.parentId)!.subtasks.push(node);
    } else {
      rootTasks.push(node);
    }
  });

  return rootTasks;
}

/** 文件夹树节点：文件夹 + 其直属任务树 + 子文件夹 */
export interface FolderNode extends FolderWithTasks {
  children: FolderNode[];
}

function buildFolderTree(folders: Folder[], tasks: Task[]): FolderNode[] {
  const folderMap = new Map<string, FolderNode>();
  const rootNodes: FolderNode[] = [];

  folders.forEach((folder) => {
    folderMap.set(folder.id, { ...folder, tasks: [], children: [] });
  });

  folders.forEach((folder) => {
    const node = folderMap.get(folder.id)!;
    if (folder.parentId && folderMap.has(folder.parentId)) {
      folderMap.get(folder.parentId)!.children.push(node);
    } else {
      rootNodes.push(node);
    }
  });

  const fillTasks = (node: FolderNode) => {
    const directTasks = tasks.filter(
      (t) => t.folderId === node.id && (t.parentId === null || !folderMap.has(t.parentId))
    );
    node.tasks = buildTaskTree(directTasks);
    node.children.forEach(fillTasks);
  };

  rootNodes.forEach(fillTasks);

  return rootNodes;
}

export const mockFolderTree: FolderNode[] = buildFolderTree(mockFolders, mockTasks);

// ===== 文件夹路径索引（搜索时显示面包屑） =====
export const folderPathMap: Record<string, string> = {
  'folder-ky': '科研',
  'folder-lw': '科研 > 论文',
  'folder-sy': '科研 > 实验',
  'folder-gp': '股票',
  'folder-sh': '生活',
};
