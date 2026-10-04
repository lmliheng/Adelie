// 版本号从本包自己的 package.json 读。
//
// 源码跑（tsx src/main.ts）与构建产物（dist/main.js）都在包根下一层，所以
// `../package.json` 两种跑法都指得对。读不到时退化成 0.0.0 —— 健康检查不该
// 因为一个读不到的文件变成 500。
import { readFileSync } from 'node:fs';

export function readServerVersion(): string {
  try {
    const raw = readFileSync(new URL('../package.json', import.meta.url), 'utf-8');
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === 'string' && parsed.version !== '' ? parsed.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}
