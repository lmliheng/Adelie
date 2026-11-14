# Adelie 宣传片（60 秒，Remotion）

这条片子是**用代码画出来的**，没有一帧来自截图或素材库：图标、界面、分数、账单都是 React
组件，时间线只有一个数组。仓库根的两份 README 首屏用它。

- **本工程出的是第二版**：1920×1080 / 30fps / 1800 帧 / 60.0s，`npm run render` 出到
  `out/adelie-promo.mp4`。仓库根 README 首屏挂的还是第一版（`../assets/promo/adelie-promo.mp4`，
  57 秒）；换片 = 把这里渲出来的文件覆盖过去，再把首屏那行「57 秒」与封面换掉。
- **设计思路**： [`DESIGN.md`](DESIGN.md) —— 为什么这么拍：叙事、构图、色板、动效、事实依据

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

## 时间线

`src/Promo.tsx` 的 `SCENES` 是唯一的时钟；`TOTAL_FRAMES` 从它推导，加一场或改时长只动这一处。

| # | 场景 | 帧 | 时长 | 讲什么 |
| --- | --- | --- | --- | --- |
| 1 | `open` | 0–120 | 4s | 图标落位、轨道画出、字标收拢 |
| 2 | `thesis` | 120–270 | 5s | 把「只会聊天」划掉，换成「写一段话」 |
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
  Promo.tsx        SCENES 数组 + 场景槽（8 帧交叉淡化，不压黑）
  Root.tsx         注册 Promo composition（1920×1080 / 30fps）
  theme.ts         色板与字号——全部取自应用默认主题 themes/github.css 与图标
  motion.ts        全片唯一一套缓动
  PaperBackdrop.tsx 纸面网格 + 边缘文字（全片共用，转场因此不闪）
  BrandMark.tsx    应用图标（白牌 / 海军蓝企鹅 / 蓝色轨道）
  scenes/          九场，一场一个文件
```

## 两条约束

- **颜色不许自己发明。** 全片的彩色只有链接蓝 `#0b57d0`（应用里真实存在的强调色）与图标轨道蓝
  `#0258ee`；其余一律黑白灰。加新场景时照 `theme.ts` 取值，别再引入「科技感蓝」。
- **画面要顶到边。** 安全边 96px，每场至少一条边出血；中心漂浮的版式会让画面四周显空。
  改完先渲 `still` 看四边，再出整片。
