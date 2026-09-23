/** 顶栏可消费的同步状态。只表达用户需要判断的事实，不泄露同步实现细节。 */
export type SyncUiState =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'syncing' }
  | { kind: 'synced'; at: number }
  | { kind: 'error'; message: string };

let current: SyncUiState = { kind: 'idle' };
const listeners = new Set<(state: SyncUiState) => void>();

export function setSyncUiState(state: SyncUiState): void {
  current = state;
  listeners.forEach((listener) => listener(current));
}

export function getSyncUiState(): SyncUiState {
  return current;
}

export function subscribeSyncUiState(listener: (state: SyncUiState) => void): () => void {
  listeners.add(listener);
  listener(current);
  return () => listeners.delete(listener);
}
