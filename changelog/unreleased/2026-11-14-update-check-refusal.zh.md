# 更新弹窗自己发出的「检查更新」被拒时，原因留在弹窗里、按钮也留在那儿

- **日期：** 2026-11-14
- **类型：** 修复
- **范围：** `web`

[English](2026-11-14-update-check-refusal.md)

**软件更新**弹窗会自己发一个「检查更新」：打开时（还没有任何结果、或上一次已经过时）、以及读者每次按下
「检查更新」。这个请求被拒时（我们自己的服务端不通、或答了 5xx），弹窗里什么都不变 —— 有上一次结果就
继续显示上一次结果，什么都不知道就**一直转着「正在检查更新…」**，而唯一说了原因的那条通知在弹窗开着时
根本不会弹（`if (!quiet())`），六秒后也就没有别的地方说了。

现在它和「下载并更新」「重启并更新」走同一个拒绝槽：句子画在正文末尾、也就是重试那颗按钮的正上方，
一直留到下一次尝试，标题点名是哪一步 ——「没能检查更新，这次没有问到结果：…」。它**不是**更新流程自己的
`error` 状态：那一个是服务端**答了**，说查了但查失败；这里请求根本没问到答案，说「检查更新失败」等于替
一个谁都没给出的回答背书。

什么都不知道时（本次加载的自动检查也被拒），正文不再转圈 —— 没有答案要来了，句子就是全部交代 —— 并且
底部补一颗「检查更新」，那是句子承诺的重试。桌面壳里，这一次请求被拒同样落在这个槽里（原因走
`apiErrorText`），与「壳自己报告检查失败」分开：后者是壳给的回答，正文里本来就有它的位置。

## 细节

- `packages/web/src/lib/update-request-refusal.ts`：`UpdateRequestStep` 加 `check`；文件头写清它与
  流程 `error` 状态的界线。
- `packages/web/src/lib/use-update-flow.ts`：`checkForUpdates()` 每次尝试先清槽（7.19 的规则），
  release 侧被拒改走 `refuseRequest("check", e)`；owner 收到客户端结算的 `refused` 时写同一个槽
  （弹窗关着才发通知，句子同样点名这一步）。
- `packages/web/src/lib/desktop-update.ts` / `use-desktop-update.ts`：结算种类多一个 `refused`
  （原因走 `apiErrorText`），与壳自己报的 `failed` 分开。
- `packages/web/src/components/account/update-modal.tsx`：`unknown` 且有拒绝时正文不再画 spinner；
  `unknown` 且有拒绝时底部给出「检查更新」。
- `packages/web/src/lib/strings.ts` / `strings-en.ts`：`checkRefused(reason)`。

## 测试

- `packages/web/test/update-request-refusal.test.ts`：`check` 那句不冒充 `checkFailed`、原样带原因、
  三句互不相同、中英两种语言。
- `packages/web/e2e/update-check-refusal.spec.mjs`：真服务端 + 真浏览器，两条 —— ①什么都不知道时
  打开弹窗（自动检查被拒）：句子在弹窗里、`role=alert`、没有 spinner、通知区没有按钮、七秒后仍在，
  底部那颗「检查更新」放行后落到「新版本 v9.9.9 可用」；②已有上一次结果时按「检查更新」被拒：
  句子在、上一次的结果原样在、七秒后仍在，放行后换上新结果。拿上一版产物跑，两条都红在找不到那句话。

## 兼容性

没有接口变化、没有新依赖、没有配置变化。桌面壳里「检查请求被拒」原先那条通知的措辞改成了这句
（关着弹窗时），其余通知不变。
