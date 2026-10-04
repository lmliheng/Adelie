// 服务端可变配置（契约 §2）。
//
// 密钥只写不读：`apiKey` 落到用户级 `.env`（core 的 userEnvFile），进程内直接
// 改环境变量让它立刻生效；对外一律只回 `hasApiKey`。任何响应体里都不出现密钥本身。
//
// 这个文件写下去的是**明文密钥**，所以权限必须是 0600：同机上别的用户读得到
// 你的 API Key，等于你的账单和额度都是他的。默认权限（0644）在多人机器上
// 是个真实的坑，而修它只需要一个 mode 参数。
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { PROVIDER_API_KEY_ENV } from 'adelie-providers';
import { defaultModelForProvider, isProviderName as isCatalogProviderName, normalizeWorkspaceRoot, userEnvFile } from 'adelie-core';

import type { ModelRef, ProviderName } from 'adelie-core';

/** 密钥文件的权限：只有属主能读写 */
const SECRET_FILE_MODE = 0o600;

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

/** 当前提供方可用的密钥。空串按「没有」处理 —— 它在请求里等价于没配 */
export function apiKeyFor(provider: ProviderName): string | undefined {
  const name = PROVIDER_API_KEY_ENV[provider];
  const value = process.env[name];
  return value !== undefined && value.trim() !== '' ? value : undefined;
}

export function hasApiKey(provider: ProviderName): boolean {
  return apiKeyFor(provider) !== undefined;
}

/**
 * 把密钥写进用户级 `.env`，并让它对当前进程立刻生效。
 *
 * 只替换本提供方那一行：这个文件是用户的配置文件（`loadUserEnvFile` 会把里面
 * 所有键装进环境），整份覆写等于替用户删掉别人的变量。
 *
 * 注意它不一定能决定下次启动用哪把 key —— 环境变量优先，若 `DEEPSEEK_API_KEY`
 * 本来就由环境给出，这里写的值会被盖住。
 */
export function writeApiKey(provider: ProviderName, key: string): void {
  const envName = PROVIDER_API_KEY_ENV[provider];
  const file = userEnvFile();
  const existing = existsSync(file) ? readFileSync(file, 'utf8') : '';

  const kept = existing
    .split(/\r?\n/)
    .filter((line) => !new RegExp(`^\\s*${envName}\\s*=`).test(line))
    // split 在末尾有换行的文件上会多出一个空串，自己收掉，避免越写越空
    .filter((line, index, lines) => !(line === '' && index === lines.length - 1));

  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, [...kept, `${envName}=${key}`, ''].join('\n'), { encoding: 'utf8', mode: SECRET_FILE_MODE });
  // 已存在的文件不会被 mode 改写（它是 open(2) 的创建参数），所以补一次 chmod ——
  // 从旧版本升上来的用户，文件多半就是 0644 躺在那儿
  try {
    chmodSync(file, SECRET_FILE_MODE);
  } catch {
    // 改不动权限不该让「写密钥」整个失败（某些文件系统不支持），但要让用户看到
    console.warn(`[adelie] 改不动 ${file} 的权限，它可能仍是其他用户可读的`);
  }

  process.env[envName] = key;
}

export function normalizeWorkspace(path: string): string {
  return normalizeWorkspaceRoot(path);
}
