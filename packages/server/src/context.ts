// 服务端的装配上下文。
//
// 路由模块（routes/*）需要的那几样东西都在这里一次性建好：用户库、可变配置、会话/运行
// 注册表、工具表、provider 工厂。路由只读这个上下文，不自己造状态 —— 否则
// 「配置改了但会话列表还按老工作区查」这类漂移会散落在每个 handler 里。
//
// P3 之后这里多了一层「按身份取东西」：配置、密钥、会话分区都挂在**身份**上，
// 而不是挂在进程上。原因是同一个进程要同时服务本机管理员与几个登录进来的用户 ——
// 进程级的一份配置没法表达「他改了模型，我没改」。
import { statSync } from 'node:fs';
import { join } from 'node:path';

import { DEFAULT_PROVIDER, SessionStore, config, loadUserEnvFile, sessionsRoot } from 'adelie-core';
import { createProvider as createRealProvider } from 'adelie-providers';
import { ToolRegistry } from 'adelie-tools';

import {
  DEFAULT_APPROVAL_MODE,
  DEFAULT_MAX_ITERATIONS,
  HOST_KEY,
  defaultModelFor,
  defaultSettings,
  hasApiKey,
  isApprovalMode,
  missingApiKeyMessage,
  normalizeWorkspace,
} from './settings.js';
import { discoverSessionsOnDisk, locationOptions, sessionEventsFileExists, SessionRegistry } from './sessions.js';
import { ADMIN_ID, UserStore, usersDbFile } from './users/db.js';
import { RunRegistry } from './turn.js';
import { readServerVersion } from './version.js';

import type { ModelRef, ProviderName, Tool } from 'adelie-core';
import type { Identity, IdentityOptions } from './identity.js';
import type { ServerSettings } from './settings.js';
import type { ProviderFactory, ProviderRequest } from './turn.js';

export type AppSettings = ServerSettings;

/**
 * 注入点。
 *
 * 每一个都对应一件「测试或宿主想换掉的东西」：工作区与会话根是环境，provider 工厂
 * 是外部世界的入口（测试塞假 provider），关闭回调是进程生命周期的出口（桌面壳
 * 用它收 http server）。
 */
export interface AppDeps {
  /** 初始工作区；默认取进程当前目录 */
  workspace?: string;
  /** 会话根目录覆盖；默认取 core 的 sessionsRoot()（家目录下） */
  sessionsRoot?: string | undefined;
  /** provider 工厂；测试注入假 provider */
  createProvider?: ProviderFactory;
  version?: string;
  /** 监听地址；非回环时认证强制生效 */
  host?: string;
  /** 显式配置的 token；给了就表示「所有请求都要凭证」 */
  token?: string | null;
  /**
   * 是否连回环请求也要凭证。
   *
   * 省略时按「token 非空即要求」——那是直接 `createApp` 的场景（测试、嵌入式）。
   * `startServer` 会显式传：绑非回环时**自动生成**的 token 只挡远程，本机仍免凭证。
   */
  alwaysRequireToken?: boolean;
  /** Web 构建产物目录；显式覆盖 ADELIE_WEB_DIST */
  webDist?: string | null;
  provider?: ProviderName;
  model?: string;
  baseUrl?: string | null;
  maxIterations?: number;
  maxTokens?: number | null;
  /** POST /api/shutdown 之后调用：由 main 负责关 http server 与退出 */
  onShutdown?: () => void | Promise<void>;
  /** 是否加载用户级 .env；测试关掉它，避免读到开发机的密钥 */
  loadUserEnv?: boolean;
  /** 用户库文件位置；测试指到临时目录。默认 `~/.adelie/adelie.db`（或 ADELIE_DB_FILE） */
  dbFile?: string;
  /** 直接注入一个用户库（测试想用内存库时） */
  users?: UserStore;
}

export interface LocatedSession {
  workspace: string;
  store: SessionStore;
  /** 会话是否已知（索引里有，或磁盘上有事件/会话头） */
  known: boolean;
  /**
   * 这个身份能不能读它。
   *
   * 不能读时调用方回 **404** 而不是 403：403 等于确认「这个会话存在，只是不给你」，
   * 而别人猜一个 id 时就该什么都问不出来。
   */
  allowed: boolean;
  /** 会话的主人（索引里没有时为 null） */
  ownerId: string | null;
}

export interface ServerContext {
  readonly deps: AppDeps;
  readonly version: string;
  readonly startedAt: number;
  /** 主机身份的可变配置：PATCH /api/config 就地改它。别的身份各有一份（见 settingsFor） */
  readonly settings: AppSettings;
  readonly users: UserStore;
  readonly identityOptions: IdentityOptions;
  readonly registry: SessionRegistry;
  readonly runs: RunRegistry;
  readonly tools: Tool[];
  readonly eagerTools: readonly string[];
  readonly createProvider: ProviderFactory;
  /** 这个身份现在用的运行配置 */
  settingsFor(identity: Identity): AppSettings;
  /** 把某个身份的配置写回库（主机身份没有落盘一说，静默返回） */
  saveSettings(identity: Identity): void;
  /** 某个主人的会话根。`undefined` = 用默认根（内置 admin 与会话共享根） */
  sessionsRootFor(ownerId: string): string | undefined;
  configView(identity: Identity): Record<string, unknown>;
  locate(sessionId: string, identity: Identity): LocatedSession;
  /** 把磁盘上有、索引里没有的会话补进索引。返回补了几条 */
  syncSessionsFromDisk(): number;
  close(): void;
}

/** 会话分区的根：只有内置 admin 用共享根，其余每人一个 `users/<id>` */
export function rootForOwner(base: string | undefined, ownerId: string): string | undefined {
  if (ownerId === ADMIN_ID) return base;
  return join(base ?? sessionsRoot(), 'users', ownerId);
}

/** 目录判据：给路由用（工作区必须是个已存在的目录） */
export function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** 从库里读回的配置。人手改坏、字段缺失、类型不对都退回默认值，不让它把启动带崩 */
export function parseStoredSettings(json: string, fallback: AppSettings): AppSettings {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ...fallback };
  }
  if (typeof raw !== 'object' || raw === null) return { ...fallback };

  const record = raw as Record<string, unknown>;
  const model = record['model'];
  const modelRef: ModelRef =
    typeof model === 'object' && model !== null &&
    typeof (model as Record<string, unknown>)['provider'] === 'string' &&
    typeof (model as Record<string, unknown>)['model'] === 'string'
      ? {
          provider: (model as Record<string, string>)['provider'] as ProviderName,
          model: (model as Record<string, string>)['model']!,
        }
      : { ...fallback.model };

  return {
    workspace: typeof record['workspace'] === 'string' ? record['workspace'] : fallback.workspace,
    model: modelRef,
    baseUrl: typeof record['baseUrl'] === 'string' ? record['baseUrl'] : null,
    maxIterations:
      typeof record['maxIterations'] === 'number' && Number.isInteger(record['maxIterations'])
        ? record['maxIterations']
        : fallback.maxIterations,
    maxTokens: typeof record['maxTokens'] === 'number' ? record['maxTokens'] : null,
    // 认不出的档位退回默认（「问我」）而不是让它把这一轮变成静默放行
    approvalPolicy: isApprovalMode(record['approvalPolicy'])
      ? record['approvalPolicy']
      : fallback.approvalPolicy,
  };
}

export function createServerContext(deps: AppDeps = {}): ServerContext {
  const version = deps.version ?? readServerVersion();
  const startedAt = Date.now();

  if (deps.loadUserEnv !== false) {
    // 与 CLI 同一条路：环境变量优先，家目录里的 .env 只补缺的那部分
    loadUserEnvFile();
  }

  const users = deps.users ?? new UserStore(deps.dbFile ?? usersDbFile());

  const provider = deps.provider ?? DEFAULT_PROVIDER;
  const settings: AppSettings = {
    workspace: normalizeWorkspace(deps.workspace ?? process.cwd()),
    model: { provider, model: deps.model ?? defaultModelFor(provider) },
    baseUrl: deps.baseUrl ?? null,
    maxIterations: deps.maxIterations ?? DEFAULT_MAX_ITERATIONS,
    maxTokens: deps.maxTokens ?? null,
    approvalPolicy: DEFAULT_APPROVAL_MODE,
  };

  /**
   * 非主机身份的配置缓存。
   *
   * 缓存不是为性能，是为了「就地改」这个用法：PATCH 拿到对象、改字段、再写回，
   * 每次从库里反序列化一份新的会让「改了一半就返回」变得看不出来。缓存由
   * `saveSettings` 落盘，进程退出前都算数。
   */
  const userSettings = new Map<string, AppSettings>();

  const createProvider: ProviderFactory = deps.createProvider ?? ((request: ProviderRequest) => {
    // 没有密钥就别把请求发出去：真端点会用 `Bearer undefined` 换回一句
    // 「api key: ****ined is invalid」，而那是**密钥缺失**被说成了「密钥错误」
    // （见 settings.ts 的 missingApiKeyMessage）。注入自定义工厂的场景不受影响。
    const missing = missingApiKeyMessage(request.provider, request.apiKey, request.baseUrl);
    if (missing !== null) throw new Error(missing);

    return createRealProvider(request.provider, {
      modelName: request.model,
      ...(request.apiKey !== undefined ? { apiKey: request.apiKey } : {}),
      ...(request.baseUrl !== null ? { baseUrl: request.baseUrl } : {}),
    });
  });

  const registry = new SessionRegistry();
  const runs = new RunRegistry();
  const tools = ToolRegistry.createDefault(config.tools.eager).getAllTools();

  function settingsFor(identity: Identity): AppSettings {
    if (identity.key === HOST_KEY) return settings;

    const cached = userSettings.get(identity.key);
    if (cached !== undefined) return cached;

    const stored = users.readUserSettings(identity.key);
    const loaded = stored === null
      ? defaultSettings(settings.workspace, { ...settings.model })
      : parseStoredSettings(stored, settings);
    userSettings.set(identity.key, loaded);
    return loaded;
  }

  function saveSettings(identity: Identity): void {
    // 主机配置只在内存里（与 v0.1.0 一致）：它来自启动参数与环境，落盘会让
    // 「这次启动怎么配的」与「上次留下的文件」打架。用户配置必须落盘 ——
    // 手机上的用户没有别的办法记住自己选了哪个模型。
    if (identity.key === HOST_KEY) return;
    users.writeUserSettings(identity.key, JSON.stringify(settingsFor(identity)));
  }

  function sessionsRootFor(ownerId: string): string | undefined {
    return rootForOwner(deps.sessionsRoot, ownerId);
  }

  /**
   * 把磁盘上存在、索引里没有的会话补进索引。
   *
   * 为什么需要：CLI 直接往磁盘写会话，它不知道也不该知道服务端的库。不做这一步，
   * 「命令行跑的会话在网页里看不见」——而这恰好是同一个用户在上面的两台设备。
   * 索引丢了也能靠它重建：它只是索引，正文永远是事件流。
   */
  function syncSessionsFromDisk(): number {
    const known = users.knownSessionIds();
    const roots: { root: string | undefined; ownerId: string }[] = [
      { root: deps.sessionsRoot, ownerId: ADMIN_ID },
    ];
    for (const user of users.listUsers()) {
      if (user.id === ADMIN_ID) continue;
      roots.push({ root: rootForOwner(deps.sessionsRoot, user.id), ownerId: user.id });
    }

    let added = 0;
    for (const entry of roots) {
      for (const found of discoverSessionsOnDisk(entry.root)) {
        if (known.has(found.sessionId)) continue;
        users.rememberSession(found.sessionId, entry.ownerId, found.workspace);
        known.add(found.sessionId);
        added += 1;
      }
    }
    return added;
  }

  function locate(sessionId: string, identity: Identity): LocatedSession {
    // 归属只从索引读，**不看请求里带的 id 是谁发的**。这一步是 A 读不到 B 的会话的
    // 唯一依据；把它换成「用当前身份去拼路径」就等于没做检查。
    const row = users.sessionOwner(sessionId);
    const current = settingsFor(identity);

    if (row !== undefined) {
      const store = new SessionStore(row.workspace, sessionId, {
        ...locationOptions(rootForOwner(deps.sessionsRoot, row.userId)),
        model: current.model,
      });
      return {
        workspace: row.workspace,
        store,
        known: true,
        allowed: row.userId === identity.ownerId || identity.isAdmin,
        ownerId: row.userId,
      };
    }

    // 索引里没有：可能是本进程刚建过（还没落库的路径），或磁盘上有但没同步过。
    // 只看这个身份自己的根 —— 别人的根下有什么，这一步问不出来。
    const workspace = registry.workspaceOf(sessionId) ?? current.workspace;
    const store = new SessionStore(workspace, sessionId, {
      ...locationOptions(sessionsRootFor(identity.ownerId)),
      model: current.model,
    });
    return {
      workspace,
      store,
      known: registry.has(sessionId) || sessionEventsFileExists(store),
      allowed: true,
      ownerId: null,
    };
  }

  return {
    deps,
    version,
    startedAt,
    settings,
    users,
    identityOptions: {
      store: users,
      token: deps.token ?? null,
      alwaysRequireToken: deps.alwaysRequireToken ?? (deps.token ?? null) !== null,
    },
    registry,
    runs,
    tools,
    eagerTools: config.tools.eager,
    createProvider,
    settingsFor,
    saveSettings,
    sessionsRootFor,
    locate,
    syncSessionsFromDisk,
    close: () => users.close(),
    configView: (identity: Identity) => {
      const current = settingsFor(identity);
      return {
        workspace: current.workspace,
        // 一个对象，不是两个平铺字段：界面因此不可能把它俩改歪
        model: current.model,
        baseUrl: current.baseUrl,
        hasApiKey: hasApiKey(identity.key, current.model.provider),
        // 审批口径是「我的运行口径」，按身份存、可写（PATCH /api/config）。
        // 契约里它报的是用户面那三档（always-ask / read-only / allow-all），
        // 翻成运行时接线的事在 turn.ts 里做（见 settings.ts 的 approvalRuntime）。
        approvalPolicy: current.approvalPolicy,
        limits: { maxIterations: current.maxIterations, maxTokens: current.maxTokens },
        version,
        // 界面靠这三条决定：显示登录页还是主界面、要不要显示「用户管理」、
        // 以及哪些字段该置灰（非管理员不能改提供方与密钥）。
        identity: {
          kind: identity.kind,
          name: identity.label,
          isAdmin: identity.isAdmin,
        },
      };
    },
  };
}
