# 插件页读不出来时，原因留在页面上，不再只剩一个空页与一条六秒的通知

- **日期：** 2026-11-02
- **类型：** fix
- **范围：** `web`
- **破坏性：** 无

[English](2026-11-02-plugins-read-refusal.md)

设置 →「插件」按配置项一张卡片地画，而 `GET /api/admin/plugin-config` 回来之前它什么都不画。
在本机这条读失败时，留下的是一个空页，理由只进了一条六秒的通知 —— 六秒后屏上再没有任何东西说明
这页为什么是空的。选中的远程机器本来就在页面上说明原因，本机没有。

现在两种都把那句话画在卡片本该出现的地方，也不再是通知：一条 `role="alert"` 的提示条，远端机器
报出机器名，本机用本机自己的措辞。它一直留到换了机器或离开这一页再回来 —— 重新挂载即重新拉取，
那就是重试。这一页没有自己的重试按钮。

## 细节

- `packages/web/src/features/settings/plugin-config-read.ts`（新）：`pluginConfigUnreadable(name,
  reason)` —— 一次读失败变成的那句话：选中的机器点名，本机则用自己的说法，不把选择器上那个光秃秃的
  「本机」当成机器名塞进机器的句式里。
- `packages/web/src/features/settings/plugins-section.tsx`：水合失败时收成空列表并把那句话留下，
  本机与远程机器同一套；有那句话就画提示条（`role="alert"`），读这条路上不再 `toastError`。
  远程机器失败时说的是什么一个字没动。
- `packages/web/src/lib/strings{,-en}.ts`：新增 `plugins.thisServerUnreadable`，就在既有的
  `machineUnreadable` 旁边。

## 测试

- `packages/web/test/plugin-config-read.test.ts`（新，4 条）：机器点名、本机不点名、原因原样带过去、
  那句话跟着界面语言走。
- `packages/web/e2e/plugins-read-refusal.spec.mjs`（新，真服务端一条）：读被拒时 —— 页面上一条句子、
  一张卡片都没有、完全没有 toast、七秒后仍在；离开这一页再回来（重新挂载即重试）后句子消失，
  卡片画出来。

## 兼容

- 接口、请求与存储都没变：还是同一个 `GET /api/admin/plugin-config`。改变的只有失败时那句话画在哪里。
