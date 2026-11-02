# 安装插件之后那次重读失败时，原因留在页面上，不再只活六秒

- **日期：** 2026-11-03
- **类型：** fix
- **范围：** `web`
- **破坏性：** 无

[English](2026-11-03-plugins-refresh-refusal.md)

设置 →「插件」的沙盒卡片在开关打开、而机器报告没有适用于其操作系统的后端时会问是否安装 ——
安装走的是插件页那条路，装完之后卡片上的**实况**（提示、按钮、后端报告）要重读一次才跟得上。安装
本身会按包各报一条通知，但那次重读要是失败，此前只多一条六秒的通知：卡片上仍写着「这个系统没有沙盒
后端」，六秒之后屏上再没有任何东西解释它为什么没变。

现在这类失败那句话留在页面上、卡片的上方：`role="alert"`（页面上只有这句在说状态，所以会被读出），
内容是本机或那台机器的名字加上这次读失败的原因，末尾说明**卡片上的状态可能仍是安装前的**。它留到换
机器、重新打开这一页（一次新的读）或另一次读成功为止 —— 安装已经落地，重读就是靠重新打开这一页。

## 细节

- `packages/web/src/features/settings/plugin-config-read.ts`：新增 `pluginConfigStale(machineName,
  reason)`，与已有的 `pluginConfigUnreadable` 并排 —— 后者说的是「什么都没读到、页面底下是空的」，
  前者说的是「卡片还在，但内容是安装前的」，两句话不能互换。
- `packages/web/src/lib/strings{,-en}.ts`：新增 `plugins.machineStale` / `plugins.thisServerStale`，
  与「无法读取插件」那两句挨着；本机仍然用自己的句式（选择器上那个「本机」塞进机器句式里读不通）。
- `packages/web/src/features/settings/plugins-section.tsx`：`loadError` 收成 `readError`（两种来源：
  挂载时那次读、安装之后那次重读），画的位置不变；`installOffered` 的 `catch` 从 `toastError` 改成
  写这句；读成功时清掉。安装的逐包通知一条没动。

## 测试

- `packages/web/test/plugin-config-read.test.ts`（扩 5 条）：点机器的名字 / 本机用自己的句式 / 原因原样
  带过去 / 与「什么都没读到」那句不是同一句 / 跟着界面语言走。
- `packages/web/e2e/plugins-backend-refresh-refusal.spec.mjs`（新，真服务端一条）：配置读与安装写都桩在
  `page.route` 上 —— 打开沙盒开关、确认安装、安装落地（有它自己的通知）、紧接着的重读以 500 `internal`
  失败：页面上一条句子、通知区没有这条原因，七秒后句子还在；把拒绝放开、离开这一页再回来，句子消失、
  卡片重新读出来。

## 兼容

- 接口、请求与存储都没变：还是同一次 `GET /api/admin/plugin-config`。改变的只有「安装之后那次读失败」
  画在哪里 —— 从一条通知挪到卡片上方。
