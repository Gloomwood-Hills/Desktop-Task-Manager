import { useState } from 'react';
import { Check, ChevronDown, ChevronRight, Clock, Calendar, AlignLeft, History } from 'lucide-react';
import { Task, TaskWithSubtasks } from '../data/types';
import { formatDeadline, formatDeadlineRel, formatDeadlineYMD, formatStartDate } from './utils/formatDate';

interface TaskItemProps {
  task: TaskWithSubtasks;
  /** 展开状态集合（任务 id → 是否展开子任务），供嵌套层级共用 */
  expandedSet: Set<string>;
  onToggleExpanded: (id: string) => void;
  onToggleCompleted: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, taskId: string) => void;
  searchQuery: string;
  /** 截止时间按日期渐变：开启时按主题（深色白/浅色黑）→#FF3333 渐变，关闭时直接红色 */
  deadlineGradient?: boolean;
  /** 深色模式：渐变远端颜色为白色；浅色模式为黑色 */
  dark?: boolean;
}

/** 高亮搜索关键词 */
export function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: 'rgba(0,122,255,0.15)', color: 'var(--primary)', borderRadius: 3, padding: '0 2px' }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

/** 截止时间颜色：渐变开启时按剩余天数从主题远端色（深色=白 / 浅色=黑）→#FF3333 线性插值（剩余1天/逾期为 #FF3333）；关闭时直接红色 */
function deadlineColor(deadline: number, gradient: boolean, dark: boolean): { bg: string; color: string } {
  if (!gradient) {
    return {
      bg: 'color-mix(in srgb, #FF3333 16%, transparent)',
      color: '#FF3333',
    };
  }
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const remain = deadline - now;
  let t: number; // 0=远端（深色白/浅色黑），1=#FF3333
  if (remain <= day) t = 1;
  else if (remain >= 7 * day) t = 0;
  else t = (7 * day - remain) / (6 * day);
  const from = dark ? [255, 255, 255] : [0, 0, 0]; // 深色模式白起步，浅色模式黑起步
  const to = [255, 51, 51]; // #FF3333
  const channel = (i: number) => Math.round(from[i] + (to[i] - from[i]) * t);
  const color = `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
  return {
    bg: `color-mix(in srgb, ${color} 16%, transparent)`,
    color,
  };
}

/** 日期徽章（开始 + 截止，含颜色渐变提醒） */
function DateBadge({ task, deadlineGradient = true, dark = false }: { task: Task; deadlineGradient?: boolean; dark?: boolean }) {
  const showStart = task.startDate !== null;
  const showDeadline = task.deadline !== null;

  if (!showStart && !showDeadline) {
    return (
      <span style={{ fontSize: 11, color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>无截止日期</span>
    );
  }

  const deadlineStyle = task.deadline !== null ? deadlineColor(task.deadline, deadlineGradient, dark) : null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 14 }}>
      {showStart && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '2px 8px', borderRadius: 999, fontSize: 11,
          background: 'color-mix(in srgb, var(--border) 25%, transparent)',
          border: '0.5px solid color-mix(in srgb, var(--border) 35%, transparent)',
        }}>
          <Calendar style={{ width: 10, height: 10, color: 'var(--muted-foreground)' }} />
          <span style={{ color: 'var(--muted-foreground)' }}>{formatStartDate(task.startDate!)}</span>
        </span>
      )}
      {showDeadline && deadlineStyle && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600,
          background: deadlineStyle.bg, color: deadlineStyle.color,
        }}>
          <Clock style={{ width: 10, height: 10 }} />
          {formatDeadlineRel(task.deadline!) && <span>{formatDeadlineRel(task.deadline!)}</span>}
          <span>{formatDeadlineYMD(task.deadline!)}</span>
        </span>
      )}
    </div>
  );
}

/** 详情行：图标 + 标签 + 值（备注/时间信息使用前景色，非灰色） */
function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {icon}
      <span style={{ fontSize: 12, color: 'var(--foreground)', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12.5, color: 'var(--foreground)', wordBreak: 'break-all' }}>{value}</span>
    </div>
  );
}

function formatCreatedAt(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 递归子任务行：复选框 + 标题 + 子任务展开/折叠 + 嵌套层级（TR-7.1 无限层级） */
function SubtaskRow({
  task, expandedSet, onToggleExpanded, onToggleCompleted, onContextMenu, searchQuery,
}: {
  task: TaskWithSubtasks;
  expandedSet: Set<string>;
  onToggleExpanded: (id: string) => void;
  onToggleCompleted: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, taskId: string) => void;
  searchQuery: string;
}) {
  const expanded = expandedSet.has(task.id);
  const hasChildren = task.subtasks.length > 0;

  return (
    <div>
      <div
        style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px' }}
        onContextMenu={(e) => onContextMenu(e, task.id)}
      >
        <div style={{ position: 'absolute', left: -12, top: 14, width: 12, height: 1, background: 'var(--border)', opacity: 0.4 }} />
        {/* 复选框 */}
        <div
          onClick={() => onToggleCompleted(task.id)}
          style={{
            width: 15, height: 15, borderRadius: '50%',
            background: task.completed ? 'var(--state-success)' : 'transparent',
            border: `1.5px solid ${task.completed ? 'var(--state-success)' : 'var(--muted-foreground)'}`,
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--state-success-foreground)',
          }}
        >
          {task.completed && <Check style={{ width: 9, height: 9 }} />}
        </div>
        <span
          style={{
            fontSize: 12.5,
            color: task.completed ? 'var(--muted-foreground)' : 'var(--foreground)',
            textDecoration: task.completed ? 'line-through' : 'none',
            flex: 1, minWidth: 0,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          <Highlight text={task.title} query={searchQuery} />
        </span>
        {/* 子任务展开/折叠 + 进度 */}
        {hasChildren && (
          <>
            <span
              onClick={(e) => { e.stopPropagation(); onToggleExpanded(task.id); }}
              style={{ display: 'inline-flex', cursor: 'pointer', flexShrink: 0 }}
            >
              {expanded
                ? <ChevronDown style={{ width: 11, height: 11, color: 'var(--icon-muted)' }} />
                : <ChevronRight style={{ width: 11, height: 11, color: 'var(--icon-muted)' }} />}
            </span>
            <span style={{ fontSize: 11, color: 'var(--muted-foreground)', whiteSpace: 'nowrap', flexShrink: 0, fontWeight: 500 }}>
              {task.subtasks.filter((s) => s.completed).length}/{task.subtasks.length}
            </span>
          </>
        )}
      </div>
      {hasChildren && expanded && (
        <div style={{ marginLeft: 18, position: 'relative' }}>
          <div style={{ position: 'absolute', left: 6, top: 0, bottom: 16, width: 1, background: 'var(--border)', opacity: 0.4 }} />
          <SubtaskList
            tasks={task.subtasks}
            expandedSet={expandedSet}
            onToggleExpanded={onToggleExpanded}
            onToggleCompleted={onToggleCompleted}
            onContextMenu={onContextMenu}
            searchQuery={searchQuery}
          />
        </div>
      )}
    </div>
  );
}

/** 递归子任务列表 */
function SubtaskList({
  tasks, expandedSet, onToggleExpanded, onToggleCompleted, onContextMenu, searchQuery,
}: {
  tasks: TaskWithSubtasks[];
  expandedSet: Set<string>;
  onToggleExpanded: (id: string) => void;
  onToggleCompleted: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, taskId: string) => void;
  searchQuery: string;
}) {
  return (
    <>
      {tasks.map((sub) => (
        <SubtaskRow
          key={sub.id}
          task={sub}
          expandedSet={expandedSet}
          onToggleExpanded={onToggleExpanded}
          onToggleCompleted={onToggleCompleted}
          onContextMenu={onContextMenu}
          searchQuery={searchQuery}
        />
      ))}
    </>
  );
}

/**
 * 任务卡片：复选框 + 标题 + 优先级 + 日期徽章
 * 点击任务行展开详情（备注、时间信息）；子任务列表独立展开
 */
export default function TaskItem({
  task, expandedSet, onToggleExpanded, onToggleCompleted, onContextMenu, searchQuery, deadlineGradient = true, dark = false,
}: TaskItemProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const expanded = expandedSet.has(task.id);
  const hasChildren = task.subtasks.length > 0;
  const hasDetails = task.remark.trim().length > 0 || task.startDate !== null || task.deadline !== null;

  return (
    <div style={{ position: 'relative' }}>
      {/* 横向分支线 */}
      <div style={{
        position: 'absolute', left: -14, top: 18, width: 14, height: 1,
        background: 'var(--border)', opacity: 0.5,
      }} />

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          padding: '8px 8px 4px',
          opacity: task.startDate !== null && task.startDate > Date.now() ? 0.65 : 1,
          borderRadius: 'calc(var(--radius) * 0.5)',
          cursor: hasDetails ? 'pointer' : 'default',
          transition: 'background-color 0.15s ease',
        }}
        onClick={() => { if (hasDetails) setDetailsOpen(!detailsOpen); }}
        onContextMenu={(e) => onContextMenu(e, task.id)}
        onMouseOver={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 45%, transparent)'; }}
        onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        {/* 复选框 */}
        <div
          onClick={(e) => { e.stopPropagation(); onToggleCompleted(task.id); }}
          onMouseOver={(e) => {
            if (!task.completed) {
              e.currentTarget.style.borderColor = 'var(--primary)';
              e.currentTarget.style.background = 'color-mix(in srgb, var(--primary) 10%, transparent)';
            }
          }}
          onMouseOut={(e) => {
            if (!task.completed) {
              e.currentTarget.style.borderColor = task.priority === 'important' ? '#ff6b3d' : 'var(--muted-foreground)';
              e.currentTarget.style.background = task.priority === 'important' ? 'color-mix(in srgb, #ff6b3d 10%, transparent)' : 'transparent';
            }
          }}
          style={{
            width: 18, height: 18, borderRadius: '50%',
            border: task.completed
              ? `1.5px solid var(--state-success)`
              : `1.5px solid ${task.priority === 'important' ? '#ff6b3d' : 'var(--muted-foreground)'}`,
            background: task.completed
              ? 'var(--state-success)'
              : task.priority === 'important' ? 'color-mix(in srgb, #ff6b3d 10%, transparent)' : 'transparent',
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            marginTop: 2,
            color: 'var(--state-success-foreground)',
          }}
        >
          {task.completed && <Check style={{ width: 11, height: 11 }} />}
        </div>

        {/* 任务内容 */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* 标题行 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
            {task.priority === 'important' && !task.completed && (
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ff6b3d', flexShrink: 0 }} />
            )}
            <span
              style={{
                fontSize: 13.5,
                fontWeight: 600,
                color: task.completed ? 'var(--muted-foreground)' : 'var(--foreground)',
                textDecoration: task.completed ? 'line-through' : 'none',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                minWidth: 0,
              }}
            >
              <Highlight text={task.title} query={searchQuery} />
            </span>
            {/* 详情展开指示 */}
            {hasDetails && (
              <span style={{ display: 'inline-flex', flexShrink: 0, opacity: 0.7 }}>
                {detailsOpen
                  ? <ChevronDown style={{ width: 12, height: 12, color: 'var(--icon-muted)' }} />
                  : <ChevronRight style={{ width: 12, height: 12, color: 'var(--icon-muted)' }} />}
              </span>
            )}
            {/* 子任务展开 */}
            {hasChildren && (
              <span
                onClick={(e) => { e.stopPropagation(); onToggleExpanded(task.id); }}
                style={{ display: 'inline-flex', cursor: 'pointer', flexShrink: 0 }}
              >
                {expanded
                  ? <ChevronDown style={{ width: 12, height: 12, color: 'var(--icon-muted)' }} />
                  : <ChevronRight style={{ width: 12, height: 12, color: 'var(--icon-muted)' }} />}
              </span>
            )}
            {hasChildren && (
              <span style={{ fontSize: 11, color: 'var(--muted-foreground)', whiteSpace: 'nowrap', fontWeight: 500 }}>
                {task.subtasks.filter((s) => s.completed).length}/{task.subtasks.length}
              </span>
            )}
          </div>

          {/* 日期徽章 */}
          <DateBadge task={task} deadlineGradient={deadlineGradient} dark={dark} />
        </div>
      </div>

      {/* 详情面板（备注 + 时间信息） */}
      {hasDetails && detailsOpen && (
        <div style={{
          margin: '2px 8px 6px 36px',
          padding: '10px 12px',
          borderRadius: 'calc(var(--radius) * 0.5)',
          background: 'color-mix(in srgb, var(--accent) 70%, transparent)',
          border: '0.5px solid color-mix(in srgb, var(--border) 50%, transparent)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}>
          {task.remark.trim() && (
            <DetailRow
              icon={<AlignLeft style={{ width: 12, height: 12, color: 'var(--muted-foreground)', flexShrink: 0 }} />}
              label="备注"
              value={<Highlight text={task.remark} query={searchQuery} />}
            />
          )}
          {task.startDate !== null && (
            <DetailRow
              icon={<Calendar style={{ width: 12, height: 12, color: 'var(--muted-foreground)', flexShrink: 0 }} />}
              label="开始"
              value={formatStartDate(task.startDate)}
            />
          )}
          {task.deadline !== null && (
            <DetailRow
              icon={<Clock style={{ width: 12, height: 12, color: 'var(--muted-foreground)', flexShrink: 0 }} />}
              label="截止"
              value={formatDeadline(task.deadline)}
            />
          )}
          <DetailRow
            icon={<History style={{ width: 12, height: 12, color: 'var(--muted-foreground)', flexShrink: 0 }} />}
            label="创建"
            value={formatCreatedAt(task.createdAt)}
          />
        </div>
      )}

      {/* 子任务（递归，支持无限层级） */}
      {hasChildren && expanded && (
        <div style={{ marginLeft: 18, position: 'relative' }}>
          <div style={{ position: 'absolute', left: 6, top: 0, bottom: 16, width: 1, background: 'var(--border)', opacity: 0.4 }} />
          <SubtaskList
            tasks={task.subtasks}
            expandedSet={expandedSet}
            onToggleExpanded={onToggleExpanded}
            onToggleCompleted={onToggleCompleted}
            onContextMenu={onContextMenu}
            searchQuery={searchQuery}
          />
        </div>
      )}
    </div>
  );
}
