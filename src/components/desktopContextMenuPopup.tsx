import { useEffect, useMemo } from 'react';
import { emitTo } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import ContextMenu, { ContextMenuState } from './contextMenu';
import { DeferTarget } from './utils/taskTiming';

export type DesktopTaskMenuAction =
  | 'edit'
  | 'toggle-complete'
  | 'delete'
  | 'stop-repeat'
  | 'defer';

export interface DesktopTaskMenuActionPayload {
  taskId: string;
  action: DesktopTaskMenuAction;
  target?: DeferTarget;
}

/** 独立透明浮窗中的任务菜单；复用原 ContextMenu，视觉与主窗口完全一致。 */
export default function DesktopContextMenuPopup() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const taskId = params.get('taskId') ?? '';
  const taskCompleted = params.get('taskCompleted') === 'true';
  const canStopRepeat = params.get('canStopRepeat') === 'true';
  const dark = params.get('dark') === 'true';

  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.classList.add('context-menu-popup');

  const close = () => { void getCurrentWindow().close(); };
  const scheduleClose = () => { window.setTimeout(close, 120); };
  const send = (action: DesktopTaskMenuAction, target?: DeferTarget) => {
    void emitTo<DesktopTaskMenuActionPayload>('main', 'desktop-task-context-action', { taskId, action, target })
      .catch((error) => console.error('[task-context-menu] failed to send action', error))
      .finally(close);
  };

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    getCurrentWindow().onFocusChanged(({ payload }) => {
      if (!payload) close();
    }).then((fn) => { unlisten = fn; });
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      unlisten?.();
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const state: ContextMenuState = {
    x: 8,
    y: 8,
    taskId,
    taskCompleted,
    canStopRepeat,
  };

  return (
    <ContextMenu
      state={state}
      onClose={scheduleClose}
      onEditTask={() => send('edit')}
      onToggleComplete={() => send('toggle-complete')}
      onDeleteTask={() => send('delete')}
      onStopRepeat={() => send('stop-repeat')}
      onDeferTask={(_id, target) => send('defer', target)}
      deferSubmenuDirection="right"
      onCreateFolder={() => {}}
      onRenameFolder={() => {}}
      onDeleteFolder={() => {}}
      onNewTask={() => {}}
      onNewTaskInFolder={() => {}}
      onRefresh={() => {}}
      onOpenSettings={() => {}}
      onExit={() => {}}
    />
  );
}
