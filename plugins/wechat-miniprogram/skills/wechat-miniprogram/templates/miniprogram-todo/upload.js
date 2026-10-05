/**
 * 用官方 CI 工具上传代码，生成开发版/体验版（不需要微信开发者工具，Linux 可跑）。
 *
 * 需要两个环境变量：
 *   MP_APPID      小程序 AppID（wx 开头）
 *   MP_KEY_PATH   后台「开发管理 → 开发设置 → 小程序代码上传」生成的密钥文件路径
 * 可选：
 *   MP_VERSION    版本号，默认 1.0.0
 *   MP_DESC       版本描述，默认时间戳
 *
 * 用法：MP_APPID=wx... MP_KEY_PATH=/path/private.key node upload.js
 */
const path = require("path");
const ci = require("miniprogram-ci");

const appid = process.env.MP_APPID;
const keyPath = process.env.MP_KEY_PATH;

if (!appid || !keyPath) {
  console.error("缺少环境变量：需要 MP_APPID 和 MP_KEY_PATH");
  process.exit(2);
}

const project = new ci.Project({
  appid,
  type: "miniProgram",
  projectPath: __dirname,
  privateKeyPath: path.resolve(keyPath),
  ignores: ["node_modules/**/*", "tools/**/*"],
});

(async () => {
  const result = await ci.upload({
    project,
    version: process.env.MP_VERSION || "1.0.0",
    desc: process.env.MP_DESC || `CI 上传 ${new Date().toISOString()}`,
    setting: { es6: true, minify: true, autoPrefixWXSS: true },
    onProgressUpdate: (info) =>
      console.log(
        "[progress]",
        typeof info === "string" ? info : JSON.stringify(info).slice(0, 200),
      ),
  });
  console.log("上传完成：", result && result.subPackageInfo ? "已上传分包信息" : "已上传");
  console.log("接着去 mp.weixin.qq.com → 管理 → 版本管理，把这次上传设为体验版 / 提交审核");
})().catch((err) => {
  console.error("上传失败：", err && err.message ? err.message : err);
  process.exit(1);
});
