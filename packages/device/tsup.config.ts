import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm"],
  // The protocol runs in Node (host and bridges) and, for the manifest types, in any reader of
  // a `.adev` package: nothing Node-specific is resolved or injected and there is no runtime
  // dependency to bundle.
  platform: "neutral",
  target: "node24",
  dts: true,
  clean: true,
  sourcemap: true,
});
