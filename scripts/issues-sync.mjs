#!/usr/bin/env node
//
// 把 docs/issues/*.md 推到 GitHub Issues（规则见 docs/issues.md）。
//
// 为什么要一个脚本而不是手点网页：
//   1. 幂等。草稿会留在仓库里，人（和代理）随时可能再看一眼、再改一遍，
//      如果每跑一次都新开一条 issue，草稿区就会变成污染的源头而不是记录。
//      所以正文里埋一个隐藏标记 `<!-- adelie-issue:<slug> -->`，推之前先按它查。
//   2. 标签不依赖仓库里预先存在。GitHub 对不存在的标签是 422 而不是「自动建」，
//      于是「先建标签」这一步必须有人做 —— 交给脚本，别交给记性。
//   3. 同步成功要把编号写回草稿：有了编号，提交信息才能写 `Fixes #N`，
//      而没有标记的草稿下次还会被当成新的推一遍。
//
// 用法：
//   node scripts/issues-sync.mjs --dry-run          # 不发，只列出要发什么
//   GH_TOKEN=... node scripts/issues-sync.mjs       # 真发
//   node scripts/issues-sync.mjs --repo o/n --dir docs/issues
//
// 令牌只从环境变量读（`GH_TOKEN` / `GITHUB_TOKEN`）：它不会出现在命令行里，
// 也就不会进 shell 历史与 ps 输出。

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const API = 'https://api.github.com';

/** 标签颜色。类别标签用 GitHub 的习惯色，范围与优先级用中性色，一眼能分出层级 */
const LABEL_COLORS = {
  bug: 'd73a4a',
  未验证: 'fbca04',
  欠账: '0e8a16',
  决策: '5319e7',
  阻塞: 'b60205',
  P0: 'b60205',
  P1: 'd93f0b',
  P2: 'fbca04',
  P3: 'c2e0c6',
};
const FALLBACK_COLOR = 'ededed';

function parseArgs(argv) {
  const options = { dryRun: false, repo: null, dir: 'docs/issues' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--repo') options.repo = argv[i += 1] ?? null;
    else if (arg === '--dir') options.dir = argv[i += 1] ?? 'docs/issues';
    else if (arg === '--help' || arg === '-h') {
      console.log('用法: node scripts/issues-sync.mjs [--dry-run] [--repo owner/name] [--dir docs/issues]');
      process.exit(0);
    } else {
      console.error(`不认识的参数：${arg}`);
      process.exit(2);
    }
  }
  return options;
}

/**
 * 从 git 的 remote 推仓库名。
 *
 * 支持 `git@github.com:owner/name.git` 与 `https://github.com/owner/name(.git)`：
 * 两种都在用（SSH 推、HTTPS 拉），脚本不该要求使用者记住用哪种配的。
 */
function repoFromGitRemote() {
  const config = readFileSync('.git/config', 'utf8');
  const match = /url\s*=\s*(.+)/.exec(config);
  if (match === null) return null;
  const url = match[1].trim();
  const ssh = /git@[^:]+:(.+?)(?:\.git)?$/.exec(url);
  if (ssh !== null) return ssh[1];
  const https = /https?:\/\/[^/]+\/(.+?)(?:\.git)?$/.exec(url);
  return https === null ? null : https[1];
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** 解析草稿。frontmatter 只认 `key: value` 与 `key: [a, b]` —— 够用，不为它引入 YAML 依赖 */
function parseDraft(file, text) {
  const match = FRONTMATTER.exec(text);
  if (match === null) throw new Error(`${file}: 缺少 frontmatter（--- 包头）`);

  const fields = {};
  for (const line of match[1].split('\n')) {
    const pair = /^([A-Za-z_]+):\s*(.*)$/.exec(line.trim());
    if (pair === null) continue;
    fields[pair[1]] = pair[2].trim();
  }

  const title = (fields['title'] ?? '').replace(/^["']|["']$/g, '').trim();
  if (title === '') throw new Error(`${file}: frontmatter 里没有 title`);

  const labels = (fields['labels'] ?? '')
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((item) => item.trim().replace(/^["']|["']$/g, ''))
    .filter((item) => item !== '');

  const issue = fields['issue'] === undefined ? null : Number.parseInt(fields['issue'], 10);

  return {
    file,
    slug: file.replace(/\.md$/, ''),
    title,
    labels,
    issue: Number.isNaN(issue) ? null : issue,
    body: text.slice(match[0].length).trim(),
  };
}

function markerOf(slug) {
  return `<!-- adelie-issue:${slug} -->`;
}

async function api(token, method, path, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'adelie-issues-sync',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  const text = await response.text();
  const parsed = text === '' ? null : JSON.parse(text);
  if (!response.ok) {
    const message = parsed?.message ?? text;
    throw new Error(`${method} ${path} → HTTP ${response.status}：${message}`);
  }
  return parsed;
}

/** 已有 issue 的 (编号 → 正文)。分页跟随 Link，否则仓库超过 100 条之后幂等就失灵了 */
async function listIssues(token, repo) {
  const found = [];
  for (let page = 1; page <= 10; page += 1) {
    const batch = await api(token, 'GET', `/repos/${repo}/issues?state=all&per_page=100&page=${page}`);
    // 这个接口把 PR 也算作 issue，得挑掉，否则标记匹配会撞上同号的 PR
    found.push(...batch.filter((item) => item.pull_request === undefined));
    if (batch.length < 100) break;
  }
  return found;
}

/** 标签必须先存在：不存在的标签会让创建请求以 422 整个失败，而不是只丢掉那个标签 */
async function ensureLabels(token, repo, names) {
  for (const name of names) {
    await api(token, 'PUT', `/repos/${repo}/labels/${encodeURIComponent(name)}`, {
      name,
      color: LABEL_COLORS[name] ?? FALLBACK_COLOR,
    });
  }
}

/** 同步成功后把编号写回草稿：下次就认得出这条已经推过了 */
function writeBackIssueNumber(path, text, number) {
  const match = FRONTMATTER.exec(text);
  const head = match[1];
  const next = head.includes('\nissue:') || head.startsWith('issue:')
    ? head.replace(/^issue:.*$/m, `issue: ${number}`)
    : `${head}\nissue: ${number}`;
  writeFileSync(path, text.replace(match[0], `---\n${next}\n---\n`), 'utf8');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const repo = options.repo ?? repoFromGitRemote();
  if (repo === null) {
    console.error('推不出仓库名：用 --repo owner/name 指定');
    process.exit(2);
  }

  const files = readdirSync(options.dir).filter((name) => name.endsWith('.md')).sort();
  if (files.length === 0) {
    console.log(`${options.dir} 里没有草稿`);
    return;
  }

  const drafts = files.map((name) => {
    const path = join(options.dir, name);
    return { path, ...parseDraft(name, readFileSync(path, 'utf8')) };
  });

  const pending = drafts.filter((draft) => draft.issue === null);
  console.log(`${drafts.length} 条草稿，其中 ${pending.length} 条没有 issue 编号`);

  if (options.dryRun) {
    for (const draft of pending) {
      console.log(`\n--- 会创建（${repo}）---`);
      console.log(`标题  ${draft.title}`);
      console.log(`标签  ${draft.labels.join(', ') || '（无）'}`);
      console.log(`标记  ${markerOf(draft.slug)}`);
      console.log(draft.body.split('\n').slice(0, 3).map((line) => `  | ${line}`).join('\n'));
    }
    return;
  }

  const token = process.env['GH_TOKEN'] ?? process.env['GITHUB_TOKEN'] ?? '';
  if (token === '') {
    console.error('没有令牌：把 GH_TOKEN 或 GITHUB_TOKEN 设为能建 issue 的 token。');
    console.error('（只读的 dry-run 不需要令牌：加 --dry-run）');
    process.exit(2);
  }

  const existing = await listIssues(token, repo);
  const byMarker = new Map();
  for (const item of existing) {
    const marker = /<!-- adelie-issue:([^\s]+) -->/.exec(item.body ?? '');
    if (marker !== null) byMarker.set(marker[1], item.number);
  }

  let created = 0;
  for (const draft of pending) {
    const already = byMarker.get(draft.slug);
    if (already !== undefined) {
      console.log(`跳过 ${draft.file}：GitHub 上已有 #${already}，回写编号`);
      writeBackIssueNumber(draft.path, readFileSync(draft.path, 'utf8'), already);
      continue;
    }

    await ensureLabels(token, repo, draft.labels);
    const issue = await api(token, 'POST', `/repos/${repo}/issues`, {
      title: draft.title,
      body: `${draft.body}\n\n${markerOf(draft.slug)}`,
      labels: draft.labels,
    });
    writeBackIssueNumber(draft.path, readFileSync(draft.path, 'utf8'), issue.number);
    console.log(`创建 #${issue.number}  ${draft.title}`);
    created += 1;
  }

  console.log(`完成：新建 ${created} 条，仓库里共 ${drafts.length} 条草稿`);
}

await main();
