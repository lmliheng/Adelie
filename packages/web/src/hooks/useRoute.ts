// src/hooks/useRoute.ts
//
// 路由的浏览器那一半：一个 path 状态 + pushState + popstate。
// 纯逻辑在 `lib/router.ts`（有单测），这里只负责与 history 打交道。

import { useCallback, useEffect, useState } from 'react'
import { stripBase, withBase } from '../lib/router'

/**
 * 部署根。`base: './'` 下 `import.meta.env.BASE_URL` 是 `'./'`，当不了 basename，
 * 所以从 `document.baseURI` 推 —— 与 `register-sw.ts` 取部署根是同一招（那里也踩过这个坑）。
 */
function deployBase(): string {
  try {
    return new URL('.', document.baseURI).pathname
  } catch {
    return '/'
  }
}

export function useRoute(): { path: string; navigate: (next: string) => void } {
  const [path, setPath] = useState(() => stripBase(window.location.pathname, deployBase()))

  useEffect(() => {
    const onPopState = (): void => setPath(stripBase(window.location.pathname, deployBase()))
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = useCallback((next: string) => {
    const target = withBase(next, deployBase())
    if (target === window.location.pathname) return
    window.history.pushState(null, '', target)
    setPath(stripBase(window.location.pathname, deployBase()))
  }, [])

  return { path, navigate }
}
