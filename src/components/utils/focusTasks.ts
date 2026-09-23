import { TaskWithSubtasks } from '../../data/types';

/**
 * 每日焦点采用配额选取，避免积压或大量重要任务占满页面：
 * 最多 2 项逾期、2 项最近到期、1 项其余重要任务，再按截止时间补齐空位。
 */
export function selectTodayFocus(tasks: TaskWithSubtasks[], now = Date.now(), limit = 5): TaskWithSubtasks[] {
  const claimed = new Set<string>();
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const claimFamily = (task: TaskWithSubtasks) => {
    claimed.add(task.id);
    const claimDescendants = (children: TaskWithSubtasks[]) => children.forEach((child) => {
      claimed.add(child.id);
      claimDescendants(child.subtasks ?? []);
    });
    claimDescendants(task.subtasks ?? []);
    let parentId = task.parentId;
    while (parentId) {
      if (claimed.has(parentId)) break;
      claimed.add(parentId);
      parentId = byId.get(parentId)?.parentId ?? null;
    }
  };
  const active = tasks.filter((task) => !task.completed);
  const overdue = active
    .filter((task) => task.deadline !== null && task.deadline < now)
    // 最近刚错过的任务优先，避免陈年积压持续占据焦点页。
    .sort((a, b) => (b.deadline ?? 0) - (a.deadline ?? 0));
  const upcoming = active
    .filter((task) => task.deadline !== null && task.deadline >= now)
    .sort((a, b) => (a.deadline ?? 0) - (b.deadline ?? 0));
  const important = active
    .filter((task) => task.priority === 'important')
    .sort((a, b) => (a.deadline ?? Number.MAX_SAFE_INTEGER) - (b.deadline ?? Number.MAX_SAFE_INTEGER));
  const selected: TaskWithSubtasks[] = [];
  const take = (candidates: TaskWithSubtasks[], quota: number) => {
    let added = 0;
    for (const task of candidates) {
      if (selected.length === limit || added === quota) break;
      if (claimed.has(task.id)) continue;
      selected.push(task);
      claimFamily(task);
      added += 1;
    }
  };

  take(overdue, Math.min(2, limit));
  take(upcoming, Math.min(2, Math.max(0, limit - selected.length)));
  take(important, Math.min(1, Math.max(0, limit - selected.length)));
  take([...overdue, ...upcoming, ...important], Math.max(0, limit - selected.length));
  return selected;
}
