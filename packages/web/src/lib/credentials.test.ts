// src/lib/credentials.test.ts
//
// 凭据的解析必须容错：它在 localStorage 里，用户可能手改、可能是旧版本写的、
// 隐私模式下写不进去。任何一条走错，表现都是「打开就是白屏 / 一直在报未授权」。

import { describe, expect, it } from 'vitest'
import {
  authHeaders,
  loadCredentials,
  normalizeBaseUrl,
  parseConnectionInput,
  parseCredentials,
  saveCredentials,
  serializeCredentials,
  type KeyValueStore,
} from './credentials'

/** 内存版 localStorage：单测不依赖 DOM 环境 */
function memoryStore(initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...initial }
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value
    },
    removeItem: (key) => {
      delete data[key]
    },
  }
}

describe('normalizeBaseUrl', () => {
  it('空串表示同源', () => {
    expect(normalizeBaseUrl('')).toBe('')
    expect(normalizeBaseUrl('   ')).toBe('')
    expect(normalizeBaseUrl('/')).toBe('')
  })

  it('缺协议时补 http://（手机上手输 192.168.x.x:7370 是常态）', () => {
    expect(normalizeBaseUrl('192.168.1.5:7370')).toBe('http://192.168.1.5:7370')
    expect(normalizeBaseUrl('localhost:7370')).toBe('http://localhost:7370')
  })

  it('去掉结尾斜杠与查询串', () => {
    expect(normalizeBaseUrl('http://host:7370/')).toBe('http://host:7370')
    expect(normalizeBaseUrl('https://adelie.example.com/?token=x')).toBe('https://adelie.example.com')
  })

  it('保留子路径前缀（反代挂在 /adelie 下的情形）', () => {
    expect(normalizeBaseUrl('https://example.com/adelie/')).toBe('https://example.com/adelie')
  })

  it('非 http(s) 协议判为无效', () => {
    expect(normalizeBaseUrl('ftp://host')).toBe('')
    expect(normalizeBaseUrl('ht!tp://')).toBe('')
  })
})

describe('parseConnectionInput', () => {
  it('从粘贴的地址里拆出 token（服务端启动时会打印带 token 的 URL）', () => {
    expect(parseConnectionInput('http://192.168.1.5:7370/?token=abc123')).toEqual({
      baseUrl: 'http://192.168.1.5:7370',
      token: 'abc123',
    })
  })

  it('没有 token 时返回 null，不覆盖已有 token', () => {
    expect(parseConnectionInput('http://192.168.1.5:7370')).toEqual({
      baseUrl: 'http://192.168.1.5:7370',
      token: null,
    })
  })

  it('空输入退回同源', () => {
    expect(parseConnectionInput('')).toEqual({ baseUrl: '', token: null })
  })
})

describe('parseCredentials / serializeCredentials', () => {
  it('往返一致，且落盘的地址是归一化过的', () => {
    const raw = serializeCredentials({ baseUrl: 'http://host:7370/', token: ' t ' })
    expect(parseCredentials(raw)).toEqual({ baseUrl: 'http://host:7370', token: 't' })
  })

  it('坏数据一律退回空凭据（同源），不抛错', () => {
    expect(parseCredentials(null)).toEqual({ baseUrl: '', token: '' })
    expect(parseCredentials('{oops')).toEqual({ baseUrl: '', token: '' })
    expect(parseCredentials('"字符串"')).toEqual({ baseUrl: '', token: '' })
    expect(parseCredentials('{"baseUrl":123,"token":false}')).toEqual({ baseUrl: '', token: '' })
  })

  it('字段类型不对时只丢那一个字段', () => {
    expect(parseCredentials('{"baseUrl":"http://h:1","token":42}')).toEqual({ baseUrl: 'http://h:1', token: '' })
  })
})

describe('loadCredentials / saveCredentials', () => {
  it('没存过时返回空凭据（= 同源、无 token）', () => {
    expect(loadCredentials(memoryStore())).toEqual({ baseUrl: '', token: '' })
  })

  it('存了能读回来', () => {
    const store = memoryStore()
    saveCredentials({ baseUrl: 'http://h:7370', token: 'abc' }, store)
    expect(loadCredentials(store)).toEqual({ baseUrl: 'http://h:7370', token: 'abc' })
    expect(Object.keys(store.data)).toEqual(['adelie.web.credentials.v1'])
  })

  it('storage 为 null（隐私模式 / 禁用存储）时不抛错', () => {
    expect(loadCredentials(null)).toEqual({ baseUrl: '', token: '' })
    expect(() => saveCredentials({ baseUrl: '', token: 'x' }, null)).not.toThrow()
  })

  it('写入抛错（配额满）时被吞掉，不影响本次会话', () => {
    const store: KeyValueStore = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
      removeItem: () => {},
    }
    expect(() => saveCredentials({ baseUrl: '', token: 'x' }, store)).not.toThrow()
  })
})

describe('authHeaders', () => {
  it('有 token 才带 Authorization', () => {
    expect(authHeaders('')).toEqual({})
    expect(authHeaders('abc')).toEqual({ authorization: 'Bearer abc' })
  })
})
