# 安全策略页说出规则表的上限，并在到顶时把「添加规则」关掉

- **日期:** 2026-11-14
- **类型:** 修复
- **范围:** `web`
- **破坏性变更:** 否

[English](2026-11-14-command-policy-rule-limit.md)

服务端把一份命令策略限制在 64 条规则，第 65 条只能换来一句 `rules exceeds 64 entries.`。页面过去既不
说明有这么一条上限，也不在它那里拦下：计数行只写「规则 · 64」，「添加规则」照样亮着，表单照样打开，规则
照样能填、能保存 —— 然后被拒，而那是整页第一次提到上限，且那句话说在被拒之后。

现在计数那一行在到顶时说出它，添加规则的入口在同一刻变成不可点：到顶时点它什么都不会发生（不是灰着却仍
能打开表单），删掉一条之后句子与按钮一起回来。数字与路由的 `MAX_RULES` 一致 —— 与这一页规则字段早就照着
服务端镜像字段长度上限是同一手法，区别是这次单测直接读服务端的源码对账，免得两边漂移。

## 细节

- `packages/web/src/lib/command-policy-rule-limit.ts`（新增）：`COMMAND_POLICY_RULE_LIMIT`（镜像
  `MAX_RULES`）与 `ruleLimitHint(count)` —— 未到顶时是 `null`，到顶（含已经超出）时是那句话。按钮与句子读
  同一个值，因此两者不会各说各的。
- `packages/web/src/components/layout/project-dialogs.tsx` 的 `SecurityPolicySection`：计数行把句子画在
  计数旁边（`data-testid="command-policy-rule-limit"`、告警色、最多两行），「添加规则」的 `disabled`
  加上这一条；「恢复默认」不受影响（它会把列表变短）。模块头注释里那句「失败弹通知」也顺手改正 —— 上一轮
  已经改成分句了。
- 词典（`strings.ts` / `strings-en.ts`）：一句带数字的说明。
- 没有接口变化、没有新依赖、服务端行为没变。

## 测试

- `packages/web/test/command-policy-rule-limit.test.ts`（新增，5 条）：还放得下时什么都不说；到顶时说出
  上限而且句子里有那个数字；已经超出（旧数据）时照样说；跟随当前词典；常量等于服务端路由里的 `MAX_RULES`
  （读服务端源码对账，与 `avatar-image.test.ts` 钉住头像上限同一写法）。
- `packages/web/e2e/command-policy-rule-limit.spec.mjs`（新增，2 条，真服务端 + 真浏览器）：项目存着 64
  条时，句子在、按钮 `disabled`、点它不会开出表单；删掉一条后两者一起回来、表单真能打开。少一条时什么都不
  说、按钮可点。
- `packages/web/e2e/command-policy-save-refusal.spec.mjs`（改）：上一轮那两条「被拒的保存」靠**表单加进
  第 65 条**触发，而这道护栏正是让它不可能再发生 —— 于是前提改成「项目存 63 条、表单补到 64 条，出站的那
  次 PUT 再多带一条」：给服务端看到的是旧版本才会存下的形状，校验、状态码与措辞仍是服务端自己的，页面没有
  被替身顶替。两条用例的断言一字未改。

## 兼容性

线上协议没变：同一个 PUT、同一套校验。变的是这一页在到顶时说清上限并挡住入口，而不是让第 65 条走到保存那
一步才被拒。
