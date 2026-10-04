// src/components/Markdown.tsx
//
// 助手正文的渲染：**Markdown 才是模型写东西的格式**（标题、列表、表格、围栏代码），
// 以前这里 `white-space: pre-wrap` 直接把源码显示出来 —— 一段带表格或代码的回答
// 就是一大块没排版的文本。
//
// 三条与 penguin 同一套做法（见 packages/ui/src/components/content/prose/prose.tsx）：
//
//  1. **插件表与组件映射是模块常量，不是每次渲染现造的数组/箭头函数。**
//     react-markdown 把 `components.pre` 当**元素类型**用：每次渲染新造一个函数，
//     React 就会把每个代码块卸载重挂一遍（流式时每秒 ~8 次，连早就闭合的那些也是），
//     用户刚选中的文本、复制按钮的状态都会丢。
//  2. `memo` 认的是 `text` 的**身份**：已经定型的那几轮不再重解析（长对话里这是
//     O(n²) 与 O(n) 的差别），正在流的那一轮照常每帧重排。
//  3. 外链一律 `target="_blank" rel="noreferrer"`：一个回答里的链接点下去不该把
//     整个应用导航走（`noreferrer` 同时意味着 `noopener`）。
//
// 不做的事：语法高亮（shiki）、KaTeX、代码块复制按钮。它们各是一层，等真有需要再加 ——
// 现在先把「能读」这件事做对。

import { memo, useDeferredValue, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'

/** GFM：表格、任务列表、删除线、裸链接。放在模块层，理由见文件头第 1 条 */
const REMARK_PLUGINS = [remarkGfm]

/** 只有链接要改行为，其余交给 CSS（`.md-body`）。同样是模块常量 */
const COMPONENTS: Components = {
  a: ({ node: _node, children, ...rest }) => (
    <a {...rest} target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
}

export const Markdown = memo(function Markdown({
  text,
  className = 'md-body',
  /** 还在流：正文每来一小段就重排一次，用 deferred 值让输入框与滚动先走 */
  streaming = false,
}: {
  text: string
  className?: string
  streaming?: boolean
}): ReactNode {
  // 流式期间把「重排 Markdown」降到后台优先级：它可能要几十毫秒，而用户此刻在意的
  // 是输入框跟手、消息区在滚。定稿后用回原值，与屏幕上最后那版文字一致。
  const deferred = useDeferredValue(text)
  const rendered = streaming ? deferred : text

  return (
    // `data-streaming` 是给 CSS 的挂钩：正在流时，光标挂在**最后一个块级元素**的末尾
    // （见 .md-body[data-streaming] 那条规则）—— 单独放一个 span 只能落到整段下面一行
    <div className={className} data-streaming={streaming ? 'true' : undefined}>
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={COMPONENTS}>
        {rendered}
      </ReactMarkdown>
    </div>
  )
})
