// 配置与工具清单（契约 §2）。
import { jsonError, readJsonObject } from '../http.js';
import {
  defaultModelFor,
  hasApiKey,
  isProviderName,
  normalizeWorkspace,
  writeApiKey,
} from '../settings.js';
import { DEFAULT_PROVIDER, MODEL_CATALOG, PROVIDER_NAMES } from 'adelie-core';
import { isDirectory } from '../context.js';

import type { Hono } from 'hono';
import type { ModelRef } from 'adelie-core';
import type { AppSettings, ServerContext } from '../context.js';

/**
 * 把 PATCH 里的 `model` 解析成一条引用。失败时返回**给人看的原因**（字符串），
 * 成功时返回引用 —— 用返回值类型区分成败，调用方不必自己拼错误分支。
 *
 * 三条规则：
 *  - 对象 `{ provider, model }`：provider 必给；model 省略时，若提供方没变就沿用
 *    当前的模型名（同一家里换型号是另一件事），变了就落到新家的默认值 ——
 *    把 deepseek 的名字发给 Moonshot 几乎必然换来一次 400。
 *  - 裸字符串：只改模型名，提供方不动（0.1 的客户端就是这么发的）。
 *  - 其它：报错。
 */
function parseModelPatch(raw: unknown, current: ModelRef): ModelRef | string {
  if (typeof raw === 'string') {
    const model = raw.trim();
    if (model === '') return 'model 必须是非空字符串';
    return { provider: current.provider, model };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return 'model 必须是 { provider, model } 对象';
  }

  const candidate = raw as { provider?: unknown; model?: unknown };
  if (!isProviderName(candidate.provider)) {
    return `provider 只能是 ${PROVIDER_NAMES.join(' / ')}`;
  }
  if (candidate.model === undefined) {
    return candidate.provider === current.provider
      ? current
      : { provider: candidate.provider, model: defaultModelFor(candidate.provider) };
  }
  if (typeof candidate.model !== 'string' || candidate.model.trim() === '') {
    return 'model 必须是非空字符串';
  }
  return { provider: candidate.provider, model: candidate.model.trim() };
}

export function registerConfigRoutes(app: Hono, ctx: ServerContext): void {
  app.get('/api/config', (c) => c.json(ctx.configView()));

  app.patch('/api/config', async (c) => {
    const body = await readJsonObject(c);
    if (body === null) return jsonError(c, 400, 'bad_request', '请求体必须是 JSON 对象');

    const next: AppSettings = { ...ctx.settings };

    if (body['workspace'] !== undefined) {
      const raw = body['workspace'];
      if (typeof raw !== 'string' || raw.trim() === '') {
        return jsonError(c, 400, 'bad_request', 'workspace 必须是非空字符串');
      }
      const workspace = normalizeWorkspace(raw);
      if (!isDirectory(workspace)) {
        return jsonError(c, 400, 'bad_request', `工作区不存在或不是目录：${workspace}`);
      }
      next.workspace = workspace;
    }

    if (body['baseUrl'] !== undefined) {
      const raw = body['baseUrl'];
      if (raw === null) {
        next.baseUrl = null;
      } else if (typeof raw === 'string') {
        next.baseUrl = raw.trim() === '' ? null : raw.trim();
      } else {
        return jsonError(c, 400, 'bad_request', 'baseUrl 必须是字符串或 null');
      }
    }

    // 换模型：`model` 是 `{ provider, model }` 一条引用，不是两个平铺字段。
    // provider 必须给；model 省略时按「换家」处理（见 parseModelPatch）。
    if (body['model'] !== undefined) {
      const parsed = parseModelPatch(body['model'], next.model);
      if (typeof parsed === 'string') return jsonError(c, 400, 'bad_request', parsed);
      next.model = parsed;
    } else if (body['provider'] !== undefined) {
      // 兼容 0.1：老客户端只发 `provider`。手机上装过的 PWA 缓存着旧前端，
      // 它还会这样发 —— 为一句字段改名把老客户端踹回设置页，不值得。
      // 等确认线上没有 0.1 的客户端之后再删这一段。
      const parsed = parseModelPatch({ provider: body['provider'] }, next.model);
      if (typeof parsed === 'string') return jsonError(c, 400, 'bad_request', parsed);
      next.model = parsed;
    }

    if (body['maxIterations'] !== undefined) {
      const raw = body['maxIterations'];
      if (typeof raw !== 'number' || !Number.isInteger(raw) || raw <= 0) {
        return jsonError(c, 400, 'bad_request', 'maxIterations 必须是正整数');
      }
      next.maxIterations = raw;
    }

    if (body['maxTokens'] !== undefined) {
      const raw = body['maxTokens'];
      if (raw === null) {
        next.maxTokens = null;
      } else if (typeof raw === 'number' && Number.isInteger(raw) && raw > 0) {
        next.maxTokens = raw;
      } else {
        return jsonError(c, 400, 'bad_request', 'maxTokens 必须是正整数或 null');
      }
    }

    if (body['apiKey'] !== undefined) {
      const raw = body['apiKey'];
      if (typeof raw !== 'string' || raw.trim() === '') {
        return jsonError(c, 400, 'bad_request', 'apiKey 必须是非空字符串');
      }
      try {
        writeApiKey(next.model.provider, raw.trim());
      } catch (error) {
        return jsonError(c, 500, 'internal', `密钥写入失败：${(error as Error).message}`);
      }
    }

    Object.assign(ctx.settings, next);
    // 只回 hasApiKey —— 密钥本身在任何响应体里都不出现（契约 §2）
    return c.json(ctx.configView());
  });

  /**
   * 模型清单（契约 §2）。
   *
   * 存在的理由：界面要给出「哪几家、各有那些模型」，这份清单只能有一个出处 ——
   * core 的模型目录。以前它被抄在 Web 的下拉框里，加一家厂商要改两处，漏掉的那处
   * 表现为「服务端支持、界面里选不到」。
   *
   * 不含端点，也不含密钥：`envKey` 是环境变量**名**，界面用它提示「密钥配在哪」，
   * 不是秘密。
   */
  app.get('/api/models', (c) => c.json({
    default: DEFAULT_PROVIDER,
    groups: MODEL_CATALOG.map((group) => ({
      id: group.id,
      label: group.label,
      envKey: group.envKey,
      hasApiKey: hasApiKey(group.id),
      models: group.models,
    })),
  }));

  app.get('/api/tools', (c) => c.json({
    tools: ctx.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      requiresApproval: tool.permissions.requiresApproval,
    })),
  }));
}
