/**
 * Vitest config kept separate from vite.config.ts (vitest's embedded vite types conflict with
 * this package's vite 7 plugin types). A node environment suffices: the tests cover the
 * gallery's pure modules and the demo store, which never touches the DOM. The network swap
 * plugin is applied here too, so a test can import the Web App's endpoint wrappers and drive
 * them against the mock — that is how the coverage test walks every endpoint. The browser checks
 * under e2e/ are Playwright's (`test:e2e`), not vitest's.
 */
import { defineConfig } from "vitest/config";
import { mockWebNetwork } from "./src/app/mock/vite-plugin";

export default defineConfig({
  plugins: [mockWebNetwork()],
  // `@adelie/ui` is a workspace package the repository asks pnpm to inject
  // (`injectWorkspacePackages`), and an injected copy is a real directory under `node_modules`:
  // Vite's esbuild step finds no tsconfig above it there, falls back to the classic JSX runtime and
  // every test that reaches `@adelie/ui` dies with "React is not defined". The automatic runtime is
  // what the package's own tsconfig declares (`jsx: react-jsx`), so it is named here as well; the
  // difference only shows when the copy is injected rather than linked.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // The coverage test walks every endpoint wrapper and re-seeds the demo store before each one
    // (~150 fixture builds). That takes 1.2 s on Linux but was measured at 4.8 s on the Windows
    // runner — one slower run and it crossed the default 5 s cap. A test that times out is not
    // merely slow: it keeps looping in the background, so its resets land inside the tests that
    // follow, and that single walk failed six tests. `ui` and `web` allow 30 s already; the other
    // files here finish well under a second, so the longer cap costs nothing when it is not hit.
    testTimeout: 30_000,
  },
});
