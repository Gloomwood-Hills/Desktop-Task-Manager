import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown, ChevronRight, Clock, Folder as FolderIcon, Pencil, Star } from 'lucide-react';
import { FolderNode, TaskWithSubtasks } from '../../data/types';
import { formatDeadline, formatDeadlineRel } from '../utils/formatDate';
import { listItem, panelSpring } from '../utils/motion';

interface MobileTaskListProps {
  folders: FolderNode[];
  rootTasks: TaskWithSubtasks[];
  expandedTasks: Set<string>;
  onToggleTaskExpanded: (id: string) => void;
  onToggleCompleted: (task: TaskWithSubtasks) => void;
  onOpenTask: (task: TaskWithSubtasks) => void;
  onEditTask: (task: TaskWithSubtasks) => void;
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
  onOpenTaskFor: (task: TaskWithSubtasks) => void;
  onEditTaskFor: (task: TaskWithSubtasks) => void;
}

const SWIPE_TRIGGER = 72;
const SWIPE_MAX = 116;

function MobileTaskRow({ task, depth, expanded, expandedTasks, onToggleExpanded, onToggleTaskExpanded, onToggleCompleted, onToggleCompletedFor, onOpenTask, onEditTask, onOpenTaskFor, onEditTaskFor }: MobileTaskRowProps) {
  const [offset, setOffset] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<{ startX: number; startY: number; axis: 'x' | 'y' | null; startOffset: number } | null>(null);

  const finishGesture = (x: number) => {
    const current = x;
    if (current > SWIPE_TRIGGER) {
      onToggleCompleted();
      setOffset(0);
      setRevealed(false);
    } else if (current < -SWIPE_TRIGGER) {
      setOffset(-SWIPE_MAX);
      setRevealed(true);
    } else if (current > -SWIPE_TRIGGER / 2) {
      setOffset(0);
      setRevealed(false);
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
    const dy = event.clientY - state.startY;
    if (state.axis === 'x') {
      finishGesture(state.startOffset + dx);
      return;
    }
    // 任务详情仅由行末的“>”按钮打开，避免轻触任务时误进入详情。
  };

  return (
    <motion.div variants={listItem} initial="initial" animate="animate" className="mobile-task-swipe-shell" style={{ marginLeft: depth * 12 }}>
      <div className="mobile-task-actions" aria-hidden={!revealed}>
        <button type="button" onClick={onEditTask} tabIndex={revealed ? 0 : -1}>
          <Pencil />
          <span>编辑</span>
        </button>
      </div>
      <div
        className={`mobile-task-row ${dragging ? 'is-dragging' : ''}`}
        data-mobile-task-row
        style={{ transform: `translate3d(${offset}px, 0, 0)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { gesture.current = null; setDragging(false); setOffset(revealed ? -SWIPE_MAX : 0); }}
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
            {task.priority === 'important' && !task.completed && <Star className="mobile-task-star" />}
          </div>
          <div className="mobile-task-meta">
            {task.deadline !== null ? <span className="mobile-task-deadline"><Clock />{formatDeadlineRel(task.deadline) || formatDeadline(task.deadline)}</span> : <span>无截止时间</span>}
            {task.subtasks.length > 0 && <button type="button" className="mobile-subtask-toggle" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onToggleExpanded(); }} aria-label={expanded ? '收起子任务' : '展开子任务'}>
              {expanded ? <ChevronDown /> : <ChevronRight />}<span>{task.subtasks.filter((child) => child.completed).length}/{task.subtasks.length}</span>
            </button>}
          </div>
        </div>
        <button
          type="button"
          className="mobile-task-detail-hint"
          aria-label={`查看任务详情：${task.title}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => { event.stopPropagation(); onOpenTask(); }}
        >›</button>
      </div>
      <AnimatePresence initial={false}>
        {revealed && (
          <motion.button type="button" className="mobile-task-close-actions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { setRevealed(false); setOffset(0); }} aria-label="收起任务操作">×</motion.button>
        )}
      </AnimatePresence>
      {expanded && task.subtasks.map((child) => (
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
          onOpenTaskFor={onOpenTaskFor}
          onEditTaskFor={onEditTaskFor}
        />
      ))}
    </motion.div>
  );
}

function FolderSection({ folder, depth, expandedTasks, onToggleTaskExpanded, onToggleCompleted, onOpenTask, onEditTask }: { folder: FolderNode; depth: number; expandedTasks: Set<string>; onToggleTaskExpanded: (id: string) => void; onToggleCompleted: (task: TaskWithSubtasks) => void; onOpenTask: (task: TaskWithSubtasks) => void; onEditTask: (task: TaskWithSubtasks) => void }) {
  const [open, setOpen] = useState(true);
  const total = folder.tasks.length + folder.children.reduce((count, child) => count + child.tasks.length, 0);
  return (
    <section className="mobile-folder-section" style={{ marginLeft: depth * 8 }}>
      <button type="button" className="mobile-folder-heading" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        {open ? <ChevronDown /> : <ChevronRight />}<FolderIcon /><span>{folder.name}</span><small>{total}</small>
      </button>
      {open && (
        <div className="mobile-folder-content">
          {folder.tasks.map((task) => <MobileTaskRow key={task.id} task={task} depth={0} expanded={expandedTasks.has(task.id)} expandedTasks={expandedTasks} onToggleExpanded={() => onToggleTaskExpanded(task.id)} onToggleTaskExpanded={onToggleTaskExpanded} onToggleCompleted={() => onToggleCompleted(task)} onToggleCompletedFor={onToggleCompleted} onOpenTask={() => onOpenTask(task)} onEditTask={() => onEditTask(task)} onOpenTaskFor={onOpenTask} onEditTaskFor={onEditTask} />)}
          {folder.children.map((child) => <FolderSection key={child.id} folder={child} depth={depth + 1} expandedTasks={expandedTasks} onToggleTaskExpanded={onToggleTaskExpanded} onToggleCompleted={onToggleCompleted} onOpenTask={onOpenTask} onEditTask={onEditTask} />)}
        </div>
      )}
    </section>
  );
}

/** 手机列表：去掉桌面拖拽排序，改为分组、滑动操作和底部详情入口。 */
export default function MobileTaskList({ folders, rootTasks, expandedTasks, onToggleTaskExpanded, onToggleCompleted, onOpenTask, onEditTask }: MobileTaskListProps) {
  return (
    <div className="mobile-task-list">
      {rootTasks.length === 0 && folders.length === 0 ? (
        <div className="mobile-empty-state"><Check /><strong>暂无待办</strong><span>点击下方加号记录一项任务</span></div>
      ) : (
        <>
          {rootTasks.map((task) => <MobileTaskRow key={task.id} task={task} depth={0} expanded={expandedTasks.has(task.id)} expandedTasks={expandedTasks} onToggleExpanded={() => onToggleTaskExpanded(task.id)} onToggleTaskExpanded={onToggleTaskExpanded} onToggleCompleted={() => onToggleCompleted(task)} onToggleCompletedFor={onToggleCompleted} onOpenTask={() => onOpenTask(task)} onEditTask={() => onEditTask(task)} onOpenTaskFor={onOpenTask} onEditTaskFor={onEditTask} />)}
          {folders.map((folder) => <FolderSection key={folder.id} folder={folder} depth={0} expandedTasks={expandedTasks} onToggleTaskExpanded={onToggleTaskExpanded} onToggleCompleted={onToggleCompleted} onOpenTask={onOpenTask} onEditTask={onEditTask} />)}
        </>
      )}
    </div>
  );
}
