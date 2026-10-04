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
import { apiKeyFor, defaultModelFor, isProviderName, missingApiKeyMessage, secretFileFor, writeApiKey } from '../src/settings.js';

const ENV_KEYS = ['DEEPSEEK_API_KEY', 'MOONSHOT_API_KEY', 'DASHSCOPE_API_KEY'] as const;

describe('密钥文件', () => {
  let dir = '';
  let file = '';
  let savedFile: string | undefined;
  let savedHome: string | undefined;
  const savedEnv = new Map<string, string | undefined>();

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'adelie-secrets-'));
    file = join(dir, '.env');
    savedFile = process.env[ENV_FILE_ENV];
    process.env[ENV_FILE_ENV] = file;
    // 用户密钥文件落在 adelieHome()/secrets/ 下，而 adelieHome 读 HOME —— 指到临时目录，
    // 否则测试会往开发机的 ~/.adelie 里写东西
    savedHome = process.env['HOME'];
    process.env['HOME'] = dir;
    for (const key of ENV_KEYS) {
      savedEnv.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterEach(() => {
    if (savedFile === undefined) delete process.env[ENV_FILE_ENV];
    else process.env[ENV_FILE_ENV] = savedFile;
    if (savedHome === undefined) delete process.env['HOME'];
    else process.env['HOME'] = savedHome;
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
    writeApiKey('host', 'kimi', 'sk-moonshot-test');
    expect(modeOf(file)).toBe(0o600);
    expect(readFileSync(file, 'utf8')).toContain('MOONSHOT_API_KEY=sk-moonshot-test');
  });

  it('已经存在的宽松文件会被收紧到 0600', () => {
    // 模拟从旧版本升上来：文件早就在那儿，而且是 0644
    writeFileSync(file, 'DEEPSEEK_API_KEY=old\n', 'utf8');
    chmodSync(file, 0o644);
    expect(modeOf(file)).toBe(0o644);

    writeApiKey('host', 'deepseek', 'sk-new');
    expect(modeOf(file)).toBe(0o600);
  });

  it('只替换本提供方那一行，别家的 key 原样留着', () => {
    writeApiKey('host', 'kimi', 'sk-kimi');
    writeApiKey('host', 'qwen', 'sk-qwen');
    writeApiKey('host', 'kimi', 'sk-kimi-2');

    const content = readFileSync(file, 'utf8');
    expect(content).toContain('MOONSHOT_API_KEY=sk-kimi-2');
    expect(content).toContain('DASHSCOPE_API_KEY=sk-qwen');
    expect(content).not.toContain('sk-kimi\n'); // 旧的那一行被换掉了
  });

  it('写进去的密钥对当前进程立刻生效（主机身份）', () => {
    writeApiKey('host', 'qwen', 'sk-dashscope');
    expect(process.env.DASHSCOPE_API_KEY).toBe('sk-dashscope');
  });

  it('用户身份写的是自己的文件，且不污染进程环境', () => {
    writeApiKey('a1b2c3', 'kimi', 'sk-user');

    const own = secretFileFor('a1b2c3');
    expect(own).toBe(join(dir, '.adelie', 'secrets', 'a1b2c3.env'));
    expect(readFileSync(own, 'utf8')).toContain('MOONSHOT_API_KEY=sk-user');
    expect(modeOf(own)).toBe(0o600);
    // 进程环境是全局的：把某个用户的密钥塞进去等于让所有用户共用它
    expect(process.env.MOONSHOT_API_KEY).toBeUndefined();
  });

  it('用户自己配的密钥压过主机的兜底；主机身份则相反（环境变量优先）', () => {
    writeApiKey('host', 'deepseek', 'sk-host');
    writeApiKey('u1', 'deepseek', 'sk-mine');

    // 用户身份：自己的文件优先 —— 否则账单会落在主机的额度上
    expect(apiKeyFor('u1', 'deepseek')).toBe('sk-mine');
    // 主机身份：环境变量优先（v0.1.0 的规矩，CLI 的提示就是照它写的）
    process.env.DEEPSEEK_API_KEY = 'sk-from-env';
    expect(apiKeyFor('host', 'deepseek')).toBe('sk-from-env');
    delete process.env.DEEPSEEK_API_KEY;
    expect(apiKeyFor('host', 'deepseek')).toBe('sk-host');
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

describe('发请求之前的密钥体检', () => {
  it('没有密钥、也没配自定义端点：说清缺哪个变量、去哪配', () => {
    const message = missingApiKeyMessage('deepseek', undefined, null);

    expect(message).not.toBeNull();
    expect(message!).toContain('DEEPSEEK_API_KEY');
    expect(message!).toContain('没有可用的密钥');
  });

  it('有密钥就放行', () => {
    expect(missingApiKeyMessage('deepseek', 'sk-x', null)).toBeNull();
  });

  it('配了自定义端点不拦 —— 本机 mock 与兼容网关自己决定要不要密钥', () => {
    expect(missingApiKeyMessage('openai', undefined, 'http://127.0.0.1:9/mock')).toBeNull();
  });

  it('每家给的是自己那个变量名', () => {
    expect(missingApiKeyMessage('kimi', undefined, null)!).toContain('MOONSHOT_API_KEY');
    expect(missingApiKeyMessage('qwen', undefined, null)!).toContain('DASHSCOPE_API_KEY');
  });
});
