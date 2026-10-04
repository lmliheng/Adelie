import { defineConfig } from 'tsup';

// 把引擎（adelie-*）打进产物，这样 dist/ 可以脱离 workspace 的源码单独分发
// （桌面壳要的就是这一份），而 hono 之类的常规依赖仍然留在 node_modules。
export default defineConfig({
  entry: { index: 'src/index.ts', main: 'src/main.ts' },
  format: ['esm'],
  target: 'node24',
  platform: 'node',
  noExternal: [/^adelie-/],
  sourcemap: true,
  splitting: false,
  clean: true,
  dts: false,
});
