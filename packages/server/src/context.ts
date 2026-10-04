// 服务端的装配上下文。
//
// 路由模块（routes/*）需要的那几样东西都在这里一次性建好：可变配置、会话/运行
// 注册表、工具表、provider 工厂。路由只读这个上下文，不自己造状态 —— 否则
// 「配置改了但会话列表还按老工作区查」这类漂移会散落在每个 handler 里。
import { statSync } from 'node:fs';

import { DEFAULT_PROVIDER, SessionStore, config, loadUserEnvFile } from 'adelie-core';
import { createProvider as createRealProvider } from 'adelie-providers';
import { ToolRegistry } from 'adelie-tools';

import { SessionRegistry, locationOptions, sessionEventsFileExists } from './sessions.js';
import { DEFAULT_MAX_ITERATIONS, defaultModelFor, hasApiKey, normalizeWorkspace } from './settings.js';
import { RunRegistry } from './turn.js';
import { readServerVersion } from './version.js';

import type { ModelRef, ProviderName, Tool } from 'adelie-core';
import type { ProviderFactory, ProviderRequest } from './turn.js';

export interface AppSettings {
  workspace: string;
  /** 当前用哪个模型：提供方与模型名是一条引用，不拆成两个字段 */
  model: ModelRef;
  baseUrl: string | null;
  maxIterations: number;
  maxTokens: number | null;
}

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
}

export interface LocatedSession {
  workspace: string;
  store: SessionStore;
  /** 会话是否已知（本进程建过，或磁盘上有事件/会话头） */
  known: boolean;
}

export interface ServerContext {
  readonly deps: AppDeps;
  readonly version: string;
  readonly startedAt: number;
  /** 可变配置：PATCH /api/config 就地改它 */
  readonly settings: AppSettings;
  readonly registry: SessionRegistry;
  readonly runs: RunRegistry;
  readonly tools: Tool[];
  readonly eagerTools: readonly string[];
  readonly createProvider: ProviderFactory;
  configView(): Record<string, unknown>;
  locate(sessionId: string): LocatedSession;
}

export function createServerContext(deps: AppDeps = {}): ServerContext {
  const version = deps.version ?? readServerVersion();
  const startedAt = Date.now();

  if (deps.loadUserEnv !== false) {
    // 与 CLI 同一条路：环境变量优先，家目录里的 .env 只补缺的那部分
    loadUserEnvFile();
  }

  const provider = deps.provider ?? DEFAULT_PROVIDER;
  const settings: AppSettings = {
    workspace: normalizeWorkspace(deps.workspace ?? process.cwd()),
    model: { provider, model: deps.model ?? defaultModelFor(provider) },
    baseUrl: deps.baseUrl ?? null,
    maxIterations: deps.maxIterations ?? DEFAULT_MAX_ITERATIONS,
    maxTokens: deps.maxTokens ?? null,
  };

  const createProvider: ProviderFactory = deps.createProvider ?? ((request: ProviderRequest) =>
    createRealProvider(request.provider, {
      modelName: request.model,
      ...(request.apiKey !== undefined ? { apiKey: request.apiKey } : {}),
      ...(request.baseUrl !== null ? { baseUrl: request.baseUrl } : {}),
    }));

  const registry = new SessionRegistry();
  const runs = new RunRegistry();
  const tools = ToolRegistry.createDefault(config.tools.eager).getAllTools();

  const locate = (sessionId: string): LocatedSession => {
    // 会话归属的工作区在创建时定死；本进程建过就按那个来，否则按当前配置
    const workspace = registry.workspaceOf(sessionId) ?? settings.workspace;
    // 把当前模型交给 store：**新**会话的会话头会记下它；已有会话头不会被改写
    const store = new SessionStore(workspace, sessionId, {
      ...locationOptions(deps.sessionsRoot),
      model: settings.model,
    });
    return {
      workspace,
      store,
      known: registry.has(sessionId) || sessionEventsFileExists(store),
    };
  };

  return {
    deps,
    version,
    startedAt,
    settings,
    registry,
    runs,
    tools,
    eagerTools: config.tools.eager,
    createProvider,
    locate,
    configView: () => ({
      workspace: settings.workspace,
      // 一个对象，不是两个平铺字段：界面因此不可能把它俩改歪
      model: settings.model,
      baseUrl: settings.baseUrl,
      hasApiKey: hasApiKey(settings.model.provider),
      // 运行时总是拿到 requestApproval（契约 §5），这条策略只在「无交互层」时才会
      // 用到；报出来是为了让界面知道默认口径是拒绝而不是放行。
      approvalPolicy: 'auto-reject',
      limits: { maxIterations: settings.maxIterations, maxTokens: settings.maxTokens },
      version,
    }),
  };
}

export function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
