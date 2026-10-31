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
    // Several suites here scan every source file of the package with the TypeScript compiler, and
    // dock-state's beforeAll imports a whole module graph: on an idle machine those take 2–4s, so
    // the 5s default leaves no headroom and the suite went red on a loaded box while the same
    // files passed alone. The timeouts only bound the wait; the assertions are unchanged.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // `vitest run --coverage`: branch and line coverage of the app's own source.
    coverage: { provider: "v8", include: ["src/**"] },
  },
});
