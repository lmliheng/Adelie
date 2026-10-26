# 多了一个插件：一句话让 Adelie 生成视频（火山方舟 Seedance）

- **Date:** 2026-10-26
- **Type:** feat
- **Scope:** `plugins`, `docs`
- **Breaking:** no

[English](2026-10-26-seedance-plugin.md)

插件库里多了一个 `use-seedance`：跟 Agent 说「用 Seedance 做一段…的视频」，它就用火山方舟的豆包
Seedance 生成一个 mp4 落到工作区，再把文件给你。这是 Adelie 第一个**产出视频**的能力——模型库那 11 条
方舟条目负责看得懂视频，这个插件负责做得出来。

装上就有（默认预装）。缺的是密钥：去方舟控制台领一把 API key，加到这个 Agent 的**密钥库**里，键名
`ARK_API_KEY`。视频按秒和分辨率计费，所以 Agent 在提交前会把提示词跟你对一遍，不会「多跑几个版本看看」。

## 细节

- **插件**（`plugins/use-seedance/`）：`skills/seedance/SKILL.md` 是 Agent 读的说明书，
  `skills/seedance/kit/seedance.mjs` 是全部运行时——一个零依赖的 Node 文件，替 Agent 走完方舟那套异步
  三步：`POST /contents/generations/tasks` 提交、`GET …/tasks/{id}` 在最大等待时长内按退避间隔轮询、拿到
  `content.video_url` 后下载。默认模型 `doubao-seedance-2-5-260628`，可选首帧 / 尾帧 / 参考图、
  时长、比例、分辨率、种子、水印、是否出声。
- **密钥只从环境读**（密钥库注入），脚本不落盘；下载先写临时文件、下完才改名，半截视频不会顶着成品的名字。
  退出码把结果分类（缺 key / 服务拒绝 / 任务失败 / 超时 / 下载失败），stdout 只有一行 JSON，路径与任务 id
  都在里面。
- **登记**：`packages/{core,cli,desktop}/package.json` 各加一行 `"@adelie/use-seedance": "workspace:*"`，
  插件库、两份 README 的分类表与文档页的插件表跟着加一行（`packages/core/test/plugins.test.ts` 与
  `packages/docs/test/skills-sync.test.ts` 就是钉这个的）。
- 测试：`plugins/use-seedance/test/seedance.test.mjs` 八条——桩服务冒充方舟，提交 → 轮询 → 下载 → 改名
  整条路在本机跑完，并断言密钥只发往接口、不发给视频 URL（真实任务返回的是签名链接）。

## 兼容性

- 没有新运行时依赖（脚本是零依赖的 Node），装包体积可以忽略。
- 它默认预装在新建的 Agent 上；已存在的 Agent 从插件库装一次。没有密钥时脚本只会告诉你缺 `ARK_API_KEY`，
  不会去动别的配置。
