import { defineConfig } from "tsup";

/**
 * 两个自包含产物，没有共享 chunk：
 *   - dist/main.js   壳本身（Electron 主进程）
 *   - dist/server.js 它 fork 的服务端
 *
 * 服务端是从 `adelie-server` 的**构建产物**再打一次包，所以安装包里跑的东西与单独
 * `npm i adelie-server` 装出来的是同一份代码，而壳不必关心它怎么来的。
 *
 * `electron` 必须 external：它是运行时内建模块，npm 上那个包只是个读磁盘路径的壳子。
 *
 * removeNodeProtocol: false 与 packages/server/tsup.config.ts 同因：服务端产物里
 * `node:sqlite` 被改写成裸 `sqlite` 的话，这里会解析不到（Node 只认带前缀的 sqlite），
 * 桌面端因此连构建都过不去。
 */
export default defineConfig({
  entry: {
    main: "src/main.ts",
    server: "../server/dist/main.js",
  },
  format: ["esm"],
  target: "node24",
  platform: "node",
  removeNodeProtocol: false,
  splitting: false,
  clean: true,
  // 安装包里带着 sourcemap 会让体积翻几倍，electron-builder.yml 里也会把它们排除
  sourcemap: true,
  external: ["electron"],
  // hono 与 @hono/node-server 是服务端的运行依赖，一起吸收进来，安装包里就没有 JS 依赖树
  noExternal: [/^adelie-/, "hono", "@hono/node-server"],
});
