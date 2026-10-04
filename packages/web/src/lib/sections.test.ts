// src/lib/sections.test.ts
//
// 设置各节的可见性是纯函数，所以这条规则能被钉住：只有「用户」一节是管理员专属，
// 身份变化时 resolveSection 必须把停不住的那一节收窄回一个看得见的位置。

import { describe, expect, it } from 'vitest'
import {
  SETTINGS_SECTIONS,
  firstVisibleSection,
  isSectionVisible,
  resolveSection,
  visibleSections,
} from './sections'

const admin = { isAdmin: true }
const user = { isAdmin: false }

describe('设置分节可见性', () => {
  it('「用户」一节是管理员专属，其余对所有人可见', () => {
    const adminOnly = SETTINGS_SECTIONS.filter((section) => section.adminOnly).map((s) => s.id)
    expect(adminOnly).toEqual(['users'])
    expect(isSectionVisible({ id: 'connection', title: '连接', group: 'personal', adminOnly: false }, user)).toBe(true)
  })

  it('管理员看得到全部，普通用户看不到用户那节', () => {
    expect(visibleSections(admin).map((s) => s.id)).toEqual(['connection', 'runtime', 'tools', 'users'])
    expect(visibleSections(user).map((s) => s.id)).toEqual(['connection', 'runtime', 'tools'])
  })

  it('默认落在第一节', () => {
    expect(firstVisibleSection(admin)).toBe('connection')
    expect(firstVisibleSection(user)).toBe('connection')
  })

  it('想要的那节看不见时收窄到第一节（管理员被降权后不会卡在「用户」上）', () => {
    expect(resolveSection('users', admin)).toBe('users')
    expect(resolveSection('users', user)).toBe('connection')
    expect(resolveSection(null, user)).toBe('connection')
    expect(resolveSection('tools', user)).toBe('tools')
  })
})
