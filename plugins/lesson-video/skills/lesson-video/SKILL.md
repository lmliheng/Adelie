---
name: lesson-video
description: Turn a narration script into a narrated vertical lesson video (1080x1920, Douyin/Reels ready) plus matching cover art — an HTML slide deck driven purely by time, edge-tts voice-over with word-level timing, Playwright frame capture, and an ffmpeg mux with burned-out safe areas. Use whenever the task is to produce a short portrait teaching or explainer video, a narrated slide video, or its cover and publishing copy, from a written script or from source material such as a notebook, dataset or paper.
---

# 竖屏教学视频：讲稿 → 配音 → 逐帧渲染 → 成片 + 封面

## Before you start

如果消息只是点名这个技能（比如「用 lesson-video」）而没有具体要讲的内容，先问清楚讲什么、给谁看、
一集多长——**先有话，再有画面**，没有讲稿就没有可渲染的东西。有内容时先自检三样东西在不在：Python
包（`edge-tts`、`imageio-ffmpeg`）、一个可用的 `playwright-core`、一个 Chrome/Chromium 可执行文件；
缺哪个按第一节的表装哪个，别急着渲染。渲染是最后一步，不是第一步：`render.mjs --check` 先过一遍，
再花那几分钟出帧。

## 结论先行

一句话：**画面是时间 t 的纯函数**。先用话把内容说清楚，把每一句话写成脚本，配音合成后拿到逐词时间，画面按这个时间去定格 —— 于是配音、字幕、画面天然咬合，不需要剪辑。

| 你要的东西 | 用哪一步 | 产物 |
| --- | --- | --- |
| 一份讲稿 | 手写 `lessons/<集>/script.json` | 分镜 + 旁白 + 出现时机（`cue`） |
| 配音 + 时间轴 | `python lib/tts.py lessons/<集>` | `audio/narration.wav`、`lesson.json` |
| 逐帧画面 | `node lib/render.mjs --dir lessons/<集>` | `frames/f_00000.jpg…` (30fps) |
| 成片 + 字幕 | `python lib/build.py lessons/<集>` | `out/<id>.mp4`、`<id>.srt` |
| 封面 | `node lib/cover.mjs --data covers/covers.json --out covers/out --sizes 1920,1440` | 1080×1920 与 1080×1440 两张 PNG |

写成一条链（GPU 无关，纯 CPU，3 分钟的片子约 5 分钟出片）：

```bash
python lib/tts.py lessons/ep01          && \
node   lib/render.mjs --dir lessons/ep01 && \
python lib/build.py lessons/ep01
```

**动手前先跑自检**（10 秒，不出帧）：

```bash
node lib/render.mjs --dir lessons/ep01 --check
```

它报三件事：内容有没有越过 y=1470 的字幕安全线、代码行有没有被卡片裁掉、标题折行有没有剩下孤字。三项全过再花几分钟渲染。

## 一、把工具包放进项目

技能目录里的 `kit/` 就是全部工具，复制到项目下当 `lib/` 用：

```bash
mkdir -p <项目>/lessons/<集名> <项目>/covers
cp -r <技能目录>/kit/* <项目>/lib/
```

`kit/` 六个文件，各管一件事：

| 文件 | 作用 |
| --- | --- |
| `tts.py` | edge-tts 逐幕配音，拿逐词边界，写出 `lesson.json`（时间轴 + 字幕）+ `narration.wav` |
| `render.mjs` | Playwright 逐帧截图；`--check` 只自检；`--scale 0.5` 低清预览 |
| `build.py` | ffmpeg 合成 H.264/AAC、响度归一、`+faststart`，顺带写 SRT |
| `deck.html` | 课件本体，一种 1080×1920 版式，幕类型见第三节 |
| `cover.mjs` / `cover.html` | 封面图（9:16 视频首图 + 3:4 主页封面） |

**依赖**（缺哪个装哪个）：

| 依赖 | 装法 | 备注 |
| --- | --- | --- |
| Python 包 | `pip install edge-tts imageio-ffmpeg` | `imageio-ffmpeg` 自带 ffmpeg 二进制，不用单独装 ffmpeg |
| Node 包 | 任意可用的 `playwright-core` | 用 `PLAYWRIGHT_MODULE` 指到它的路径即可，不必装进本项目 |
| 浏览器 | 任意 Chrome / Chromium 可执行文件 | 用 `CHROME_PATH` 指过去 |

两个环境变量（Windows / Linux 都一样，`render.mjs` 与 `cover.mjs` 都认）：

```bash
PLAYWRIGHT_MODULE=/path/to/node_modules/playwright-core \
CHROME_PATH=/path/to/chrome.exe \
  node lib/render.mjs --dir lessons/ep01
```

## 二、脚本 `script.json` 怎么写

顶层字段：

| 字段 | 含义 |
| --- | --- |
| `id` | 集目录名与成片名（`out/<id>.mp4`），如 `ep01-regression` |
| `series` / `episode` / `brand` | 系列名 / 集标题（只在日志里用）/ **画面左上台标文字** |
| `wm` | 画面右上角水印文字；不给就整块隐藏（模板里没有任何固定文案） |
| `mark` | 台标方块的字母；不给就取 `brand` 的首字 |
| `voice` / `rate` | edge-tts 音色与语速，如 `zh-CN-YunxiNeural` / `+18%` |
| `gap` | 每幕之间的静音秒数，默认 0.35；一口气讲完的系列用 0.3 |
| `scenes` | 幕数组，见下 |

每一幕：`id`（幕内短名，用来命名音频）、`type`（版式）、`narration`（**这一集真正要讲的话**），其余字段按 `type` 取。

| `type` | 特有字段 | 用途 |
| --- | --- | --- |
| `title` | `kicker` `title` `sub` `tags[]` | 开场：大标题 + 一句副标题 + 三两个标签 |
| `points` | `kicker` `title` `items[]` | 要点幕，`<em>` 标蓝关键词 |
| `math` | `kicker` `title` `steps[{label,formula,hi}]` | 公式卡，`hi: true` 把某张卡高亮；≥4 张自动切紧凑版式 |
| `code` | `kicker` `title` `file` `code` `code_reveal` | 代码卡，`code` 用 `\n` 分行，逐行出现 |
| `source` | 同 `code`，另加 `notes[]` | 代码 + 下方 2–3 条注记（读库源码时用） |
| `outro` | `kicker` `title` `sub` `cta` | 结尾 + CTA 按钮 |

### 出现时机：写 `cue`，不写秒数

任何元素上写 `"cue": "关键词"`，`tts.py` 会在**配音的逐词时间**里找这个关键词，把元素出现的时刻标成 `at`（相对本幕秒数，比人声早 0.15s）。

- 关键词必须**真的出现在同一幕的 `narration` 里**（`cue_time` 按去掉空白的字符流做子串匹配），否则静默失败、元素永不出现；
- 想要 CTA 晚点出，就写 `"cta_cue": "关注"` —— 任何 `<名>_cue` 都会解析成 `<名>_at`；
- 已经手写了 `at` 的不会被覆盖，两种写法可以混用；
- 中文数字按念法写关键词：旁白念「负二点三四」，cue 就写 `负二点三四`，别写 `-2.34`。

### 字数与节奏（实测）

中文旁白约 **5.9 字/秒**（`rate` 为 `+18%`、`zh-CN-YunxiNeural`）——**3 分钟 ≈ 1070 字**，按这个数分配每一幕。写完先估一遍，别等合成完才发现超时。

## 三、画面规矩（都在 `kit/deck.html` 里，改一处全片生效）

**安全区**：抖音等 App 的按钮、状态栏会压住画面边缘，所以两侧和上部必须留白。当前版式：

| 位置 | 数值 |
| --- | --- |
| 场景内边距 | `padding: 300px 185px 450px 150px`（上 / 右 / 下 / 左） |
| 内容可用区 | 宽 **745px**、高 **1170px**（y=300 → y=1470） |
| 左上台标 | `left:150px; top:172px` |
| 右上水印 | `right:178px; top:180px` |
| 字幕带 | y=1470 起，两行 46px/36px，居中 860px 宽 |

由此推出两条硬约束：

1. **内容底边 < 1470**（否则盖住字幕）；
2. **代码行 ≤ 约 55 个西文字符**（卡片内宽 697px ÷ 等宽字体 12.65px/字；实测 51 字符安全）。代码里长行放不下就换行、或把变量名缩短，别指望它自己折 —— `.card-bd` 是 `overflow:hidden`，超了会被**悄悄裁掉**。

另外两点：

- `kicker` 会被 CSS `text-transform:uppercase`，**别在 kicker 里写希腊字母或中文以外的敏感字形**；
- 标题用了 `text-wrap:balance`，折行时左右均衡，避免最后一行只剩一两个字。

## 四、封面 `covers.json` + `covers/out/`

```bash
PLAYWRIGHT_MODULE=… CHROME_PATH=… \
  node lib/cover.mjs --data covers/covers.json --out covers/out --sizes 1920,1440
```

每条封面一个对象：`id`（文件名前缀）`no`（集号，右上角大数字）`brand` `wm` `cta` `titleLines[]`（**自己写好断行**，最后一行自动标蓝）`subLines[]`（每行别超过约 20 字，多了会折成三行）`pills[]`（三个标签）`tag`（可选，接在「第 N 集」后面）`foot`（左下角一行）。

一次出两张：`<id>-9x16.png`（1080×1920，视频首图）和 `<id>-1080x1440.png`（1080×1440，主页封面）。

## 五、发布物料

写进项目的 `covers/copy.md`，一集一段：**标题**（一句话，最好带一个真实数字）、**文案**（三行要点 + 每行一句解释）、**标签**。

- 抖音描述**标签最多 5 个**（如 `#Kaggle #机器学习 #分类 #逻辑回归 #Python`），多了不显示；
- 文案里的数字**必须是片子里真跑出来的**，不要编——这一条比排版重要得多。

## 六、踩过的坑

1. **Python 找不到 stdout 编码（Windows）**：控制台是 GBK，任何 `print` 中文或 `python -c` 都会 `UnicodeEncodeError`。所有 Python 调用前加 `PYTHONUTF8=1`。
2. **`edge-tts` 偶尔空手而归**（`NoAudioReceived`）：`tts.py` 里已带 4 次重试，别自己再包一层；真的是网络断了再排查。
3. **必须显式要 `boundary="WordBoundary"`**：edge-tts 7.x 默认按句返回边界，拿不到逐词时间，字幕就贴不上人声。
4. **Python 写回的 JSON 是 CRLF**：要改已经生成过的 `lesson.json`，别用文本替换，改用 Python 脚本读写。
5. **帧序列很占地方**：3 分钟的片子约 1.5 GB（5511 张 JPEG）。确认成片没问题后可以删 `lessons/<集>/frames/`，要重渲再跑一次 `render.mjs`。
6. **渲染前千万别跳过 `--check`**：内容越线、代码被裁、标题孤字，这三类问题在成片里很难发现，在自检里一眼就能看到。
7. **帧数与时间轴不符**：`build.py` 会比对帧数与 `duration × fps`，差超过 2 帧就报警 —— 那通常说明渲染中途被打断了，重渲。
8. **`PLAYWRIGHT_MODULE` 指的必须是 playwright-core 的目录**（含 `package.json` 的那层），不是 `playwright`。

## 七、边界

- 画面是**时间 t 的纯函数**，没有 CSS 过渡、没有随机数：同一份 `script.json` 每次渲染结果一致，改一句话重渲即可，不需要剪辑软件。
- 这套版式只做 1080×1920 竖屏；横屏或方形要另做版式（`deck.html` 的 `html,body` 宽高与场景内边距是硬编码的）。
- 配音只走 edge-tts（免费、无需密钥）。要换别的 TTS，替换 `tts.py` 里的 `synth()` 即可，其余步骤不用动。
