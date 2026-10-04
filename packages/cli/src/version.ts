/**
 * 版本号：CLI 的 `--version`、`adelie serve` 打印的地址、以及它起出来的服务端
 * `/api/health` 报的都取这一处。
 *
 * 从包自己的 package.json 读：源码跑（tsx src/cli.ts）与构建产物（dist/cli.js）都在
 * 包根下一层，所以 `../package.json` 两种跑法都指得对。读不到时退化成 0.0.0，
 * 不让一个读不到的文件把 `--version` 变成崩溃点。
 */
import { readFileSync } from 'node:fs';

export const PACKAGE_NAME = 'adelie';

export const PACKAGE_VERSION = (() => {
  try {
    const raw = readFileSync(new URL('../package.json', import.meta.url), 'utf-8');
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === 'string' && parsed.version !== '' ? parsed.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
})();
