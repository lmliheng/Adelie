// src/main.tsx
//
// 入口：挂载 App、引全局样式、注册 Service Worker。

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { registerServiceWorker } from './register-sw'
import './styles/global.css'

const container = document.getElementById('root')
if (container === null) {
  // index.html 与入口是配套的；缺了只有构建配置出错这一种可能，直接说清楚
  throw new Error('找不到 #root 挂载点，index.html 可能被改坏了')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// 注册失败不影响在线使用（见 register-sw.ts）
registerServiceWorker()
