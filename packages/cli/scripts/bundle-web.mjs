/**
 * 把 Web 构建产物复制进 CLI 包（`dist/web-dist`）。
 *
 * 为什么要把一个前端塞进 CLI 包：`npm i -g adelie` 之后再敲 `adelie serve`，用户期望
 * 直接看到界面，而不是一句「找不到前端产物」。这三四百 KB 换的是「装一次，终端和界面
 * 两条路都能走」。
 *
 * 单独构建 cli 时（`pnpm --filter adelie build`）会先经 devDependency 拉起 web 的构建；
 * 真的找不到产物就直接失败 —— 打出一个没有界面的 `serve` 比构建失败更糟。
 */
import { cpSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const cliDir = path.resolve(here, '..');
const source = path.join(cliDir, '..', 'web', 'dist');
const dest = path.join(cliDir, 'dist', 'web-dist');

if (!existsSync(path.join(source, 'index.html'))) {
  console.error(
    `[bundle-web] 找不到 Web 构建产物（${source}/index.html）。\n` +
      '先构建 web：pnpm --filter adelie-web build',
  );
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
cpSync(source, dest, { recursive: true });
console.log(`[bundle-web] ${path.relative(cliDir, source)} → dist/web-dist`);
