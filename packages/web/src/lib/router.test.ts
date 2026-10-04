// src/lib/router.test.ts
//
// 路由的四件小事都是纯函数，所以三种部署（站点根 / Pages 子路径 / `base: './'` 的相对形式）
// 都能在 node 里跑一遍 —— 这类「换台机器就白屏」的错，只有单测能便宜地挡住。

import { describe, expect, it } from 'vitest'
import { HOME_PATH, NAV_PAGES, navPageOf, normalizePath, pageIdOf, stripBase, withBase } from './router'

describe('normalizePath', () => {
  it('补前导斜杠、去尾斜杠，空串当根', () => {
    expect(normalizePath('')).toBe('/')
    expect(normalizePath('agents')).toBe('/agents')
    expect(normalizePath('/agents/')).toBe('/agents')
    expect(normalizePath('/')).toBe('/')
    expect(normalizePath('///')).toBe('/')
  })
})

describe('stripBase', () => {
  it('站点根部署：原样', () => {
    expect(stripBase('/', '/')).toBe('/')
    expect(stripBase('/agents', '/')).toBe('/agents')
  })

  it('子路径部署（GitHub Pages）：去掉部署根', () => {
    expect(stripBase('/Adelie/', '/Adelie/')).toBe('/')
    expect(stripBase('/Adelie', '/Adelie/')).toBe('/')
    expect(stripBase('/Adelie/agents', '/Adelie/')).toBe('/agents')
  })

  it('base 是相对形式（`base: "./"` 解析出来的意外值）时不乱切', () => {
    expect(stripBase('/agents', './')).toBe('/agents')
    expect(stripBase('/agents', '')).toBe('/agents')
  })

  it('路径不以部署根开头时也不返回空串', () => {
    expect(stripBase('/other', '/Adelie/')).toBe('/other')
  })
})

describe('withBase', () => {
  it('与 stripBase 互逆（站点根与子路径两版）', () => {
    for (const base of ['/', '/Adelie/']) {
      for (const path of ['/', '/chat', '/agents']) {
        expect(stripBase(withBase(path, base), base)).toBe(normalizePath(path))
      }
    }
  })

  it('缺尾斜杠的 base 也能拼对', () => {
    expect(withBase('/agents', '/Adelie')).toBe('/Adelie/agents')
  })
})

describe('pageIdOf', () => {
  it('五个导航页与首页都认得', () => {
    expect(pageIdOf(HOME_PATH)).toBe('chat')
    for (const page of NAV_PAGES) expect(pageIdOf(page.path)).toBe(page.id)
  })

  it('带尾斜杠的地址也认（人手工敲出来的那条）', () => {
    expect(pageIdOf('/models/')).toBe('models')
  })

  it('认不出来的路径返回 null（调用方当首页，而不是白屏）', () => {
    expect(pageIdOf('/nope')).toBeNull()
  })

  it('根路径与空串算首页：子路径部署一打开就落在对话页', () => {
    expect(pageIdOf('')).toBe('chat')
    expect(pageIdOf('/')).toBe('chat')
  })

  it('navPageOf 只认导航页', () => {
    expect(navPageOf('agents')?.path).toBe('/agents')
    expect(navPageOf('chat')).toBeNull()
  })
})
