// src/hooks/useElapsed.ts
//
// 运行中的秒表：从 `startedAt` 起到现在过了多少秒，只有这一轮还在跑时才走。
//
// 为什么要有它：一轮 agent 任务可能跑几分钟，期间界面上如果只有一个静止的「执行中」，
// 人分不清「在动」和「卡死了」。一个会走的秒表是最便宜、也最诚实的活体信号 ——
// 它显示的是**这一轮真的开始了多久**，不是估算的进度条。
//
// 停下就归零：计时只属于「正在跑」这件事 —— 调用方在 running 为假时不显示它，
// 于是也不会出现「已经停了，秒表还在走」。

import { useEffect, useState } from 'react'

export function useElapsed(startedAt: number, running: boolean, stepMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!running) return
    // 立刻对齐一次：挂载与重启计时之间不该有一段显示旧值的窗口
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), stepMs)
    return () => window.clearInterval(timer)
  }, [running, stepMs])

  if (!running) return 0
  return Math.max(0, (now - startedAt) / 1000)
}
