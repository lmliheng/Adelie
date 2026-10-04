import { defineConfig } from 'tsup';

/**
 * 两个入口：`index`（给 `adelie serve` 与桌面壳 import）与 `main`（可执行入口，
 * 直接 `node dist/main.js`）。
 *
 * 引擎（adelie-*）打进产物：仓库内 `adelie-core` 的 exports 指向 src/*.ts（发布时才被
 * publishConfig 改写成 dist），一个**构建产物**如果把它们留作外部依赖，直接 `node
 * dist/main.js` 就会去解析 .ts 而崩。打进来自包含的这份 dist 才是能脱离 workspace
 * 跑起来的那份 —— 桌面壳与 E2E 都靠它。hono 之类常规依赖仍留在 node_modules。
 *
 * removeNodeProtocol: false —— tsup 默认把 `import 'node:xxx'` 改写成裸标识符 `xxx`，
 * 对 fs/path 这类老内建没问题，但 `node:sqlite` 是**只能带前缀**的新内建（Node 里
 * `import 'sqlite'` 直接 ERR_MODULE_NOT_FOUND），改写后产物一 import 就崩。保留前缀
 * 既修好服务端产物本身，也让桌面壳能把它打进安装包。
 */
export default defineConfig({
  entry: { index: 'src/index.ts', main: 'src/main.ts' },
  format: ['esm'],
  target: 'node24',
  platform: 'node',
  noExternal: [/^adelie-/],
  removeNodeProtocol: false,
  sourcemap: true,
  splitting: false,
  clean: true,
  // 类型声明由 tsc 另跑一步生成（见 tsconfig.build.json）：tsup 的 dts 在 TS 7 下会崩
  dts: false,
});
