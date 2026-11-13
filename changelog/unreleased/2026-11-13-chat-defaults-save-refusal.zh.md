# 项目设置里的一次保存被拒时，说清哪一半已经存进了项目

- **日期:** 2026-11-13
- **类型:** 修复
- **范围:** `web`
- **破坏性变更:** 否

[English](2026-11-13-chat-defaults-save-refusal.md)

项目设置「默认值」页的一次保存最多写两处：先是 `[default_chat]` 那一块（Agent、工作目录、审批模式、思考
等级），再是这个项目的默认模型。它们按这个顺序发出，所以第二次可以在这第一次已经落地之后被拒 —— 而那条拒绝
只落在一句通知里，念的是错误自己的话，别的什么都没有。于是「那一块已经存进去了」的一次保存，与「哪儿都没去成」
的那一次读起来一模一样，而这句话六秒后就自己消失，留下读者去猜项目现在拿着哪一半。这正是全应用那条「被拒的
原因留在发问的地方」的规则，而这一页是还在发通知的下一处。

现在这句话画在发问的那组控件下方，并且说清项目拿走了哪一半：那一块被拒时说默认值仍是原来的；默认模型被拒而
那一块已经落地时，说默认值已保存、模型仍是原来的；只有模型被拒（那一块没动）时只说这一件 —— 绝口不提「已
保存」。每次尝试先清掉上一次那句，保存按钮仍然是重试。

## 细节

- `packages/web/src/lib/chat-defaults-save-refusal.ts`（新增）：`chatDefaultsSaveRefused(attempt,
  error)` —— `{ write: "defaults" | "model"; defaultsLanded: boolean }` 加上那句话，经 `refusalText`
  读出（服务端答的按错误码自己那句本地化文案念；本仓库自己抛出的失败原样显示）。那次尝试随句子一起回来，
  因为被拒的是哪一次写，正是「项目现在拿着什么」的答案。
- `packages/web/src/components/layout/project-dialogs.tsx`：`ChatDefaultsSection` 记住这次尝试在写哪一处、
  那一块是否已经落地，并把句子画在控件网格下方（`data-testid="chat-defaults-refusal"`、`role="alert"`、
  危险色、限两行、悬停看全文）；这一页的 `toastError` 撤掉。两处写本身、它们的顺序与谁会落地一个字节都没改。
- `packages/web/src/lib/strings.ts` / `strings-en.ts`：`chatDefaultsRefused`、`chatDefaultsModelRefused`、
  `chatDefaultsModelRefusedAfterSave`，中英各三句。

## 测试

- `packages/web/test/chat-defaults-save-refusal.test.ts`（新增，6 条）：那一块被拒时说没有保存、并念错误码
  自己那句；那一块已落地而模型被拒时说清哪一半进了项目；同样的模型拒绝在那一块没动时绝不声称保存过；没走到
  请求就失败的保留它自己的话；什么都没得说时落通用文案；当前词典决定语言。
- `packages/web/e2e/chat-defaults-save-refusal.spec.mjs`（新增，2 条，真服务端 + 真浏览器，两次拒绝都是
  服务端自己给的）：两半都动过、而挑中的模型同时被另一个标签页的模型页从这个项目里删掉 —— 默认模型路由答
  400，句子说默认值已保存、点名被拒的模型，那一块真的存进去了而默认模型真的没变，通知区一条都没有，七秒后
  那句仍在，把模型加回去后按同一个按钮就让模型那一半落地；只改了模型的那一次，句子只说这一件，存下来的那一块
  与之前读到的逐字节相同，同一个按钮重试即落地。
- 拿改动前的这一页（`HEAD` 的 `project-dialogs.tsx` 重新构建）跑同一份新用例，两条都死在找不到那行拒绝句；
  同一页上的两态探针：改前 1.2 s 是通知区一条只有 `defaultModel must be included in models: …` 的通知、
  7.5 s 屏幕上一片空白（而那一块在服务端已经存进去了），改后两刻都是控件下方那句话。

## 兼容性

线上接口没变、没有新依赖、已存数据格式没变。两处都落地的保存与以前一模一样；变的是只落地一半的那一次 ——
它再也不能看起来像哪儿都没去成。
