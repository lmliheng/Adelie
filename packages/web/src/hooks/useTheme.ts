// src/hooks/useTheme.ts
//
// 主题：初始值来自 localStorage / 系统偏好；跟随系统直到用户手动切一次。

import { useCallback, useEffect, useState } from 'react'
import { applyTheme, nextTheme, resolveInitialTheme, watchSystemTheme, type Theme } from '../lib/theme'

export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(() => resolveInitialTheme())
  const [manual, setManual] = useState<boolean>(() => {
    try {
      const saved = globalThis.localStorage?.getItem('adelie.web.theme.v1')
      return saved === 'light' || saved === 'dark'
    } catch {
      return false
    }
  })

  // 首帧就应用，避免浅色闪一下再变深色
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    if (manual) return
    return watchSystemTheme(setTheme)
  }, [manual])

  const toggle = useCallback(() => {
    setManual(true)
    setTheme((current) => nextTheme(current))
  }, [])

  return { theme, toggle }
}
