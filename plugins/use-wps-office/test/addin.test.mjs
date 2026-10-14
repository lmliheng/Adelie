/**
 * What WPS fetches from the bridge when it loads the add-on. WPS is handed a *directory*
 * (`http://127.0.0.1:<port>/addin/`) and pulls `manifest.xml`, the ribbon and the page out of
 * it, so these tests drive the real `kit/serve.mjs` over HTTP and check exactly that: every
 * file the manifest and the page name is really served, under the right content type, from
 * that directory URL — and nothing outside it can be fetched.
 *
 * No browser and no WPS needed; the add-on directory is the plugin's own.
 *
 *   node --test plugins/wps-office/test/addin.test.mjs
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ADDIN = path.join(HERE, "..", "skills", "wps-office", "kit", "addin");
const SERVE = path.join(HERE, "..", "skills", "wps-office", "kit", "serve.mjs");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

let root = null;
let bridge = null;
let base = null;

before(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "wps-addin-test-"));
  const port = await freePort();
  bridge = spawn(process.execPath, [SERVE, "--root", root, "--port", String(port)], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  base = `http://127.0.0.1:${port}/addin/`;
  for (let i = 0; i < 80; i += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/status.json`)).ok) return;
    } catch {
      // not listening yet
    }
    await sleep(50);
  }
  throw new Error("桥没起来");
});

after(async () => {
  bridge?.kill("SIGTERM");
  await sleep(150);
  fs.rmSync(root, { recursive: true, force: true });
});

test("加载项目录：WPS 拿到的那个地址能直接列出这页", async () => {
  const res = await fetch(base);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /text\/html/);
  assert.equal(await res.text(), fs.readFileSync(path.join(ADDIN, "index.html"), "utf8"));
});

test("清单与功能区都在目录里，是 XML 而不是二进制流", async () => {
  const manifest = await fetch(`${base}manifest.xml`);
  assert.equal(manifest.status, 200);
  assert.match(manifest.headers.get("content-type") ?? "", /xml/);
  const text = await manifest.text();
  assert.match(text, /<Name>Adelie<\/Name>/);
  assert.match(text, /<Application Name="wps">/);
  assert.match(text, /<RibbonXml>ribbon\.xml<\/RibbonXml>/);
  assert.match(text, /<TaskPane [^>]*Url="index\.html"/);

  const ribbon = await fetch(`${base}ribbon.xml`);
  assert.equal(ribbon.status, 200);
  const ribbonText = await ribbon.text();
  assert.match(ribbonText, /onLoad="ribbon\.OnAddinLoad"/);
  assert.match(ribbonText, /onAction="ribbon\.OnAction"/);
  assert.match(ribbonText, /getImage="ribbon\.GetImage"/);
});

test("页面要的每个文件都取得到，类型也对", async () => {
  const wanted = [
    ["panel.js", /javascript/],
    ["panel.css", /text\/css/],
    ["wps-api.js", /javascript/],
    ["stub-wps.js", /javascript/],
    ["images/icon.svg", /svg/],
  ];
  for (const [rel, type] of wanted) {
    const res = await fetch(`${base}${rel}`);
    assert.equal(res.status, 200, `${rel} 应当取得到`);
    assert.match(res.headers.get("content-type") ?? "", type, `${rel} 的类型`);
    assert.ok((await res.text()).length > 0, `${rel} 不该是空的`);
  }
});

test("页面只引相对路径（加载项目录可能被当成根来解析）", async () => {
  const html = await (await fetch(`${base}index.html`)).text();
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length > 0, "页面总得引用点什么");
  for (const ref of refs) {
    assert.ok(!ref.startsWith("/"), `${ref} 不该是绝对路径`);
    assert.ok(!/^https?:/i.test(ref), `${ref} 不该指向外部`);
  }
});

test("ribbon 回调在页面里真的存在", async () => {
  const [ribbon, panel] = await Promise.all([
    (await fetch(`${base}ribbon.xml`)).text(),
    (await fetch(`${base}panel.js`)).text(),
  ]);
  for (const handler of [...ribbon.matchAll(/="ribbon\.(\w+)"/g)].map((m) => m[1])) {
    assert.ok(panel.includes(`${handler}:`), `panel.js 里没有 window.ribbon.${handler}`);
  }
});

test("目录之外的文件拿不到", async () => {
  for (const attempt of ["..%2f..%2fpackage.json", "..%2fserve.mjs", "%2e%2e%2fsuite.js"]) {
    const res = await fetch(`${base}${attempt}`, { redirect: "manual" });
    assert.notEqual(res.status, 200, `${attempt} 不该被发出去`);
    const body = await res.text();
    assert.ok(!body.includes('"name"'), `${attempt} 不该泄露插件自己的文件`);
  }
});

test("没有这个文件就说没有", async () => {
  const res = await fetch(`${base}nope.js`);
  assert.equal(res.status, 404);
});
