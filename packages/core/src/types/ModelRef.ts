// src/types/ModelRef.ts
//
// 「用哪个模型」的引用形状：一对 `(provider, model)`，而不是一个拼好的字符串。
//
// 为什么不拼字符串：`kimi/kimi-latest` 这种写法看着方便，拆回来却只能靠猜 ——
// 模型名自己完全可能带斜杠（网关与自建部署常这么命名），而拼错的那一半不会被
// 任何类型或校验发现，只会变成一次莫名其妙的 400。分成两个字段之后：provider
// 是有穷联合（写错编不过），模型名保持自由字符串（各家迭代太快，不该由我们认证）。
//
// 这条引用贯穿三处，用量与成本都按它归属：
//   1. 配置（这台机器现在用哪个）
//   2. 会话头（这个会话建的时候用哪个）
//   3. run 的事件头（这一轮用的是哪个）

import { isProviderName } from '../config/model-catalog.js';
import type { ProviderName } from './Args.js';

export interface ModelRef {
  provider: ProviderName;
  /** 请求里真正下发的模型名。自由字符串：不自造白名单，认不认得由厂商说了算 */
  model: string;
}

/** 给人看的形式：`kimi/kimi-latest`。**只用于显示**，不要拿它去反解 */
export function formatModelRef(ref: ModelRef): string {
  return `${ref.provider}/${ref.model}`;
}

/** 两条引用是否指同一个模型。任一侧缺失（老会话头、老事件）一律算不同 */
export function sameModelRef(
  a: ModelRef | null | undefined,
  b: ModelRef | null | undefined,
): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  return a.provider === b.provider && a.model === b.model;
}

/**
 * 解析 `provider/model` 形式的字符串。
 *
 * 只切**第一个**斜杠：提供方 id 是我们自己定的、不含斜杠，而模型名里允许有。
 * 解析不出来返回 null，由调用方决定是报错还是忽略 —— 这里不抛异常，因为它也
 * 用在「配置文件里人手写的值」这条路径上，抛出来会变成一次崩溃而不是一条提示。
 */
export function parseModelRef(text: string): ModelRef | null {
  const trimmed = text.trim();
  const slash = trimmed.indexOf('/');
  if (slash <= 0 || slash === trimmed.length - 1) return null;
  const provider = trimmed.slice(0, slash);
  const model = trimmed.slice(slash + 1).trim();
  if (model === '' || !isProviderName(provider)) return null;
  return { provider, model };
}

/**
 * 形状判据。
 *
 * 需要它是因为会话头与事件流都是 JSON 读回来的 `unknown`：直接断言成 `ModelRef`
 * 会让一个手改坏的文件把整条恢复路径带崩，而这里返回 false 只是「没有这条信息」。
 */
export function isModelRef(value: unknown): value is ModelRef {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { provider?: unknown; model?: unknown };
  return (
    isProviderName(candidate.provider) &&
    typeof candidate.model === 'string' &&
    candidate.model.trim() !== ''
  );
}
