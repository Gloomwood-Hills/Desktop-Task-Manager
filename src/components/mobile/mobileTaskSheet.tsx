import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlignLeft, CalendarDays, Check, Clock3, Folder, History, Pencil, Repeat2, X } from 'lucide-react';
import { TaskWithSubtasks } from '../../data/types';
import { formatDeadline, formatStartDate } from '../utils/formatDate';
import { panelSpring } from '../utils/motion';

interface MobileTaskSheetProps {
  task: TaskWithSubtasks | null;
  onClose: () => void;
  onToggleCompleted: (id: string) => void;
  onEdit: (task: TaskWithSubtasks) => void;
}

function createdAtLabel(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** 手机任务详情底部面板：把备注、时间和操作集中到拇指可达区域。 */
export default function MobileTaskSheet({ task, onClose, onToggleCompleted, onEdit }: MobileTaskSheetProps) {
  useEffect(() => {
    if (!task) return undefined;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [task, onClose]);

  return (
    <AnimatePresence>
      {task && (
        <motion.div className="mobile-sheet-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <button type="button" className="mobile-sheet-scrim" aria-label="关闭任务详情" onClick={onClose} />
          <motion.section className="mobile-task-sheet" role="dialog" aria-modal="true" aria-label="任务详情" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={panelSpring}>
            <div className="mobile-sheet-handle" />
            <div className="mobile-sheet-header">
              <div>
                <span className="mobile-sheet-kicker">任务详情</span>
                <h2>{task.title}</h2>
              </div>
              <button type="button" className="mobile-icon-button" aria-label="关闭详情" onClick={onClose}><X /></button>
            </div>

            <div className="mobile-sheet-content">
              <div className="mobile-sheet-status-row">
                <button type="button" className={`mobile-sheet-complete ${task.completed ? 'is-complete' : ''}`} onClick={() => onToggleCompleted(task.id)}>
                  <Check />{task.completed ? '恢复任务' : '完成任务'}
                </button>
                <button type="button" className="mobile-sheet-edit" onClick={() => onEdit(task)}><Pencil />编辑</button>
              </div>
              <div className="mobile-detail-grid">
                <div><Folder /><span>分类</span><strong>{task.folderId ? '已分类' : '未分类'}</strong></div>
                <div><History /><span>创建</span><strong>{createdAtLabel(task.createdAt)}</strong></div>
                {task.startDate !== null && <div><CalendarDays /><span>开始</span><strong>{formatStartDate(task.startDate)}</strong></div>}
                {task.deadline !== null && <div><Clock3 /><span>截止</span><strong>{formatDeadline(task.deadline)}</strong></div>}
                {task.repeatRule && <div><Repeat2 /><span>重复</span><strong>{task.repeatRule === 'custom' ? `每${task.repeatIntervalDays ?? 1}天` : task.repeatRule === 'daily' ? '每天' : task.repeatRule === 'weekly' ? '每周' : task.repeatRule === 'monthly' ? '每月' : '每年'}</strong></div>}
              </div>
              <div className="mobile-sheet-remark"><AlignLeft /><div><span>备注</span><p>{task.remark.trim() || '未添加备注'}</p></div></div>
              {task.subtasks.length > 0 && <div className="mobile-sheet-subtasks"><span>子任务进度 {task.subtasks.filter((child) => child.completed).length}/{task.subtasks.length}</span><div>{task.subtasks.map((child) => <div key={child.id} className={child.completed ? 'is-complete' : ''}><Check />{child.title}</div>)}</div></div>}
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
