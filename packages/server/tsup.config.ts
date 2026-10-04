import { defineConfig } from 'tsup';

/**
 * 两个入口：`index`（给 `adelie serve` 与桌面壳 import）与 `main`（可执行入口，
 * 直接 `node dist/main.js`）。
 *
 * 引擎（adelie-*）打进产物：仓库内 `adelie-core` 的 exports 指向 src/*.ts（发布时才被
 * publishConfig 改写成 dist），一个**构建产物**如果把它们留作外部依赖，直接 `node
 * dist/main.js` 就会去解析 .ts 而崩。打进来自包含的这份 dist 才是能脱离 workspace
 * 跑起来的那份 —— 桌面壳与 E2E 都靠它。hono 之类常规依赖仍留在 node_modules。
 */
export default defineConfig({
  entry: { index: 'src/index.ts', main: 'src/main.ts' },
  format: ['esm'],
  target: 'node24',
  platform: 'node',
  noExternal: [/^adelie-/],
  sourcemap: true,
  splitting: false,
  clean: true,
  // 类型声明由 tsc 另跑一步生成（见 tsconfig.build.json）：tsup 的 dts 在 TS 7 下会崩
  dts: false,
});
