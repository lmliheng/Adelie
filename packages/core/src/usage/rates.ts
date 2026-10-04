// src/usage/rates.ts
//
// 用量换算成钱：**价格是数据，成本永远现算**。
//
// 为什么不在落库时就把成本算好写进去：调价、促销、峰谷一变，历史行里的数字就成了
// 谎话，而且要重算就得回填。落库的只该是 token（那是不变的观测），钱是「按今天的
// 牌价算出来的一个视图」—— 同一条记录在不同时间算出来可以不同，这是设计而不是 bug。
//
// 表里没有的模型返回 null，调用方按「未定价」处理并说出来。编一个价格比留空更坏。
//
// 计费口径（只做乘法，不做分层/阶梯）：`输入 × 输入价 + 输出 × 输出价`，命中前缀缓存
// 的那部分若给了 `cacheRead` 就按它算 —— 缓存价通常比输入价低一个量级，把它按输入价
// 算会系统性高估。两个数都不知道时按输入价算，并在注释里认下这件事。

import type { TokenUsage } from '../types/AgentProvider.js';
import { MODEL_CATALOG } from '../config/model-catalog.js';

/** 牌价单位：美元 / 百万 token（与各家定价页同一口径，避免每次心算） */
export interface ModelRates {
  /** 未命中缓存的输入价 */
  readonly input: number;
  /** 输出价 */
  readonly output: number;
  /** 命中前缀缓存的输入价；省略时按 `input` 算 */
  readonly cacheRead?: number;
}

/**
 * 某个模型的牌价。
 *
 * 只认 `(provider, model)` 精确匹配：模型名是自由字符串（各家迭代快），我们无法靠
 * 前缀猜「这是哪个家族的哪一档」。猜错的代价是钱，所以宁可不认。
 */
export function ratesFor(provider: string, model: string): ModelRates | null {
  for (const group of MODEL_CATALOG) {
    if (group.id !== provider) continue;
    for (const candidate of group.models) {
      if (candidate.id === model) return candidate.rates ?? null;
    }
    // 用户在目录之外手填的模型名（各家的新快照版）：不认，按未定价处理
    return null;
  }
  return null;
}

/**
 * 一次用量值多少钱（美元）。未定价的模型调用方先判 `ratesFor` 返回 null 再走这里。
 *
 * `cacheRead` 只作用于**命中**的那部分：未命中的输入按输入价算。若响应给了
 * `cacheMissTokens`，就按它算输入那一项 —— 否则会把命中的 token 又算一遍。
 */
export function estimateCostUsd(usage: TokenUsage, rates: ModelRates): number {
  const cacheHit = usage.cacheHitTokens ?? 0;
  const cacheMiss = usage.cacheMissTokens;
  const inputTokens = cacheMiss ?? Math.max(0, usage.promptTokens - cacheHit);
  const cachePrice = rates.cacheRead ?? rates.input;

  const cost =
    (inputTokens / 1_000_000) * rates.input +
    (cacheHit / 1_000_000) * cachePrice +
    (usage.completionTokens / 1_000_000) * rates.output;

  // 浮点乘法的尾巴（0.30000000000000004）不该出现在界面上：按「不到一厘就抹掉」收
  return Math.round(cost * 1_000_000) / 1_000_000;
}
