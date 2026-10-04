// src/test/provider/kimi-qwen.test.ts
//
// Kimi 与通义。
//
// 这两家走的是与 DeepSeek 相同的 `/chat/completions` 协议，所以这里不重测协议
// 翻译（见 deepseek-translation.test.ts），只测「它们确实是独立的提供方」：
// 端点、厂商标、密钥变量、工厂函数、以及 baseUrl 能被调用方覆盖。
import { describe, it, expect } from 'vitest';
import { KimiProvider, DEFAULT_KIMI_BASE_URL } from '../src/kimi.provider.js';
import { QwenProvider, DEFAULT_QWEN_BASE_URL } from '../src/qwen.provider.js';
import { DeepSeekProvider } from '../src/deepseek.provider.js';
import { createProvider, PROVIDER_API_KEY_ENV } from '../src/Provider.js';

const baseConfig = { apiKey: 'test-key', modelName: 'whatever' };

describe('Kimi（Moonshot）', () => {
  it('默认端点指向 Moonshot 的兼容端点，而不是别家', () => {
    const provider = new KimiProvider(baseConfig);
    expect(provider.config.baseUrl).toBe(DEFAULT_KIMI_BASE_URL);
    expect(provider.config.baseUrl).toBe('https://api.moonshot.cn/v1/chat/completions');
  });

  it('名字与厂商标都改掉了 —— 报错时要说对是谁拒的请求', () => {
    const provider = new KimiProvider(baseConfig);
    expect(provider.name).toBe('kimi');
    expect((provider as unknown as { vendor: string }).vendor).toContain('Kimi');
  });

  it('密钥读 MOONSHOT_API_KEY', () => {
    expect(PROVIDER_API_KEY_ENV.kimi).toBe('MOONSHOT_API_KEY');
    expect(PROVIDER_API_KEY_ENV.kimi).not.toBe(PROVIDER_API_KEY_ENV.deepseek);
  });

  it('调用方给的 baseUrl 覆盖默认值（网关 / 本机代理都用得上）', () => {
    const provider = new KimiProvider({ ...baseConfig, baseUrl: 'https://gw.internal/v1/chat/completions' });
    expect(provider.config.baseUrl).toBe('https://gw.internal/v1/chat/completions');
  });

  it('仍然是一个 chat-completions 实现（与 DeepSeek 同源，不是复制品）', () => {
    expect(new KimiProvider(baseConfig)).toBeInstanceOf(DeepSeekProvider);
  });

  it('工厂认得 kimi', () => {
    expect(createProvider('kimi', baseConfig)).toBeInstanceOf(KimiProvider);
  });
});

describe('通义千问（DashScope 兼容模式）', () => {
  it('默认端点指向 DashScope 的兼容模式端点', () => {
    const provider = new QwenProvider(baseConfig);
    expect(provider.config.baseUrl).toBe(DEFAULT_QWEN_BASE_URL);
    expect(provider.config.baseUrl).toBe(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    );
  });

  it('名字与厂商标都改掉了', () => {
    const provider = new QwenProvider(baseConfig);
    expect(provider.name).toBe('qwen');
    expect((provider as unknown as { vendor: string }).vendor).toContain('通义');
  });

  it('密钥读 DASHSCOPE_API_KEY', () => {
    expect(PROVIDER_API_KEY_ENV.qwen).toBe('DASHSCOPE_API_KEY');
  });

  it('baseUrl 可被覆盖', () => {
    const provider = new QwenProvider({ ...baseConfig, baseUrl: 'https://proxy.local/v1/chat/completions' });
    expect(provider.config.baseUrl).toBe('https://proxy.local/v1/chat/completions');
  });

  it('工厂认得 qwen', () => {
    expect(createProvider('qwen', baseConfig)).toBeInstanceOf(QwenProvider);
  });
});

describe('工厂的整体约定', () => {
  it('四家都造得出来，且都不是同一类', () => {
    const kinds = (['deepseek', 'openai', 'kimi', 'qwen'] as const).map(
      (type) => createProvider(type, baseConfig).name,
    );
    expect(kinds).toEqual(['deepseek', 'openai', 'kimi', 'qwen']);
  });

  it('每一家都有自己的密钥变量', () => {
    const keys = Object.values(PROVIDER_API_KEY_ENV);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual([
      'DEEPSEEK_API_KEY',
      'OPENAI_API_KEY',
      'MOONSHOT_API_KEY',
      'DASHSCOPE_API_KEY',
    ]);
  });
});
