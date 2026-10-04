// src/lib/theme.ts
//
// 深色 / 浅色。按 web-design 的约定：在 <html> 上加 `dark` 类，默认跟随系统，
// 用户手动选择后持久化。深色是**纯黑**（#000），不是深蓝。
//
// 同时改写 <meta name="theme-color">：PWA 全屏时状态栏颜色跟着主题走，
// 否则深色界面配白状态栏，一眼假。

const STORAGE_KEY = 'adelie.web.theme.v1'

export type Theme = 'light' | 'dark'

const LIGHT = '#ffffff'
const DARK = '#000000'

export function resolveInitialTheme(store: Pick<Storage, 'getItem'> | null = safeStore()): Theme {
  const saved = store?.getItem(STORAGE_KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return prefersDark() ? 'dark' : 'light'
}

export function applyTheme(theme: Theme, store: Pick<Storage, 'setItem'> | null = safeStore()): void {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.classList.toggle('light', theme === 'light')
  // color-scheme 让原生控件（滚动条、软键盘）跟着变
  root.style.colorScheme = theme
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute('content', theme === 'dark' ? DARK : LIGHT)
  }
  try {
    store?.setItem(STORAGE_KEY, theme)
  } catch {
    // 存不下就算了，不影响本次会话
  }
}

export function nextTheme(theme: Theme): Theme {
  return theme === 'dark' ? 'light' : 'dark'
}

/** 跟随系统偏好变化（用户没手动选过时才有意义，调用方负责判断） */
export function watchSystemTheme(onChange: (theme: Theme) => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => {}
  const query = window.matchMedia('(prefers-color-scheme: dark)')
  const listener = (event: MediaQueryListEvent) => {
    onChange(event.matches ? 'dark' : 'light')
  }
  query.addEventListener('change', listener)
  return () => query.removeEventListener('change', listener)
}

function prefersDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

function safeStore(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}
