// src/lib/composer-options.ts
//
// 输入区控制带上那两个下拉的**纯逻辑**：审批口径的三档、以及「当前这一家能选的模型」。
//
// 为什么单独一个模块：这两样都是从契约抄下来的常量与过滤规则，塞进组件里就只能靠点
// 界面来验。尤其是三档的 id —— 它们必须与服务端 `settings.ts` 的 `APPROVAL_MODES`
// 逐个字符一致，对不上就是一个 400 `bad_request`，而单测能当场把它钉住。
//
// 模型这边只列**当前提供方**：Adelie 没有上下文压缩路由，跨家换型号等于让新一家去读
// 别家的历史，所以换一家提供方要新开会话（契约里换家也是管理员专属）。别家的东西
// 一律不出现，免得用户以为可以直接挑。

import type { CatalogModel, ModelCatalog } from '../api/types'

/** 与服务端 `packages/server/src/settings.ts` 的 `ApprovalMode` 一致；数组顺序即界面顺序 */
export type ApprovalPolicy = 'always-ask' | 'read-only' | 'allow-all'

export interface ApprovalOption {
  id: ApprovalPolicy
  /** 下拉里显示的短标签 */
  label: string
  /** title / hint 里的一句话解释，说清这一档会发生什么 */
  hint: string
}

/** 默认档单独拎出来：认不出服务端给的值时回退到它，也省掉一次可能越界的下标取值 */
const ALWAYS_ASK: ApprovalOption = {
  id: 'always-ask',
  label: '每次问我',
  hint: '需要审批的动作会停下来问你（默认）',
}

export const APPROVAL_OPTIONS: readonly ApprovalOption[] = [
  ALWAYS_ASK,
  { id: 'read-only', label: '只读', hint: '需要审批的动作一律自动拒绝，只剩读取类工具能跑' },
  { id: 'allow-all', label: '全放行', hint: '不问，直接执行 —— 它会真的动手' },
]

export const DEFAULT_APPROVAL_POLICY: ApprovalPolicy = ALWAYS_ASK.id

/**
 * 把服务端回来的值收窄成三档之一。
 *
 * 认不出来就退回默认档，而不是让下拉空着：空着的下拉看起来像「配置坏了」，
 * 而服务端那边其实一直在按某个合法档位跑（旧客户端的 `auto-reject` 也走这条）。
 */
export function approvalOption(id: string | null | undefined): ApprovalOption {
  return APPROVAL_OPTIONS.find((option) => option.id === id) ?? ALWAYS_ASK
}

/** 当前这一家能选的模型。目录里没有这一家（还没拉到 / 刚换了家）就给空表，不猜。 */
export function providerModels(catalog: ModelCatalog | null, provider: string): CatalogModel[] {
  return catalog?.groups.find((group) => group.id === provider)?.models ?? []
}

/**
 * 下拉的候选项。
 *
 * 务必把**当前值**包进来：目录里没有它时（用户手填的型号、或清单没拉到），
 * `<select value>` 找不到对应的 option 会自己落到第一项 —— 界面显示的模型和服务端
 * 记着的不再是同一个，而这看起来正像「已经改好了」。宁可多出一个没有 label 的条目。
 */
export function modelChoices(catalog: ModelCatalog | null, provider: string, current: string): CatalogModel[] {
  const models = providerModels(catalog, provider)
  if (current === '' || models.some((model) => model.id === current)) return models
  return [{ id: current, label: current }, ...models]
}
