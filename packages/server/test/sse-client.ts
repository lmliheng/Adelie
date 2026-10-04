// SSE 客户端：把 `text/event-stream` 逐帧读出来，读到 `done` 为止。
//
// 用 fetch + reader 而不是 EventSource：Node 里没有全局 EventSource，而且测试要
// 能在流还开着的时候插一脚（审批、取消）。
export interface SseFrame {
  event: string;
  data: string;
}

function parseFrame(raw: string): SseFrame | null {
  let event = '';
  const dataLines: string[] = [];

  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) event = line.slice('event:'.length).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice('data:'.length).trimStart());
  }

  if (event === '') return null;
  return { event, data: dataLines.join('\n') };
}

export async function consumeSse(
  response: Response,
  onFrame: (frame: SseFrame) => void | Promise<void>,
): Promise<SseFrame[]> {
  const body = response.body;
  if (body === null) throw new Error('响应没有 body');

  const reader = body.getReader();
  const decoder = new TextDecoder();
  const frames: SseFrame[] = [];
  let buffer = '';

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;

      buffer += decoder.decode(chunk.value, { stream: true });
      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const raw = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const frame = parseFrame(raw);
        if (frame !== null) {
          frames.push(frame);
          await onFrame(frame);
        }
        boundary = buffer.indexOf('\n\n');
      }
    }
  } finally {
    // 断言失败提前退出时，别把服务端那条连接挂着
    await reader.cancel().catch(() => undefined);
  }

  return frames;
}

export function json(frame: SseFrame): Record<string, unknown> {
  return JSON.parse(frame.data) as Record<string, unknown>;
}

export function eventsOf(frames: readonly SseFrame[]): string[] {
  return frames.map((frame) => frame.event);
}
