/**
 * AI 客户端：通用 OpenAI 兼容接口（BaseURL + API Key + Model）。
 * - generateSubtasks：给标题+截止，AI 生成排期合理的子任务。
 * - aiRunCommand：命令栏工具调用（function calling），AI 返回要执行的应用动作。
 * 兼容 DeepSeek / OpenAI / 通义 / Moonshot 等主流服务商。
 */

import { TaskRepeatRule } from '../data/types';

export interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export const DEFAULT_AI_BASE_URL = 'https://api.deepseek.com/v1';

/** AI 是否已配置：模型名必须由用户明确填写，不能依赖内置默认值。 */
export function aiConfigured(config: Pick<AiConfig, 'baseUrl' | 'apiKey' | 'model'> | null | undefined): boolean {
  return !!config && !!config.baseUrl?.trim() && !!config.apiKey?.trim() && !!config.model?.trim();
}

/** 生成的子任务条目（时间戳：可为 null；remark：AI 生成时强制 20~50 字执行说明） */
export interface GeneratedSubtask {
  /** 编辑已有任务时保留对应数据库子任务 ID；AI/导入新条目没有该字段。 */
  id?: string;
  title: string;
  deadline: number | null;
  remark?: string;
}

/** 子任务规划模式：首次拆分、补充后续步骤、优化现有计划。 */
export type SubtaskPlanMode = 'initial' | 'extend' | 'optimize';

/** AI 工具调用结果：函数名 + 参数（由命令栏执行） */
export interface AiToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

/** 从模型输出中抽取第一段合法 JSON（剥围栏、取首个完整 {} 或 []） */
export function extractJsonBlock(text: string): unknown | null {
  if (!text) return null;
  const t = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  try { return JSON.parse(t); } catch { /* fallthrough */ }
  const starts = ['[', '{'].map((c) => t.indexOf(c)).filter((i) => i >= 0);
  if (starts.length === 0) return null;
  const start = Math.min(...starts);
  const open = t[start];
  const close = open === '[' ? ']' : '}';
  for (let i = start; i < t.length; i++) {
    if (t[i] === close) {
      try { return JSON.parse(t.slice(start, i + 1)); } catch { /* keep scanning */ }
    }
  }
  return null;
}

/** 把 ISO 字符串/数值/自然日期串统一转为时间戳；无法解析返回 null */
function toTimestamp(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const t = Date.parse(value);
    if (!Number.isNaN(t)) return t;
  }
  return null;
}

interface ChatOptions {
  temperature?: number;
  tools?: unknown[];
  toolChoice?: 'auto' | 'required' | 'none';
  signal?: AbortSignal;
}

/** 底层 chat/completions 调用 */
async function chatCompletion(config: AiConfig, messages: ChatMessage[], options: ChatOptions = {}): Promise<{
  content: string | null;
  toolCalls: { name: string; arguments: string }[];
}> {
  const base = config.baseUrl.trim().replace(/\/+$/, '');
  const url = `${base}/chat/completions`;
  const payload: Record<string, unknown> = {
    model: config.model,
    messages,
    temperature: options.temperature ?? 0.4,
    stream: false,
  };
  if (options.tools && options.tools.length > 0) {
    payload.tools = options.tools;
    payload.tool_choice = options.toolChoice ?? 'auto';
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(payload),
    signal: options.signal,
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const err = (await res.json()) as { error?: { message?: string } };
      if (err?.error?.message) detail = err.error.message;
    } catch { /* ignore */ }
    throw new Error(`AI 请求失败：${detail}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string | null; tool_calls?: { function?: { name: string; arguments: string } }[] } }[];
  };
  const msg = data.choices?.[0]?.message;
  const content = msg?.content ?? null;
  const toolCalls = (msg?.tool_calls ?? []).map((tc) => ({
    name: tc.function?.name ?? '',
    arguments: tc.function?.arguments ?? '{}',
  }));
  return { content, toolCalls };
}

/** OpenAI tools schema（本应用暴露给 AI 的工具）。
 * 需求：AI 仅负责「新建任务 / 编辑任务」这类需要解析多字段的复杂操作，
 * 其余简单操作（新建文件夹/移动/删除）由应用内自然语言解析器处理。 */
export function buildTools(): unknown[] {
  const repeatEnum: TaskRepeatRule[] = ['daily', 'weekly', 'monthly', 'yearly', 'custom'];
  return [
    {
      type: 'function',
      function: {
        name: 'create_task',
        description: '新建一个任务并返回任务的全部字段，由应用弹出新建任务窗口供用户确认（AI 已选好各项）。需一次性给出所有能确定的功能字段。',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: '任务标题，去掉日期/重复/提醒等修饰，只留纯任务名' },
            folder: { type: 'string', description: '可选：目标文件夹名称（必须是上下文中的文件夹名之一，缺省为未分类）' },
            deadline: { type: 'string', description: '可选：截止时间 ISO 8601（如 2026-08-04T23:59）。仅日期也要给具体时刻' },
            priority: { type: 'string', enum: ['normal', 'important'], description: '可选：重要程度' },
            remark: { type: 'string', description: '可选：任务备注，说明该任务要做什么、做到什么程度' },
            repeat_rule: { type: 'string', enum: repeatEnum, description: '重复规则；例如"每3天"→custom，"每天"→daily' },
            repeat_interval_days: { type: 'integer', description: 'repeat_rule=custom 时的间隔天数' },
            reminder_offsets: { type: 'array', items: { type: 'string' }, description: '可选：提前提醒偏移，取 "1d"/"3d"/"6h"/"1h" 之一或多个' },
            subtasks: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string', description: '子任务标题' },
                  deadline_iso: { type: 'string', description: '可选：该子任务截止时间 ISO 8601，应在 [now, 父任务截止] 之间' },
                  remark: { type: 'string', description: '可选：子任务备注（20~50 字，说明要做什么）' },
                },
                required: ['title'],
              },
            },
          },
          required: ['title'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'update_task',
        description: '修改已有任务（按标题模糊匹配）。需返回要修改的所有字段，由应用弹出编辑任务窗口供用户确认（AI 已选好各项）。',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '任务标题关键词，必须是上下文中的任务名之一' },
            title: { type: 'string', description: '可选：新标题' },
            deadline: { type: 'string', description: '可选：新截止时间 ISO 8601' },
            priority: { type: 'string', enum: ['normal', 'important'], description: '可选：重要程度' },
            remark: { type: 'string', description: '可选：新备注' },
            repeat_rule: { type: 'string', enum: repeatEnum, description: '可选：重复规则' },
            repeat_interval_days: { type: 'integer', description: 'repeat_rule=custom 时的间隔天数' },
            reminder_offsets: { type: 'array', items: { type: 'string' }, description: '可选：提前提醒偏移 "1d"/"3d"/"6h"/"1h"' },
          },
          required: ['query'],
        },
      },
    },
  ];
}

/** 工具名 → ID 类型（用于把文件夹名映射到 id） */
export interface AiCommandContext {
  /** 当前活动任务标题列表 */
  taskTitles: string[];
  /** 当前文件夹名称列表 */
  folderNames: string[];
  /** 现在时间戳 */
  now: number;
}

const SUBTASK_SYSTEM = `你是 Todo List 的智能任务规划助手。

你的任务是：将用户任务拆解为 3~6 个有实际意义、按执行顺序排列的子任务，并根据每个子任务的实际工作量合理分配截止时间。

【任务拆解】
1. 子任务必须是完成父任务所需的实际工作。
2. 按自然执行顺序排列，前面的工作应尽可能成为后续工作的基础。
3. 根据任务类型判断工作量，不同类型任务的耗时差异必须被体现。
   例如：撰写论文通常明显比完成普通作业耗时；资料收集、复杂分析、编程实现等通常比简单整理耗时。
4. 不要为了凑数量拆分没有独立价值的小步骤。

【时间规划】
1. 先估计每个子任务相对于其他子任务的工作量，再据此分配时间。
2. 工作量越大的子任务，应获得越长的时间区间；工作量小的子任务可以获得较短时间。
3. 不要求子任务时间平均分配，禁止机械地平均分配时间。
4. 所有子任务的 deadline 必须递增，并位于 [当前时间, 父任务截止时间] 内。
5. 整体时间安排应覆盖父任务的大部分可用时间，不要把所有工作集中到最后几天。
6. 最后一个子任务的 deadline 应接近或等于父任务截止时间。
7. 如果某个子任务明显需要较长时间，应允许其占据整个时间区间中明显更大的比例。
8. 不要为了让日期"均匀"而牺牲对实际工作量的判断。

【remark】
每个子任务提供一句简洁的执行说明，简洁说明执行内容和完成标准。
【输出】
只输出 JSON 数组，不要 Markdown，不要解释，不要输出任何额外文字。

格式：
[
  {
    "title": "子任务名称",
    "deadline": "YYYY-MM-DDTHH:mm",
    "remark": "具体执行内容及完成标准"
  }
]`;

/** 毫秒/天 */
const DAY_MS = 24 * 60 * 60 * 1000;

/** 本地友好格式化：YYYY-MM-DD HH:mm */
function fmtLocal(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 把时间戳钳制到 [lo, hi] 区间；超出返回 null。用于强约束子任务必须落在 [新建时间, 父截止] 之间 */
function clampTs(v: number | null, lo: number, hi: number | null): number | null {
  if (v == null) return null;
  if (hi != null && v > hi) v = hi;
  if (v < lo) v = lo;
  return v;
}

/** 一键生成子任务：根据父任务标题 + 截止时间，让 AI 产出排期子任务。
 * 温度 0（快速应答/确定性输出）；时间强约束到 [新建时间, 父截止] 之间。 */
export async function generateSubtasks(
  config: AiConfig,
  opts: { title: string; deadline: number | null; now: number; count?: number | null; hint?: string; mode?: SubtaskPlanMode; existingSubtasks?: GeneratedSubtask[]; parentContext?: string; signal?: AbortSignal },
): Promise<GeneratedSubtask[]> {
  const mode = opts.mode ?? 'initial';
  const existing = opts.existingSubtasks ?? [];
  const parentContext = opts.parentContext?.trim() ?? '';
  const cacheKey = JSON.stringify({ model: config.model, title: opts.title, deadline: opts.deadline, count: opts.count ?? null, hint: opts.hint ?? '', mode, existing, parentContext });
  const cached = subtaskCache.get(cacheKey);
  if (cached) return cached.map((x) => ({ ...x }));
  const countText = opts.count && opts.count > 0 ? `${opts.count} 个` : mode === 'extend' ? '1~3 个' : '3~5 个';
  const spanDays = opts.deadline ? Math.max(1, Math.round((opts.deadline - opts.now) / DAY_MS)) : 0;
  // 关键：模型不知道"当前时刻"，必须显式给出当前时间与区间天数，否则无法均匀铺开
  const rangeText = opts.deadline
    ? `当前时间：${fmtLocal(opts.now)}\n任务截止：${fmtLocal(opts.deadline)}（从今天算起约 ${spanDays} 天内，区间共 ${spanDays} 天，请把这 ${spanDays} 天合理地分给各子任务）`
    : `当前时间：${fmtLocal(opts.now)}\n任务截止：未指定（请合理安排截止时间，不要早于当前时间）`;
  const modeText = mode === 'extend'
    ? '当前模式是“补充后续步骤”：只返回尚未存在的后续步骤，不要重复已有子任务。'
    : mode === 'optimize'
      ? '当前模式是“优化现有计划”：返回优化后的完整子任务列表；保留合理步骤，必要时调整顺序、标题和截止时间。'
      : '当前模式是“首次拆分”：从零开始规划子任务。';
  const existingText = existing.length > 0
    ? `\n现有子任务（已由用户编辑，请认真参考）：\n${existing.map((s, i) => `${i + 1}. ${s.title}${s.deadline ? `｜截止 ${fmtLocal(s.deadline)}` : ''}${s.remark ? `｜${s.remark}` : ''}`).join('\n')}`
    : '';
  const parentText = parentContext ? `\n父任务上下文（从上到下）：${parentContext}\n当前任务是上述层级中的直接子任务，请确保新生成的步骤都归属于当前任务，不要把父任务重复生成。` : '';
  const user = `任务：${opts.title}${parentText}\n${rangeText}\n${modeText}\n请生成 ${countText} 个有先后顺序的子任务。${existingText}\n${opts.hint?.trim() ? `补充要求：${opts.hint.trim()}` : ''}`;
  const { content } = await chatCompletion(config, [
    { role: 'system', content: SUBTASK_SYSTEM },
    { role: 'user', content: user },
  ], { temperature: 0, signal: opts.signal });
  const parsed = extractJsonBlock(content ?? '');
  if (!Array.isArray(parsed) || parsed.length === 0) return [];
  const subs = parsed
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && typeof x.title === 'string')
    .map((x) => ({
      title: String(x.title).trim(),
      deadline: clampTs(toTimestamp(x.deadline ?? x.deadline_iso), opts.now, opts.deadline),
      remark: typeof x.remark === 'string' ? x.remark.trim() : '',
    }))
    .filter((x) => x.title.length > 0);
  subtaskCache.set(cacheKey, subs);
  return subs.map((x) => ({ ...x }));
}

/** 当前编辑会话级缓存：重复请求相同规划不重复消耗网络与额度。 */
const subtaskCache = new Map<string, GeneratedSubtask[]>();

const COMMAND_SYSTEM = (ctx: AiCommandContext) =>
  `你是本任务管理应用的命令助手。你只负责「新建任务」「编辑任务」这两类需要解析多字段的复杂操作；新建文件夹、移动任务到文件夹、删除任务/文件夹等简单指令不要去解析，直接不输出任何 tool call（应用会用自己的自然语言解析器处理）。
解析任务指令时，必须把任务/文件夹的"主体名"解析正确：例如"新建一个重复三天的上课任务，8月4号结束"应调用 create_task，title 为"上课"（去掉"重复三天/8月4号结束"等修饰），deadline 为 2026 年 8 月 4 日（今天是 ${new Date(ctx.now).toLocaleDateString('zh-CN')}，用合适的年份），"三天"应表达为 repeat_rule=custom、repeat_interval_days=3。
"把游泳改为重要且截止周五"应调用 update_task，query 为"游泳"，priority 为 important，deadline 为周五。
带固定时刻的循环任务（如"每天八点起床"）应调用 create_task：title 为"起床"，repeat_rule=daily，deadline 设为今天（若今天该时刻已过则设为明天）的 08:00 具体时刻（必须是含时刻的 ISO 字符串，如 2026-09-08T08:00；不可只写日期、不可为 null）。同理"每周一上午九点开会"→ weekly 且 deadline 为下周一 09:00。
如果指令要求"生成/拆分子任务"，请在 create_task 的 subtasks 中给出每个子任务，且每个子任务必须同时提供 title、deadline_iso（必须为具体时刻，位于 [当前时间, 父任务截止] 之间）与 remark（20~50 字具体执行说明），不得省略。
只输出被执行的 tool_calls（create_task 或 update_task），不要解释，也不要输出 create_folder/move_task_to_folder/delete_task/delete_folder。可用的任务标题：${ctx.taskTitles.join('、') || '（暂无）'}。可用文件夹：${ctx.folderNames.join('、') || '（暂无）'}。

如果指令不需要新建或编辑任务，则不输出任何 tool call，返回空。`;

/** 命令栏 AI 助手：解析指令，返回应执行的工具调用（可能多个） */
export async function aiRunCommand(
  config: AiConfig,
  opts: { command: string; context: AiCommandContext; now: number },
): Promise<AiToolCall[]> {
  const tools = buildTools();
  const { content, toolCalls } = await chatCompletion(config, [
    { role: 'system', content: COMMAND_SYSTEM(opts.context) },
    { role: 'user', content: opts.command },
  ], { tools, temperature: 0.2 });

  if (toolCalls.length > 0) {
    return toolCalls
      .filter((tc) => tc.name)
      .map((tc) => {
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(tc.arguments); } catch { /* keep empty */ }
        return { name: tc.name, arguments: args };
      });
  }

  // 兜底：模型可能以纯 JSON 形式返回 {"function":...,"arguments":{...}} 或数组
  const parsed = extractJsonBlock(content ?? '');
  const list = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
  const calls: AiToolCall[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const name = (item as Record<string, unknown>).function ?? (item as Record<string, unknown>).name;
    const argsRaw = (item as Record<string, unknown>).arguments ?? {};
    let args: Record<string, unknown> = {};
    if (typeof argsRaw === 'string') { try { args = JSON.parse(argsRaw); } catch { args = {}; } }
    else if (argsRaw && typeof argsRaw === 'object') args = argsRaw as Record<string, unknown>;
    if (typeof name === 'string' && name) calls.push({ name, arguments: args });
  }
  return calls;
}

/** 测试 AI 连接：发一条极短消息验证 Key/地址/模型是否可用 */
export async function testAiConnection(config: AiConfig): Promise<void> {
  const { content } = await chatCompletion(config, [{ role: 'user', content: 'ping' }], { temperature: 0 });
  if (!content) throw new Error('空响应');
}

export { toTimestamp };
export type { ChatMessage, ChatOptions };
