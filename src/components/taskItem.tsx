import { useState } from 'react';
import { motion } from 'motion/react';
import { Check, ChevronDown, ChevronRight, Clock, Calendar, AlignLeft, History, Info } from 'lucide-react';
import { Task, TaskWithSubtasks } from '../data/types';
import { formatDeadline, formatDeadlineRel, formatDeadlineYMD, formatStartDate } from './utils/formatDate';
import { panelSpring } from './utils/motion';

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

/** 截止时间颜色，按剩余天数分档（与设计稿品牌色阶一致）：
 * ≥7 天 = 主题正文色（浅色=黑 / 深色=白）；7~5 天 `#0064d6`；5~3 天 `#007aff`→`#2e8dff` 渐变；
 * 3~1 天 `#2e8dff`；剩余 24 小时以内（含逾期）`#ff453a`。关闭渐变时直接 `#ff453a`。 */
function deadlineColor(deadline: number, gradient: boolean, dark: boolean): { bg: string; color: string } {
  if (!gradient) {
    return {
      bg: 'color-mix(in srgb, #ff453a 16%, transparent)',
      color: '#ff453a',
    };
  }
  type Rgb = [number, number, number];
  const lerp = (a: Rgb, b: Rgb, k: number): Rgb => [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ];
  const toHex = (c: Rgb) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;

  const day = 24 * 60 * 60 * 1000;
  const d = (deadline - Date.now()) / day; // 剩余天数
  let rgb: Rgb;
  if (d >= 7) rgb = dark ? [255, 255, 255] : [0, 0, 0];
  else if (d >= 5) rgb = [0x00, 0x64, 0xd6];
  else if (d >= 3) rgb = lerp([0x00, 0x7a, 0xff], [0x2e, 0x8d, 0xff], (5 - d) / 2);
  else if (d >= 1) rgb = [0x2e, 0x8d, 0xff];
  else rgb = [0xff, 0x45, 0x3a];

  const color = toHex(rgb);
  return {
    bg: `color-mix(in srgb, ${color} 16%, transparent)`,
    color,
  };
}

/** 是否已过期：有截止时间、未完成、且截止时间已过 */
function isTaskExpired(task: { deadline: number | null; completed: boolean }): boolean {
  return task.deadline !== null && !task.completed && task.deadline < Date.now();
}

/** 已过期标签（浅紫底白字）—— 与截止时间标签对齐：fontSize/padding/lineHeight 一致 */
function ExpiredBadge() {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', flexShrink: 0,
      padding: '2px 8px', borderRadius: 999,
      background: '#c4b5fd', color: '#ffffff',
      fontSize: 11, fontWeight: 600, lineHeight: 1.4, whiteSpace: 'nowrap',
    }}>
      已过期
    </span>
  );
}

/** 累计完成次数标签（重复系列：即使已结束重复也保留显示，只是不再更新）—— 与截止时间标签对齐 */
/** 重复规则中文标签 */
const REPEAT_RULE_LABEL: Record<string, string> = {
  daily: '每天', weekly: '每周', monthly: '每月', yearly: '每年',
};

/** 重复系列聚类徽章：显示重复规则（如"每天"）+ 累计完成次数，使列表视图中重复任务一目了然 */
function RepeatBadge({ rule, intervalDays, count }: { rule: string | null; intervalDays: number | null; count: number }) {
  const label = rule === 'custom' ? `每${intervalDays ?? 1}天` : (rule ? REPEAT_RULE_LABEL[rule] : '');
  if (!label) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', flexShrink: 0, gap: 4,
      padding: '2px 8px', borderRadius: 999,
      background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
      color: 'var(--primary)', fontSize: 11, fontWeight: 600, lineHeight: 1.4, whiteSpace: 'nowrap',
    }}>
      {label}
      {count > 0 && <span style={{ opacity: 0.7 }}>·{count}次</span>}
    </span>
  );
}

/** 日期徽章（开始 + 截止，含颜色渐变提醒）；已过期/累计完成次数标签与截止时间同一行 */
function DateBadge({ task, deadlineGradient = true, dark = false }: { task: Task & { repeatCount?: number }; deadlineGradient?: boolean; dark?: boolean }) {
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
          padding: '2px 8px', borderRadius: 999, fontSize: 11, lineHeight: 1.4,
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
          padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, lineHeight: 1.4,
          background: deadlineStyle.bg, color: deadlineStyle.color,
        }}>
          <Clock style={{ width: 10, height: 10 }} />
          {formatDeadlineRel(task.deadline!) && <span>{formatDeadlineRel(task.deadline!)}</span>}
          <span>{formatDeadlineYMD(task.deadline!)}</span>
        </span>
      )}
      {/* 已过期 / 累计完成次数：与截止时间同一行（任务描述下方） */}
      {isTaskExpired(task) && <ExpiredBadge />}
      {task.repeatSeriesId !== null && <RepeatBadge rule={task.repeatRule} intervalDays={task.repeatIntervalDays} count={task.repeatCount ?? 0} />}
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
  const [detailsOpen, setDetailsOpen] = useState(false);

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
            background: task.completed ? 'var(--primary)' : 'transparent',
            border: task.completed ? 'none' : '1.5px solid var(--muted-foreground)',
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#ffffff',
          }}
        >
          {task.completed && (
            <motion.span
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={panelSpring}
              style={{ display: 'inline-flex' }}
            >
              <Check style={{ width: 9, height: 9 }} />
            </motion.span>
          )}
        </div>
        <span
          style={{
            fontSize: 12.5,
            color: task.completed ? 'var(--muted-foreground)' : 'var(--foreground)',
            textDecoration: task.completed ? 'line-through' : 'none',
            flex: 1, minWidth: 0,
            whiteSpace: 'normal',
            wordBreak: 'break-word',
            overflowWrap: 'anywhere',
            lineHeight: 1.3,
          }}
        >
          <Highlight text={task.title} query={searchQuery} />
        </span>
        <button
          type="button"
          aria-label={detailsOpen ? '收起任务详情' : '查看任务详情'}
          title={detailsOpen ? '收起详情' : '查看详情'}
          onClick={(e) => { e.stopPropagation(); setDetailsOpen((v) => !v); }}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, padding: 0, border: 0, borderRadius: 6, background: detailsOpen ? 'var(--accent)' : 'transparent', color: 'var(--icon-muted)', cursor: 'pointer', flexShrink: 0 }}
        >
          <Info style={{ width: 13, height: 13 }} />
        </button>
        {task.deadline !== null && (
          <span
            title={formatDeadline(task.deadline)}
            style={{ fontSize: 11, color: 'var(--muted-foreground)', whiteSpace: 'nowrap', flexShrink: 0, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 3 }}
          >
            <Clock style={{ width: 11, height: 11, color: 'var(--icon-muted)' }} />
            {formatDeadline(task.deadline)}
          </span>
        )}
        {isTaskExpired(task) && <ExpiredBadge />}
        {task.repeatSeriesId !== null && <RepeatBadge rule={task.repeatRule} intervalDays={task.repeatIntervalDays} count={task.repeatCount ?? 0} />}
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
      {detailsOpen && (
        <div className="task-detail-panel" style={{ margin: '2px 8px 5px 25px', padding: '7px 9px', borderRadius: 8, background: 'color-mix(in srgb, var(--accent) 60%, transparent)', border: '0.5px solid color-mix(in srgb, var(--border) 50%, transparent)', display: 'flex', flexDirection: 'column', gap: 5 }}>
          <DetailRow icon={<AlignLeft style={{ width: 11, height: 11, color: 'var(--muted-foreground)', flexShrink: 0 }} />} label="备注" value={task.remark.trim() || '无备注'} />
          {task.deadline !== null && <DetailRow icon={<Clock style={{ width: 11, height: 11, color: 'var(--muted-foreground)', flexShrink: 0 }} />} label="截止" value={formatDeadline(task.deadline)} />}
          <DetailRow icon={<History style={{ width: 11, height: 11, color: 'var(--muted-foreground)', flexShrink: 0 }} />} label="创建" value={formatCreatedAt(task.createdAt)} />
        </div>
      )}
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
  // 创建时间对所有任务都有意义，因此详情入口始终显示，即使没有备注和截止日期。
  const hasDetails = true;

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
          // 活动任务保持完整对比度；未来开始时间只在详情/日期信息中表达，
          // 不再降低整行透明度，避免导入后的标题、备注和勾选框看起来像已禁用。
          opacity: 1,
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
              ? 'none'
              : `1.5px solid ${task.priority === 'important' ? '#ff6b3d' : 'var(--muted-foreground)'}`,
            background: task.completed
              ? 'var(--primary)'
              : task.priority === 'important' ? 'color-mix(in srgb, #ff6b3d 10%, transparent)' : 'transparent',
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            marginTop: 2,
            color: '#ffffff',
          }}
        >
          {task.completed && (
            <motion.span
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={panelSpring}
              style={{ display: 'inline-flex' }}
            >
              <Check style={{ width: 11, height: 11 }} />
            </motion.span>
          )}
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
                whiteSpace: 'normal',
                wordBreak: 'break-word',
                overflowWrap: 'anywhere',
                lineHeight: 1.3,
                minWidth: 0,
              }}
            >
              <Highlight text={task.title} query={searchQuery} />
            </span>
            {/* 详情入口：与子任务箭头分离，箭头只表达层级展开 */}
            {hasDetails && (
              <button
                type="button"
                aria-label={detailsOpen ? '收起任务详情' : '查看任务详情'}
                title={detailsOpen ? '收起详情' : '查看详情'}
                onClick={(e) => { e.stopPropagation(); setDetailsOpen((v) => !v); }}
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 23, height: 23, padding: 0, border: 0, borderRadius: 6, background: detailsOpen ? 'var(--accent)' : 'transparent', color: 'var(--icon-muted)', cursor: 'pointer', flexShrink: 0 }}
              >
                <Info style={{ width: 13, height: 13 }} />
              </button>
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
        <div className="task-detail-panel" style={{
          margin: '2px 8px 6px 36px',
          padding: '10px 12px',
          borderRadius: 'calc(var(--radius) * 0.5)',
          background: 'color-mix(in srgb, var(--accent) 70%, transparent)',
          border: '0.5px solid color-mix(in srgb, var(--border) 50%, transparent)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}>
          <DetailRow
            icon={<AlignLeft style={{ width: 12, height: 12, color: 'var(--muted-foreground)', flexShrink: 0 }} />}
            label="备注"
            value={task.remark.trim() ? <Highlight text={task.remark} query={searchQuery} /> : '无备注'}
          />
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
