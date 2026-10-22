/**
 * Vitest config: node environment, no DOM. Tests drive the app's logic, its stores and the
 * components that render to static markup; e2e/ (Playwright, `test:e2e`) is excluded.
 * Kept separate from vite.config.ts: vitest's bundled vite 5 types conflict with this package's vite 7
 * plugin types, and tests don't need the plugin anyway.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  // `@adelie/ui` is a workspace package the repository asks pnpm to inject
  // (`injectWorkspacePackages`), and an injected copy is a real directory under `node_modules`:
  // Vite's esbuild step finds no tsconfig above it there, falls back to the classic JSX runtime and
  // every suite that reaches `@adelie/ui` dies with "React is not defined". The automatic runtime is
  // what the package's own tsconfig declares (`jsx: react-jsx`), so it is named here as well; the
  // difference only shows when the copy is injected rather than linked.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Every vi.stubGlobal (fetch, localStorage, …) is undone before the next test starts.
    unstubGlobals: true,
    // `vitest run --coverage`: branch and line coverage of the app's own source.
    coverage: { provider: "v8", include: ["src/**"] },
  },
});
