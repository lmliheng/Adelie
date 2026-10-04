// 配置与工具清单（契约 §2）。
//
// P3 之后这里有两层权限，都在**这一层**判定（不放进路由权限表，因为同一片路由里
// 字段与字段的要求不同）：
//   - 谁能改什么：**密钥、端点、提供方、工作区**是管理员的；模型名与预算是每个人的。
//   - 改出来的东西属于谁：配置按身份存（`ctx.settingsFor`），别人的那份动不到。
import { jsonError, readJsonObject } from '../http.js';
import {
  defaultModelFor,
  hasApiKey,
  isProviderName,
  normalizeWorkspace,
  writeApiKey,
} from '../settings.js';
import { DEFAULT_PROVIDER, MODEL_CATALOG, PROVIDER_NAMES } from 'adelie-core';
import { isDirectory, type AppSettings, type ServerContext } from '../context.js';
import { identityOf } from '../identity.js';

import type { Context, Hono } from 'hono';
import type { ModelRef } from 'adelie-core';
import type { AppEnv, Identity } from '../identity.js';

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

/** 只有管理员能改的字段。非管理员碰到它们时给的是 403 而不是「静默忽略」 */
function adminOnly(c: Context, what: string): Response {
  return jsonError(c, 403, 'admin_required', `只有管理员能改${what}`);
}

export function registerConfigRoutes(app: Hono<AppEnv>, ctx: ServerContext): void {
  app.get('/api/config', (c) => c.json(ctx.configView(identityOf(c))));

  app.patch('/api/config', async (c) => {
    const identity = identityOf(c);
    const body = await readJsonObject(c);
    if (body === null) return jsonError(c, 400, 'bad_request', '请求体必须是 JSON 对象');

    const current = ctx.settingsFor(identity);
    const next: AppSettings = { ...current };

    if (body['workspace'] !== undefined) {
      // 改工作区等于决定「Agent 能在哪个目录里动手」，这是管理员的事。
      // 普通用户的工作区由管理员在（每个用户各自的）配置里定下来。
      if (!identity.isAdmin) return adminOnly(c, '工作区');
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
      // 自定义端点能指向任何服务器 —— 那是请求与密钥的去处，管理员才有权决定
      if (!identity.isAdmin) return adminOnly(c, '端点');
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
    //
    // 平铺的 `provider` 是 0.1 客户端的写法（装了 PWA 的手机会缓存旧前端），
    // 留着它的代价是契约里多一条规则 —— 等确认线上没有 0.1 客户端后删，
    // 条件写在 docs/issues/server-config-provider-compat-branch.md。
    if (body['model'] !== undefined || body['provider'] !== undefined) {
      const raw = body['model'] !== undefined ? body['model'] : { provider: body['provider'] };
      const parsed = parseModelPatch(raw, next.model);
      if (typeof parsed === 'string') return jsonError(c, 400, 'bad_request', parsed);
      // 换家庭（提供方）是管理员的事：它连着端点与密钥，换家等于换一个账号在花钱。
      // 同家换型号（改 model 名）人人可用 —— 那是「用哪个脑子」的偏好。
      if (parsed.provider !== current.model.provider && !identity.isAdmin) {
        return adminOnly(c, '提供方');
      }
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
      if (!identity.isAdmin) return adminOnly(c, '密钥');
      const raw = body['apiKey'];
      if (typeof raw !== 'string' || raw.trim() === '') {
        return jsonError(c, 400, 'bad_request', 'apiKey 必须是非空字符串');
      }
      try {
        // 写进**这个身份**的密钥文件：管理员写的是主机级 `.env`，
        // 登录用户写的是自己的 `secrets/<id>.env`（见 settings.ts）
        writeApiKey(identity.key, next.model.provider, raw.trim());
      } catch (error) {
        return jsonError(c, 500, 'internal', `密钥写入失败：${(error as Error).message}`);
      }
    }

    Object.assign(current, next);
    ctx.saveSettings(identity);
    // 只回 hasApiKey —— 密钥本身在任何响应体里都不出现（契约 §2）
    return c.json(ctx.configView(identity));
  });

  /**
   * 模型清单（契约 §2）。
   *
   * 存在的理由：界面要给出「哪几家、各有那些模型」，这份清单只能有一个出处 ——
   * core 的模型目录。以前它被抄在 Web 的下拉框里，加一家厂商要改两处，漏掉的那处
   * 表现为「服务端支持、界面里选不到」。
   *
   * 不含端点，也不含密钥：`envKey` 是环境变量**名**，界面用它提示「密钥配在哪」，
   * 不是秘密。`hasApiKey` 按**当前身份**算 —— 同一台机器上，管理员配了密钥不等于
   * 别人也配了（每个人有自己的密钥文件）。
   */
  app.get('/api/models', (c) => {
    const identity: Identity = identityOf(c);
    return c.json({
      default: DEFAULT_PROVIDER,
      groups: MODEL_CATALOG.map((group) => ({
        id: group.id,
        label: group.label,
        envKey: group.envKey,
        hasApiKey: hasApiKey(identity.key, group.id),
        models: group.models,
      })),
    });
  });

  app.get('/api/tools', (c) => c.json({
    tools: ctx.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      requiresApproval: tool.permissions.requiresApproval,
    })),
  }));
}
