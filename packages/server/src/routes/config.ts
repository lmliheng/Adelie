// 配置与工具清单（契约 §2）。
import { jsonError, readJsonObject } from '../http.js';
import {
  defaultModelFor,
  isProviderName,
  normalizeWorkspace,
  writeApiKey,
} from '../settings.js';
import { isDirectory } from '../context.js';

import type { Hono } from 'hono';
import type { AppSettings, ServerContext } from '../context.js';

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

    if (body['provider'] !== undefined) {
      const raw = body['provider'];
      if (!isProviderName(raw)) {
        return jsonError(c, 400, 'bad_request', 'provider 只能是 deepseek 或 openai');
      }
      next.provider = raw;
      // 换提供方却没同时给模型时，落到新提供方的默认模型：
      // 沿用旧名字几乎必然换来一次 400
      if (body['model'] === undefined) next.model = defaultModelFor(raw);
    }

    if (body['model'] !== undefined) {
      const raw = body['model'];
      if (typeof raw !== 'string' || raw.trim() === '') {
        return jsonError(c, 400, 'bad_request', 'model 必须是非空字符串');
      }
      next.model = raw.trim();
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
        writeApiKey(next.provider, raw.trim());
      } catch (error) {
        return jsonError(c, 500, 'internal', `密钥写入失败：${(error as Error).message}`);
      }
    }

    Object.assign(ctx.settings, next);
    // 只回 hasApiKey —— 密钥本身在任何响应体里都不出现（契约 §2）
    return c.json(ctx.configView());
  });

  app.get('/api/tools', (c) => c.json({
    tools: ctx.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      requiresApproval: tool.permissions.requiresApproval,
    })),
  }));
}
