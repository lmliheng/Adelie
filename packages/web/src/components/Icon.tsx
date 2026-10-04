// src/components/Icon.tsx
//
// 图标一律内联 SVG：没有图标字体、没有 CDN（web-design 的「零外部请求」）。
// 统一 24 视框、1.6 描边、currentColor，所以颜色和大小都由上下文决定。

import type { ReactNode } from 'react'

export type IconName =
  | 'menu'
  | 'close'
  | 'plus'
  | 'trash'
  | 'gear'
  | 'sun'
  | 'moon'
  | 'send'
  | 'stop'
  | 'chevron'
  | 'alert'
  | 'check'
  | 'refresh'
  | 'copy'
  | 'terminal'
  | 'file'
  | 'clock'
  | 'offline'
  | 'shield'
  | 'sparkle'
  | 'user'
  | 'users'
  | 'logout'

const PATHS: Record<IconName, ReactNode> = {
  menu: (
    <>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </>
  ),
  close: (
    <>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M10 11v6M14 11v6" />
      <path d="M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5l1.4 2.1 2.5-.5.4 2.5 2.3 1.1-1.3 2.2 1.3 2.2-2.3 1.1-.4 2.5-2.5-.5L12 21.5l-1.4-2.1-2.5.5-.4-2.5L5.4 16.3 6.7 14.1 5.4 11.9l2.3-1.1.4-2.5 2.5.5L12 2.5Z" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />,
  send: (
    <>
      <path d="M12 19V5" />
      <path d="M6 11l6-6 6 6" />
    </>
  ),
  stop: <rect x="7" y="7" width="10" height="10" rx="1.5" />,
  chevron: <path d="M9 6l6 6-6 6" />,
  alert: (
    <>
      <path d="M12 4.5 3.5 19.5h17L12 4.5Z" />
      <path d="M12 10v4" />
      <path d="M12 17h.01" />
    </>
  ),
  check: <path d="M5 13l4.5 4.5L19 7" />,
  refresh: (
    <>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20 4v4h-4" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M15 5.5A1.5 1.5 0 0 0 13.5 4H6a2 2 0 0 0-2 2v7.5A1.5 1.5 0 0 0 5.5 15" />
    </>
  ),
  terminal: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <path d="M7 10l2.5 2L7 14" />
      <path d="M13 15h4" />
    </>
  ),
  file: (
    <>
      <path d="M14 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9l-5-5Z" />
      <path d="M14 4v5h5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  offline: (
    <>
      <path d="M5 12.5a10 10 0 0 1 14 0" />
      <path d="M8.5 15.5a5.5 5.5 0 0 1 7 0" />
      <path d="M12 19h.01" />
      <path d="M3 3l18 18" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.5 5 6v6c0 4 3 7 7 8.5 4-1.5 7-4.5 7-8.5V6l-7-2.5Z" />
      <path d="M9.5 12.5 11.5 15l3.5-4" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6L12 4Z" />
      <path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5 20c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5" />
    </>
  ),
  users: (
    <>
      <circle cx="9.5" cy="8.5" r="3" />
      <path d="M3.5 19.5c0-3 2.7-5 6-5s6 2 6 5" />
      <path d="M16 6.2a3 3 0 0 1 0 5.6" />
      <path d="M17.5 19.5c0-2-0.6-3.5-1.7-4.6" />
    </>
  ),
  logout: (
    <>
      <path d="M14 5.5H6.5a1.5 1.5 0 0 0-1.5 1.5v10a1.5 1.5 0 0 0 1.5 1.5H14" />
      <path d="M16.5 12H10" />
      <path d="M14 9.5 16.5 12 14 14.5" />
    </>
  ),
}

export function Icon({ name, size = 16 }: { name: IconName; size?: number }): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}

/** 品牌字形（brand/adelie-glyph.svg 内联版）：只有内联才会继承 currentColor */
export function Glyph({ size = 22 }: { size?: number }): ReactNode {
  return (
    <svg viewBox="0 0 1024 1024" width={size} height={size} role="img" aria-label="Adelie" focusable="false">
      <defs>
        <mask id="adelie-glyph-cuts">
          <rect width="1024" height="1024" fill="#fff" />
          <ellipse cx="512" cy="705" rx="124" ry="130" fill="#000" />
          <circle cx="448" cy="356" r="46" fill="none" stroke="#000" strokeWidth="24" />
          <circle cx="576" cy="356" r="46" fill="none" stroke="#000" strokeWidth="24" />
          <path
            d="M 512 415 C 542 440 552 470 549 492 C 546 514 532 528 512 534 C 492 528 478 514 475 492 C 472 470 482 440 512 415 Z"
            fill="#000"
          />
        </mask>
      </defs>
      <path
        d="M 512 225 C 596 225 652 296 662 388 C 684 470 706 560 706 660 C 706 780 664 840 512 840 C 360 840 318 780 318 660 C 318 560 340 470 362 388 C 372 296 428 225 512 225 Z"
        fill="currentColor"
        mask="url(#adelie-glyph-cuts)"
      />
    </svg>
  )
}
