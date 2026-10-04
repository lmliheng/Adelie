// 模型引用（契约 §2）：`model` 是一条 `{ provider, model }` 引用，不是两个平铺字段。
//
// 这里钉住四件事：换家要落到新家的默认模型、同一家只换型号不动提供方、写错要 400、
// 以及 0.1 的老客户端（只发 provider、或把 model 当字符串发）仍然能用。
// 最后一条是兼容性，不是偏好 —— 手机上装过的 PWA 缓存着旧前端。
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startHarness, type Harness } from './harness.js';

describe('模型引用', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startHarness();
  });

  afterAll(async () => {
    await harness.dispose();
  });

  async function patch(body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
    const res = await fetch(`${harness.base}/api/config`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() as Record<string, unknown> };
  }

  async function currentModel(): Promise<unknown> {
    const res = await fetch(`${harness.base}/api/config`);
    return ((await res.json()) as Record<string, unknown>)['model'];
  }

  it('只给 provider 换家：落到新家的默认模型', async () => {
    const res = await patch({ model: { provider: 'kimi' } });
    expect(res.status).toBe(200);
    // 旧名字（deepseek-chat）发给 Moonshot 必然 400，所以这里必须换成 kimi 的默认值
    expect(res.body['model']).toEqual({ provider: 'kimi', model: 'kimi-latest' });
    expect(await currentModel()).toEqual({ provider: 'kimi', model: 'kimi-latest' });
  });

  it('provider 不变又没给模型名：保持当前模型，不退回默认值', async () => {
    await patch({ model: { provider: 'kimi', model: 'kimi-k2-0905-preview' } });
    const res = await patch({ model: { provider: 'kimi' } });
    expect(res.status).toBe(200);
    expect(res.body['model']).toEqual({ provider: 'kimi', model: 'kimi-k2-0905-preview' });
  });

  it('给全了一对：按给的来', async () => {
    const res = await patch({ model: { provider: 'qwen', model: 'qwen-max' } });
    expect(res.status).toBe(200);
    expect(res.body['model']).toEqual({ provider: 'qwen', model: 'qwen-max' });
  });

  it('写错了要 400，且配置一点没动', async () => {
    const before = await currentModel();

    expect((await patch({ model: { provider: 'qwen', model: '   ' } })).status).toBe(400);
    expect((await patch({ model: { provider: 'qwen', model: 42 } })).status).toBe(400);
    expect((await patch({ model: { model: 'qwen-max' } })).status).toBe(400); // 缺 provider
    expect((await patch({ model: 42 })).status).toBe(400);

    expect(await currentModel()).toEqual(before);
  });

  it('兼容 0.1：只发平铺的 provider', async () => {
    const res = await patch({ provider: 'deepseek' });
    expect(res.status).toBe(200);
    expect(res.body['model']).toEqual({ provider: 'deepseek', model: 'deepseek-chat' });
  });

  it('兼容 0.1：把 model 当字符串发，只换型号不换家', async () => {
    const res = await patch({ model: 'deepseek-flash' });
    expect(res.status).toBe(200);
    expect(res.body['model']).toEqual({ provider: 'deepseek', model: 'deepseek-flash' });

    const back = await patch({ model: 'deepseek-chat' });
    expect(back.body['model']).toEqual({ provider: 'deepseek', model: 'deepseek-chat' });
  });

  it('GET /api/models 给出四家与各自的密钥变量名，不含端点', async () => {
    const res = await fetch(`${harness.base}/api/models`);
    expect(res.status).toBe(200);
    const body = await res.json() as {
      default: string;
      groups: Array<{ id: string; label: string; envKey: string; hasApiKey: boolean; models: unknown[] }>;
    };

    expect(body.default).toBe('deepseek');
    expect(body.groups.map((group) => group.id)).toEqual(['deepseek', 'openai', 'kimi', 'qwen']);
    expect(body.groups.map((group) => group.envKey)).toEqual([
      'DEEPSEEK_API_KEY',
      'OPENAI_API_KEY',
      'MOONSHOT_API_KEY',
      'DASHSCOPE_API_KEY',
    ]);
    for (const group of body.groups) {
      expect(group.models.length).toBeGreaterThan(0);
      expect(typeof group.hasApiKey).toBe('boolean');
    }
    // 端点与服务端配置是两回事，不该出现在给界面的清单里
    expect(JSON.stringify(body)).not.toContain('baseUrl');
  });
});
