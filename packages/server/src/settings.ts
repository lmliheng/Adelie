// 服务端可变配置（契约 §2）。
//
// 密钥只写不读：`apiKey` 落到用户级 `.env`（core 的 userEnvFile），进程内直接
// 改环境变量让它立刻生效；对外一律只回 `hasApiKey`。任何响应体里都不出现密钥本身。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { PROVIDER_API_KEY_ENV } from 'adelie-providers';
import { normalizeWorkspaceRoot, userEnvFile } from 'adelie-core';

import type { ProviderName } from 'adelie-core';

export interface ServerSettings {
  workspace: string;
  provider: ProviderName;
  model: string;
  /** 覆盖提供方端点；null 表示用该提供方的默认端点 */
  baseUrl: string | null;
  maxIterations: number;
  /** 累计 token 上限；null 表示不限制 */
  maxTokens: number | null;
}

export const DEFAULT_MAX_ITERATIONS = 50;

/** 未指定模型时的默认值。deepseek 的默认协议名是契约示例里那个 */
export function defaultModelFor(provider: ProviderName): string {
  return provider === 'openai' ? 'gpt-4o-mini' : 'deepseek-chat';
}

export function isProviderName(value: unknown): value is ProviderName {
  return value === 'deepseek' || value === 'openai';
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
  writeFileSync(file, [...kept, `${envName}=${key}`, ''].join('\n'), 'utf8');

  process.env[envName] = key;
}

export function normalizeWorkspace(path: string): string {
  return normalizeWorkspaceRoot(path);
}
