// src/components/ToastHost.tsx
//
// Toast 容器：右下角（移动端底部居中），role="status" aria-live="polite"。
// 点一下就关掉，3–4 秒也会自己消失（见 useToast）。

import type { ReactNode } from 'react'
import type { Toast } from '../hooks/useToast'

export function ToastHost({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }): ReactNode {
  if (toasts.length === 0) return null
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast${toast.tone === 'error' ? ' is-error' : ''}`}
          onClick={() => onDismiss(toast.id)}
        >
          {toast.text}
        </div>
      ))}
    </div>
  )
}
