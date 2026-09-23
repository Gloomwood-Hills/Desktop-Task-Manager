import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown, ChevronRight, Clock, Folder as FolderIcon, Pencil, Trash2, X } from 'lucide-react';
import { FolderNode, TaskWithSubtasks } from '../../data/types';
import { formatDeadlineRel, formatDeadlineYMD } from '../utils/formatDate';
import { drawerReveal, panelSpring } from '../utils/motion';
import { DeferTarget } from '../utils/taskTiming';
import { deadlineColor } from '../taskItem';
import { getEffectiveDeadline } from '../../data/utils';

interface MobileTaskListProps {
  folders: FolderNode[];
  rootTasks: TaskWithSubtasks[];
  expandedTasks: Set<string>;
  onToggleTaskExpanded: (id: string) => void;
  onToggleCompleted: (task: TaskWithSubtasks) => void;
  onOpenTask: (task: TaskWithSubtasks) => void;
  onEditTask: (task: TaskWithSubtasks) => void;
  onDeferTask: (task: TaskWithSubtasks, target: DeferTarget) => void;
  onDeleteTask: (task: TaskWithSubtasks) => void;
}

interface MobileTaskRowProps {
  task: TaskWithSubtasks;
  depth: number;
  expandedTasks: Set<string>;
  expanded: boolean;
  onToggleExpanded: () => void;
  onToggleTaskExpanded: (id: string) => void;
  onToggleCompleted: () => void;
  onToggleCompletedFor: (task: TaskWithSubtasks) => void;
  onOpenTask: () => void;
  onEditTask: () => void;
  onRequestDefer: () => void;
  onDeleteTask: () => void;
  onOpenTaskFor: (task: TaskWithSubtasks) => void;
  onEditTaskFor: (task: TaskWithSubtasks) => void;
  onRequestDeferFor: (task: TaskWithSubtasks) => void;
  onDeleteTaskFor: (task: TaskWithSubtasks) => void;
  activeSwipeTaskId: string | null;
  onSwipeOpen: (taskId: string) => void;
  onSwipeClose: () => void;
}

const SWIPE_TRIGGER = 72;
const SWIPE_MAX = 222;

function MobileTaskRow({ task, depth, expanded, expandedTasks, onToggleExpanded, onToggleTaskExpanded, onToggleCompleted, onToggleCompletedFor, onOpenTask, onEditTask, onRequestDefer, onDeleteTask, onOpenTaskFor, onEditTaskFor, onRequestDeferFor, onDeleteTaskFor, activeSwipeTaskId, onSwipeOpen, onSwipeClose }: MobileTaskRowProps) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<{ startX: number; startY: number; axis: 'x' | 'y' | null; startOffset: number } | null>(null);
  const suppressActionClick = useRef(false);
  const revealed = activeSwipeTaskId === task.id;
  const revealProgress = Math.min(1, Math.max(0, -offset / SWIPE_MAX));

  useEffect(() => {
    if (!dragging) setOffset(revealed ? -SWIPE_MAX : 0);
  }, [revealed, dragging]);

  const finishGesture = (x: number) => {
    const current = x;
    if (revealed && current > -SWIPE_MAX + 36) {
      setOffset(0);
      onSwipeClose();
    } else if (!revealed && current > SWIPE_TRIGGER) {
      setOffset(0);
      onOpenTask();
    } else if (current < -SWIPE_TRIGGER) {
      setOffset(-SWIPE_MAX);
      onSwipeOpen(task.id);
    } else if (current > -SWIPE_TRIGGER / 2) {
      setOffset(0);
      onSwipeClose();
    } else {
      setOffset(revealed ? -SWIPE_MAX : 0);
    }
    setDragging(false);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    gesture.current = { startX: event.clientX, startY: event.clientY, axis: null, startOffset: offset };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = gesture.current;
    if (!state) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    if (!state.axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      state.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (state.axis === 'x') {
        event.currentTarget.setPointerCapture(event.pointerId);
        suppressActionClick.current = true;
        setDragging(true);
      }
    }
    if (state.axis !== 'x') return;
    event.preventDefault();
    const next = Math.max(-SWIPE_MAX, Math.min(96, state.startOffset + dx));
    setOffset(next);
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = gesture.current;
    gesture.current = null;
    if (!state) return;
    const dx = event.clientX - state.startX;
    if (state.axis === 'x') {
      finishGesture(state.startOffset + dx);
      window.setTimeout(() => { suppressActionClick.current = false; }, 0);
      return;
    }
    // 任务详情仅由行末的“>”按钮打开，避免轻触任务时误进入详情。
  };

  const effectiveDeadline = getEffectiveDeadline(task);
  const deadlineStyle = effectiveDeadline !== null ? deadlineColor(effectiveDeadline, true, document.documentElement.classList.contains('dark')) : null;

  return (
    <div className="mobile-task-node" style={{ marginLeft: depth * 12 }}>
    <motion.div
      className="mobile-task-swipe-shell"
      data-mobile-swipe-task-id={task.id}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { gesture.current = null; setDragging(false); setOffset(revealed ? -SWIPE_MAX : 0); }}
    >
      <div
        className={`mobile-task-actions ${revealed ? 'is-revealed' : ''}`}
        aria-hidden={revealProgress < .98}
        style={{ opacity: revealProgress, transform: `translate3d(${(1 - revealProgress) * 24}px, 0, 0)` }}
      >
        <button type="button" className="mobile-task-defer-action" onClick={() => { if (suppressActionClick.current) return; onSwipeClose(); setOffset(0); onRequestDefer(); }} tabIndex={revealed ? 0 : -1}>
          <Clock />
          <span>稍后</span>
        </button>
        <button type="button" onClick={() => { if (suppressActionClick.current) return; onSwipeClose(); setOffset(0); onEditTask(); }} tabIndex={revealed ? 0 : -1}>
          <Pencil />
          <span>编辑</span>
        </button>
        <button type="button" className="mobile-task-delete-action" onClick={() => { if (suppressActionClick.current) return; onSwipeClose(); setOffset(0); onDeleteTask(); }} tabIndex={revealed ? 0 : -1}>
          <Trash2 />
          <span>删除</span>
        </button>
      </div>
      <div
        className={`mobile-task-row ${dragging ? 'is-dragging' : ''}`}
        data-mobile-task-row
        style={{ transform: `translate3d(${offset}px, 0, 0)` }}
      >
        <button
          type="button"
          className={`mobile-task-check ${task.completed ? 'is-complete' : ''} ${task.priority === 'important' ? 'is-important' : ''}`}
          aria-label={task.completed ? '恢复任务' : '完成任务'}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => { event.stopPropagation(); onToggleCompleted(); }}
        >
          {task.completed && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={panelSpring}><Check /></motion.span>}
        </button>
        <div className="mobile-task-copy">
          <div className="mobile-task-title-line">
            <span className={`mobile-task-title ${task.completed ? 'is-complete' : ''}`}>{task.title}</span>
          </div>
          <div className="mobile-task-meta">
            {effectiveDeadline !== null && deadlineStyle ? <span className="mobile-task-deadline" style={{ background: deadlineStyle.bg, color: deadlineStyle.color }}><Clock />{formatDeadlineRel(effectiveDeadline) && <b>{formatDeadlineRel(effectiveDeadline)}</b>}<span>{formatDeadlineYMD(effectiveDeadline)}</span></span> : <span>无截止时间</span>}
            {task.subtasks.length > 0 && <button type="button" className="mobile-subtask-toggle" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onToggleExpanded(); }} aria-label={expanded ? '收起子任务' : '展开子任务'}>
              {expanded ? <ChevronDown /> : <ChevronRight />}<span>{task.subtasks.filter((child) => child.completed).length}/{task.subtasks.length}</span>
            </button>}
          </div>
        </div>
      </div>
    </motion.div>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div key={`subtasks-${task.id}`} variants={drawerReveal} initial="initial" animate="animate" exit="exit" style={{ overflow: 'hidden' }}>
            {task.subtasks.map((child) => (
              <MobileTaskRow
                key={child.id}
                task={child}
                depth={depth + 1}
                expanded={expandedTasks.has(child.id)}
                expandedTasks={expandedTasks}
                onToggleExpanded={() => onToggleTaskExpanded(child.id)}
                onToggleTaskExpanded={onToggleTaskExpanded}
                onToggleCompleted={() => onToggleCompletedFor(child)}
                onToggleCompletedFor={onToggleCompletedFor}
                onOpenTask={() => onOpenTaskFor(child)}
                onEditTask={() => onEditTaskFor(child)}
                onRequestDefer={() => onRequestDeferFor(child)}
                onDeleteTask={() => onDeleteTaskFor(child)}
                onOpenTaskFor={onOpenTaskFor}
                onEditTaskFor={onEditTaskFor}
                onRequestDeferFor={onRequestDeferFor}
                onDeleteTaskFor={onDeleteTaskFor}
                activeSwipeTaskId={activeSwipeTaskId}
                onSwipeOpen={onSwipeOpen}
                onSwipeClose={onSwipeClose}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FolderSection({ folder, depth, expandedTasks, onToggleTaskExpanded, onToggleCompleted, onOpenTask, onEditTask, onRequestDefer, onDeleteTask, activeSwipeTaskId, onSwipeOpen, onSwipeClose }: { folder: FolderNode; depth: number; expandedTasks: Set<string>; onToggleTaskExpanded: (id: string) => void; onToggleCompleted: (task: TaskWithSubtasks) => void; onOpenTask: (task: TaskWithSubtasks) => void; onEditTask: (task: TaskWithSubtasks) => void; onRequestDefer: (task: TaskWithSubtasks) => void; onDeleteTask: (task: TaskWithSubtasks) => void; activeSwipeTaskId: string | null; onSwipeOpen: (taskId: string) => void; onSwipeClose: () => void }) {
  const [open, setOpen] = useState(true);
  const total = folder.tasks.length + folder.children.reduce((count, child) => count + child.tasks.length, 0);
  return (
    <section className="mobile-folder-section" style={{ marginLeft: depth * 8 }}>
      <button type="button" className="mobile-folder-heading" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        {open ? <ChevronDown /> : <ChevronRight />}<FolderIcon /><span>{folder.name}</span><small>{total}</small>
      </button>
      <AnimatePresence initial={false}>
      {open && (
        <motion.div key={`folder-${folder.id}`} className="mobile-folder-content" variants={drawerReveal} initial="initial" animate="animate" exit="exit" style={{ overflow: 'hidden' }}>
          {folder.tasks.map((task) => <MobileTaskRow key={task.id} task={task} depth={0} expanded={expandedTasks.has(task.id)} expandedTasks={expandedTasks} onToggleExpanded={() => onToggleTaskExpanded(task.id)} onToggleTaskExpanded={onToggleTaskExpanded} onToggleCompleted={() => onToggleCompleted(task)} onToggleCompletedFor={onToggleCompleted} onOpenTask={() => onOpenTask(task)} onEditTask={() => onEditTask(task)} onRequestDefer={() => onRequestDefer(task)} onDeleteTask={() => onDeleteTask(task)} onOpenTaskFor={onOpenTask} onEditTaskFor={onEditTask} onRequestDeferFor={onRequestDefer} onDeleteTaskFor={onDeleteTask} activeSwipeTaskId={activeSwipeTaskId} onSwipeOpen={onSwipeOpen} onSwipeClose={onSwipeClose} />)}
          {folder.children.map((child) => <FolderSection key={child.id} folder={child} depth={depth + 1} expandedTasks={expandedTasks} onToggleTaskExpanded={onToggleTaskExpanded} onToggleCompleted={onToggleCompleted} onOpenTask={onOpenTask} onEditTask={onEditTask} onRequestDefer={onRequestDefer} onDeleteTask={onDeleteTask} activeSwipeTaskId={activeSwipeTaskId} onSwipeOpen={onSwipeOpen} onSwipeClose={onSwipeClose} />)}
        </motion.div>
      )}
      </AnimatePresence>
    </section>
  );
}

/** 手机列表：去掉桌面拖拽排序，改为分组、滑动操作和底部详情入口。 */
export default function MobileTaskList({ folders, rootTasks, expandedTasks, onToggleTaskExpanded, onToggleCompleted, onOpenTask, onEditTask, onDeferTask, onDeleteTask }: MobileTaskListProps) {
  const [deferTask, setDeferTask] = useState<TaskWithSubtasks | null>(null);
  const [activeSwipeTaskId, setActiveSwipeTaskId] = useState<string | null>(null);
  useEffect(() => {
    if (!activeSwipeTaskId) return;
    const closeFromOutside = (event: PointerEvent) => {
      const target = event.target;
      const shell = target instanceof Element ? target.closest<HTMLElement>('[data-mobile-swipe-task-id]') : null;
      if (shell?.dataset.mobileSwipeTaskId !== activeSwipeTaskId) setActiveSwipeTaskId(null);
    };
    document.addEventListener('pointerdown', closeFromOutside, true);
    return () => document.removeEventListener('pointerdown', closeFromOutside, true);
  }, [activeSwipeTaskId]);
  const deferOptions: { target: DeferTarget; label: string }[] = [
    { target: 'tonight', label: '今晚' },
    { target: 'tomorrow', label: '明天' },
    { target: 'nextWorkday', label: '下个工作日' },
    { target: 'nextMonday', label: '下周一' },
  ];
  return (
    <div className="mobile-task-list">
      {rootTasks.length === 0 && folders.length === 0 ? (
        <div className="mobile-empty-state"><Check /><strong>暂无待办</strong><span>点击下方加号记录一项任务</span></div>
      ) : (
        <>
          {rootTasks.map((task) => <MobileTaskRow key={task.id} task={task} depth={0} expanded={expandedTasks.has(task.id)} expandedTasks={expandedTasks} onToggleExpanded={() => onToggleTaskExpanded(task.id)} onToggleTaskExpanded={onToggleTaskExpanded} onToggleCompleted={() => onToggleCompleted(task)} onToggleCompletedFor={onToggleCompleted} onOpenTask={() => onOpenTask(task)} onEditTask={() => onEditTask(task)} onRequestDefer={() => setDeferTask(task)} onDeleteTask={() => onDeleteTask(task)} onOpenTaskFor={onOpenTask} onEditTaskFor={onEditTask} onRequestDeferFor={setDeferTask} onDeleteTaskFor={onDeleteTask} activeSwipeTaskId={activeSwipeTaskId} onSwipeOpen={setActiveSwipeTaskId} onSwipeClose={() => setActiveSwipeTaskId(null)} />)}
          {folders.map((folder) => <FolderSection key={folder.id} folder={folder} depth={0} expandedTasks={expandedTasks} onToggleTaskExpanded={onToggleTaskExpanded} onToggleCompleted={onToggleCompleted} onOpenTask={onOpenTask} onEditTask={onEditTask} onRequestDefer={setDeferTask} onDeleteTask={onDeleteTask} activeSwipeTaskId={activeSwipeTaskId} onSwipeOpen={setActiveSwipeTaskId} onSwipeClose={() => setActiveSwipeTaskId(null)} />)}
        </>
      )}
      <AnimatePresence>
        {deferTask && (
          <motion.div className="mobile-defer-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <button type="button" className="mobile-defer-scrim" aria-label="关闭稍后处理" onClick={() => setDeferTask(null)} />
            <motion.section className="mobile-defer-sheet" role="dialog" aria-modal="true" aria-label="稍后处理" initial={{ opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .96 }} transition={panelSpring}>
              <div className="mobile-defer-header">
                <div><strong>稍后处理</strong><span>{deferTask.title}</span></div>
                <button type="button" aria-label="关闭" onClick={() => setDeferTask(null)}><X /></button>
              </div>
              <div className="mobile-defer-options">
                {deferOptions.map((option) => (
                  <button key={option.target} type="button" onClick={() => { const task = deferTask; setDeferTask(null); onDeferTask(task, option.target); }}>
                    <Clock /><span>{option.label}</span><ChevronRight />
                  </button>
                ))}
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
