// src/lib/sections.ts
//
// 设置的「分节」与「谁看得见」。
//
// 借的是 penguin 的做法：可见性是一组**纯函数**，不是散在 JSX 里的 `{isAdmin && …}`。
// 散着写有两个后果 —— 加一节要改一处判断，判断和服务端权限错了也没人测得到。收在这里
// 之后，`settings` 只是把 `visibleSections(viewer)` 排出来画，规则本身能单测。

export type SettingsSectionId = 'connection' | 'runtime' | 'tools' | 'users'

export interface SettingsSection {
  id: SettingsSectionId
  title: string
  /** 分组只影响 rail 上的小标题；个人 = 你自己这台/这个账号要配的，服务端 = 服务端给你看的事实 */
  group: 'personal' | 'server'
  /** 只有管理员看得见。目前只有「用户」一节 */
  adminOnly: boolean
}

/** 顺序即 rail 上出现的顺序（按 group 分组后逐组渲染，顺序不变） */
export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  { id: 'connection', title: '服务端连接', group: 'personal', adminOnly: false },
  { id: 'runtime', title: '运行配置', group: 'personal', adminOnly: false },
  { id: 'tools', title: '可用工具', group: 'server', adminOnly: false },
  { id: 'users', title: '用户', group: 'server', adminOnly: true },
]

export interface Viewer {
  isAdmin: boolean
}

export function isSectionVisible(section: SettingsSection, viewer: Viewer): boolean {
  return !section.adminOnly || viewer.isAdmin
}

export function visibleSections(viewer: Viewer): SettingsSection[] {
  return SETTINGS_SECTIONS.filter((section) => isSectionVisible(section, viewer))
}

/** 打开设置时落在哪一节：第一节可见的。全都不见（不可能）时给 null */
export function firstVisibleSection(viewer: Viewer): SettingsSectionId | null {
  return visibleSections(viewer)[0]?.id ?? null
}

/**
 * 把「想要的节」收窄成一个当前身份真的看得见的节。
 * 身份一变（比如管理员被降权，或从管理员切到普通用户）时，rail 上不能再停在「用户」，
 * 否则右侧会渲染一节根本没有权限拉数据的页面。
 */
export function resolveSection(
  desired: SettingsSectionId | null,
  viewer: Viewer,
): SettingsSectionId | null {
  const visible = visibleSections(viewer)
  if (desired !== null && visible.some((section) => section.id === desired)) return desired
  return visible[0]?.id ?? null
}
