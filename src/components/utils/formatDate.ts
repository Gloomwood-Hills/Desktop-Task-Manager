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

/** 格式化截止时间徽章文案：今天 15:00 / 明天 18:00 / 后天 12:00 / 07-18 / 下周一 */
export function formatDeadline(deadline: number): string {
  const now = Date.now();
  const diffDays = Math.round((startOfDay(deadline) - startOfDay(now)) / day);

  const d = new Date(deadline);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;

  if (diffDays === 0) return `今天 ${time}`;
  if (diffDays === 1) return `明天 ${time}`;
  if (diffDays === 2) return `后天 ${time}`;
  if (diffDays > 2 && diffDays < 7) {
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return `${weekdays[d.getDay()]} ${time}`;
  }
  if (diffDays >= 7 && diffDays < 14) return '下周一';
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 格式化开始日期徽章：MM-DD */
export function formatStartDate(startDate: number): string {
  const d = new Date(startDate);
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 格式化完成时间：7月19日 */
export function formatCompletedAt(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 截止时间徽章颜色分级：逾期=红、1天内=红、3天内=橙、7天内=默认 */
export function deadlineUrgency(deadline: number): 'danger' | 'warning' | 'normal' {
  const now = Date.now();
  const diffMs = deadline - now;
  if (diffMs < day) return 'danger';
  if (diffMs < 3 * day) return 'warning';
  return 'normal';
}
