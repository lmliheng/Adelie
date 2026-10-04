// src/api/sse.test.ts
//
// SSE 分帧是流式对话唯一的解析层：分错一帧就是「回答少一半」或「JSON 解析炸掉」。
// 这里覆盖的都是真实会遇到的边界：跨块切断、\r\n、多行 data、注释心跳、无结尾空行。

import { describe, expect, it } from 'vitest'
import { createSseParser, parseFrameData } from './sse'

describe('createSseParser', () => {
  it('按空行切帧，event 与 data 都取出来', () => {
    const parser = createSseParser()
    const frames = parser.push('event: delta\ndata: {"kind":"content","text":"你"}\n\nevent: done\ndata: {}\n\n')
    expect(frames).toEqual([
      { event: 'delta', data: '{"kind":"content","text":"你"}', id: null },
      { event: 'done', data: '{}', id: null },
    ])
  })

  it('跨块的半个帧留在缓冲里，拼齐后才交出来', () => {
    const parser = createSseParser()
    expect(parser.push('event: delta\ndata: {"te')).toEqual([])
    expect(parser.push('xt":"你好"}\n\n')).toEqual([{ event: 'delta', data: '{"text":"你好"}', id: null }])
  })

  it('多字节字符被切成两半也不会乱码', () => {
    // TextDecoder 的 stream 模式负责这件事，这里验证「切片发生在任意字节处」也不崩
    const parser = createSseParser()
    const bytes = new TextEncoder().encode('event: delta\ndata: {"text":"企鹅"}\n\n')
    const decoder = new TextDecoder()
    const frames = [
      ...parser.push(decoder.decode(bytes.slice(0, 20), { stream: true })),
      ...parser.push(decoder.decode(bytes.slice(20), { stream: true })),
      ...parser.flush(),
    ]
    expect(frames).toHaveLength(1)
    expect(JSON.parse(frames[0]?.data ?? '')).toEqual({ text: '企鹅' })
  })

  it('兼容 \\r\\n 换行，且不会把结尾的孤立 \\r 当成帧边界', () => {
    const parser = createSseParser()
    expect(parser.push('event: delta\r\ndata: {"a":1}\r')).toEqual([])
    expect(parser.push('\n\r\n')).toEqual([{ event: 'delta', data: '{"a":1}', id: null }])
  })

  it('忽略注释行（心跳）与未知字段', () => {
    const parser = createSseParser()
    const frames = parser.push(': keep-alive\nretry: 3000\nevent: ping\ndata: 1\n\n')
    expect(frames).toEqual([{ event: 'ping', data: '1', id: null }])
  })

  it('多行 data 用换行拼接，id 也带上', () => {
    const parser = createSseParser()
    const frames = parser.push('id: 42\nevent: note\ndata: line1\ndata: line2\n\n')
    expect(frames).toEqual([{ event: 'note', data: 'line1\nline2', id: '42' }])
  })

  it('没有 event 字段时按 SSE 规范退回 message', () => {
    const parser = createSseParser()
    expect(parser.push('data: hi\n\n')).toEqual([{ event: 'message', data: 'hi', id: null }])
  })

  it('流结束时 flush 出没有空行收尾的最后一帧', () => {
    const parser = createSseParser()
    expect(parser.push('event: done\ndata: {}')).toEqual([])
    expect(parser.flush()).toEqual([{ event: 'done', data: '{}', id: null }])
  })

  it('只有注释的块不产生帧', () => {
    const parser = createSseParser()
    expect(parser.push(': ping\n\n')).toEqual([])
  })
})

describe('parseFrameData', () => {
  it('正常 JSON 解析成对象', () => {
    expect(parseFrameData({ event: 'delta', data: '{"a":1}', id: null })).toEqual({ a: 1 })
  })

  it('坏 JSON 返回 null 而不是抛错（界面据此提示而不是白屏）', () => {
    expect(parseFrameData({ event: 'delta', data: '{oops', id: null })).toBeNull()
  })

  it('空 data 返回 null', () => {
    expect(parseFrameData({ event: 'done', data: '', id: null })).toBeNull()
  })
})
