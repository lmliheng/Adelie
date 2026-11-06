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

用哪个服务商来识别是「服务器」分组里的一项设置，与其它部署级设置同一种形态：服务地址、模型 ID、API 密钥。
密钥是只写的，和项目里的模型凭据一样 —— 设置页读回来的是「有没有存过」，不是密钥本身，管理员只改模型时
不必重新贴一遍密钥。

## 录音这一侧

- 点一下开始录，按钮变成结束它入口，再点一下结束并识别。两个在途状态各自有说明：录完了没人按结束，与正在
  识别，看上去一模一样，但只有一种在等用户动手。
- 音频在页面里解码、混成单声道，按 16 kHz 的 16 位 PCM 发出 —— 流式协议文档上的采样率 —— 浏览器挑了什么
  容器都到不了服务商那边。
- 两件事说在草稿框那儿，而不是丢进一条自己会消失的通知：录到一片安静（「没有听清，请再说一次。」），以及
  还没开录就被拒的麦克风。服务商自己的拒绝 —— 密钥不被接受、账号用不了这个模型 —— 按服务商的原话显示，
  那句话点明了该改什么，而该改的地方就在设置页。

## 明细

- `packages/server/src/services/asr.ts`（新）：一句录音一条 WebSocket，走流式协议 —— `run-task` 报出
  模型与音频格式，音频按约 100 ms 一帧发送，`finish-task`，然后收 `result-generated` 的句子直到
  `task-finished`。传输层的形态不出这个文件：帧排成有序队列，握手与收帧之间不会丢东西，卡住的服务表现为
  超时而不是挂住请求。
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

- `packages/server/test/asr.test.ts`（新，15 条，对着一个本地说这套协议的套接字跑）：`Authorization`
  头、告诉服务商的模型与音频参数、音频本身的字节数、`finish-task`、多句按到达顺序拼接、空结果算成功、
  `task-failed` 按服务商原话读回、服务不可达，以及各条拒绝 —— 空音频、奇数长度、超过时长上限、不受支持的
  采样率、非管理员来读密钥、非法地址不落盘。
- `packages/web/test/asr-audio.test.ts`（新，7 条）：解码、混单声道、重采样、PCM16 转换与 base64 ——
  含立体声与不是录音采样率的那种输入。
- `packages/web/e2e/asr-dictation.spec.mjs`（脚手架里；真浏览器、真服务端、一个假语音服务）：设置页存下
  地址、模型与密钥，服务端读回 `hasKey`；随后 Chromium 的假麦克风播放一个 WAV 文件，按钮录到真音频，服务
  商答的那句话落进草稿框。
- `packages/server/test/hot-replace.test.ts`：设置替身补上这两个新方法。

## 兼容性

没有删任何接口。多一组设置，与其它设置一样按 KV 行存放；没配过的服务器行为不变 —— 麦克风按钮会说还没有
配置识别模型，并指向设置页。默认地址与模型是词元跳动的，因此手上已有词元跳动密钥的部署只需把密钥贴进去。

**端到端那一次是对着假语音服务验的，不是对着真服务商：** 手上这把词元跳动的密钥被词元跳动自己拒了
（`unauthorized / API 密钥不存在`），因此真识别结果还没有看到过。
