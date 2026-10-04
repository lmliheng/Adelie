// src/components/Skeleton.tsx
//
// 加载态用骨架（灰块），而不是转圈：转圈只说明「在忙」，骨架说明「马上出来的是什么」。
// 形状照着真实内容做，所以内容出现时不会跳动。

import type { ReactNode } from 'react'

export function SessionListSkeleton(): ReactNode {
  return (
    <div className="sk-stack" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((index) => (
        <div key={index} className="skeleton sk-row" style={{ opacity: 1 - index * 0.12 }} />
      ))}
    </div>
  )
}

export function TranscriptSkeleton(): ReactNode {
  return (
    <div className="column sk-stack" aria-hidden="true" style={{ gap: 16 }}>
      <div className="skeleton sk-line" style={{ width: '42%', height: 14, alignSelf: 'flex-end' }} />
      <div className="skeleton sk-line" style={{ width: '88%' }} />
      <div className="skeleton sk-line" style={{ width: '76%' }} />
      <div className="skeleton" style={{ height: 40, borderRadius: 'var(--radius-card)' }} />
      <div className="skeleton sk-line" style={{ width: '64%' }} />
    </div>
  )
}
