// src/config/model-catalog.ts
//
// 模型目录：一家厂商一组，把「密钥在哪个环境变量里、端点在哪、有哪些模型」收成一张表。
//
// 为什么要有这张表：在这之前，这三件事散在四处 —— 提供方名写在类型里
// （`'deepseek' | 'openai'`）、端点与密钥环境变量写死在 providers 包的 switch 里、
// 模型名是用户在命令行上敲的裸字符串。加一家厂商要同时改四处，漏掉一处就表现为
// 「好像切过去了，其实还在用旧的端点」—— 那种错误不报错，只是偷偷用了别家。
//
// 为什么模型 id 只当**候选**、不当白名单：各家的 id 迭代很快（快照版、滚动别名、
// 预览版），把不认识的名字一律拒掉，等于逼用户等我们发版才能用上新模型。这张表
// 负责默认值、界面展示与报错提示；用户给的 id 一律透传 —— 某个 id 认不认得，
// 最终只有厂商自己说了算。
//
// kimi / qwen 两组的默认端点与模型 id 取自两家公开文档（2026-10），**未在真机上
// 发过真实请求**（本机没有这两家的 key）。id 写错只会换来厂商的一条 404，
// 改这张表即可，不必动代码。

import type { ProviderName } from '../types/Args.js';
// 只借类型：运行时那条依赖是反过来的（rates.ts 读这张表），`import type` 编译后不留代码，
// 所以两边不会真的互相 import。
import type { ModelRates } from '../usage/rates.js';

export interface CatalogModel {
  /** 请求里真正下发的模型名 */
  readonly id: string;
  /** 给人看的一句话 */
  readonly label: string;
  /** 该组未指定模型时用的那一个；每组至多一个 */
  readonly default?: boolean;
  /**
   * 牌价（美元 / 百万 token）。
   *
   * **只标我们真的知道牌价的那些**：不知道就不写，查询时按「未定价」处理并在界面上
   * 说出来 —— 编一个数字比留空更坏，因为它会让人按错的钱做决定。价格是数据、不是逻辑：
   * 改价只影响之后的查询，历史行里的 token 不动（成本永远现算，见 `usage/rates.ts`）。
   *
   * kimi / qwen 只公布人民币价（按汇率换算是另一种猜法），所以这里留空。
   */
  readonly rates?: ModelRates;
}

export interface ProviderGroup {
  readonly id: ProviderName;
  readonly label: string;
  /** 密钥所在的环境变量名，同时也是用户级 `.env` 里的键名 */
  readonly envKey: string;
  /** 默认端点（完整的 chat/completions 地址）；用户可用 `--base-url` 覆盖 */
  readonly baseUrl: string;
  /**
   * 走哪套协议。
   *
   * 现在只有 `/chat/completions` 一套：Kimi（Moonshot）与通义（DashScope 兼容模式）
   * 都提供这套兼容端点，所以适配一家新厂商通常只是往这张表里加一组，
   * 而不是新写一个 provider 类。
   */
  readonly clientType: 'chat-completions';
  readonly models: readonly CatalogModel[];
}

export const MODEL_CATALOG: readonly ProviderGroup[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    envKey: 'DEEPSEEK_API_KEY',
    baseUrl: 'https://api.deepseek.com/v1/chat/completions',
    clientType: 'chat-completions',
    models: [
      // 牌价（USD / 百万 token，2026-10 抄自官方定价页）：缓存价按官方的「命中前缀缓存」档
      { id: 'deepseek-chat', label: '对话（默认）', default: true, rates: { input: 0.27, cacheRead: 0.07, output: 1.1 } },
      // 这个名字不在官方目录里（本仓库自己的候选）：**不标价**，查询时按未定价处理
      { id: 'deepseek-flash', label: '快而省' },
      { id: 'deepseek-reasoner', label: '推理', rates: { input: 0.55, cacheRead: 0.14, output: 2.19 } },
    ],
  },
  {
    id: 'openai',
    label: 'OpenAI 兼容端点',
    envKey: 'OPENAI_API_KEY',
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    clientType: 'chat-completions',
    models: [
      { id: 'gpt-4o-mini', label: '小模型（默认）', default: true, rates: { input: 0.15, cacheRead: 0.075, output: 0.6 } },
      { id: 'gpt-4o', label: '大模型', rates: { input: 2.5, cacheRead: 1.25, output: 10 } },
    ],
  },
  {
    id: 'kimi',
    label: 'Kimi（Moonshot）',
    envKey: 'MOONSHOT_API_KEY',
    baseUrl: 'https://api.moonshot.cn/v1/chat/completions',
    clientType: 'chat-completions',
    models: [
      // 官方滚动别名：永远指向当前推荐的模型，适合当默认值（快照版会下线，别名不会）
      { id: 'kimi-latest', label: '滚动指向最新（默认）', default: true },
      { id: 'kimi-k2-0905-preview', label: 'K2 快照' },
      { id: 'moonshot-v1-32k', label: '上一代 32k' },
    ],
  },
  {
    id: 'qwen',
    label: '通义千问（DashScope 兼容模式）',
    envKey: 'DASHSCOPE_API_KEY',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    clientType: 'chat-completions',
    models: [
      // qwen-turbo / qwen-plus / qwen-max 是官方滚动别名，写死在表里比钉快照版稳
      { id: 'qwen-plus', label: '均衡（默认）', default: true },
      { id: 'qwen-max', label: '最强' },
      { id: 'qwen-turbo', label: '最快' },
      { id: 'qwen-long', label: '长上下文' },
    ],
  },
];

/** 目录里所有提供方的 id，顺序即展示顺序 */
export const PROVIDER_NAMES: readonly ProviderName[] = MODEL_CATALOG.map((group) => group.id);

/**
 * 没给 `--provider` / 配置里也没写时用哪一家。
 *
 * 只在这里写一次：以前 'deepseek' 同时在 CLI、服务端、Web 三处各写了一遍，
 * 改默认值得记得改三处，而漏掉的那处表现为「命令行是这家、界面是那家」。
 */
export const DEFAULT_PROVIDER: ProviderName = 'deepseek';

/** 目录里所有密钥环境变量名。用户级 `.env` 该读哪些键，就是它 */
export const PROVIDER_ENV_KEYS: readonly string[] = MODEL_CATALOG.map((group) => group.envKey);

export function providerGroup(id: string): ProviderGroup | undefined {
  return MODEL_CATALOG.find((group) => group.id === id);
}

export function isProviderName(value: unknown): value is ProviderName {
  return typeof value === 'string' && providerGroup(value) !== undefined;
}

/**
 * 取一组的定义。
 *
 * 调用方拿到的一定是合法 id（类型系统已经把住），所以这里找不到就是程序出错 ——
 * 抛错比返回 undefined 好：静默回落到别家会让人以为「切过去了」。
 */
function groupOf(id: ProviderName): ProviderGroup {
  const group = providerGroup(id);
  if (group === undefined) {
    throw new Error(`模型目录里没有提供方 ${id}（目录：${PROVIDER_NAMES.join(' / ')}）`);
  }
  return group;
}

export function envKeyForProvider(id: ProviderName): string {
  return groupOf(id).envKey;
}

export function defaultBaseUrlForProvider(id: ProviderName): string {
  return groupOf(id).baseUrl;
}

/** 未指定模型时用哪一个：先看标了 default 的，没有就取第一个 */
export function defaultModelForProvider(id: ProviderName): string {
  const models = groupOf(id).models;
  const picked = models.find((model) => model.default === true) ?? models[0];
  if (picked === undefined) {
    throw new Error(`模型目录里 ${id} 一组没有任何模型`);
  }
  return picked.id;
}
