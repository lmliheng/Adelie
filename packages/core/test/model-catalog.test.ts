// src/test/config/model-catalog.test.ts
//
// 模型目录。
//
// 这张表是「加一家厂商」的唯一入口，所以这里测的不是某个具体型号，而是
// **表本身的完整性**：每个提供方都得能被解析出密钥变量、端点与默认模型，
// 否则就会出现「命令行认这家、运行时却不知道端点在哪」这种半截状态。
import { describe, it, expect } from 'vitest';
import {
  MODEL_CATALOG,
  PROVIDER_ENV_KEYS,
  PROVIDER_NAMES,
  defaultBaseUrlForProvider,
  defaultModelForProvider,
  envKeyForProvider,
  isProviderName,
  providerGroup,
} from '../src/config/model-catalog.js';
import type { ProviderName } from '../src/types/Args.js';

describe('模型目录', () => {
  it('覆盖全部提供方，且 id 不重复', () => {
    const ids = MODEL_CATALOG.map((group) => group.id);
    expect(new Set(ids).size).toBe(ids.length);
    // 类型层面要求「每个 ProviderName 都在目录里」：漏一组，这里的长度就对不上
    const declared: ProviderName[] = ['deepseek', 'openai', 'kimi', 'qwen'];
    expect([...ids].sort()).toEqual([...declared].sort());
  });

  it('密钥环境变量不重复 —— 两家共用一个变量名会互相覆盖', () => {
    const keys = MODEL_CATALOG.map((group) => group.envKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain('MOONSHOT_API_KEY');
    expect(keys).toContain('DASHSCOPE_API_KEY');
  });

  it('每组都有默认模型，且默认模型确实在该组的清单里', () => {
    for (const group of MODEL_CATALOG) {
      expect(group.models.length).toBeGreaterThan(0);
      const defaults = group.models.filter((model) => model.default === true);
      expect(defaults.length, `${group.id} 的默认模型应当恰好一个`).toBe(1);
      expect(group.models.map((model) => model.id)).toContain(defaultModelForProvider(group.id));
    }
  });

  it('端点必须是完整的 chat/completions 地址', () => {
    for (const group of MODEL_CATALOG) {
      expect(group.baseUrl, group.id).toMatch(/^https:\/\/.+\/chat\/completions$/);
    }
  });

  it('Kimi 与通义各自钉住自己的端点，而不是落到 OpenAI 上', () => {
    expect(defaultBaseUrlForProvider('kimi')).toBe('https://api.moonshot.cn/v1/chat/completions');
    expect(defaultBaseUrlForProvider('qwen')).toBe(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    );
  });

  it('派生出来的清单与目录一致', () => {
    expect(PROVIDER_NAMES).toEqual(MODEL_CATALOG.map((group) => group.id));
    expect(PROVIDER_ENV_KEYS).toEqual(MODEL_CATALOG.map((group) => group.envKey));
    expect(envKeyForProvider('kimi')).toBe('MOONSHOT_API_KEY');
    expect(envKeyForProvider('qwen')).toBe('DASHSCOPE_API_KEY');
  });

  it('认得出提供方，也认得出不认识的名字', () => {
    expect(isProviderName('kimi')).toBe(true);
    expect(isProviderName('qwen')).toBe(true);
    expect(isProviderName('deepseek')).toBe(true);
    expect(isProviderName('moonshot')).toBe(false); // 别名不是 id，别放进去
    expect(isProviderName('')).toBe(false);
    expect(isProviderName(undefined)).toBe(false);
    expect(providerGroup('kimi')?.label).toContain('Kimi');
    expect(providerGroup('nope')).toBeUndefined();
  });
});
