// 服务端配置里的密钥文件与模型默认值（契约 §2）。
//
// 测两件事：
//   1. 写密钥的文件权限必须是 0600 —— 写下去的是明文 API Key；
//   2. 提供方与默认模型跟着 core 的模型目录走，不再各自手抄一份。
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ENV_FILE_ENV, defaultModelForProvider } from 'adelie-core';
import { defaultModelFor, isProviderName, writeApiKey } from '../src/settings.js';

const ENV_KEYS = ['DEEPSEEK_API_KEY', 'MOONSHOT_API_KEY', 'DASHSCOPE_API_KEY'] as const;

describe('密钥文件', () => {
  let dir = '';
  let file = '';
  let savedFile: string | undefined;
  const savedEnv = new Map<string, string | undefined>();

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'adelie-secrets-'));
    file = join(dir, '.env');
    savedFile = process.env[ENV_FILE_ENV];
    process.env[ENV_FILE_ENV] = file;
    for (const key of ENV_KEYS) {
      savedEnv.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterEach(() => {
    if (savedFile === undefined) delete process.env[ENV_FILE_ENV];
    else process.env[ENV_FILE_ENV] = savedFile;
    for (const [key, value] of savedEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    savedEnv.clear();
    rmSync(dir, { recursive: true, force: true });
  });

  /** 文件权限（只取后 9 位）：0600 = 只有属主可读写 */
  function modeOf(path: string): number {
    return statSync(path).mode & 0o777;
  }

  it('新建的密钥文件是 0600', () => {
    writeApiKey('kimi', 'sk-moonshot-test');
    expect(modeOf(file)).toBe(0o600);
    expect(readFileSync(file, 'utf8')).toContain('MOONSHOT_API_KEY=sk-moonshot-test');
  });

  it('已经存在的宽松文件会被收紧到 0600', () => {
    // 模拟从旧版本升上来：文件早就在那儿，而且是 0644
    writeFileSync(file, 'DEEPSEEK_API_KEY=old\n', 'utf8');
    chmodSync(file, 0o644);
    expect(modeOf(file)).toBe(0o644);

    writeApiKey('deepseek', 'sk-new');
    expect(modeOf(file)).toBe(0o600);
  });

  it('只替换本提供方那一行，别家的 key 原样留着', () => {
    writeApiKey('kimi', 'sk-kimi');
    writeApiKey('qwen', 'sk-qwen');
    writeApiKey('kimi', 'sk-kimi-2');

    const content = readFileSync(file, 'utf8');
    expect(content).toContain('MOONSHOT_API_KEY=sk-kimi-2');
    expect(content).toContain('DASHSCOPE_API_KEY=sk-qwen');
    expect(content).not.toContain('sk-kimi\n'); // 旧的那一行被换掉了
  });

  it('写进去的密钥对当前进程立刻生效', () => {
    writeApiKey('qwen', 'sk-dashscope');
    expect(process.env.DASHSCOPE_API_KEY).toBe('sk-dashscope');
  });
});

describe('提供方与默认模型', () => {
  it('认得目录里的四家，也不认别的', () => {
    expect(isProviderName('kimi')).toBe(true);
    expect(isProviderName('qwen')).toBe(true);
    expect(isProviderName('moonshot')).toBe(false);
    expect(isProviderName(42)).toBe(false);
  });

  it('默认模型与模型目录一致（搬走手抄的那一份）', () => {
    for (const provider of ['deepseek', 'openai', 'kimi', 'qwen'] as const) {
      expect(defaultModelFor(provider)).toBe(defaultModelForProvider(provider));
    }
    expect(defaultModelFor('deepseek')).toBe('deepseek-chat');
    expect(defaultModelFor('kimi')).toBe('kimi-latest');
    expect(defaultModelFor('qwen')).toBe('qwen-plus');
  });
});
