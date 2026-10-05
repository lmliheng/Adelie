/**
 * 用官方 CI 工具生成「体验版」预览二维码（图片落盘，可直接给用户扫）。
 *
 * 环境变量同 upload.js：MP_APPID / MP_KEY_PATH
 * 可选：MP_QR_OUT 二维码输出路径，默认 ./preview-qrcode.png
 *
 * 用法：MP_APPID=wx... MP_KEY_PATH=/path/private.key node preview.js
 */
const fs = require("fs");
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
  const result = await ci.preview({
    project,
    desc: `预览 ${new Date().toISOString()}`,
    setting: { es6: true, minify: true },
    qrcodeFormat: "image",
    qrcodeOutputDest: process.env.MP_QR_OUT || path.join(__dirname, "preview-qrcode.png"),
    onProgressUpdate: (info) =>
      console.log(
        "[progress]",
        typeof info === "string" ? info : JSON.stringify(info).slice(0, 200),
      ),
  });
  const out = process.env.MP_QR_OUT || path.join(__dirname, "preview-qrcode.png");
  console.log(
    "预览二维码：",
    out,
    fs.existsSync(out) ? `(${fs.statSync(out).size} 字节)` : "(未生成)",
  );
  if (result && result.subPackageInfo)
    console.log("分包信息：", JSON.stringify(result.subPackageInfo).slice(0, 300));
})().catch((err) => {
  console.error("生成预览失败：", err && err.message ? err.message : err);
  process.exit(1);
});
