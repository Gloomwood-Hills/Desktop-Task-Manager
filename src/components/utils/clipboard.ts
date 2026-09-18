import { Task } from '../../data/types';

/** 主视图复制格式：保留备注中的换行，便于直接粘贴到聊天或文档。 */
export function formatTaskClipboardText(task: Pick<Task, 'title' | 'remark'>): string {
  const title = task.title.trim();
  const remark = task.remark.trim();
  return `任务：${title}\n备注：${remark || '无备注'}`;
}

/** WebView/浏览器剪贴板兼容封装；权限 API 不可用时回退到隐藏文本域。 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 某些 Android WebView 会暴露 clipboard API 但拒绝调用，继续使用兼容方案。
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}
