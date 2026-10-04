#!/usr/bin/env node
//
// 清掉一个兼容目录再让 tsc 重新输出（tsc 自己不会清）。
//
// 为什么需要它：`tsc -p tsconfig.build.json` 只写不删。删掉一个源文件之后，上一版
// 编译出来的 `.js` / `.d.ts` 还留在 `dist/` 里，跟着发布包一起发出去 —— 而
// `package.json` 的 `files` 就是 `["dist", "README.md"]`。实测过：删掉
// `anthropic.provider.ts` / `gemini.provider.ts` 之后，`packages/providers/dist/` 里
// 那四个文件还活着（原话见 docs/issues/... 已随这次修复删除，结论在 CHANGELOG）。
//
// 两点自律：
//   1. **只删 `packages/<某个包>/dist`**，别的路径一律拒绝 —— 一个能被 `pnpm build`
//      顺带调用的删除脚本，写错一个变量的代价太大（比如 `rm -rf $HOME`）。
//   2. 目录不存在不算错：第一次构建时 `dist` 本来就还没有。
//
// 用法：`node ../../scripts/clean-dist.mjs [目录…]`，默认清当前目录下的 `dist`。

import { existsSync, rmSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const PACKAGES = join(ROOT, 'packages');

/** 目标必须是 ROOT/packages/<包名>/dist，且不能是符号链接（否则会删到别处） */
function isAllowed(target) {
  const rel = relative(PACKAGES, target);
  if (rel.startsWith('..') || isAbsolute(rel)) return false;
  const parts = rel.split('/');
  // <包名>/dist ，两段，最后一段必须是 dist
  return parts.length === 2 && parts[1] === 'dist' && parts[0] !== '';
}

const targets = process.argv.slice(2);
const dirs = (targets.length > 0 ? targets : ['dist']).map((name) => resolve(process.cwd(), name));

let removed = 0;
for (const dir of dirs) {
  if (!existsSync(dir)) continue;
  const real = realpathSync(dir);
  if (!isAllowed(real)) {
    console.error(`clean-dist：拒绝删除 ${real}（只允许删 packages/<包名>/dist）`);
    process.exit(2);
  }
  if (!statSync(real).isDirectory()) continue;
  rmSync(real, { recursive: true, force: true });
  removed += 1;
  console.log(`clean-dist：已清 ${relative(ROOT, real)}`);
}

if (removed === 0) console.log('clean-dist：没有需要清的东西（第一次构建就是这样）');
