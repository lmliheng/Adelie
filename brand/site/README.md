# brand/site — 设计规格页

`index.html` 是 Adelie 的品牌与界面设计规格，一页说清：标志构成（带尺寸标注的
技术图）、图标阶梯与小尺寸表现、配色、界面令牌、四端形态与截图、使用规则。

它没有构建步骤：一个 HTML 文件加一个 `assets/` 目录，`server.mjs` 是只用 Node
标准库写的静态服务器。**页面样式抄的就是 `packages/web/src/styles/global.css`
那一套 token** —— 看懂这一页的样式表，就看懂了 Adelie 的界面。

在线的那一份：

- 本机 / 公网：http://64.83.2.109:3004/ （systemd 单元 `adelie-design.service`）

## 本地看

```bash
node brand/site/server.mjs            # 默认 0.0.0.0:3004
PORT=8080 node brand/site/server.mjs  # 换端口
```

## 发布到服务器

```bash
bash brand/site/deploy.sh             # 拷到 /opt/adelie-design 并重启服务
```

`/opt/adelie-design` 是部署副本，这里才是源。改完页面跑一次 `deploy.sh`。

## 资源从哪来

| 路径 | 来源 |
| --- | --- |
| `assets/adelie-icon.svg`、`assets/adelie-glyph.svg`、`assets/preview.png` | `brand/` 下同名文件 |
| `assets/icons/*` | `brand/icons/` 整组（含 `adelie.ico`） |
| `assets/shots/*` | Web 端与端到端跑测时的截图（`scripts/e2e.mjs` 那一轮） |

主标志改了以后，`brand/render-icons.mjs` 重出位图，再把上面两组文件重新拷一遍；
`assets/shots/*` 是应用界面的截图，界面改了要重跑 `scripts/e2e.mjs` 再更新。
