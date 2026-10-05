<p align="center">
  <img src="packages/web/public/adelie-icon.svg" alt="Adelie logo" width="88" />
</p>

<h1 align="center">Adelie</h1>

<p align="center"><strong>A local-first multi-agent app development platform, built on PenguinHarness</strong></p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="License: Apache-2.0" /></a>
  <img src="https://img.shields.io/badge/node-%E2%89%A5%2024-brightgreen" alt="Node >= 24" />
  <a href="https://github.com/Prism-Shadow/penguin-harness"><img src="https://img.shields.io/badge/fork%20of-PenguinHarness-1f6feb" alt="Fork of PenguinHarness" /></a>
</p>

> [!IMPORTANT]
> **Adelie is a fork of [PenguinHarness](https://github.com/Prism-Shadow/penguin-harness).** The code
> tree, the engine, the Web frontend and the protocol all come from PenguinHarness (Apache-2.0);
> Adelie is the productised line built on top of it — its own brand and interface, its own data root
> and ports, its own release pipeline.
>
> - Where it came from, what the licence requires, what we changed: [`FORK.md`](FORK.md)
> - How far the work has got: [`FORK-PROGRESS.md`](FORK-PROGRESS.md)
> - The upstream project's own channels — repository, website, docs, blog, community, Discord, X,
>   WeChat, Product Hunt — are **theirs**, not Adelie's: <https://github.com/Prism-Shadow/penguin-harness> ·
>   <https://penguin.ooo/>
> - The PenguinHarness and PrismShadow names and marks belong to upstream. Adelie does not use them
>   as its own name, icon or domain.

<p align="center">English | <a href="README.zh.md">简体中文</a></p>

## Why Adelie

> With LangChain, you build agents by hand — at 1× speed.<br />With Adelie, agents build agents — at 100×.

Adelie runs on your computer or server and automates the agent app lifecycle from creation and evaluation to optimization and deployment. Three reasons define the platform:

### 1. 🏆 Outstanding results at tens of times less cost

A deliberately minimal toolset over clean low-level interfaces: fewer tool calls, fewer tokens — deeply tuned for open models like DeepSeek. Each harness on the model it is normally paired with, same tasks, head-to-head:

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/readme/benchmark-dark.svg" />
    <img src="assets/readme/benchmark-light.svg" alt="Benchmark: Adelie leads the data-analysis suite and ties OpenAI Codex on coding, at a small fraction of both rivals' cost" width="920" />
  </picture>
</p>

**Best accuracy on data analysis — at 1/70 of Claude Code's cost.**

### 2. ⚡ One sentence generates a runnable agent app

Describe what you need in one sentence. Adelie builds the complete agent application — scaffold, code, and run instructions, end to end:

```text
Collect the docs from https://github.com/ericbuess/claude-code-docs and build a RAG app that answers Claude Code questions as a configuration expert, citing its sources.
```

And this is the finished product — a docs expert with retrieval, cited sources that link to the original files, and example questions built in:

https://github.com/user-attachments/assets/9b7033e8-f08a-4c3f-bd33-547896664e6e

**And generating this entire RAG app burned just $0.02 (¥0.2) of tokens — on DeepSeek V4 Pro.**

### 3. 🧬 Native agent self-evolution engine

With Adelie Skills, an agent evaluates and optimizes itself: run the benchmark, find the lost points, ship version N+1 — with a snapshot before every round and every request observable in the Trace view.

https://github.com/user-attachments/assets/922d13a6-5ffc-4685-9a39-352f02f9afc0

*The benchmark and the two recordings above are the upstream PenguinHarness authors' own results and screen captures of this codebase — Adelie ships that same engine and UI, so they describe what this fork does. The product name visible in the recordings is the base's pre-rename branding.*

## Built-in plugins

Four plugin categories ship in the box (the docs live in [`packages/docs`](packages/docs) in this tree) — skills, plus the session hooks that drive goal mode and continual learning; agents can also write and optimize their own skills:

| Category             | Plugins                                                                       |
| -------------------- | ----------------------------------------------------------------------------- |
| Office Productivity  | `data-analysis`, `use-firecrawl`, `browser-automation`, `use-bento-slides`, `humanizer`, `goal`, `continual-learning` |
| Software Development | `software-development`, `use-claude-code`                              |
| AI App Development   | `agent-development`, `model-development`, `skill-porting`, `agent-tuning`     |
| Agent Company        | `agent-company`                                                               |

The desktop app also has a built-in browser in its side dock. Agents drive it with `penguin browser` and the `browser-automation` plugin: they read pages, click and type, and pull out data such as your Amazon orders, signed in with the accounts you import from your own browser.

## Supported Models

| Model            | Providers                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| DeepSeek V4      | DeepSeek, OpenRouter, Fireworks AI, SiliconFlow, TokenDance, Qwen Token Plan, Qwen Pay-As-You-Go |
| Kimi K3          | Moonshot AI, OpenRouter, Fireworks AI, TokenDance, Qwen Pay-As-You-Go                            |
| GLM 5.3          | Z.AI, OpenRouter, TokenDance                                                                     |
| Hunyuan 3        | OpenRouter                                                                                       |
| Qwen 3.8 Max     | Qwen Token Plan, Qwen Pay-As-You-Go, OpenRouter, TokenDance                                      |
| GPT 5.6          | OpenAI, OpenRouter                                                                               |
| Gemini 3.7 Flash | Google Gemini, OpenRouter                                                                        |
| Claude 5         | Anthropic, OpenRouter                                                                            |
| Inkling          | OpenRouter, Fireworks AI                                                                         |

Each family's latest generation only — the app's **Models** page lists every built-in preset, and any OpenAI-protocol endpoint works too: pick a preset, or point a custom endpoint at any of the 1000+ online and local models.

## Requirements

| Requirement  | Supported                                                                  |
| ------------ | -------------------------------------------------------------------------- |
| OS           | Linux, macOS, Windows 10+                                                  |
| Architecture | x64, arm64                                                                 |
| Runtime      | Node >= 24 (there is no Adelie installer yet — see Installation)           |
| Model        | an API key for at least one model                                          |

## Installation — read this first

**Adelie has not shipped release artifacts of its own yet.** There is no Adelie npm package, no
Adelie installer, no Adelie Docker image and no Adelie download page: those are the last step of the
plan ([`FORK-PROGRESS.md`](FORK-PROGRESS.md) §4). Today the only way to run Adelie is from this
source tree:

```bash
# dependencies (skip desktop/electron: it downloads a runtime and is not needed for the Web App)
pnpm install --frozen-lockfile \
  --filter @prismshadow/penguin-core --filter @prismshadow/penguin-ui \
  --filter @prismshadow/penguin-server --filter @prismshadow/penguin-web \
  --filter @prismshadow/penguin-cli --filter @prismshadow/penguin-hmr

# build (core's exports point at dist/, so build before running anything)
pnpm -r --filter @prismshadow/penguin-core --filter @prismshadow/penguin-server \
        --filter @prismshadow/penguin-web run build

# run the server together with the built Web App
cd packages/server
PENGUIN_HOME=<data root> HOST=0.0.0.0 PORT=<port> node dist/index.js
```

The first start prints a first-login link as a framed notice on every start until a password exists —
open it to claim the built-in `admin` account and set one (there is no initial password to copy).
Models are configured on the in-app **Models** page, which is where a fresh instance needs an API key
before it can run anything.

> [!WARNING]
> Everything the upstream README offers — `curl https://penguin.ooo/install.sh | sh`,
> `npm install -g @prismshadow/penguin-cli`, `docker run hiyouga/penguinharness`, the desktop
> installer on <https://penguin.ooo/download> — installs **PenguinHarness**, not Adelie. Those
> channels stay upstream's until Adelie publishes its own.

Package names, the data root and the command name still carry the upstream spelling
(`@prismshadow/*`, `~/.penguin/data`, `penguin`) because the rename is a staged job — what is left
of it is tracked in [`FORK-PROGRESS.md`](FORK-PROGRESS.md).

## Development

```bash
pnpm install && pnpm build   # build first: core's exports point at dist/
pnpm dev                     # backend + web app together (prefixed logs, deps built once)
```

See [CONTRIBUTING.md](.github/CONTRIBUTING.md) for the workspace guide (the file is upstream's and
largely still describes this tree accurately): dev commands, quality gates, repo layout, changelog
rule. `packages/landing` (the upstream website) was removed in this fork.

## Upstream roadmap

This is the upstream project's roadmap, kept here as context for where
the base is heading. Adelie's own plan is [`FORK-PROGRESS.md`](FORK-PROGRESS.md).

- [ ] Public release of the benchmark suite
- [x] Desktop app
- [x] Windows support
- [ ] Agent company and templates
- [ ] Company-level self evolving
- [ ] OpenShell integration (permission-governed shell)
- More to come…

## Upstream contributors

Thanks to everyone who has contributed to PenguinHarness — the
codebase this fork is built on.

<p align="center">
  <a href="https://github.com/Prism-Shadow/penguin-harness/graphs/contributors"><img src="https://contrib.rocks/image?repo=Prism-Shadow/penguin-harness" alt="PenguinHarness contributors" /></a>
</p>

## Citation

If you use this codebase in your research, cite the upstream project it comes from (Adelie is a
fork of it):

```bibtex
@software{penguinharness2026,
  author  = {{PrismShadow Team}},
  title   = {PenguinHarness: Efficient Self-Improving Harness for Everyone},
  year    = {2026},
  url     = {https://github.com/Prism-Shadow/penguin-harness},
  license = {Apache-2.0}
}
```

## Acknowledgements

This repo benefits from:

- [MinGit](https://github.com/git-for-windows/git): the POSIX shell and Git bundled on Windows
- [GenericAgent](https://github.com/lsdefine/genericagent): built-in browser automation

See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for their licenses.

## License

[Apache-2.0](LICENSE) © 2026 Prism Shadow — the upstream copyright. Adelie is a fork of it and
is released under the same licence; see [`FORK.md`](FORK.md).

The upstream PenguinHarness codebase is built with ❤️ by [Yaowei Zheng](https://github.com/hiyouga) (author of [LlamaFactory](https://github.com/hiyouga/LlamaFactory)), the [PrismShadow AI Team](https://github.com/Prism-Shadow), and [Fable 5](https://www.anthropic.com/news/claude-fable-5-mythos-5). Adelie is a fork of that work.
