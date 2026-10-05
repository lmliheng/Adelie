/**
 * 校验小程序工程结构（不依赖微信开发者工具，纯 Node）
 * 检查：app.json 声明的页面四件套是否齐全、所有 JSON 能否解析、所有 JS 语法是否合法、
 *       WXML 的插值括号是否配对、project.config.json 的 appid 是否还是占位值。
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const errors = [];
const warnings = [];
const rel = (p) => path.relative(root, p);

function readJson(file) {
  const text = fs.readFileSync(file, "utf8");
  try {
    return JSON.parse(text);
  } catch (e) {
    errors.push(`${rel(file)} JSON 解析失败: ${e.message}`);
    return null;
  }
}

// 1. 遍历全部 json / wxml，做语法层面检查
function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      walk(full);
      continue;
    }
    if (name.endsWith(".json")) readJson(full);
    if (name.endsWith(".wxml")) {
      const t = fs.readFileSync(full, "utf8");
      const open = (t.match(/\{\{/g) || []).length;
      const close = (t.match(/\}\}/g) || []).length;
      if (open !== close) errors.push(`${rel(full)} 插值括号不配对：{{ ×${open} vs }} ×${close}`);
    }
    if (name.endsWith(".js")) {
      if (/^\s*(import|export)\s/m.test(fs.readFileSync(full, "utf8"))) {
        errors.push(`${rel(full)} 使用了 ESM 语法，小程序页面应使用 CommonJS`);
      }
      try {
        execFileSync(process.execPath, ["--check", full], { stdio: "pipe" });
      } catch (e) {
        errors.push(`${rel(full)} 语法错误: ${String(e.stderr || e.message).split("\n")[0]}`);
      }
    }
  }
}

// 2. app.json 页面四件套
const appJsonPath = path.join(root, "app.json");
const appJson = fs.existsSync(appJsonPath)
  ? readJson(appJsonPath)
  : (errors.push("缺少 app.json"), null);
if (appJson) {
  if (!Array.isArray(appJson.pages) || appJson.pages.length === 0)
    errors.push("app.json 没有声明 pages");
  for (const page of appJson.pages || []) {
    for (const ext of ["js", "wxml", "json"]) {
      const f = path.join(root, `${page}.${ext}`);
      if (!fs.existsSync(f)) errors.push(`页面文件缺失: ${page}.${ext}`);
    }
    if (!fs.existsSync(path.join(root, `${page}.wxss`)))
      warnings.push(`${page}.wxss 不存在（不是必须）`);
  }
  if (appJson.sitemapLocation && !fs.existsSync(path.join(root, appJson.sitemapLocation))) {
    errors.push(`sitemapLocation 指向的文件不存在: ${appJson.sitemapLocation}`);
  }
}

// 3. 入口文件
for (const f of ["app.js", "app.wxss", "project.config.json"]) {
  if (!fs.existsSync(path.join(root, f))) errors.push(`缺少 ${f}`);
}

// 4. appid 占位提醒
const pcPath = path.join(root, "project.config.json");
if (fs.existsSync(pcPath)) {
  const pc = readJson(pcPath);
  if (pc && ["touristappid", "", undefined].includes(pc.appid)) {
    warnings.push(
      `project.config.json 的 appid 仍是占位值「${pc.appid}」，正式上传前需替换为真实 AppID`,
    );
  }
}

walk(root);

if (warnings.length) {
  console.log("提醒：");
  warnings.forEach((w) => console.log("  ⚠ " + w));
}
if (errors.length) {
  console.log("发现 " + errors.length + " 个问题：");
  errors.forEach((e) => console.log("  ✗ " + e));
  process.exit(1);
}
console.log("✅ 校验通过：页面结构、JSON、JS 语法、WXML 插值均正常");
