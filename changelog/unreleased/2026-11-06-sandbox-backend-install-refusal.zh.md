# 沙箱后端的安装没落地时，对话框留着：原因在框里，重试也在框里

- **日期：** 2026-11-06
- **类型：** fix
- **范围：** `web`
- **破坏性：** 否

[English](2026-11-06-sandbox-backend-install-refusal.md)

设置里的沙盒卡片，在开关被打开、而机器报告没有适用于其操作系统的沙盒后端时，会问要不要装这个系统的
默认后端。那次安装可能没让机器拿到后端 —— 服务端列出了这个包、但进程装不上，或者请求根本没得到答复
（它之后的包也不再尝试）。对话框过去一发出请求就关掉，唯一的交代是一条六秒后自己消失的通知 —— 而卡片
上仍写着「没有适用于其操作系统的后端」。

现在对话框在**全部装好**时关闭，而不是在请求发出时关闭。有东西没装上，它就留着：原因画在它自己的问题
下面（`role="alert"`，装不上的包用服务端自己的原话、失败的请求按错误码念本地化的那句），点名**还没装
上的包**，并且只提供这些 —— 它自己的「安装」按钮就是重试，重试也不会把已经装好的再装一遍，因为每次
安装都会重新装载服务器的插件、中止所有项目中正在进行的 Agent 运行。无论成败，卡片上那些实时状态都会
重读一次，所以真装上的东西看得见。

## 明细

- `packages/web/src/features/settings/sandbox-backend-refusal.ts`（新）：
  `backendInstallRefusal(failures, stopped, remaining)` —— 纯判断，念哪句话只在这一处，不依赖页面就能测。
- `packages/web/src/features/settings/plugins-section.tsx`：`installOffered()` 把这一轮失败收起来不再
  走通知，随后重读卡片的实时状态，只在什么都不剩时关闭对话框；否则把「要装的包」收窄成还缺的那几个，
  并留下那句话。「请先打开一个项目」那条前提也改成留在对话框里（它原本有同样的六秒问题）。
- `packages/web/src/features/settings/sandbox-backend-prompt.tsx`：多一个 `refusal` 属性，画在
  `ConfirmModal` 的拒绝槽里、问题的下面。
- `packages/web/src/lib/strings{,-en}.ts`：一对新文案 `sandboxBackendPrompt.installStopped(reason)` 与
  `sandboxBackendPrompt.installRefused(reasons, missing)`。

## 测试

- `packages/web/test/sandbox-backend-refusal.test.ts`（新，8 条）：全部装好时无话可说；装不上的包用服务端
  原话；失败的请求按错误码念本地化句子、不带线上英文原文；只点名还缺的包；已经有句号的理由不会叠成
  两个句号；多条理由都留着；本仓自己抛的值按原话念；跟着当前语言。
- `packages/web/e2e/sandbox-backend-install-refusal.spec.mjs`（新，3 条，真服务端 + 真浏览器）：安装桩成
  `internal` 时对话框留着、原因在框里而不在通知区，**7 秒后**仍在且「安装」按钮可再按，重按之后包真的
  装上、对话框关闭；装上了但加载不了的包用服务端原话；两个包的这一轮卡在第二个时只提供第二个，重试只
  发这一个。

## 兼容性

不碰接口、线上格式与已存数据，不引入新依赖。错误码念哪句话没有变（`refusalText`，7.19 的规则）。
