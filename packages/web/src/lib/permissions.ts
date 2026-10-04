// src/lib/permissions.ts
//
// 界面上「哪些字段能改」的判据。
//
// 为什么单独一个纯模块：这条规则在服务端是**唯一**的真话（`routes/config.ts` 的
// 四个 adminOnly），界面这边只是把它照出来 —— 用户不该点了保存才知道自己没权限。
// 放在这里而不是塞进 SettingsDialog，是为了能脱离 DOM 测：界面上的 if 散开之后，
// 「非管理员看到半亮的表单」这种事没人测得出来。
//
// 判据与服务端一致的四条：密钥、端点、提供方、工作区是管理员的；
// 模型名与预算是每个人的。

import type { IdentityInfo } from '../api/types'

export type ConfigField = 'workspace' | 'baseUrl' | 'provider' | 'apiKey' | 'model' | 'limits'

/** 只有管理员能动的字段。顺序即界面上出现的顺序 */
export const ADMIN_FIELDS: readonly ConfigField[] = ['workspace', 'baseUrl', 'provider', 'apiKey']

export function isAdminField(field: ConfigField): boolean {
  return ADMIN_FIELDS.includes(field)
}

export function canEditField(identity: IdentityInfo | null | undefined, field: ConfigField): boolean {
  // 还不知道自己是谁时按「不能改」处理：猜错了会让人白填一遍表单再吃一个 403
  if (identity === null || identity === undefined) return false
  return identity.isAdmin || !isAdminField(field)
}

/** 置灰时的说明。不写「你没有权限」那种话，写清「为什么」与「找谁」 */
export function permissionHint(identity: IdentityInfo | null | undefined, field: ConfigField): string {
  if (canEditField(identity, field)) return ''
  const name = identity?.name ?? '管理员'
  switch (field) {
    case 'workspace':
      return `当前身份是 ${name}，工作区由管理员设定`
    case 'baseUrl':
      return '自定义端点由管理员设定'
    case 'provider':
      return '换提供方连着端点与密钥，由管理员设定；同一家之内可以随便换型号'
    case 'apiKey':
      return `密钥由管理员设定。${name} 自己的密钥写在服务端的 secrets/${identity?.name ?? '<用户>'}.env`
    default:
      return ''
  }
}
