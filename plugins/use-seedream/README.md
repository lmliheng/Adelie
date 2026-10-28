# Seedream 图像生成（`@adelie/use-seedream`）

一句话：**把提示词交给火山方舟的豆包 Seedream，拿回图片，落在工作区里。**

运行时就一个零依赖的 Node 文件（`skills/seedream/kit/seedream.mjs`）。它替 Agent 走完图片生成
的**同步一步**——一次请求，答案里直接带回图片：

```
POST /images/generations   一次请求 → data[] 里是图片：url（默认）或 b64_json
下载 url 或解码 b64_json    → 先写临时文件，写完了才改名
```

端点默认 `https://ark.cn-beijing.volces.com/api/v3`，鉴权是 `Authorization: Bearer $ARK_API_KEY`；
**密钥只从环境读**（Agent 的密钥库注入），脚本不写盘，也不留下别的痕迹。

## 用

```bash
node skills/seedream/kit/seedream.mjs --prompt "一只猫在窗台上晒太阳" --out cat.png
```

stderr 是给人看的进度行，**stdout 只有一行 JSON**，路径、耗时、用量都在里面：

```json
{"ok":true,"model":"doubao-seedream-5-0-pro-260628","size":"2K","request_id":"0217…","elapsed_ms":18342,"paths":["/abs/cat.png"],"usage":{"generated_images":1}}
```

参数：`--out`（单图是文件路径，出多图时是目录；默认单图 `./seedream-<时间戳>.<格式>`、
多图 `./seedream-<时间戳>/`）、
`--model`（默认 `doubao-seedream-5-0-pro-260628`）、`--image`（参考图，可重复，最多 14 张，
本机文件会内联成 `data:<mime>;base64,…`）、`--size`（`1K`/`2K`/`4K` 或 `2048x2048`，
总像素须在 1280×720 与 4096×4096 之间）、`--count`（一次出组图，1–15 张）、`--layers`（图层拆分）、
`--transparent`、`--format`（`png`/`jpeg`；不传时按 `--out` 的扩展名定，两者都没有就是 `png` ——
一个叫 `cat.png` 的文件里装着 JPEG 字节，在很多看图工具里就是「坏文件」）、`--seed`、`--watermark`。
**没传的参数不发给服务**，所以模型自己的默认值说了算；未知参数直接报错，不会悄悄忽略。

出多图（`--count` 或 `--layers`）时 `--out` 当目录用，文件名是三位序号加内容：
`001-base.png`、`002-z1-背景.png`……序号后面带 `-z<z_index>`（有的话）和层名 —— 层名原样保留，
只把路径里放不下的字符（`/ \ : * ? " < > |`、空白、控制字符）换成 `-`，中文不会被打掉；服务没给名字时
用 `base` / `layer`。图层一律是 PNG。

退出码把结果分了类：`0` 成功；`2` 命令行不对；`3` 缺 `ARK_API_KEY`；`4` 接口拒了请求（`upstream`
里是服务原话）；`7` 图片没下下来（临时文件已删，最终路径上不会留半张图）。

## 文件

| 路径 | 是什么 |
| --- | --- |
| `skills/seedream/kit/seedream.mjs` | 全部运行时：参数、请求、下载/解码、一行 JSON |
| `skills/seedream/SKILL.md` | Agent 读的说明书：什么时候用、参数、错误码怎么处理、产物怎么给用户看 |
| `test/seedream.test.mjs` | 自检，桩服务冒充方舟，不用密钥也不花钱 |
| `plugin.json` / `package.json` / `icon.svg` / `LICENSE` | 插件清单、包信息、图标、Apache-2.0 |

## 测试

```bash
node --test "plugins/use-seedream/test/*.test.mjs"   # 或在包目录里 pnpm test
```

桩（`test/` 里那个 `http.createServer`）冒充方舟：生成接口按用例返回 URL 或 base64，
图片地址由同一个桩提供，于是整条路——请求 → 下载 → 改名——都在本机跑完，并断言密钥只发往接口、
不发给图片 URL（真实的返回是签名链接）。它验的是脚本自己的行为；真实响应形状另外对着方舟真接口核过一次
（2026-10-28，`doubao-seedream-5-0-pro-260628`：出图、组图与图层拆分都跑通了）。

关键接口改动时以官网为准：
[图片生成](https://docs.volcengine.com/docs/ark/image-generation-api?lang=zh)、
[模型列表](https://docs.volcengine.com/docs/ark/model-list?lang=zh)。

## 真接口核过什么（2026-10-28）

- 单图：`--size 1280x720` 出图，落盘 1280×720 PNG；`--out X.png` 现在会让服务直接给 PNG。
- 图层拆分：`--image` 给一张本机图，回来 5 项（1 张底图 + 4 个图层），层名是中文
  `背景 / 窗户 / 木桌 / 橘猫`，图层都是带 alpha 的 PNG，`bounding_box.absolute` / `.normalized` 都在。
- 这一轮真跑时发现并修掉两个只有真接口才暴露的问题：中文层名被清成 `layer`（现在原样保留），以及
  `--out X.png` 拿到 JPEG 字节（现在扩展名决定 `output_format`，都没说时默认 png）。
- 当时的账号还回 `ModelNotOpen`：方舟的图像模型要在控制台「开通管理」里单独开通，不是默认可用。

## 还没验的

- 组图（`--count`）的真实张数与上限。
- `sequential_image_generation` 与 `layer_decomposition` 在真实模型上的组合约束（脚本只按文档传参）。
- Windows 上的路径与 base64 参考图（本机是 Linux，只验了 Linux）。
