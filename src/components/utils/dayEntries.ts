export interface IdentifiedDayEntry {
  task: { id: string };
  parentTitle?: string;
}

/** 日视图按任务 ID 去重；重复时优先保留带父任务归属信息的条目。 */
export function dedupeDayEntries<T extends IdentifiedDayEntry>(entries: T[]): T[] {
  const unique = new Map<string, T>();
  for (const entry of entries) {
    const existing = unique.get(entry.task.id);
    if (!existing || (!existing.parentTitle && entry.parentTitle)) {
      unique.set(entry.task.id, entry);
    }
  }
  return [...unique.values()];
}
