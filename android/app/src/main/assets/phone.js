#!/usr/bin/env node
// Adelie 手机操控的命令行入口，装在每个 Agent 都能用到的地方（$ADELIE_HOME/tools/phone.js）。
//
//   node phone.js screen
//   node phone.js tap '{"text":"发送"}'
//   node phone.js screenshot
//
// 端口和 token 每次启动都会换，从 $ADELIE_HOME/phone-control.json 读。
"use strict";

const fs = require("fs");
const path = require("path");

function readInfo() {
  const home = process.env.ADELIE_HOME || path.join(__dirname, "..");
  const candidates = [
    path.join(home, "phone-control.json"),
    path.join(home, "..", "phone-control.json"),
    path.join(__dirname, "phone-control.json"),
    "/data/data/dev.adelie.app/files/phone-control.json",
  ];
  for (const file of candidates) {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (e) {
      /* 下一个 */
    }
  }
  throw new Error("找不到 phone-control.json：先打开一次 Adelie，让手机操控的服务起来");
}

async function main() {
  const [action, raw] = process.argv.slice(2);
  if (!action || action === "-h" || action === "--help") {
    console.log(
      "用法: node phone.js <action> [json]\n" +
        "  actions: doctor screen tap text swipe long_press key open apps screenshot wait task journal projection capture\n" +
        "  doctor 自检：无障碍开了没、控制口在不在、技能装了几份\n" +
        '例: node phone.js tap \'{"text":"发送"}\'',
    );
    return;
  }

  let extra = {};
  if (raw) {
    try {
      extra = JSON.parse(raw);
    } catch (e) {
      throw new Error("第二个参数要是 JSON：" + raw);
    }
  }

  const info = readInfo();
  const response = await fetch(info.url, {
    method: "POST",
    headers: { "X-Adelie-Token": info.token, "Content-Type": "application/json" },
    body: JSON.stringify(Object.assign({ action }, extra)),
  });
  let data;
  try {
    data = await response.json();
  } catch (e) {
    throw new Error("控制口返回的不是 JSON（HTTP " + response.status + "）");
  }

  // 截图别往终端里倒 base64：落盘给路径，模型再用读图的方式看
  if (action === "screenshot" && data && data.ok && data.image) {
    const ext = data.format === "png" ? "png" : "jpg";
    const file = path.join(process.cwd(), "phone-" + Date.now() + "." + ext);
    fs.writeFileSync(file, Buffer.from(data.image, "base64"));
    delete data.image;
    data.saved = file;
  }

  console.log(JSON.stringify(data, null, 2));
  if (!data || !data.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(String((error && error.message) || error));
  process.exit(2);
});
