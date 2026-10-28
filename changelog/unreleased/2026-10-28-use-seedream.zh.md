# Agent 能生成图片了：一句话，一张图落在工作区里

- **Date:** 2026-10-28
- **Type:** feat
- **Scope:** `plugins`, `core`, `docs`
- **Breaking:** no

[English](2026-10-28-use-seedream.md)

之前 Adelie 能出视频，却出不了图：方舟的图像生成（Seedream）不是对话模型、进不了模型库，插件里也没有
对应的一条。新插件 `use-seedream` 把这个缺口补上了 —— 一个零依赖的 Node 脚本，把提示词变成图片并落到
工作区，和视频那边的 `use-seedance` 并排。

同一个命令还覆盖了 Seedream 这家真正有意思的部分：最多 14 张参考图（本机文件直接内联，不用先传上去）、
一次最多 15 张的组图、**图层拆分**（1 张底图 + 最多 16 个可单独编辑的透明 PNG 图层，每层的 `z_index`、
名称和边界框都会回报），以及透明背景。

## 细节

- `plugins/use-seedream/skills/seedream/kit/seedream.mjs`（新增）：一次同步的
  `POST {base}/images/generations`，只发用到的参数（`size`、`sequential_image_generation`、
  `layer_decomposition`、`background`、`output_format`、`seed`、`watermark`），按回答里的 URL 下载
  或用 `b64_json` 解码，每个文件先写 `<name>.part-<pid>` 再改名 —— 半截的图不会顶替最终文件名。
  `WxH` 尺寸在本地按服务的像素区间（1280×720 … 4096×4096）先校一遍，写错算命令行错，而不是让服务回
  一个 400。退出码沿用视频插件：`0` 成功、`2` 命令行不对、`3` 缺 `ARK_API_KEY`、`4` 接口拒绝（服务原话
  在 `upstream` 里，含 `ModelNotOpen`）、`7` 图没下下来。
- 多图时 `--out` 当目录，文件名是 `<NNN>-z<z_index>-<名称>.<扩展名>`：序号管顺序，有层序就带上，名称用
  服务给的那个（没有就用 `base` / `layer`）。图层恒为 PNG。
- `plugins/use-seedream/skills/seedream/SKILL.md`（新增）：什么时候用、先说清计费（组图或图层拆分就是
  好几张在计费）、先确认凭据，以及一条要紧的：聊天里的 Markdown 图片语法解析不到工作区文件 —— 结果按
  路径交给用户，别写 `![]()`。
- `plugins/use-seedream/{plugin.json,README.md,icon.svg,LICENSE,package.json}`（新增）：打包与描述方式
  照 `use-seedance`，`category: office-productivity`。
- `packages/{core,cli,desktop}/package.json` 与 `pnpm-lock.yaml`：加 `@adelie/use-seedream: workspace:*`，
  所以它和视频插件一样是预装的。
- `packages/core/test/plugins.test.ts`：插件名单加 `use-seedream`（计数跟着到 23）；`plugins/README.md`、
  `README.md`、`README.zh.md`、`packages/docs/content/skills.{zh,en}.md` 各补一条 —— 仓库自带守卫就是
  拿这些表和插件库逐条对。
- `plugins/use-seedream/test/seedream.test.mjs`（新增）：10 条对本地桩服务的用例 —— 缺密钥、单图下载、
  组图请求体、图层拆分的命名与 `layers[]`、本机参考图内联、`b64_json` 落盘、坏参数、以及被拒不吞错误。

## 兼容

- 原有接口一个都没动：多了一个插件、插件清单里多一个名字。
- 默认模型是 `doubao-seedream-5-0-pro-260628`，换别的 Seedream 用 `--model`。
- **真实接口还没跑过**：密钥库里这把方舟 key 对应账号没有开通该模型（`ModelNotOpen`），所以以上全部是
  对桩服务验的，不是对服务验的。
