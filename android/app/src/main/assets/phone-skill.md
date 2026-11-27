---
name: phone-control
description: 操作这台安卓手机 —— 读屏、点按、输入文字、滑动、打开别的应用、截图。Adelie 手机操控已经装在这台设备上，用户让你动手机时用它。
---

# 手机操控

这台手机上的 Adelie 自带「手机操控」：通过系统无障碍服务读屏、点按、输入、滑动、打开别的应用、截图。
只在用户明确让你操作手机时使用；做完记得收尾。

## 先自检

用的是 App 自己注册的无障碍服务，不是 shell 的 adb 权限。所以**不要**去试
`input tap` / `uiautomator dump` / `screencap` / `am start` —— Adelie 以自己的 uid 跑，
这些必然被 `SecurityException` / `Permission Denial` 挡回来，跑一遍只会得出错误的结论。

第一句先跑自检，它一次说清能不能用、缺哪样、要让用户做什么：

```bash
node "$ADELIE_HOME/tools/phone.js" doctor
```

- `ok:true`：无障碍和控制口都在，直接 `screen` 开始。
- `accessibility:false`：无障碍没开，把 `next` 里那句话原样告诉用户（系统设置 → 无障碍 →
  「Adelie 手机操控」），等用户开完再跑一次 `doctor`。
- `control:false`：Adelie 的后台服务没起来，让用户回到 Adelie 主界面停一下或重启 App。
- `skill` 是这套用法装进了几个 Agent；`agents` 列出它们的名字，排查「为什么别的 Agent 不知道」用。

## 连接信息

端口和 token 每次启动都会换，放在 `$ADELIE_HOME/phone-control.json`：

```json
{"port": 41234, "token": "…", "url": "http://127.0.0.1:41234/cmd"}
```

## 怎么调

推荐用随包带的命令行（不需要拼 JSON）：

```bash
node "$ADELIE_HOME/tools/phone.js" screen                    # 读当前界面
node "$ADELIE_HOME/tools/phone.js" tap '{"text":"发送"}'      # 按文字点
node "$ADELIE_HOME/tools/phone.js" tap '{"index":7}'         # 按编号点（编号来自最近一次 screen）
node "$ADELIE_HOME/tools/phone.js" text '{"text":"你好"}'     # 往输入框写字
node "$ADELIE_HOME/tools/phone.js" long_press '{"text":"天气"}'  # 长按（叫出菜单）
node "$ADELIE_HOME/tools/phone.js" key '{"name":"enter"}'     # 输入法的回车/搜索/发送
node "$ADELIE_HOME/tools/phone.js" key '{"name":"back"}'
node "$ADELIE_HOME/tools/phone.js" open '{"name":"微信"}'
node "$ADELIE_HOME/tools/phone.js" apps
node "$ADELIE_HOME/tools/phone.js" screenshot                # 存成文件，返回路径
node "$ADELIE_HOME/tools/phone.js" task '{"op":"stop"}'
```

也可以直接 POST（安卓上不一定有 curl，用 node）：

```bash
node -e 'const i=require(process.env.ADELIE_HOME+"/phone-control.json");fetch(i.url,{method:"POST",headers:{"X-Adelie-Token":i.token,"Content-Type":"application/json"},body:JSON.stringify({action:"screen"})}).then(r=>r.text()).then(console.log)'
```

## 动作一览

| action | 参数 | 作用 |
| --- | --- | --- |
| `doctor` | — | 自检：无障碍 / 控制口 / 技能装了几份 + 下一步该怎么办（不能操作时也答得出） |
| `screen` | `max?` | 读当前界面：带编号的控件清单（文字/描述/边界/可点）+ 结构化 `tree` |
| `tap` | `index` 或 `text`/`desc`/`id`/`exact`，也可 `x`+`y` | 点控件或坐标 |
| `text` | `text`，可带 `index` | 往输入框写字 |
| `swipe` | `x1,y1,x2,y2,duration?` | 滑动/滚动 |
| `long_press` | `index`/`text`/…，也可 `x`+`y`；`duration?`（默认 800ms，最长 5 秒） | 长按控件叫出菜单（聊天消息、桌面图标、文件都靠它） |
| `key` | `name`: back/home/recents/notifications/quick/enter | 系统按键；`enter` 是输入法的回车 / 搜索 / 发送 |
| `open` | `package` 或 `name` | 打开应用 |
| `apps` | `filter?` | 可启动的应用清单 |
| `screenshot` | `quality?`，`format?: jpeg|png` | 截图（Android 11+），脚本会落盘 |
| `wait` | `text`/`desc`/`id`/`className` + `timeout?`/`interval?`/`gone?`；也可 `package`；或 `until:"still"`；或只给 `ms` | 等某个控件出现（`gone` 等它消失）、等前台换应用、等界面不再变（`until:still` 直接把这一屏带编号返回）；只给 `ms` 就是纯等一会儿 |
| `scroll_to` | `text`/`desc`/`id`/`className` + `max?`/`dir?` | 一屏一屏翻着找，找到给编号（`max` 默认 4、上限 10；`dir:up` 往上翻） |
| `task` | `op`: start/stop/status | 开/停一轮手机任务 |
| `journal` | `limit?` | 看这一轮做过哪些步骤（也写在 `$ADELIE_HOME/phone-journal.jsonl`） |
| `projection` | `op`: status/grant/stop/launch（`launch` 要 `package`） | 后台屏：授权、在虚拟显示上启动应用 |
| `capture` | `maxWidth?`、`quality?` | 后台屏画面（JPEG base64，脚本会落盘） |

## 长按与回车

很多菜单只藏在长按里，而搜索框、聊天输入框往往没有可点的「发送」，只能按输入法上的回车：

```bash
node "$ADELIE_HOME/tools/phone.js" long_press '{"text":"昨天那条消息"}'   # 长按消息叫出菜单
node "$ADELIE_HOME/tools/phone.js" long_press '{"x":540,"y":1200}'       # 坐标长按
node "$ADELIE_HOME/tools/phone.js" text '{"text":"天气"}'
node "$ADELIE_HOME/tools/phone.js" key '{"name":"enter"}'                # 相当于按输入法的「搜索」
```

- `long_press` 先找控件自己声明的长按能力，没有再退成「在控件中心按住 800ms」，两种都能叫出菜单。
- 长按之后界面通常会变（弹出菜单），先重新 `screen` 再选下一项。
- `key enter` 只在 Android 11 及以上可用；返回 `error=unsupported` 就说明这台系统给不了，
  改成点界面上的发送 / 搜索按钮。

## 后台屏（试验）

把被操作的应用放到一块虚拟显示上跑，用户自己的屏幕还能继续用。手机需要先授权一次
（系统会弹「开始录制或投屏」），用户点允许之后：

```bash
node "$ADELIE_HOME/tools/phone.js" projection '{"op":"status"}'
node "$ADELIE_HOME/tools/phone.js" projection '{"op":"launch","package":"com.tencent.mm"}'
node "$ADELIE_HOME/tools/phone.js" screen '{"display":"virtual"}'
node "$ADELIE_HOME/tools/phone.js" tap '{"display":"virtual","text":"搜索"}'
node "$ADELIE_HOME/tools/phone.js" capture          # 后台屏当前画面
```

- 后台屏上**不能按坐标点**（系统只允许默认显示收手势），要用 `index` 或 `text` 指定控件。
- 有些系统不允许把别的应用启动到虚拟显示，这时 `projection launch` 会返回
  `error=launch_on_display_failed` 并带上原因；不要硬试，退回默认显示操作，并告诉用户。
- 没授权时 `screen {"display":"virtual"}` 返回 `error=no_virtual_window`，
  `capture` 返回 `error=projection_off`。

## 等界面（比 sleep 靠谱）

点完之后下一屏什么时候出来没有准数。与其 `wait {"ms":1500}` 赌一把，不如等下一屏的关键字：

```bash
node "$ADELIE_HOME/tools/phone.js" tap '{"text":"发送"}'
node "$ADELIE_HOME/tools/phone.js" wait '{"text":"已发送"}'            # 等出现，默认最多 8 秒
node "$ADELIE_HOME/tools/phone.js" wait '{"text":"发送中","gone":true}'  # 等它消失（加载框、转圈）
node "$ADELIE_HOME/tools/phone.js" wait '{"package":"com.tencent.mm","timeout":5000}'  # 等前台换应用
```

- 条件口径和 `tap` 一样：`text` 是包含匹配，`exact:true` 才要求完全相等；也能用 `desc`、`id`、`className`。
- `timeout` 默认 8000 毫秒，最长 20000；`interval` 默认 250 毫秒（两次读屏之间）。
- 命中返回 `found:true` 和那个控件的 `label`/`bounds`，**不**给编号 —— 要动手先 `screen`。
- 没等到返回 `ok:true, found:false`，`note` 里写着等了几秒：这时先 `screen` 看停在哪一屏，
  再决定重试、换做法，还是问用户。别把 `found:false` 当成失败去重试同一个死循环。
- 等的时候用户按了暂停，会立刻返回 `error=paused`。

### 不知道会出现哪段字时：等它稳下来

刚打开一个应用、刚点完一个异步提交，你并不知道下一屏会写什么。这时别猜关键字：

```bash
node "$ADELIE_HOME/tools/phone.js" open '{"name":"微信"}'
node "$ADELIE_HOME/tools/phone.js" wait '{"until":"still"}'      # 等界面不再变，把这一屏带编号交出来
node "$ADELIE_HOME/tools/phone.js" tap '{"index":3}'            # 编号就是上一句给的，直接点
```

- 返回形状和 `screen` 一模一样（`text` 清单 + `tree`），**编号也是这一屏的**，省掉一次 `screen`。
- 连读两屏控件清单一样才算稳；一直在变（时钟、倒计时、视频）时返回 `stable:false` 加眼下这一屏，
  不是错误，接着动就行。
- `settle`（默认 300ms）是判断「稳」要求两次读屏之间至少隔多久，`timeout` 同 `wait`。

### 长列表里找不到：滑着找

聊天列表、联系人、设置页经常一屏装不下，按文字找不到不代表没有：

```bash
node "$ADELIE_HOME/tools/phone.js" scroll_to '{"text":"张三"}'         # 往下翻最多 4 屏
node "$ADELIE_HOME/tools/phone.js" scroll_to '{"text":"张三","max":8}'  # 多翻几屏
node "$ADELIE_HOME/tools/phone.js" scroll_to '{"text":"桌面与壁纸","dir":"up"}'
```

- 找到时返回 `found:true`、`scrolled`（翻了几屏）、`index` 与 `hit`：`index` 就是这一屏的编号，
  下一条直接 `tap {"index":…}`。
- 翻到上限还没找到返回 `found:false`，这时别继续瞎翻：换个说法、换方向，或者先 `screen` 看看
  是不是根本不在这个页面。
- 别自己估着 `swipe` 一串：滑着找会一屏一屏读着确认，滑过头了也知道自己在第几屏。

## 规矩

- 先 `screen` 看清界面再动手，别凭坐标猜；编号只在最近一次 `screen`、`wait until:still`
  或 `scroll_to` 里有效。
- 发送、删除、付款、下单、安装/卸载、授权，以及打开别的应用之前，手机上会弹确认卡等人点。
  返回 `error=cancelled` 表示用户取消了 —— 不要换个说法重试，先问用户想怎么办。
- `error=accessibility_off`：用户把无障碍关了，请让用户去 设置 → 手机操控 → 无障碍服务 打开，
  开完再 `doctor` 确认一次。
- `error=app_not_allowed`：当前前台的应用不在用户设定的「允许操作的应用」名单里，
  这一条不要绕过，告诉用户是谁被挡住了，由用户决定要不要把它勾进名单。
- `error=paused`：用户按了胶囊上的暂停，等用户点「继续」。
- 一轮任务 3 分钟没有新动作会自动结束；屏幕上胶囊的「停止」也会结束。
- 密码、验证码、支付步骤交还用户，不要代劳，也不要把它们读出来。
- 任务做完调 `task {"op":"stop"}` 收起浮层；用户说「停」的时候立刻停。
