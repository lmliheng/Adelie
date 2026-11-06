# 输入框能听写了：加号旁边多一个麦克风，识别在服务器上做

- **日期：** 2026-11-07
- **类型：** feature
- **范围：** `server`、`web`、`ui`
- **破坏性：** 否

[English](2026-11-07-speech-input.md)

此前进入一个 Session 只有键盘一条路。输入框现在多一个麦克风按钮，录下的音频转成文字落进草稿框，发送前
还能读一遍、改一改。

识别在**服务器**上做，不在页面里。桌面外壳没有 Web Speech API，把识别放浏览器里会让同一个账号在网页版
和桌面版上表现不同；密钥也因此只留在这台服务器上，不随每个打开页面的浏览器下发。页面发出去的是录音本身，
沿用会话自己的凭据，且不会写进磁盘任何一处。

用哪个服务来识别是「服务器」分组里的一项设置，与其它部署级设置同一种形态：服务地址、模型 ID、API 密钥。
密钥是只写的，和项目里的模型凭据一样 —— 设置页读回来的是「有没有存过」，不是密钥本身，管理员只改模型时
不必重新贴一遍密钥。

## 一套协议，两个地址

实时语音模型由阿里百炼自己提供，也被它前面的一层网关转售。两家在各自的路径上说同一套协议，所以**区别只
在地址**：

| 地址 | 端点 |
|---|---|
| `https://tokendance.space`（默认） | `wss://…/gateway/alibaba/api-ws/v1/inference` |
| `https://dashscope.aliyuncs.com` | `wss://…/api-ws/v1/inference` |

一句录音一条 WebSocket：`run-task` 帧报出模型与音频格式，录音按约 100 ms 一帧发送，然后 `finish-task`；
转写以 `result-generated` 帧回来，`task-finished` 结束。两边用的是同一个模型 ID
`qwen-audio-3.1-asr-flash-streaming`，变的只有地址。

## 一句话会来很多次

服务不是把一句话发一次就完。它还在识别这一句时会带着同一个 `sentence_id` 再发一次、多出几个字。逐帧拼接
就会把每个词按被修正的次数重复出来 —— 这里的第一版正是这么做的，是协议本来的形态（记在参考应用的设计笔记
里）把这件事揪出来的。现在，带句子编号的帧覆盖该句已存下的文字，各句按首次出现的顺序相接；不带编号的帧只在
被标记为收尾时才算一句，那是网关自己的示例打印的形态。

盯着真服务发完 16 秒语音：它对同一个 `sentence_id: 1` 改了大约二十次 ——
`"" → "呵" → "呵我" → "呵，5月见" → "呵，5月见派" → "呵，五岳剑派，哎呀呀" → …` —— 并且从头到尾
**没有一帧 `sentence_end` 为真**，连 `task-finished` 之前的最后一帧也不是。所以转写只能从一次次修正里
拼出来，不能等那个标志：真按 `sentence_end` 收尾，这段代码会一个字都拿不到。

## 录音这一侧

- 点一下开始录，按钮变成结束它的入口，再点一下结束并识别。两个在途状态各自有说明：录完了没人按结束，与正在
  识别，看上去一模一样，但只有一种在等用户动手。
- 音频在页面里解码、混成单声道，按 16 kHz 的 16 位 PCM 发出 —— 协议上的采样率 —— 浏览器挑了什么容器都到
  不了服务那边。
- 两件事说在草稿框那儿，而不是丢进一条自己会消失的通知：录到一片安静（「没有听清，请再说一次。」），以及
  还没开录就被拒的麦克风。服务自己的拒绝 —— 密钥不被接受、账号用不了这个模型、账号欠费 —— 按服务商的原话
  显示，那句话点明了该改什么，而该改的地方就在设置页。

## 明细

- `packages/server/src/services/asr.ts`（新）：这套协议，一句录音一条 WebSocket，帧排成有序队列，卡住的
  服务表现为超时而不是挂住请求；转写按上面的规矩按 `sentence_id` 归并。
- `packages/server/src/http/routes/asr.ts`（新）：`GET|PUT /api/asr/config` 归管理员（密钥在这儿）；
  `POST /api/asr/transcribe` 归任何已登录用户。PUT 里空着或没给 `apiKey` 就沿用已存的那把，且每个字段都
  先校验完再落盘。
- `packages/server/src/db/repos/server-settings.ts`、`.../mechanisms/settings.ts`：这三个取值，多出
  一组设置。
- `packages/web/src/lib/asr-audio.ts`（新）：解码、混单声道、重采样、PCM16、base64。
- `packages/web/src/features/chat/use-asr-recorder.ts`（新）：录音的状态机
  （`idle | recording | transcribing`）与它的提示。
- `packages/web/src/features/settings/asr-section.tsx`（新）与 `.../settings-dialog.tsx`：「服务器」
  分组下的「语音输入」页，仅管理员。
- `packages/web/src/features/chat/chat-input.tsx`：麦克风按钮，以及输入框上方那一行提示。
- `packages/ui/src/components/icons/icons.ts`：新增 `microphone` 图标。

## 测试

- `packages/server/test/asr.test.ts`（新，17 条，对着一个本地说这套协议的套接字跑）：`Authorization`
  头、模型与音频参数、音频本身的字节数、`finish-task`、多句按到达顺序拼接、被修正的一句只算一次、没有编号
  的收尾句、空结果算成功、`task-failed` 按服务原话读回、服务不可达、各条拒绝（空音频、奇数长度、超过时长
  上限、不受支持的采样率、非管理员来读密钥、非法地址不落盘），以及两类地址各自解析出的端点。
- `packages/web/test/asr-audio.test.ts`（新，7 条）：解码、混单声道、重采样、PCM16 转换与 base64 ——
  含立体声与不是录音采样率的那种输入。
- `packages/web/e2e/asr-dictation.spec.mjs`（脚手架里；真浏览器、真服务端、一个假语音服务）：设置页存下
  地址、模型与密钥，服务端读回 `hasKey`；随后 Chromium 的假麦克风播放一个 WAV 文件，按钮录到真音频，服务
  答的那句话落进草稿框。
- `packages/server/test/hot-replace.test.ts`：设置替身补上这两个新方法。

## 对着真服务验过

起了一个临时服务器指向 `https://dashscope.aliyuncs.com`，用一把真的百炼密钥往 `/api/asr/transcribe` 发了
16 秒语音。跑了三次，每次约 3 秒，每次都回来：

> 呵，五岳剑派，哎呀呀，别用这种眼神看着我嘛，人家可是一片好心呢。听说你们掌门身体有恙，可要试试本宫这上等的丹药。

模型就是设置里那个 `qwen-audio-3.1-asr-flash-streaming`。在这之前，同一个账号回的是
`task-failed / Arrearage / Access denied, please make sure your account is in good standing` ——
这道闸会开也会关，关上时路由把那句话原样透出。（本机上那份参考实现，用同一把密钥、同一个端点、同一个模型
去跑，被拒的回事一模一样，所以那是账号状态，不是这条链路。）

## 兼容性

没有删任何接口。多一组设置，与其它设置一样按 KV 行存放；没配过的服务器行为不变 —— 麦克风按钮会说还没有
配置识别模型，并指向设置页。默认地址是网关那边的，因此手上已有词元跳动密钥的部署只需把密钥贴进去；手上是
百炼密钥的，把地址填成 `https://dashscope.aliyuncs.com`，模型不用动。
