import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", "bridge-bin": "src/main.ts" },
  format: ["esm"],
  platform: "node",
  target: "node24",
  dts: true,
  clean: true,
  sourcemap: true,
  // The bridge process imports @adelie/device, which the desktop's packaging resolves from
  // node_modules; bundling it here would give a second copy of the protocol in the app.
  external: ["@adelie/device"],
});
