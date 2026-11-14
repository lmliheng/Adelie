# 错误中心里撤销一条忽略规则被拒时，原因留在按下去的那颗按钮旁边

- **日期：** 2026-11-15
- **类型：** 修复
- **范围：** `web`

[English](2026-11-15-ignore-undo-refusal.md)

成本中心的错误面板里，「忽略这类异常」留下的通知条上有「撤销」，被忽略那一视图的规则行上有
「取消忽略」—— 两颗按钮发的是同一个 DELETE。被拒时两边屏幕上都一点没变：通知条还写着隐藏了
几条记录、按钮还亮着，规则也还列在那里，所以重试就是同一个按钮；缺的只是原因，而它落在一条六秒后
自己消失、还浮在页面顶部的通知里。一条规则删不掉的时候，读者最需要知道的恰恰是「这些记录仍然被
隐藏」，而屏幕上那个看起来没被碰过的页面不会说。

现在拒绝留在按下去的那颗按钮下面，按「哪一处问的 + 哪一条规则」定位，因此只会出现在按过的那一处：
通知条的「撤销」被拒，句子就在通知条里；规则行的「取消忽略」被拒，句子就在那一行下面，而页面上
另一处（同一条规则的通知条）不会替它说话。句子点名被沉默的那一类，并直说忽略规则还在、这些记录
仍被隐藏。每次尝试开始先清掉上一次那句，落地的那次一并清掉，本页不再为这两颗按钮弹通知。

顺带补上这条路径上唯一会真的出现的那句服务端拒绝：`ignore_rule_not_found`（别处已经撤销了这条
规则，或列表是旧的）此前没有中文说法，只能落到服务器那句英文原文 —— 现在它有了。

## 细节

- `packages/web/src/features/usage/ignore-undo-refusal.ts`（新增）：`ignoreUndoRefused(host, id,
  label, error)`，`host` 取 `notice` / `rule`；原因走 `refusalText`，句子在词典里。文件头写清为什么
  键里要有宿主（通知条与规则行指的是同一个规则 id，只按 id 分不出是哪一处问的）。
- `packages/web/src/features/usage/errors-panel.tsx`：新增 `undoRefusal` 状态；`unignore(host, id,
  label)` 每次尝试先清、被拒改为写这句话而不是弹通知；通知条与 `IgnoreRulesBox` 各在自己那一处画
  (`data-testid` 分别 `ignore-notice-undo-refusal` / `ignore-rule-undo-refusal`，`role="alert"`、危险色、
  限两行、整句停在悬停提示里)；`IgnoreRulesBox` 多一个可选的 `refusal` 入参，句子用 `basis-full`
  独占一行，规则的按钮原样留着。
- `packages/web/src/lib/strings.ts`、`strings-en.ts`：`usage.errorsUnignoreRefused(label, reason)`；
  `errors.byCode.ignore_rule_not_found` 中英各一句。

## 测试

- `packages/web/test/ignore-undo-refusal.test.ts`：服务端那条 404 读成词典里的中文而不是线上英文、
  宿主与规则 id 原样带回、句子说的是「规则还在」而不是「已恢复」、自己抬起来的失败保留原话、无话可说
  时落通用文案、跟随当前词典。
- `packages/web/test/errors-panel.test.ts`：两条规则、一条拒绝时，那句话只画在规则 id 对上的一行，
  两行的「取消忽略」都还在。
- `packages/web/e2e/errors-ignore.spec.mjs`：真服务端 + 真浏览器两条 —— 从通知条的「撤销」被拒（句子
  在通知条里、通知区没有按钮、七秒后仍在、规则与隐藏状态都没动，放行后同一个按钮落地）与从规则行的
  「取消忽略」被拒（句子在那一行、通知条不替它说话、规则仍是 1 条，放行后规则 0 条、记录回到「全部」）。
  拒绝是 `page.route` 给的 500，两侧的规则数与记录数都经 API 读回。

## 兼容性

没有接口变化、没有新依赖、没有配置变化。这两颗按钮被拒时原先会弹的通知没有了，改成它们各自位置上
的一行；新增的那句 `ignore_rule_not_found` 只影响文案。
