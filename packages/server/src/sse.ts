// SSE 帧的缓冲通道。
//
// 运行时的事件出口与增量出口都是同步回调，而写 SSE 是异步的（`writeSSE` 返回
// Promise）。同步回调里不能 await，所以这里把帧排队，由 SSE 处理函数里的一个
// 循环按序取走 —— 顺序和 appendFileSync 落盘的顺序一致。
export interface SseFrame {
  event: string;
  data: unknown;
}

export class SseChannel {
  private readonly queue: SseFrame[] = [];
  private wake: (() => void) | null = null;
  private closed = false;

  get isClosed(): boolean {
    return this.closed;
  }

  /** 推一帧。通道已关闭（客户端断开、本轮已收尾）后静默丢弃 */
  push(event: string, data: unknown): void {
    if (this.closed) return;
    this.queue.push({ event, data });
    this.wakeUp();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.wakeUp();
  }

  /** 依次吐出帧；通道关闭且队列取空后结束 */
  async *drain(): AsyncGenerator<SseFrame, void, void> {
    while (true) {
      const frame = this.queue.shift();
      if (frame !== undefined) {
        yield frame;
        continue;
      }
      if (this.closed) return;
      await new Promise<void>((resolve) => {
        this.wake = resolve;
      });
    }
  }

  private wakeUp(): void {
    const wake = this.wake;
    this.wake = null;
    wake?.();
  }
}
