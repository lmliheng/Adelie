// src/test/types/model-ref.test.ts
//
// 模型引用。
//
// 这里钉的是「引用而不是拼串」这个决定：为什么要有 parse 与格式化的分工、
// 为什么模型名里允许有斜杠、以及读回来的 `unknown` 该怎么判而不是硬断言。
import { describe, it, expect } from 'vitest';
import {
  formatModelRef,
  isModelRef,
  parseModelRef,
  sameModelRef,
} from '../src/types/ModelRef.js';

describe('模型引用', () => {
  it('格式化是给人看的：`提供方/模型`', () => {
    expect(formatModelRef({ provider: 'kimi', model: 'kimi-latest' })).toBe('kimi/kimi-latest');
    expect(formatModelRef({ provider: 'deepseek', model: 'deepseek-chat' })).toBe(
      'deepseek/deepseek-chat',
    );
  });

  it('解析只切第一个斜杠 —— 模型名里允许有斜杠', () => {
    // 自建网关与一些部署会把路径写进模型名，按最后一个斜杠切就会认错
    expect(parseModelRef('kimi/kimi-latest')).toEqual({ provider: 'kimi', model: 'kimi-latest' });
    expect(parseModelRef('openai/vendor/gpt-4o')).toEqual({
      provider: 'openai',
      model: 'vendor/gpt-4o',
    });
    expect(parseModelRef('  qwen/qwen-max  ')).toEqual({ provider: 'qwen', model: 'qwen-max' });
  });

  it('解析不出来就给 null，不抛错', () => {
    // 它也被用在「配置文件里人手写的值」那条路上：抛出来会变成崩溃而不是提示
    expect(parseModelRef('deepseek-chat')).toBeNull(); // 没有斜杠
    expect(parseModelRef('moonshot/kimi-latest')).toBeNull(); // 不是我们认得的提供方
    expect(parseModelRef('kimi/')).toBeNull(); // 缺模型名
    expect(parseModelRef('/kimi-latest')).toBeNull(); // 缺提供方
    expect(parseModelRef('')).toBeNull();
  });

  it('判据挡得住 JSON 里读回来的各种形状', () => {
    expect(isModelRef({ provider: 'kimi', model: 'kimi-latest' })).toBe(true);
    expect(isModelRef({ provider: 'kimi', model: '  ' })).toBe(false); // 空白不算模型名
    expect(isModelRef({ provider: 'nope', model: 'x' })).toBe(false);
    expect(isModelRef({ provider: 'kimi' })).toBe(false);
    expect(isModelRef('kimi/kimi-latest')).toBe(false); // 字符串不是引用
    expect(isModelRef(null)).toBe(false);
    expect(isModelRef([])).toBe(false);
  });

  it('比较：缺失的一侧一律算不同', () => {
    const ref = { provider: 'kimi', model: 'kimi-latest' } as const;
    expect(sameModelRef(ref, { provider: 'kimi', model: 'kimi-latest' })).toBe(true);
    expect(sameModelRef(ref, { provider: 'kimi', model: 'kimi-k3' })).toBe(false);
    expect(sameModelRef(ref, { provider: 'qwen', model: 'kimi-latest' })).toBe(false);
    // 老会话头、老事件没有模型，不能与「用着 deepseek」混为一谈
    expect(sameModelRef(undefined, undefined)).toBe(false);
    expect(sameModelRef(ref, undefined)).toBe(false);
    expect(sameModelRef(null, ref)).toBe(false);
  });
});
