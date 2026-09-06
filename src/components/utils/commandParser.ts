/**
 * 自然语言命令解析器：识别以下指令
 * - 新建文件夹：新建X分类 / 新建文件夹X / 新建X文件夹
 * - 编辑任务截止：把X(任务?)改为Y —— 模糊搜索任务名 X，编辑截止时间为 Y
 * - 设置重复：把X设为每天/每周/每月/每年重复 / 把X每N天重复
 * - 设置提前提醒：把X提前1天/3天/6小时提醒
 * - 设置自定义提醒时刻：把X提醒设在明天下午3点
 * - 设置优先级：把X设为重要 / 把X取消重要
 * - 移动到文件夹：把X移到Y文件夹
 * - 新建任务（带属性）：新建任务X，明天截止，每天重复，提前1天提醒
 * - 新建任务（兜底）：其余含日期/时间的句子（如"明天下午去游泳"）
 */

import { TaskRepeatRule } from '../../data/types';
import { ReminderOffsetKey } from '../../data/reminderOffsets';
import { parseNaturalDateTime } from './formatDate';

export type ParsedCommand =
  | { kind: 'create-folder'; folderName: string }
  | { kind: 'create-task'; title: string; deadline: number | null; repeatRule: TaskRepeatRule | null; repeatIntervalDays: number | null; reminderOffsets: ReminderOffsetKey[]; reminderAt: number | null }
  | { kind: 'edit-task'; query: string; newDeadline: number | null }
  | { kind: 'set-repeat'; query: string; repeatRule: TaskRepeatRule; repeatIntervalDays: number | null }
  | { kind: 'set-reminder-offset'; query: string; offsets: ReminderOffsetKey[] }
  | { kind: 'set-reminder-at'; query: string; reminderAt: number }
  | { kind: 'set-priority'; query: string; priority: 'important' | 'normal' }
  | { kind: 'move-to-folder'; query: string; folderName: string }
  | { kind: 'unknown' };

/** 去除句子中的日期/时间/前缀修饰，提取任务标题关键词 */
function extractTaskKeyword(text: string): string {
  let s = text;
  // 新建/创建/添加 前缀（含"新建任务：""新建一个"等）
  s = s.replace(/^(?:新建|创建|添加)(?:一个|一个新)?(?:任务)?\s*[:：]?\s*/, '');
  // 相对日期
  s = s.replace(/今天|今日|明天|明日|后天|大后天|月底/g, '');
  // 周X / 下周X / 星期X / 礼拜X
  s = s.replace(/(?:下个?周|周|星期|礼拜)\s*[一二三四五六日天]/g, '');
  // 具体日期：x月x日/x月x号/x年x月x日
  s = s.replace(/[0-9一二两三四五六七八九十]{1,2}\s*月\s*[0-9一二两三四五六七八九十]{1,2}\s*(?:日|号|天)?/g, '');
  s = s.replace(/\d{4}\s*年/g, '');
  // 时间段（长词优先，避免误剥单字"早/晚"）
  s = s.replace(/早晨|清晨|早上|上午|下午|晚上|傍晚|凌晨|中午|晚间|夜晚/g, '');
  // 阿拉伯数字的 X点(Y分) / X:Y
  s = s.replace(/\d{1,2}\s*[点时:：]\s*(\d{1,2})?\s*分?/g, '');
  // 中文数字的 X点(Y分)
  s = s.replace(/[一二两三四五六七八九十]{1,3}\s*[点时:：]\s*([一二两三四五六七八九十]{1,2})?\s*分?/g, '');
  // X小时后 / X小时 之后
  s = s.replace(/\d{1,2}|[一二两三四五六七八九十]{1,2}\s*(?:个)?小时(?:以)?后/g, '');
  // 前后多余的"的"与空白
  s = s.replace(/^的+|\的+$/g, '').trim();
  return s;
}

/** 解析自然语言的截止时间戳：含"下午/晚上/上午"但未写具体时刻时，按时间段默认补时 */
function parseCommandDeadline(text: string): number | null {
  const parsed = parseNaturalDateTime(text);
  if (parsed == null) return null;
  const d = new Date(parsed);
  const dateOnly = d.getSeconds() === 0 && ((d.getHours() === 0 && d.getMinutes() === 0) || (d.getHours() === 23 && d.getMinutes() === 59));
  const hasExplicitHour = /[点时:：]/.test(text);
  if (!dateOnly || hasExplicitHour) return parsed;
  if (/晚上|傍晚/.test(text)) d.setHours(20, 0, 0, 0);
  else if (/下午|中午/.test(text)) d.setHours(16, 0, 0, 0);
  else if (/清晨|早晨|一早|上午/.test(text)) d.setHours(9, 0, 0, 0);
  else if (/凌晨/.test(text)) d.setHours(1, 0, 0, 0);
  return d.getTime();
}

/** 模糊评分：优先标题即/含查询词，其次子序列字符覆盖度 */
export function fuzzyScore(title: string, query: string): number {
  const t = title.toLowerCase();
  const q = query.toLowerCase();
  if (!q) return 0;
  if (t === q) return 1000;
  if (t.includes(q)) return 800 + Math.max(0, t.length - q.length);
  if (q.includes(t)) return 700 + t.length;
  // 子序列匹配：查询词中按顺序出现在标题里的字符数
  let score = 0;
  let ti = 0;
  for (const ch of q) {
    const idx = t.indexOf(ch, ti);
    if (idx >= 0) { score++; ti = idx + 1; }
  }
  return score * 10;
}

/** 解析重复规则关键词 → (rule, intervalDays|null) */
function parseRepeatRule(text: string): { rule: TaskRepeatRule; intervalDays: number | null } | null {
  if (/每天|每日|天天/.test(text)) return { rule: 'daily', intervalDays: null };
  if (/每周|每星期|每礼拜/.test(text)) return { rule: 'weekly', intervalDays: null };
  if (/每月|每个月/.test(text)) return { rule: 'monthly', intervalDays: null };
  if (/每年|每一年/.test(text)) return { rule: 'yearly', intervalDays: null };
  // 自定义：每N天 / 每隔N天
  const m = text.match(/每(?:隔)?\s*(\d+)\s*天/);
  if (m) {
    const n = Math.max(1, parseInt(m[1], 10));
    return { rule: 'custom', intervalDays: n };
  }
  return null;
}

/** 解析提前提醒偏移：1天/3天/6小时 → ReminderOffsetKey[] */
function parseReminderOffsets(text: string): ReminderOffsetKey[] {
  const offsets: ReminderOffsetKey[] = [];
  if (/提前\s*1\s*天|提前一天|提前1日/.test(text)) offsets.push('1d');
  if (/提前\s*3\s*天|提前三天|提前3日/.test(text)) offsets.push('3d');
  if (/提前\s*6\s*小时|提前6小时/.test(text)) offsets.push('6h');
  return offsets;
}

/** 从"把X..."句式中提取任务查询词 X */
function extractQueryAfterBa(text: string): string {
  // 去掉"把"前缀，再去掉后续的动词短语（设为/提前/提醒/移到/改为等）
  let s = text.replace(/^把\s*/, '');
  // 截断到第一个动词短语
  const verbIdx = s.search(/设为|设成|改成|改为|改到|改至|提前|提醒设在|提醒在|移到|移动到|放到|归到|取消重要|设为重要|标记为重要/);
  if (verbIdx >= 0) s = s.slice(0, verbIdx);
  // 去除"任务"后缀
  s = s.replace(/任务$/, '').trim();
  return s;
}

/**
 * 统一解析"新建任务"式自然语言（支持 +、逗号、顿号分隔属性段）：
 * 提取标题、截止时间、重复规则、提前提醒偏移。
 * 例： "九月九日登山+每月重复+提前3天提醒" / "新建任务X，明天截止，每天重复，提前1天提醒"
 * 返回 { kind:'create-task', ... }；title 为空表示无法识别为任务。
 */
function parseCreateTask(text: string): ParsedCommand {
  // 去掉"新建/创建/添加 任务"等前缀
  const body = text.replace(/^(?:新建|创建|添加)(?:一个|一个新|一个新)?(?:任务)?\s*[:：]?\s*/, '');
  const parts = body.split(/[+＋,，、;；]/).map((p) => p.trim()).filter(Boolean);
  const empty = { kind: 'create-task' as const, title: '', deadline: null, repeatRule: null, repeatIntervalDays: null, reminderOffsets: [] as ReminderOffsetKey[], reminderAt: null };
  if (parts.length === 0) return empty;

  let repeatRule: TaskRepeatRule | null = null;
  let repeatIntervalDays: number | null = null;
  const reminderOffsets: ReminderOffsetKey[] = [];
  let deadline: number | null = null;
  const titleChunks: string[] = [];

  for (const seg of parts) {
    // 截止时间段（"截止/到期/明天/月末" 等由 parseCommandDeadline 处理）
    if (/截止|到期/.test(seg)) {
      const d = parseCommandDeadline(seg.replace(/截止|到期/i, ''));
      if (d != null) deadline = d;
      continue;
    }
    // 重复规则
    const rpt = parseRepeatRule(seg);
    if (rpt) { repeatRule = rpt.rule; repeatIntervalDays = rpt.intervalDays; continue; }
    // 提前提醒偏移
    const offs = parseReminderOffsets(seg);
    if (offs.length > 0) { reminderOffsets.push(...offs); continue; }
    // 否则为标题候选，并从段内尝试解析日期作为截止
    const segDeadline = parseCommandDeadline(seg);
    if (segDeadline != null && deadline == null) deadline = segDeadline;
    titleChunks.push(seg);
  }

  const rawTitle = titleChunks.join(' ');
  const first = parts[0];
  // 标题净化失败时兜底用首个非属性段
  const title = extractTaskKeyword(rawTitle) || (titleChunks.length ? titleChunks[0] : '');
  return { kind: 'create-task', title, deadline, repeatRule, repeatIntervalDays, reminderOffsets, reminderAt: null };
}

/** 解析完整命令 */
export function parseCommand(text: string): ParsedCommand {
  const t = text.trim();
  if (!t) return { kind: 'unknown' };

  // 1) 新建文件夹
  let m = t.match(/^新建(.+?)分类$/);
  if (m) {
    const name = m[1].replace(/^文件夹/, '').trim();
    if (name) return { kind: 'create-folder', folderName: name };
  }
  m = t.match(/^新建文件夹(.+)$/);
  if (m) {
    const name = m[1].trim();
    if (name) return { kind: 'create-folder', folderName: name };
  }
  m = t.match(/^新建(.+?)文件夹$/);
  if (m) {
    const name = m[1].trim();
    if (name) return { kind: 'create-folder', folderName: name };
  }

  // 2) 把X移到Y文件夹 / 移动到 / 放到 / 归到
  m = t.match(/^把(.+?)(?:移到|移动到|放到|归到)(.+?)(?:文件夹)?$/);
  if (m) {
    const query = extractQueryAfterBa(t);
    const folderName = m[2].replace(/文件夹$/, '').trim();
    if (query && folderName) return { kind: 'move-to-folder', query, folderName };
  }

  // 3) 把X设为重要 / 标记为重要
  if (/^把.+?(设为|设成|标记为)重要/.test(t)) {
    const query = extractQueryAfterBa(t);
    if (query) return { kind: 'set-priority', query, priority: 'important' };
  }
  // 把X取消重要 / 设为普通
  if (/^把.+?(取消重要|设为普通|设为一般|取消标记)/.test(t)) {
    const query = extractQueryAfterBa(t);
    if (query) return { kind: 'set-priority', query, priority: 'normal' };
  }

  // 4) 把X提前1天/3天/6小时提醒
  if (/^把.+?提前/.test(t) && /提醒/.test(t)) {
    const query = extractQueryAfterBa(t);
    const offsets = parseReminderOffsets(t);
    if (query && offsets.length > 0) return { kind: 'set-reminder-offset', query, offsets };
  }

  // 5) 把X提醒设在/在Y —— 自定义提醒时刻（无需截止时间）
  m = t.match(/^把(.+?)提醒(?:设|在)?(?:在|于|为)?(.+)$/);
  if (m) {
    const query = extractQueryAfterBa(t);
    const reminderAt = parseCommandDeadline(m[2]);
    if (query && reminderAt != null) return { kind: 'set-reminder-at', query, reminderAt };
  }

  // 6) 把X设为每天/每周/每月/每年重复 / 每N天重复
  if (/^把.+?(设为|设成|改成|改为).*重复/.test(t) || /^把.+?每.+?天.*重复/.test(t)) {
    const query = extractQueryAfterBa(t);
    const repeat = parseRepeatRule(t);
    if (query && repeat) return { kind: 'set-repeat', query, repeatRule: repeat.rule, repeatIntervalDays: repeat.intervalDays };
  }

  // 7) 编辑任务：把X(任务?)改为/改成/改到/改至 Y（截止时间）
  m = t.match(/^把(.+?)(?:任务)?(?:改为|改成|改到|改至|改成到|改为到)(.+)$/);
  if (m) {
    const query = extractTaskKeyword(m[1]);
    const newDeadline = parseCommandDeadline(m[2]);
    return { kind: 'edit-task', query, newDeadline };
  }

  // 8) 新建任务（带属性）：新建任务X，明天截止，每天重复，提前1天提醒；支持"+"串联
  if (/^(?:新建|创建|添加)(?:一个|一个新)?(?:任务)?\s*[:：]?/.test(t)) {
    const cmd = parseCreateTask(t);
    if (!cmd.title) return { kind: 'unknown' };
    return cmd;
  }

  // 9) 新建任务（兜底）：提取标题 + 解析截止/重复/提醒（支持"+"串联，如 "九月九日登山+每月重复+提前3天提醒"）
  const cmd = parseCreateTask(t);
  if (!cmd.title) return { kind: 'unknown' };
  return cmd;
}
