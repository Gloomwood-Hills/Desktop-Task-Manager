import { TaskWithSubtasks } from '../../data/types';

/**
 * 在收起的父任务下只预览一条最需要关注的直属未完成子任务。
 * 有截止时间的子任务按其与当前时间的绝对间隔选取；无截止时间只在没有任何日期时
 * 才按原列表顺序兜底，避免“无日期”抢走用户最临近的截止事项。
 */
export function closestDeadlineSubtask(
  tasks: TaskWithSubtasks[],
  now = Date.now(),
): TaskWithSubtasks | null {
  const active = tasks.filter((task) => !task.completed);
  if (active.length === 0) return null;

  const dated = active.filter((task) => task.deadline !== null);
  if (dated.length === 0) return active[0];

  return dated.reduce((closest, task) => {
    const closestDistance = Math.abs(closest.deadline! - now);
    const taskDistance = Math.abs(task.deadline! - now);
    // 间隔相同时优先较早的截止时间，确保排序稳定且更保守地暴露临期事项。
    return taskDistance < closestDistance
      || (taskDistance === closestDistance && task.deadline! < closest.deadline!)
      ? task
      : closest;
  });
}
