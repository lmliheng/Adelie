# Seedance 视频生成（`@adelie/use-seedance`）

一句话：**把提示词交给火山方舟的豆包 Seedance，拿回一个 mp4，落在工作区里。**

运行时就一个零依赖的 Node 文件（`skills/seedance/kit/seedance.mjs`）。它替 Agent 走完视频生成
的**异步三步**——提交任务、轮询到终态、把视频下载到本地：

```
POST /contents/generations/tasks        提交 → 拿任务 id（cgt-…）
GET  /contents/generations/tasks/{id}   轮询 → succeeded 时才带回 content.video_url
下载 video_url                          → 先写临时文件，下完了才改名
```

端点默认 `https://ark.cn-beijing.volces.com/api/v3`，鉴权是 `Authorization: Bearer $ARK_API_KEY`；
**密钥只从环境读**（Agent 的密钥库注入），脚本不写盘，也不留下别的痕迹。

## 用

```bash
node skills/seedance/kit/seedance.mjs --prompt "一只猫对着镜头打哈欠" --out cat.mp4
```

stderr 是给人看的进度行，**stdout 只有一行 JSON**，路径、字节数、任务 id、耗时都在里面：

```json
{"ok":true,"path":"/abs/cat.mp4","bytes":2314213,"task_id":"cgt-…","model":"doubao-seedance-2-5-260628","video_url":"https://…","elapsed_ms":74210}
```

参数：`--out`（默认 `./seedance-<时间戳>.mp4`）、`--model`（默认 `doubao-seedance-2-5-260628`）、
`--image` / `--last-frame` / `--reference-image`（首帧 / 尾帧 / 参考图，可给本机文件或 URL）、
`--duration`、`--ratio`、`--resolution`、`--seed`、`--watermark`、`--generate-audio`、
`--poll-interval`（默认 5 秒，退避到 20）、`--max-wait`（默认 900 秒）。**没传的参数不发给服务**，
所以模型自己的默认值说了算；未知参数直接报错，不会悄悄忽略。

退出码把结果分了类：`0` 成功；`2` 命令行不对；`3` 缺 `ARK_API_KEY`；`4` 接口拒了请求（`upstream`
里是服务原话）；`5` 任务以 `failed`/`cancelled`/`expired` 结束；`6` 超过 `--max-wait` 还没完
（任务仍在服务端跑，`task_id` 可以晚点再查，别重复提交）；`7` 视频没下下来。

## 文件

| 路径 | 是什么 |
| --- | --- |
| `skills/seedance/kit/seedance.mjs` | 全部运行时：参数、提交、轮询、下载、一行 JSON |
| `skills/seedance/SKILL.md` | Agent 读的说明书：什么时候用、参数、错误码怎么处理、产物怎么给用户看 |
| `test/seedance.test.mjs` | 八条自检，桩服务冒充方舟，不用密钥也不花钱 |
| `plugin.json` / `package.json` / `icon.svg` / `LICENSE` | 插件清单、包信息、图标、Apache-2.0 |

## 测试

```bash
node --test "plugins/use-seedance/test/*.test.mjs"   # 或在包目录里 pnpm test
```

桩（`test/` 里那个 `http.createServer`）冒充方舟：提交返回任务 id，查询第一次 `running`、第二次
`succeeded` 并给本地 mp4，于是整条路——提交 → 轮询 → 下载 → 改名——都在本机跑完，并断言密钥只发往
接口、不发给视频 URL（真实的任务返回的是签名链接）。**它验的是脚本自己的行为，不是真实响应的形状**：
真实方舟的成功响应长什么样只能靠文档，想真跑一次需要账号已开通 Seedance 并且愿意付费。

关键接口改动时以官网为准：
[创建视频生成任务](https://docs.volcengine.com/docs/ark/create-video-generation-task-api?lang=zh)、
[查询视频生成任务](https://docs.volcengine.com/docs/ark/get-video-generation-task-api?lang=zh)、
[模型列表](https://docs.volcengine.com/docs/ark/model-list?lang=zh)。

## 还没验的

- 真实方舟的一次完整成功（需要已开通的账号与付费额度）。
- 首尾帧 / 全模态参考这些组合参数在真实模型上的取值约束（脚本只按文档传 `role`，参数合规交服务判）。
- Windows 上的路径与 base64 参考图（本机是 Linux，只验了 Linux）。
