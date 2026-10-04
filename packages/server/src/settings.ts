// 服务端可变配置（契约 §2）。
//
// 密钥只写不读：`apiKey` 落到密钥文件，进程内直接改环境变量让它立刻生效；
// 对外一律只回 `hasApiKey`。任何响应体里都不出现密钥本身。
//
// 这个文件写下去的是**明文密钥**，所以权限必须是 0600：同机上别的用户读得到
// 你的 API Key，等于你的账单和额度都是他的。默认权限（0644）在多人机器上
// 是个真实的坑，而修它只需要一个 mode 参数。
//
// 密钥按身份分文件：
//   - `host`（本机、无凭证进来的管理员本人）→ 主机级 `.env`（v0.1.0 的位置，CLI 也读它）
//   - 登录进来的用户 → `~/.adelie/secrets/<userId>.env`
// 取值的优先级见 `apiKeyFor`，那里写清了「自己配的」与「主机配的」谁压谁。
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { PROVIDER_API_KEY_ENV } from 'adelie-providers';
import { adelieHome, defaultModelForProvider, isProviderName as isCatalogProviderName, normalizeWorkspaceRoot, userEnvFile } from 'adelie-core';

import type { ModelRef, ProviderName } from 'adelie-core';

/** 密钥文件的权限：只有属主能读写 */
const SECRET_FILE_MODE = 0o600;

/** 主机身份在「每用户数据」里的键 */
export const HOST_KEY = 'host';

export interface ServerSettings {
  workspace: string;
  /**
   * 当前用哪个模型。提供方不再是独立字段 —— 它是这条引用的一半，分开存就会出现
   * 「provider 是 kimi、model 还是 deepseek-chat」这种自相矛盾的状态。
   */
  model: ModelRef;
  /** 覆盖提供方端点；null 表示用该提供方的默认端点 */
  baseUrl: string | null;
  maxIterations: number;
  /** 累计 token 上限；null 表示不限制 */
  maxTokens: number | null;
}

export const DEFAULT_MAX_ITERATIONS = 50;

/** 未指定模型时的默认值。各家的默认模型在 core 的模型目录里，这里不再手抄一份 */
export function defaultModelFor(provider: ProviderName): string {
  return defaultModelForProvider(provider);
}

/** 判据在 core 的模型目录里（那里说得出「认识哪几家」），这里只是服务端侧的入口 */
export function isProviderName(value: unknown): value is ProviderName {
  return isCatalogProviderName(value);
}

/**
 * 某个身份的密钥文件。
 *
 * 主机身份沿用 v0.1.0 的 `<home>/.adelie/.env`：CLI 与桌面壳都读它，改位置等于让
 * 升级上来的用户重新配一次密钥。用户身份各有自己的文件。
 */
export function secretFileFor(key: string): string {
  if (key === HOST_KEY) return userEnvFile();
  return join(adelieHome(), 'secrets', `${key}.env`);
}

/** 从密钥文件里读一个键。文件不存在、读不动、格式不对都按「没有」处理 */
function readEnvValue(file: string, name: string): string | undefined {
  if (!existsSync(file)) return undefined;
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (match === null || match[1] !== name) continue;
    const value = match[2]!.trim().replace(/^["']|["']$/g, '');
    if (value !== '') return value;
  }
  return undefined;
}

/**
 * 当前身份指定提供方可用的密钥。空串按「没有」处理 —— 它在请求里等价于没配。
 *
 * 优先级有意不对称：
 *   - **主机身份**：环境变量优先，其次 `.env`。这是 v0.1.0 就写在 CLI 提示里的规矩
 *     （`loadUserEnvFile` 只在环境里没有时才装文件的值），改它会让 `adelie status`
 *     说的话与服务的实际行为对不上。
 *   - **用户身份**：自己的文件优先，其次环境变量。因为「环境」是主机的 —— 用户自己
 *     配的那把必须压过主机的兜底，否则他会看到账单落在别人的额度上。
 */
export function apiKeyFor(key: string, provider: ProviderName): string | undefined {
  const name = PROVIDER_API_KEY_ENV[provider];
  const fromProcess = process.env[name];
  const envValue = fromProcess !== undefined && fromProcess.trim() !== '' ? fromProcess : undefined;
  const fileValue = readEnvValue(secretFileFor(key), name);

  if (key === HOST_KEY) return envValue ?? fileValue;
  return fileValue ?? envValue;
}

export function hasApiKey(key: string, provider: ProviderName): boolean {
  return apiKeyFor(key, provider) !== undefined;
}

/** 只替换一个键、保留文件里别的行。理由见下：这是用户的配置文件，不是我们的数据库 */
function writeEnvValue(file: string, name: string, value: string): void {
  const existing = existsSync(file) ? readFileSync(file, 'utf8') : '';

  const kept = existing
    .split(/\r?\n/)
    .filter((line) => !new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=`).test(line))
    // split 在末尾有换行的文件上会多出一个空串，自己收掉，避免越写越空
    .filter((line, index, lines) => !(line === '' && index === lines.length - 1));

  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, [...kept, `${name}=${value}`, ''].join('\n'), { encoding: 'utf8', mode: SECRET_FILE_MODE });
  // 已存在的文件不会被 mode 改写（它是 open(2) 的创建参数），所以补一次 chmod ——
  // 从旧版本升上来的用户，文件多半就是 0644 躺在那儿
  try {
    chmodSync(file, SECRET_FILE_MODE);
  } catch {
    // 改不动权限不该让「写密钥」整个失败（某些文件系统不支持），但要让用户看到
    console.warn(`[adelie] 改不动 ${file} 的权限，它可能仍是其他用户可读的`);
  }
}

/**
 * 把密钥写进该身份的密钥文件。
 *
 * 只替换本提供方那一行：这个文件是用户的配置文件（`loadUserEnvFile` 会把里面
 * 所有键装进环境），整份覆写等于替用户删掉别人的变量。
 *
 * 主机身份额外把它装进 `process.env`，让当前进程立刻生效（用户身份不这么做：
 * 进程环境是全局的，把某个用户的密钥塞进去等于让所有用户共用它）。
 *
 * 注意主机身份下它不一定能决定下次启动用哪把 key —— 环境变量优先，若
 * `DEEPSEEK_API_KEY` 本来就由环境给出，这里写的值会被盖住。
 */
export function writeApiKey(key: string, provider: ProviderName, value: string): void {
  const envName = PROVIDER_API_KEY_ENV[provider];
  writeEnvValue(secretFileFor(key), envName, value);
  if (key === HOST_KEY) process.env[envName] = value;
}

/** 身份的默认运行配置。用户配置从它派生，所以「没配过」的人看到的也是这套默认值 */
export function defaultSettings(workspace: string, model: ModelRef): ServerSettings {
  return {
    workspace,
    model,
    baseUrl: null,
    maxIterations: DEFAULT_MAX_ITERATIONS,
    maxTokens: null,
  };
}

export function normalizeWorkspace(path: string): string {
  return normalizeWorkspaceRoot(path);
}
