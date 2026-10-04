// src/lib/permissions.test.ts
//
// 界面侧的权限判据必须与服务端一致的地方只有一处：**哪些字段是管理员专属**。
// 这里把它钉住，改服务端那条表时会被提醒也来改这里。
import { describe, expect, it } from 'vitest'

import { ADMIN_FIELDS, canEditField, isAdminField, permissionHint } from './permissions'
import type { IdentityInfo } from '../api/types'

const admin: IdentityInfo = { kind: 'host', name: 'host', isAdmin: true }
const user: IdentityInfo = { kind: 'user', name: 'alice', isAdmin: false }

describe('界面权限判据', () => {
  it('密钥、端点、提供方、工作区是管理员专属（与服务端 routes/config.ts 的四条一致）', () => {
    expect([...ADMIN_FIELDS]).toEqual(['workspace', 'baseUrl', 'provider', 'apiKey'])
    for (const field of ADMIN_FIELDS) expect(canEditField(user, field)).toBe(false)
  })

  it('模型名与预算是每个人的（「选模型」两档一致）', () => {
    expect(canEditField(user, 'model')).toBe(true)
    expect(canEditField(user, 'limits')).toBe(true)
  })

  it('管理员什么都能改', () => {
    for (const field of [...ADMIN_FIELDS, 'model', 'limits'] as const) {
      expect(canEditField(admin, field)).toBe(true)
    }
  })

  it('还不知道自己是谁时一律不可改', () => {
    // 猜成「可以改」会让人白填一遍表单再吃一个 403
    expect(canEditField(null, 'model')).toBe(false)
    expect(canEditField(undefined, 'workspace')).toBe(false)
  })

  it('置灰时给的是原因而不是「你没有权限」', () => {
    expect(permissionHint(user, 'provider')).toContain('管理员')
    expect(permissionHint(user, 'apiKey')).toContain('secrets/')
    expect(permissionHint(admin, 'apiKey')).toBe('')
    expect(isAdminField('model')).toBe(false)
  })
})
