# 安全策略页的规则字段说出自己的长度上限

- **日期:** 2026-11-14
- **类型:** 修复
- **范围:** `web`
- **破坏性变更:** 否

[English](2026-11-14-command-policy-field-limit.md)

服务端把一条规则的三个字段分别限在名称 64、正则 512、描述 300 个字符上，页面的输入框也带着同样的
`maxLength`。上限落在输入框上，意味着**粘贴进来的一段更长的文本会被浏览器悄悄截掉后面那截**：屏幕上看不出
少了字，确认之后存下去的却是被截过的那一条。正则尤其糟 —— 截断后如果还编译得过去，那条规则匹配的东西就
不是粘贴进来的那条了，「存下来了」不再等于「我写下的那一份」。

现在三个字段各自到顶时，就在**它自己下面**说出这件事，并说明这意味着什么（超出的部分没有被写进来、请确认
内容仍然完整），而不是只说一个数字。删掉一个字离开上限，那句话跟着消失；打开一条已经存着 512 个字符的规则，
编辑器一出现就带着它 —— 屏幕上那份值本来就是会存下去的那一份。

## 细节

- `packages/web/src/lib/command-policy-rule-limit.ts`：新增 `COMMAND_POLICY_FIELD_LIMITS`（镜像服务端
  `MAX_RULE_NAME_LEN` / `MAX_RULE_PATTERN_LEN` / `MAX_RULE_DESCRIPTION_LEN`）与
  `ruleFieldLimitHint(field, length)` —— 未到顶时是 `null`，到顶（含已经超出）时是那句话。上一轮那份列表
  上限（`ruleLimitHint`）在同一模块里，两者读的是同一种「镜像服务端的上限，然后提前说出来」的手法。
- `packages/web/src/components/layout/project-dialogs.tsx` 的 `RuleEditor`：三个 `maxLength` 改成读常量，
  每个字段下多一行提示（`data-testid="command-policy-rule-{name,pattern,desc}-limit"`、告警色、最多两行）。
- 词典（`strings.ts` / `strings-en.ts`）：一句带数字的说明。
- 没有接口变化、没有新依赖、服务端行为没变。

## 测试

- `packages/web/test/command-policy-field-limit.test.ts`（新增，8 条）：未到顶时什么都不说；到顶时说出上限
  而且句子里有那个数字；已经超出（旧数据）时照样说；那句话讲的是「被截掉了什么」而不只是一个数字（中英各
  一份）；三个常量等于服务端路由里的三个常量（读服务端源码对账）；三个输入框的 `maxLength` 就是这三个数；
  打开一条名称已经到顶的规则时只有名称那一行说话；三个字段都短时一行都没有。
- `packages/web/e2e/command-policy-field-limit.spec.mjs`（新增，2 条，真服务端 + 真浏览器）：往正则框里
  **用键盘**粘贴 632 个字符 —— 值停在 512、那句话在、只有它一个字段在说，退一个字就一起消失；名称与描述
  同样到顶；另有一条打开存着 512 个字符的规则，编辑器一出现那句话就在。

## 兼容性

线上协议没变：同一个 PUT、同一套校验、同样的上限。变的是页面在这些上限处提前说话，而不是让人在保存之后才
发现粘贴进来的东西已经被截过。
