# Adelie 宣传片（60 秒，Remotion）

这条片子是**用代码画出来的**，没有一帧来自截图或素材库：图标、界面、分数、账单都是 React
组件，时间线只有一个数组。仓库根的两份 README 首屏用它。

- **当前是第三版**：1920×1080 / 30fps / 1800 帧 / 60.0s，`npm run render` 出到
  `out/adelie-promo.mp4`。仓库根 README 首屏挂的还是第一版（`../assets/promo/adelie-promo.mp4`，
  57 秒）；换片 = 把这里渲出来的文件覆盖过去，再把首屏那行「57 秒」与封面换掉。
- **设计思路**：[`DESIGN.md`](DESIGN.md) —— 为什么这么拍：叙事、色板、构图、动效、事实依据。
  改样式之前先读它，尤其是「两个色板不许混」那一节。
- **交接稿**：[`DESIGN-HANDOFF.md`](DESIGN-HANDOFF.md) —— 这一版界面是手画的，和桌面端实际长得
  不一样；交给 Adelie Desktop 重做时照这一份走：真实截图基准在 [`reference/`](reference/)，里面写了
  九场分镜、真实 token 与尺寸、取画面的三种做法、验收清单。

## 跑起来

需要 Node ≥ 20 与一个本机 Chromium（`remotion.config.ts` 里的 `REMOTION_BROWSER`，默认
`/usr/bin/chromium`；换机器时改这一处或设这个环境变量）。

```bash
npm install

npm run studio     # Remotion Studio：浏览器里拖时间轴看每一场
npm run typecheck  # tsc --noEmit
npm run still      # 渲一帧看构图（默认第 0 帧）
npm run render     # 出整片 out/adelie-promo.mp4
```

单帧检查某一场的构图（最常用的一步：满幅构图要单独看四边有没有露出空白）：

```bash
npx remotion still Promo out/f430.png --frame=430
```

整片渲染在 8 核 / 无 GPU 的机器上大约 15–20 分钟（SwiftShader 软渲染）。**这台机器的
Chromium 会在 3–5 分钟后崩掉**（渲染器进程消失、node 端一直等，没有报错），整片一次渲不完，
所以带了一个分段脚本：每段 150 帧、每段一个全新的浏览器，崩了就重试，最后用图片序列拼回 1800 帧。

```bash
./render-chunks.sh              # 出 out/chunks/c-*.mp4，坏了就重试
```

拼接要走图片序列（各段的容器时长有 1–2 帧的误差，直接 `-c copy` 拼会多出重复帧）：

```bash
for f in out/chunks/c-*.mp4; do ffmpeg -i "$f" -vsync 0 -q:v 1 -start_number $n out/seq1/f%05d.jpg; done
ffmpeg -framerate 30 -i out/seq1/f%05d.jpg -c:v libx264 -crf 20 -pix_fmt yuv420p out/adelie-promo.mp4
```

## 时间线

`src/Promo.tsx` 的 `SCENES` 是唯一的时钟；`Root.tsx` 的 `durationInFrames` 从它来，
加一场或改时长只动这一处。

| # | 场景 | 帧 | 时长 | 讲什么 |
| --- | --- | --- | --- | --- |
| 1 | `open` | 0–120 | 4s | 图标落位、轨道画出、字标收拢 |
| 2 | `thesis` | 120–270 | 5s | 划掉「只会聊天」，换成「写一段话」 |
| 3 | `text` | 270–570 | 10s | **左边写 AGENTS.md，右边长出一个智能体** |
| 4 | `demo` | 570–840 | 9s | 一句话、六步工具调用、产出 docx |
| 5 | `skills` | 840–1080 | 8s | 技能 / 子代理 / 定时 / 记忆 |
| 6 | `evolve` | 1080–1350 | 9s | **评估找失分 → 改文本 → 62 → 78 → 91** |
| 7 | `cost` | 1350–1515 | 5.5s | 每一步的耗时与花费都记账 |
| 8 | `local` | 1515–1650 | 4.5s | 文件不出机器，模型随你换 |
| 9 | `close` | 1650–1800 | 5s | 字标 + 一句话 + 仓库地址 |

## 目录

```text
src/
  Promo.tsx      SCENES 数组 + 场景槽（5 帧快切，不压黑、不叠化）
  Root.tsx       注册 Promo composition（1920×1080 / 30fps）
  theme.ts       两套色板：C = 片子自己的（取自 v1 实帧），UI = 应用真实深色主题
  motion.ts      全片唯一一套缓动（rise 预跑 6 帧，切点即成型）
  Backdrop.tsx   纯黑 + 藏青椭圆辉光 + 点阵（挂在所有场景之外，切场不闪）
  BrandMark.tsx  应用图标（白牌 / 海军蓝企鹅 / 蓝色轨道）
  scenes/        九场，一场一个文件
```

## 三条约束

- **两个色板不许混。** 片子用 `C`（黑底 + 品牌蓝 `#4a8cff` / 轨道蓝 `#0258ee`），第 4 场的界面
  用 `UI`（抄自 `themes/github.css` 的 `.dark`）。给界面加品牌蓝、或把片子调成界面灰，都会让
  观众分不清哪是产品、哪是旁白。
- **画面要顶到边。** 安全边 64px，每场至少一条边出血；中间漂浮的版式会让画面四周显空。
  改完先渲 `still` 看四边，再出整片。
- **不写 14px 以下的字。** 1080p 在手机上看是 640 宽，小字会糊成灰块。
