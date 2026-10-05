#!/usr/bin/env node
/**
 * 一键把需求箱立起来：拷服务 → 生成口令 → 写配置 → 建巡台定时任务 → 打印接下来两步。
 *
 * 它只做「摆好」，不替你起进程：服务用 `node serve.mjs` 跑（前台、systemd、docker 都行），
 * 定时任务写成一个 .toml 交给平台自己重读（每 30 秒看一眼那个目录）。这两件事各自都是透明的，
 * 出问题一眼能看见，比藏在安装脚本里强。
 *
 * 用法：
 *   node install.mjs --dir ~/requirements-box --workspace ~/my-project
 *   node install.mjs --dir /opt/req-box --port 3007 --period 2h --agent default_agent \
 *                    --data-root ~/.adelie/data --project default_project --print-only
 *
 * 选项都有默认值：--dir 必给，其余不给就按上面那些推断（推断结果会原样打印出来核对）。
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const KIT_FILES = ["requirements.mjs", "requirements.html", "serve.mjs", "patrol.md"];

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) flags[key] = true;
    else {
      flags[key] = next;
      i += 1;
    }
  }
  return flags;
}

const flags = parseArgs(process.argv.slice(2));
const die = (msg) => {
  console.error(`install.mjs: ${msg}`);
  process.exit(2);
};

if (!flags.dir || flags.dir === true) die("必须给 --dir（服务装到哪个目录）");

const DIR = resolve(String(flags.dir));
const DATA_ROOT = resolve(
  String(
    flags["data-root"] ??
      process.env.PENGUIN_HOME ??
      process.env.ADELIE_HOME ??
      join(homedir(), ".penguin"),
  ),
);
const PROJECT = String(flags.project ?? process.env.PENGUIN_PROJECT_ID ?? "default_project");
const AGENT = String(flags.agent ?? process.env.PENGUIN_AGENT_ID ?? "default_agent");
const WORKSPACE = resolve(String(flags.workspace ?? process.cwd()));
const PORT = Number(flags.port ?? 3007);
const HOST = String(flags.host ?? "127.0.0.1");
const PERIOD = String(flags.period ?? "2h");
const SCHEDULE = String(flags["schedule-name"] ?? "requirements-triage");
const SCHEDULE_DIR = resolve(
  String(
    flags["schedule-dir"] ?? join(DATA_ROOT, PROJECT, "agents", AGENT, "agent_state", "schedule"),
  ),
);
const SCHEDULE_TOML = join(SCHEDULE_DIR, `${SCHEDULE}.toml`);
const DATA_DIR = resolve(String(flags["data-dir"] ?? join(DIR, "data")));
const PENGUIN_BIN = String(flags["penguin-bin"] ?? process.env.PENGUIN_BIN ?? "penguin");
const PRINT_ONLY = flags["print-only"] === true;

if (!PERIOD.match(/^\d+[mhd]$/)) die(`--period 要是 30m / 2h / 7d 这样的写法，收到的是 ${PERIOD}`);
// 巡台会话在这个目录里干活：它不存在的话，spawn 会在点「现在就做」的那一刻才报 ENOENT，
// 那种错没人看得懂 —— 摆的时候就拦住。
if (!existsSync(WORKSPACE))
  die(`--workspace 指向的目录不存在：${WORKSPACE}（巡台那一轮要在那里改代码）`);

// 1. 拷服务本体
if (!PRINT_ONLY) mkdirSync(DIR, { recursive: true });
for (const name of KIT_FILES) {
  const from = join(HERE, name);
  if (!existsSync(from)) die(`kit 里少了 ${name}`);
  if (!PRINT_ONLY) copyFileSync(from, join(DIR, name));
}

// 2. 口令与数据目录：口令只在用户自己手上那份地址里出现，不进日志、不进提交
if (!PRINT_ONLY) mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
const KEY_FILE = join(DATA_DIR, "key.txt");
let key = "";
if (existsSync(KEY_FILE)) key = readFileSync(KEY_FILE, "utf8").trim();
else if (!PRINT_ONLY) {
  key = randomBytes(24).toString("hex");
  writeFileSync(KEY_FILE, `${key}\n`, { mode: 0o600 });
}

// 3. 配置：代码里不写死任何一台机器的路径，全从这份 json（或环境变量）来
const config = {
  dataDir: DATA_DIR,
  patrolToml: SCHEDULE_TOML,
  penguinBin: PENGUIN_BIN,
  project: PROJECT,
  agent: AGENT,
  workspace: WORKSPACE,
};
if (!PRINT_ONLY)
  writeFileSync(join(DIR, "box.config.json"), `${JSON.stringify(config, null, 2)}\n`);

// 4. 巡台那个定时任务：写成一个 .toml 交给平台自己重读。prompt 的正文出自 patrol.md（唯一出处），
//    这里只把「去哪儿读、口令在哪」这几处指针填进去。
const base = `http://${HOST === "0.0.0.0" ? "127.0.0.1" : HOST}:${PORT}`;
const prompt = [
  `按 ${join(DIR, "patrol.md")} 跑一轮「需求箱巡台」：从 ${base} 上读 status=new 的需求`,
  `（口令在 ${KEY_FILE}），先逐条标成 doing 再动手；能做的做掉，做不了或需要用户拍板的标成 blocked `,
  `并写清卡在哪个决定上，做完的把结论写回接口并归档；最后给用户发一封本轮汇报（空巡不发邮件）。`,
].join("");
const toml = [
  `prompt = """${prompt}"""`,
  `workspace = "${WORKSPACE}"`,
  "enabled = true",
  `start_at = ${new Date(Date.now() + 60_000).toISOString()}`,
  `period = "${PERIOD}"`,
  "",
].join("\n");
if (!PRINT_ONLY) {
  mkdirSync(SCHEDULE_DIR, { recursive: true });
  writeFileSync(SCHEDULE_TOML, toml, { mode: 0o600 });
}

// 5. 能查就替用户核一眼：这个定时任务平台认不认
let verified = "没核（--print-only，或者本机没有 penguin）";
if (!PRINT_ONLY) {
  try {
    const out = execFileSync(PENGUIN_BIN, ["schedule", "ls"], { encoding: "utf8", timeout: 30000 });
    const line = out.split("\n").find((l) => l.includes(SCHEDULE));
    verified = line ? line.trim() : `没在 penguin schedule ls 里看到 ${SCHEDULE}`;
  } catch (err) {
    verified = `没能核（${err.message.split("\n")[0]}）`;
  }
}

console.log(`装到        ${DIR}${PRINT_ONLY ? "（--print-only：什么都没写）" : ""}
数据 / 口令 ${DATA_DIR}${key ? `（口令 ${key.slice(0, 8)}…，完整值在 key.txt）` : ""}
配置        ${join(DIR, "box.config.json")}
定时任务    ${SCHEDULE_TOML}（每 ${PERIOD}）
工作目录    ${WORKSPACE}
核对        ${verified}

接下来两步：

  1) 起服务（前台跑；要常驻就挂 systemd / docker，端口别跟别的服务撞）
     HOST=${HOST} PORT=${PORT} node ${join(DIR, "serve.mjs")}

  2) 浏览器打开（口令放在 ?key= 后面一次，之后它自己记住）
     ${base}/requirements?key=${key || "<key.txt 里的那串>"}
`);
