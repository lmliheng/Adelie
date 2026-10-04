#!/usr/bin/env node
//
// Adelie 自检（体检）：把「这个应用现在有没有毛病」变成一条命令。
//
// 为什么要有它：一次对话会被压缩、会被忘掉，而缺陷不会。人工过一遍代码库每次都要
// 重新想「该看哪儿」，而「该看哪儿」这件事本身是**可枚举**的 —— 契约与实现会不会分叉、
// 权限表有没有漏一行、密钥有没有多写一个文件、issue 草稿是不是写全了、产物里有没有
// 已删源的残渣。这些都能机械地查，查完剩下的才需要人（和模型）判断。
//
// 三条纪律：
//   1. **体检不修东西。** 它只报告。修与不修由人决定 —— 一个会自动改代码的体检脚本，
//      第一次误报之后就不会再有人敢跑它。
//   2. **能指出证据。** 每条发现都带 `文件:行` 或命令，能被独立复核（同 docs/issues.md 的
//      「证据」那一段）。
//   3. **能天天跑。** 便宜的检查默认全开（drift / hygiene 全是读文件），贵的（typecheck /
//      test / build）默认也跑但可以 `--no-gates` 跳过 —— 提交前跑全的，改一行跑快的。
//
// 用法：
//   node scripts/audit.mjs                 # 全套（含 typecheck / test / build）
//   node scripts/audit.mjs --no-gates      # 只跑静态检查，秒级
//   node scripts/audit.mjs --only=routes-in-docs,issue-drafts
//   node scripts/audit.mjs --json          # 给别的工具吃
//
// 退出码：0 = 没有 P0/P1；1 = 有 P0/P1（可以挂进 CI）；2 = 脚本自身出错。

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const LEVELS = ['P0', 'P1', 'P2', 'P3'];

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

function read(path) {
  return readFileSync(path, 'utf8');
}

function exists(path) {
  return existsSync(path);
}

/** 递归列目录下的文件（跳过 node_modules / dist / .git） */
function walk(dir, filter, out = []) {
  if (!exists(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, filter, out);
    else if (filter(entry.name)) out.push(full);
  }
  return out;
}

/** 仓库相对路径，报告里好看也稳定（绝对路径换台机器就变了） */
function rel(path) {
  return relative(ROOT, path);
}

/** 一行里第几个字符：用它可以给 `文件:行` 而不是糊一个「在某处」 */
function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

/** 从一段文本里抠出所有匹配，带上行号 */
function matches(text, pattern) {
  const found = [];
  for (const match of text.matchAll(pattern)) {
    found.push({ text: match[0], groups: match.slice(1), line: lineOf(text, match.index ?? 0) });
  }
  return found;
}

function packages() {
  return readdirSync(join(ROOT, 'packages'))
    .map((name) => join(ROOT, 'packages', name))
    .filter((dir) => exists(join(dir, 'package.json')));
}

/** 一个包里所有源文件（src 下的 .ts/.tsx，排除测试） */
function sources(pkgDir, includeTests = false) {
  return walk(join(pkgDir, 'src'), (name) => {
    if (!/\.(ts|tsx)$/.test(name)) return false;
    if (!includeTests && /\.test\.(ts|tsx)$/.test(name)) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// 取契约里的路由与错误码（docs/api.md 是四端共用的那份真话）
// ---------------------------------------------------------------------------

function docRoutes() {
  const text = read(join(ROOT, 'docs/api.md'));
  const routes = new Set();
  for (const match of text.matchAll(/\b(GET|POST|PATCH|DELETE|PUT)\s+(\/api\/[^\s`（(]*)/g)) {
    routes.add(`${match[1]} ${match[2].replace(/[.,，。]$/, '')}`);
  }
  return routes;
}

function codeRoutes() {
  const routes = [];
  for (const pkg of packages()) {
    for (const file of sources(pkg)) {
      const text = read(file);
      for (const match of matches(text, /app\.(get|post|patch|delete|put)\(\s*'(\/api\/[^']*)'/g)) {
        routes.push({ method: match.groups[0].toUpperCase(), path: match.groups[1], file, line: match.line });
      }
    }
  }
  return routes;
}

function docErrorCodes() {
  const text = read(join(ROOT, 'docs/api.md'));
  const section = text.slice(text.indexOf('## 8. 错误'));
  const codes = new Set();
  for (const match of section.matchAll(/`([a-z_]+)`/g)) codes.add(match[1]);
  return codes;
}

function codeErrorCodes() {
  const codes = new Map();
  for (const pkg of packages()) {
    for (const file of sources(pkg)) {
      const text = read(file);
      for (const match of matches(text, /jsonError\(\s*c\s*,\s*\d{3}\s*,\s*'([a-z_]+)'/g)) {
        if (!codes.has(match.groups[0])) codes.set(match.groups[0], `${rel(file)}:${match.line}`);
      }
    }
  }
  return codes;
}

// ---------------------------------------------------------------------------
// 检查
// ---------------------------------------------------------------------------

/** 贵的三个闸门：项目自己的 typecheck / test / build。它们是「能不能发」的底线 */
const gates = {
  id: 'gates',
  title: '闸门：typecheck / test / build',
  heavy: true,
  run() {
    const findings = [];
    const notes = [];
    const commands = [
      ['typecheck', ['pnpm', 'typecheck'], 'P1'],
      ['test', ['pnpm', 'test'], 'P1'],
      ['build', ['pnpm', 'build'], 'P1'],
    ];
    for (const [label, argv, level] of commands) {
      let output = '';
      let ok = true;
      try {
        output = execFileSync(argv[0], argv.slice(1), { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (error) {
        ok = false;
        output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
      }
      if (!ok) {
        const tail = output.trim().split('\n').slice(-12).join('\n');
        findings.push({
          level,
          title: `pnpm ${label} 不通过`,
          detail: '这是发布底线：先修它，别的检查都可以等。',
          evidence: tail,
        });
        continue;
      }
      if (label === 'test') {
        const passed = [...output.matchAll(/Tests\s+(\d+) passed(?: \| (\d+) skipped)?/g)];
        const total = passed.reduce((sum, m) => sum + Number(m[1]), 0);
        const skipped = passed.reduce((sum, m) => sum + Number(m[2] ?? 0), 0);
        notes.push(`测试 ${total} 通过 / ${skipped} 跳过`);
      }
    }
    return { findings, notes };
  },
};

/** 契约与实现的路由有没有分叉。文档写了代码没有 = 骗人；代码有文档没写 = 藏私 */
const routesInDocs = {
  id: 'routes-in-docs',
  title: '契约：docs/api.md 的路由与代码一一对应',
  run() {
    const docs = docRoutes();
    const code = codeRoutes();
    const codeKeys = new Set(code.map((route) => `${route.method} ${route.path}`));
    const findings = [];

    for (const route of code) {
      if (!docs.has(`${route.method} ${route.path}`)) {
        findings.push({
          level: 'P2',
          title: `代码里有、契约里没有：${route.method} ${route.path}`,
          detail: '契约是四端共用的那份真话。新路由没写进 docs/api.md，另外三端就不知道它存在。',
          evidence: `${rel(route.file)}:${route.line}`,
        });
      }
    }
    for (const route of docs) {
      if (!codeKeys.has(route)) {
        findings.push({
          level: 'P2',
          title: `契约里有、代码里找不到：${route}`,
          detail: '要么实现被删了（文档过期），要么写法与契约不同（比如挂了子路由）。',
          evidence: 'docs/api.md',
        });
      }
    }
    return { findings, notes: [`契约 ${docs.size} 条路由，代码 ${codeKeys.size} 条`] };
  },
};

/** 权限表是不是还是活的：表里每一行都该对着一条真路由 */
const routePermissions = {
  id: 'route-permissions',
  title: '权限表：每一行都对着一条真路由',
  run() {
    const file = join(ROOT, 'packages/server/src/identity.ts');
    const text = read(file);
    const rows = matches(text, /\{\s*prefix:\s*'([^']+)',\s*auth:\s*'([a-z]+)'\s*\}/g);
    const code = codeRoutes();
    const findings = [];
    for (const row of rows) {
      const prefix = row.groups[0];
      // `/api` 是兜底那一行，它本来就不对应具体路由
      if (prefix === '/api') continue;
      const hit = code.some((route) => route.path.startsWith(prefix));
      if (!hit) {
        findings.push({
          level: 'P3',
          title: `权限表里的 ${prefix} 对不上任何路由`,
          detail: '路由改名或删掉之后留下的行。留着不算错，但下一个人会以为它还在挡什么。',
          evidence: `${rel(file)}:${row.line}`,
        });
      }
    }
    return { findings, notes: [`权限表 ${rows.length} 行`] };
  },
};

/** 前端的每一条请求路径都该在契约里查得到 */
const webApiPaths = {
  id: 'web-api-paths',
  title: '前端请求路径都在契约里',
  run() {
    const dir = join(ROOT, 'packages/web/src');
    const docs = docRoutes();
    const docPaths = new Set([...docs].map((route) => route.split(' ')[1]));
    const findings = [];
    let count = 0;
    for (const file of walk(dir, (name) => /\.(ts|tsx)$/.test(name))) {
      const text = read(file);
      for (const match of matches(text, /'(?:\/api\/[^'`]*|\$\{[^}]*\}\/api\/[^'`]*)'/g)) {
        const raw = match.text.replace(/^'|'$/g, '');
        if (!raw.startsWith('/api/') && !raw.includes('/api/')) continue;
        count += 1;
        // 只比前缀部分：`/api/sessions/${id}` 这种拼出来的，取到第一个 ${ 之前
        const literal = raw.split('${')[0];
        const known = [...docPaths].some((path) => path.startsWith(literal) || literal.startsWith(path.split(':')[0]));
        if (!known) {
          findings.push({
            level: 'P2',
            title: `前端在请求契约里没有的路径：${raw}`,
            detail: '要么契约漏了，要么这是个写错的前缀。',
            evidence: `${rel(file)}:${match.line}`,
          });
        }
      }
    }
    return { findings, notes: [`前端 ${count} 处请求路径`] };
  },
};

/** 错误码：代码里能出现的，契约里得列全 */
const errorCodes = {
  id: 'error-codes',
  title: '错误码：代码与契约 §8 对齐',
  run() {
    const docs = docErrorCodes();
    const code = codeErrorCodes();
    const findings = [];
    for (const [name, where] of code) {
      if (!docs.has(name)) {
        findings.push({
          level: 'P2',
          title: `代码在回 \`${name}\`，契约 §8 里没有这个码`,
          detail: '界面按码分支（见 web 的 describeApiError），漏一个码就是一次「未知错误」。',
          evidence: where,
        });
      }
    }
    return { findings, notes: [`代码 ${code.size} 个码，契约 ${docs.size} 个`] };
  },
};

/** issue 草稿：发现即记的前提是草稿本身合规，否则同步脚本会静默丢东西 */
const issueDrafts = {
  id: 'issue-drafts',
  title: 'issue 草稿合规（见 docs/issues.md）',
  run() {
    const dir = join(ROOT, 'docs/issues');
    const files = exists(dir) ? readdirSync(dir).filter((name) => name.endsWith('.md')) : [];
    const findings = [];
    let pending = 0;
    const scopes = new Set(['core', 'providers', 'tools', 'runtime', 'server', 'cli', 'web', 'desktop', 'docs', 'brand', 'release']);
    for (const name of files) {
      const path = join(dir, name);
      const text = read(path);
      const head = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
      if (head === null) {
        findings.push({ level: 'P2', title: `${name} 没有 frontmatter`, detail: '同步脚本读不到 title/labels 就会整个失败。', evidence: rel(path) });
        continue;
      }
      if (!/^title:\s*\S/m.test(head[1])) {
        findings.push({ level: 'P2', title: `${name} 缺 title`, detail: '标题是 issue 的门面：`<范围>: <一句可判定的话>`。', evidence: rel(path) });
      }
      if (!/^labels:\s*\[.+\]/m.test(head[1])) {
        findings.push({ level: 'P2', title: `${name} 缺 labels`, detail: '类别 + scope + 优先级，缺一段就分不出该谁看。', evidence: rel(path) });
      }
      if (!/^issue:\s*\d+/m.test(head[1])) pending += 1;
      // 五段指的是**内容**，标题可以按类别换名字（见 docs/issues.md §3 的对照）。
      // 这里只查两条硬的：段落数够不够、有没有「证据」—— 证据那一段是纪律的核心。
      const headings = [...text.matchAll(/^##+ .+$/gm)].map((match) => match[0]);
      if (headings.length < 3) {
        findings.push({
          level: 'P3',
          title: `${name} 只有 ${headings.length} 段`,
          detail: '五件事（现象 / 复现 / 期望 / 影响 / 证据）缺一段就是没写完，见 docs/issues.md §3。',
          evidence: rel(path),
        });
      }
      if (!headings.some((heading) => heading.includes('证据'))) {
        findings.push({
          level: 'P3',
          title: `${name} 没有「证据」段`,
          detail: '没有证据的条目关不掉也验不了：写清命令与输出、`文件:行` 或 commit。',
          evidence: rel(path),
        });
      }
      const scope = /^---\n[\s\S]*?scope:([a-z]+)[\s\S]*?\n---/.exec(text);
      if (scope === null) {
        findings.push({ level: 'P3', title: `${name} 的 labels 里没有 scope:*`, detail: '范围标签是排查时的第一层过滤。', evidence: rel(path) });
      } else if (!scopes.has(scope[1])) {
        findings.push({ level: 'P3', title: `${name} 的 scope:${scope[1]} 不在约定的范围词里`, detail: '范围取一个词，见 docs/issues.md §3。', evidence: rel(path) });
      }
    }
    return { findings, notes: [`${files.length} 条草稿，其中 ${pending} 条待同步`] };
  },
};

/** 临时做法的语言标记：注释里的「临时」「TODO」是欠账的自白 */
const markers = {
  id: 'markers',
  title: '源码里的临时做法与 TODO',
  run() {
    const findings = [];
    let total = 0;
    for (const pkg of packages()) {
      for (const file of sources(pkg)) {
        const text = read(file);
        const patterns = /^\s*(?:\/\/|\*|#).*\b(TODO|FIXME|XXX|HACK)\b.*$|^\s*(?:\/\/|\*|#).*(临时(?!目录|文件|挂)|暂时|先这样|以后再).*$/gm;
        for (const match of matches(text, patterns)) {
          total += 1;
          if (findings.length < 12) {
            findings.push({
              level: 'P3',
              title: `欠账标记：${rel(file)}:${match.line}`,
              detail: '欠账要落到 issue 里才算记下（docs/issues.md §2 第 3 条）；当场能还的还掉，还不了的写成草稿。',
              evidence: match.text.trim().slice(0, 120),
            });
          }
        }
      }
    }
    return { findings, notes: [`共 ${total} 处标记${total > 12 ? '（只列前 12）' : ''}`] };
  },
};

/** 提供方硬编码：加一家厂商应该只加一组目录，不该去改各处 */
const providerHardcode = {
  id: 'provider-hardcode',
  title: '提供方没有绕开模型目录硬编码',
  run() {
    const patterns = /\b(new\s+\w*Provider\s*\(|DeepSeekProvider|OpenAIProvider|KimiProvider|QwenProvider)\b/g;
    const findings = [];
    for (const pkg of packages()) {
      if (pkg.endsWith('/providers')) continue; // 提供方实现本来就在这里
      for (const file of sources(pkg)) {
        const text = read(file);
        for (const match of matches(text, patterns)) {
          findings.push({
            level: 'P2',
            title: `绕开模型目录的提供方用法：${match.groups[0]}`,
            detail: 'provider 的构造应当走工厂 + 模型目录（packages/core/src/config/model-catalog.ts），否则加一家厂商要改这里。',
            evidence: `${rel(file)}:${match.line}`,
          });
        }
      }
    }
    return { findings, notes: [] };
  },
};
/** 密钥卫生：值只该出现在「注入」与「调用」两处，且不该进仓库 */
const secrets = {
  id: 'secrets',
  title: '密钥卫生（值不进仓库、不进日志、文件 0600）',
  run() {
    const findings = [];

    // 1. 有没有人被 git 跟踪进了仓库
    try {
      const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' });
      const envs = tracked
        .split('\n')
        // `.env.example` 是给人抄的模板，本身没有值；真正的密钥文件是 `.env` 与 secrets/ 下的东西
        .filter((name) => !/\.env\.(example|sample|template)$/.test(name))
        .filter((name) => /(^|\/)\.env(\.|$)/.test(name) || name.includes('/secrets/'));
      for (const name of envs) {
        findings.push({
          level: 'P0',
          title: `仓库里有密钥文件被跟踪：${name}`,
          detail: '值一旦进过 git 历史，改文件是删不掉的 —— 该轮换密钥，而不是删这一行。',
          evidence: `git ls-files | grep ${name}`,
        });
      }
    } catch {
      // 不在 git 仓库里跑就不查这一条
    }

    // 2. 有没有把**值**打出来。只打「配没配」是允许的 —— 判据是「模板里插值了一个
    //    名字像密钥的变量」，不是「这一行出现了 token 这个词」（后者全是文案）。
    for (const pkg of packages()) {
      for (const file of sources(pkg, true)) {
        const text = read(file);
        for (const match of matches(text, /console\.(?:log|error|warn)\([^)]*\$\{[^}]*(?:apiKey|token|password|secret)[^}]*\}/gi)) {
          findings.push({
            level: 'P2',
            title: '疑似把密钥类变量的值打了出来',
            detail: '值只该出现在「注入子进程」与「调用模型」两处。请人工确认这一行打的是值还是有无。',
            evidence: `${rel(file)}:${match.line}`,
          });
        }
      }
    }

    // 3. 写密钥的地方有没有收权限
    const writers = [
      'packages/core/src/config/user-env.ts',
      'packages/server/src/settings.ts',
      'packages/cli/src/commands/config.ts',
    ];
    for (const name of writers) {
      const path = join(ROOT, name);
      if (!exists(path)) continue;
      const text = read(path);
      if (text.includes('API_KEY') && !text.includes('0o600')) {
        findings.push({
          level: 'P1',
          title: `${name} 写密钥但看不到 0600`,
          detail: '明文密钥默认权限是 0644，同机其他用户读得到（P1 这条规矩是刻意的）。',
          evidence: name,
        });
      }
    }

    // 4. 磁盘上的密钥文件权限（本机跑才有意义）
    const home = process.env['HOME'] ?? '';
    const secretsDir = join(home, '.adelie', 'secrets');
    if (exists(secretsDir)) {
      for (const name of readdirSync(secretsDir)) {
        const mode = statSync(join(secretsDir, name)).mode & 0o777;
        if ((mode & 0o077) !== 0) {
          findings.push({
            level: 'P1',
            title: `密钥文件权限过宽：${name} 是 0${mode.toString(8)}`,
            detail: '同机其他用户能读到明文密钥。',
            evidence: `ls -l ${join(secretsDir, name)}`,
          });
        }
      }
    }
    return { findings, notes: [] };
  },
};

/** 产物里有没有已删源的残渣：不清 dist 就会把上一版的东西打进发布包 */
const distClean = {
  id: 'dist-clean',
  title: '构建产物与源码一致（没有已删源的残渣）',
  run() {
    // 只查「一个产物文件应该对应一个源文件」的那种产物（tsc 一类的镜像输出）。
    // 打包器的产物（带哈希的 chunk、入口 bundle）本来就不对应单个源文件，
    // 排除它们才不会把「构建成功」误报成「残渣」。
    const BUNDLE_NAMES = /^(?:index|main|cli|server|sw)\.[a-z.]*js$/;
    const findings = [];
    for (const pkg of packages()) {
      const dist = join(pkg, 'dist');
      if (!exists(dist)) continue;
      const sourceNames = new Set(
        sources(pkg, true).map((file) => file.slice(file.lastIndexOf('/') + 1).replace(/\.(ts|tsx)$/, '')),
      );
      for (const file of walk(dist, (name) => /\.(js|d\.ts)$/.test(name))) {
        const relToDist = relative(dist, file);
        if (relToDist.startsWith('assets/') || relToDist.includes('/assets/') || relToDist.includes('web-dist')) continue;
        const base = relToDist.slice(relToDist.lastIndexOf('/') + 1);
        if (BUNDLE_NAMES.test(base)) continue;
        const stem = base.replace(/\.d\.ts$/, '').replace(/\.js$/, '');
        if (!sourceNames.has(stem)) {
          findings.push({
            level: 'P2',
            title: `产物里有已删源的残渣：${rel(file)}`,
            detail: '`tsc` 只写不删：源文件删掉之后产物还留着，而 package.json 的 files 就是 dist。各包的 build 已经先跑 scripts/clean-dist.mjs，出现这条说明有包漏了这一步。',
            evidence: `packages/${relative(join(ROOT, 'packages'), pkg)}/src 里没有 ${stem}.ts`,
          });
        }
      }
    }
    return { findings, notes: [] };
  },
};

/** 版本号与依赖声明这类「看着没事、上线出事」的一致性问题 */
const consistency = {
  id: 'consistency',
  title: '版本号一致、workspace 依赖有声明',
  run() {
    const findings = [];
    const rootVersion = JSON.parse(read(join(ROOT, 'package.json'))).version;
    const manifests = packages().map((dir) => ({ dir, json: JSON.parse(read(join(dir, 'package.json'))) }));

    for (const { dir, json } of manifests) {
      if (json.version !== rootVersion) {
        findings.push({
          level: 'P2',
          title: `${json.name} 的版本 ${json.version} 与根 ${rootVersion} 不一致`,
          detail: '发布时按包各自的版本推 npm：不一致会推出一个「部分新部分旧」的版本。',
          evidence: rel(join(dir, 'package.json')),
        });
      }
      const declared = new Set([...Object.keys(json.dependencies ?? {}), ...Object.keys(json.devDependencies ?? {})]);
      for (const file of sources(dir, true)) {
        const text = read(file);
        for (const match of matches(text, /from\s+'(adelie-[a-z]+)(?:\/[^']*)?'/g)) {
          // 自己引用自己（包名 == imports 里那个名字）是 Node 支持的写法，不算漏声明
          if (match.groups[0] === json.name) continue;
          if (!declared.has(match.groups[0])) {
            findings.push({
              level: 'P1',
              title: `${json.name} 用了 ${match.groups[0]} 但没在 package.json 里声明`,
              detail: 'workspace 里跑得通（pnpm 会软链到根），装出去就 ERR_MODULE_NOT_FOUND。',
              evidence: `${rel(file)}:${match.line}`,
            });
          }
        }
      }
    }

    // CHANGELOG 得有「未发布」一节，否则新东西没地方记
    const changelog = read(join(ROOT, 'CHANGELOG.md'));
    if (!/^## 未发布/m.test(changelog)) {
      findings.push({
        level: 'P3',
        title: 'CHANGELOG.md 没有「未发布」一节',
        detail: '改动落在哪里没有地方写，发布说明就只能在发布当天现编。',
        evidence: 'CHANGELOG.md',
      });
    }
    return { findings, notes: [`${manifests.length} 个包，版本 ${rootVersion}`] };
  },
};

/** 文档里自认「未验证」的结论：提醒它们还没关掉 */
const unverifiedClaims = {
  id: 'unverified-claims',
  title: '文档里自认未验证的结论',
  run() {
    const findings = [];
    const dir = join(ROOT, 'docs');
    let count = 0;
    for (const file of walk(dir, (name) => name.endsWith('.md'))) {
      const text = read(file);
      for (const match of matches(text, /^.*未验证.*$/gm)) {
        count += 1;
      }
    }
    if (count > 0) {
      findings.push({
        level: 'P3',
        title: `文档里有 ${count} 处「未验证」`,
        detail: '这些是**结论**而不是缺陷：要么去验一次，要么在 docs/issues/ 里有对应草稿说明为什么一直开着。',
        evidence: 'grep -rn 未验证 docs/',
      });
    }
    return { findings, notes: [] };
  },
};

const CHECKS = [
  gates,
  routesInDocs,
  routePermissions,
  webApiPaths,
  errorCodes,
  issueDrafts,
  markers,
  providerHardcode,
  secrets,
  distClean,
  consistency,
  unverifiedClaims,
];

// ---------------------------------------------------------------------------
// 跑
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const options = { gates: true, json: false, only: null, failOn: 'P1' };
  for (const arg of argv) {
    if (arg === '--no-gates') options.gates = false;
    else if (arg === '--json') options.json = true;
    else if (arg.startsWith('--only=')) options.only = arg.slice('--only='.length).split(',').map((s) => s.trim()).filter(Boolean);
    else if (arg.startsWith('--fail-on=')) {
      const level = arg.slice('--fail-on='.length).trim().toUpperCase();
      if (!LEVELS.includes(level)) {
        console.error(`--fail-on 只认 ${LEVELS.join(' / ')}，收到 ${level}`);
        process.exit(2);
      }
      options.failOn = level;
    } else if (arg === '--help' || arg === '-h') {
      console.log('用法: node scripts/audit.mjs [--no-gates] [--only=id,id] [--fail-on=P0|P1|P2|P3] [--json]');
      console.log(`检查项：${CHECKS.map((check) => check.id).join(' / ')}`);
      console.log('默认 --fail-on=P1：只有 P0/P1 会让退出码非零。CI 用 P2，本地随手跑用默认。');
      process.exit(0);
    } else {
      console.error(`不认识的参数：${arg}`);
      process.exit(2);
    }
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const selected = CHECKS.filter((check) => {
    if (options.only !== null) return options.only.includes(check.id);
    return options.gates || !check.heavy;
  });

  // 已经有草稿的问题不再当新发现报：体检的职责是「提醒还没记下的」，不是把 issue
  // 列表复述一遍。判据很直接 —— 草稿正文里提到过同一个文件路径就算记过了。
  const drafts = draftTexts();

  const results = [];
  for (const check of selected) {
    if (!options.json) console.log(`\n…… ${check.title}`);
    let outcome = { findings: [], notes: [] };
    try {
      outcome = check.run();
    } catch (error) {
      outcome = {
        findings: [{ level: 'P2', title: `检查项 ${check.id} 自己崩了`, detail: '体检脚本出错不等于应用出错，但这条例外得修。', evidence: String(error && error.message) }],
        notes: [],
      };
    }
    for (const finding of outcome.findings) {
      const candidates = candidatesOf(finding);
      const known = candidates.length === 0
        ? undefined
        : drafts.find((draft) => candidates.some((candidate) => draft.body.includes(candidate)));
      if (known !== undefined) finding.knownIn = known.file;
    }
    results.push({ id: check.id, title: check.title, ...outcome });
  }

  const findings = results.flatMap((result) => result.findings.map((finding) => ({ ...finding, check: result.id })));
  findings.sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level));

  if (options.json) {
    const summary = summaryOf(findings, options.failOn);
    console.log(JSON.stringify({ results, findings, summary }, null, 2));
    process.exit(summary.blocking > 0 ? 1 : 0);
  }

  for (const result of results) {
    const notes = result.notes.length > 0 ? `（${result.notes.join('，')}）` : '';
    console.log(`\n== ${result.title}${notes}`);
    if (result.findings.length === 0) {
      console.log('   ✓ 没有发现');
      continue;
    }
    for (const finding of result.findings) {
      console.log(`   [${finding.level}] ${finding.title}`);
      console.log(`        ${finding.detail}`);
      if (finding.knownIn !== undefined) console.log(`        已有草稿：${finding.knownIn}`);
      if (finding.evidence !== undefined) {
        console.log(`        证据：${String(finding.evidence).split('\n').map((line, index) => (index === 0 ? line : `              ${line}`)).join('\n')}`);
      }
    }
  }

  const summary = summaryOf(findings, options.failOn);
  console.log('\n-------- 汇总 --------');
  console.log(LEVELS.map((level) => `${level} ${summary.byLevel[level]}`).join('   '));
  if (summary.recorded > 0) console.log(`其中 ${summary.recorded} 条已经记在 docs/issues/ 的草稿里`);
  console.log(
    summary.blocking === 0
      ? `没有 ${options.failOn} 或更重的：应用处于可发布状态（就体检覆盖的面而言）`
      : `有 ${summary.blocking} 条 ${options.failOn} 或更重的：先处理它们（--fail-on 可调）`,
  );
  console.log('体检只报告、不修东西；修完请重跑一次（`node scripts/audit.mjs`），条目消失才算数。');
  process.exit(summary.blocking > 0 ? 1 : 0);
}

/** docs/issues/*.md 的正文，用来判断某条发现是不是已经记过了 */
function draftTexts() {
  const dir = join(ROOT, 'docs/issues');
  if (!exists(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => ({ file: join('docs/issues', name), body: read(join(dir, name)) }));
}

/**
 * 从发现里取出几个「能被草稿提到」的字符串，用来判断这条是不是已经记过了。
 *
 * 取多个是因为草稿里的写法与我们的标题未必逐字相同：一条产物残渣可能写成
 * `packages/providers/dist/` 加 `` `anthropic.provider.js` ``，而我们的标题里是
 * `packages/providers/dist/anthropic.provider.d.ts`。所以同时取整条路径、去掉后缀的
 * 路径、所在目录、以及带各种后缀的文件名 —— 只要草稿提到其中一个就算记过了。
 */
function candidatesOf(finding) {
  const text = `${finding.title} ${finding.evidence ?? ''}`;
  const candidates = new Set();
  for (const match of text.matchAll(/[\w./-]*[\w-]+\.(?:ts|tsx|mjs|js|json|md)/g)) {
    const path = match[0];
    if (path.length < 8) continue;
    candidates.add(path);
    candidates.add(path.replace(/\.d\.ts$/, '').replace(/\.(ts|tsx|mjs|js|json|md)$/, ''));
    candidates.add(path.slice(0, path.lastIndexOf('/') + 1));
    const base = path.slice(path.lastIndexOf('/') + 1);
    const stem = base.replace(/\.(ts|tsx|mjs|js|json|md)$/, '').replace(/\.d$/, '');
    if (stem.length >= 8) {
      candidates.add(stem);
      for (const ext of ['ts', 'tsx', 'js', 'mjs', 'd.ts']) candidates.add(`${stem}.${ext}`);
    }
  }
  return [...candidates].filter((candidate) => candidate.length >= 8);
}

function summaryOf(findings, failOn) {
  const byLevel = Object.fromEntries(LEVELS.map((level) => [level, 0]));
  for (const finding of findings) byLevel[finding.level] += 1;
  const threshold = LEVELS.indexOf(failOn);
  const recorded = findings.filter((finding) => finding.knownIn !== undefined).length;
  return {
    total: findings.length,
    byLevel,
    // 「挡发布」的门槛：failOn 那一档以及比它更重的，**且还没被记进草稿**的。
    // 已经记下的问题由 issue 跟踪，不该把 CI 一直挂红 —— 挂红了大家就会开始忽略它，
    // 那比不检查更糟。这里只挡「体检新发现、还没人认领」的那些。
    blocking: findings.filter((finding) => LEVELS.indexOf(finding.level) <= threshold && finding.knownIn === undefined).length,
    recorded,
  };
}

main();
