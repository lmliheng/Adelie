// src/api/sse.ts
//
// SSE 分帧解析器（纯函数，见 sse.test.ts）。
//
// 为什么不用 EventSource：对话是 `POST /api/sessions/:id/messages`，而 EventSource
// 只能发 GET、且不能带自定义请求头（鉴权要 `Authorization: Bearer`）。所以自己读
// `fetch` 的 ReadableStream，这里就负责把字节流切成一个个 frame。
//
// 规则按 WHATWG 的 text/event-stream 来，但只实现用得到的部分：
//   - 帧之间用空行分隔（`\n\n`，也容忍 `\r\n\r\n`）
//   - `event:` / `data:` / `id:` 字段，冒号后可有一个空格
//   - 多行 `data:` 按 `\n` 拼接
//   - 以 `:` 开头的行是注释（心跳），忽略
//   - 不认识的字段忽略，而不是报错 —— 服务端加字段不该让老客户端崩

export interface SseFrame {
  /** 缺省是 `message`（SSE 规范里的默认类型） */
  event: string
  data: string
  id: string | null
}

export interface SseParser {
  /** 喂入一段解码后的文本，返回本次能完整解析出的帧（可能为空） */
  push(chunk: string): SseFrame[]
  /** 流结束时调用：把缓冲区里没有以空行收尾的最后一帧也交出来 */
  flush(): SseFrame[]
}

export function createSseParser(): SseParser {
  let buffer = ''

  const drain = (atEnd: boolean): SseFrame[] => {
    const frames: SseFrame[] = []
    for (;;) {
      const boundary = buffer.indexOf('\n\n')
      if (boundary === -1) break
      const block = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      const frame = parseBlock(block)
      if (frame !== null) frames.push(frame)
    }
    if (atEnd && buffer.trim() !== '') {
      const frame = parseBlock(buffer)
      buffer = ''
      if (frame !== null) frames.push(frame)
    }
    return frames
  }

  return {
    push(chunk: string): SseFrame[] {
      buffer += chunk
      // 末尾孤立的 `\r` 可能是被切断的 `\r\n`，先扣住不归一化：现在把它当成 `\n`
      // 就会把一个帧边界提前切出来。它留在缓冲里，下一块到了再一起归一化，
      // 那时 `\r` + `\n` 才会正确折叠成一个换行。
      let hold = ''
      if (buffer.endsWith('\r')) {
        hold = '\r'
        buffer = buffer.slice(0, -1)
      }
      buffer = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      const frames = drain(false)
      buffer += hold
      return frames
    },
    flush(): SseFrame[] {
      // 流结束：剩下的 `\r` 不可能再等到配对的 `\n` 了，直接归一化
      buffer = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      return drain(true)
    },
  }
}

function parseBlock(block: string): SseFrame | null {
  let event = 'message'
  let id: string | null = null
  const dataLines: string[] = []
  let sawField = false

  for (const rawLine of block.split('\n')) {
    if (rawLine === '' || rawLine.startsWith(':')) continue // 空行 / 注释（心跳）
    const colon = rawLine.indexOf(':')
    const field = colon === -1 ? rawLine : rawLine.slice(0, colon)
    let value = colon === -1 ? '' : rawLine.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)

    if (field === 'event') {
      event = value === '' ? 'message' : value
      sawField = true
    } else if (field === 'data') {
      dataLines.push(value)
      sawField = true
    } else if (field === 'id') {
      id = value
      sawField = true
    }
    // retry 及其它字段：忽略
  }

  if (!sawField) return null
  return { event, data: dataLines.join('\n'), id }
}

/** 把帧的 data 当 JSON 解析；解析不出来返回 null（调用方决定怎么提示） */
export function parseFrameData(frame: SseFrame): unknown {
  if (frame.data === '') return null
  try {
    return JSON.parse(frame.data)
  } catch {
    return null
  }
}
