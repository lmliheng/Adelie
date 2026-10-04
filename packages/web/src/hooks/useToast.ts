// src/hooks/useToast.ts
//
// 轻量提示（web-design 的 Toast 约定：右下角/移动端底部居中，3–4 秒自动消失，
// role="status"）。用它而不是 window.alert —— 原生弹窗会打断输入、且没法撤销。

import { useCallback, useEffect, useRef, useState } from 'react'

export interface Toast {
  id: number
  text: string
  tone: 'info' | 'error'
}

export interface ToastController {
  toasts: Toast[]
  push: (text: string, tone?: 'info' | 'error') => void
  dismiss: (id: number) => void
}

const LIFETIME_MS = 4000

export function useToast(): ToastController {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer !== undefined) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const push = useCallback(
    (text: string, tone: 'info' | 'error' = 'info') => {
      const id = nextId.current
      nextId.current += 1
      setToasts((current) => [...current, { id, text, tone }])
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), LIFETIME_MS),
      )
    },
    [dismiss],
  )

  // 卸载时清掉定时器，避免对已卸载组件 setState
  useEffect(() => {
    const map = timers.current
    return () => {
      for (const timer of map.values()) clearTimeout(timer)
      map.clear()
    }
  }, [])

  return { toasts, push, dismiss }
}
