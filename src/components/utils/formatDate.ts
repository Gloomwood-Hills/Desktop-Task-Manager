/**
 * 日期格式化工具：与设计稿日期徽章格式保持一致
 */

const day = 24 * 60 * 60 * 1000;

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** 是否包含具体时间：00:00:00（开始仅日期）与 23:59:00（截止仅日期）视为"仅日期"；带秒的边界时刻（如"一小时后"恰为 23:59:01）视为具体时刻 */
function hasExplicitTime(ts: number): boolean {
  const d = new Date(ts);
  const h = d.getHours();
  const m = d.getMinutes();
  const s = d.getSeconds();
  return !(s === 0 && ((h === 0 && m === 0) || (h === 23 && m === 59)));
}

/** 相对标签：明天/后天/本周x/下周x（x=一/二/三/四/五/六/日）；超出范围返回空串（仅年月日） */
export function formatDeadlineRel(deadline: number): string {
  const now = new Date();
  const diffDays = Math.round((startOfDay(deadline) - startOfDay(now.getTime())) / day);
  if (diffDays === 1) return '明天';
  if (diffDays === 2) return '后天';

  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const mondayOf = (d: Date): number => {
    const diff = d.getDay() === 0 ? -6 : 1 - d.getDay(); // 距周一
    const m = new Date(d);
    m.setDate(m.getDate() + diff);
    return startOfDay(m.getTime());
  };
  const weekDiff = Math.round((mondayOf(new Date(deadline)) - mondayOf(now)) / (7 * day));
  if (weekDiff === 0) return `本周${weekdays[new Date(deadline).getDay()]}`;
  if (weekDiff === 1) return `下周${weekdays[new Date(deadline).getDay()]}`;
  return '';
}

/** 年月日标签：2026.8.9；含具体时间时附 HH:mm */
export function formatDeadlineYMD(deadline: number): string {
  const d = new Date(deadline);
  const date = `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
  return hasExplicitTime(deadline) ? `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}` : date;
}

/** 截止时间组合文案：相对标签 + 年月日（如 "明天 2026.8.9" / "2026.8.15"） */
export function formatDeadline(deadline: number): string {
  const rel = formatDeadlineRel(deadline);
  const ymd = formatDeadlineYMD(deadline);
  return rel ? `${rel} ${ymd}` : ymd;
}

/** 格式化开始日期徽章：仅日期时 MM-DD；含具体时间时 MM-DD HH:mm */
export function formatStartDate(startDate: number): string {
  const d = new Date(startDate);
  const date = `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return hasExplicitTime(startDate) ? `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}` : date;
}

/** 格式化完成时间：7月19日 */
export function formatCompletedAt(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 截止时间徽章颜色分级：逾期=红、1天内=红、3天内=橙、7天内=默认 */
// ===== 自然语言日期解析（Quick Capture） =====

const WEEK_CN: Record<string, number> = { '一': 0, '二': 1, '三': 2, '四': 3, '五': 4, '六': 5, '日': 6, '天': 6 };
const NUM_CN: Record<string, number> = {
  '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6,
  '七': 7, '八': 8, '九': 9, '十': 10, '十一': 11, '十二': 12, '十三': 13, '十四': 14,
  '十五': 15, '十六': 16, '十七': 17, '十八': 18, '十九': 19, '二十': 20,
  '二十一': 21, '二十二': 22, '二十三': 23, '二十四': 24, '二十五': 25, '二十六': 26,
  '二十七': 27, '二十八': 28, '二十九': 29, '三十': 30, '三十一': 31,
};

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

/** 阿拉伯或中文数字 → number */
function toNumber(token: string): number | null {
  if (/^\d{1,2}$/.test(token)) return parseInt(token, 10);
  return NUM_CN[token] ?? null;
}

/**
 * 解析自然语言中的日期/时间，返回截止时间戳（解析不到返回 null）。
 * 支持：今天/明天/后天/月底/周X/下周一 + 上午/下午/晚上 + X点(Y分)（中文或数字）
 * 例："明天下午三点" → 明天 15:00；"周五" → 本周五 23:59；"下午三点" → 今天 15:00
 */
export function parseNaturalDateTime(text: string): number | null {
  const now = new Date();

  // 相对时间：X小时后 / X小时（如"一小时后"、"1小时后"），精确到具体时刻
  const afterHours = text.match(/(\d{1,2}|[一二两三四五六七八九十]{1,2})\s*(?:个)?小时(?:以)?后/);
  if (afterHours) {
    const n = toNumber(afterHours[1]);
    if (n !== null && n > 0) {
      const t = new Date(now.getTime() + n * 3600 * 1000);
      // 若恰好落在"仅日期"标记（00:00:00 / 23:59:00），+1秒以保留具体时刻语义
      if (t.getSeconds() === 0 && ((t.getHours() === 23 && t.getMinutes() === 59) || (t.getHours() === 0 && t.getMinutes() === 0))) {
        t.setSeconds(1);
      }
      return t.getTime();
    }
  }

  let base: Date | null = null;

  // ===== 具体日期格式（优先级最高）=====
  // x年x月x日（如 2026年8月9日，年份为阿拉伯数字，月日支持中文数字）
  const ymdCN = text.match(/(\d{4})年\s*([0-9一二两三四五六七八九十]{1,2})\s*月\s*([0-9一二两三四五六七八九十]{1,2})\s*日/);
  // YYYY.M.D 或 YY.M.D（如 2026.8.9 / 26.8.9）
  const ymdDot = text.match(/(\d{2,4})\.(\d{1,2})\.(\d{1,2})/);
  // x月x日（如 8月9日 / 八月九日）
  const mdCN = text.match(/([0-9一二两三四五六七八九十]{1,2})\s*月\s*([0-9一二两三四五六七八九十]{1,2})\s*日/);
  // M.D（如 8.9；排除被更长数字/点串包含的情况）
  const mdDot = text.match(/(?:^|[^\d.])(\d{1,2})\.(\d{1,2})(?![\d.])/);

  if (ymdCN) {
    base = new Date(parseInt(ymdCN[1], 10), (toNumber(ymdCN[2]) ?? 0) - 1, toNumber(ymdCN[3]) ?? 0);
  } else if (ymdDot) {
    const y = ymdDot[1].length === 2 ? 2000 + parseInt(ymdDot[1], 10) : parseInt(ymdDot[1], 10);
    base = new Date(y, (toNumber(ymdDot[2]) ?? 0) - 1, toNumber(ymdDot[3]) ?? 0);
  } else if (mdCN) {
    const m = toNumber(mdCN[1]) ?? 0;
    const d = toNumber(mdCN[2]) ?? 0;
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) base = new Date(now.getFullYear(), m - 1, d);
  } else if (mdDot) {
    const m = toNumber(mdDot[1]) ?? 0;
    const d = toNumber(mdDot[2]) ?? 0;
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) base = new Date(now.getFullYear(), m - 1, d);
  }

  // ===== 相对日期 =====
  if (!base && /月底/.test(text)) {
    base = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  } else if (!base && /后天/.test(text)) {
    base = addDays(now, 2);
  } else if (!base && /明天|明日/.test(text)) {
    base = addDays(now, 1);
  } else if (!base && /今天|今日|今晚/.test(text)) {
    base = now;
  } else if (!base) {
    const wm = text.match(/(?:下个?周|周|星期|礼拜)([一二三四五六日天])/);
    if (wm) {
      // 周一为一周开始：本周一 = 今天 - 距周一天数（周一→0 … 周日→6）
      const daysSinceMonday = (now.getDay() + 6) % 7;
      const thisMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday);
      let d = addDays(thisMonday, (wm[0].startsWith('下') ? 7 : 0) + (WEEK_CN[wm[1]] ?? 0));
      if (d.getTime() < startOfDay(now.getTime())) d = addDays(d, 7);
      base = d;
    }
  }

  // 时间部分：上午/下午/晚上 + X点(Y分)
  let hour: number | null = null;
  let minute = 0;
  const hm = text.match(/(上午|下午|晚上|凌晨)?\s*(\d{1,2}|[一二两三四五六七八九十]{1,3})\s*[点时:：]\s*(\d{1,2}|[一二两三四五六七八九十]{1,2})?\s*分?/);
  if (hm) {
    let h = toNumber(hm[2]);
    if (h === null) h = 0; // 中文数字未命中（如"零"）时兜底
    if ((hm[1] === '下午' || hm[1] === '晚上') && h < 12) h += 12;
    hour = h;
    if (hm[3]) minute = toNumber(hm[3]) ?? 0;
  }

  if (!base && hour === null) return null;

  const target = base ? new Date(base) : new Date(now);
  if (hour !== null) {
    target.setHours(hour, minute, 0, 0);
  } else {
    target.setHours(23, 59, 0, 0); // 仅指定日期 → 当日结束作为截止
  }
  return target.getTime();
}
