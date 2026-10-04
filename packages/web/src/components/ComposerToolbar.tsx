// src/components/ComposerToolbar.tsx
//
// 输入区控制带上的两个菜单：**模型** 与 **审批口径**。
//
// 外观照搬 penguin 的输入卡底部：一个胶囊触发件（标记 + 当前值 + 紧凑箭头）加一个
// portal 出来的面板（标题条 + 行 + 打勾 + 脚注）。触发件与面板都在 ComposerMenu 里，
// 这里只负责「读配置、发 PATCH、失败说一句」这些应用的活 —— 于是输入框（Composer）
// 仍然只管把节点排进 `.composer-tools`，看一遍就懂。
//
// 为什么单独一个组件：这两个控件要读配置、要发 `PATCH /api/config`、要在失败时说一句。
// 把它从输入框里拆出来，输入框才能继续「看一遍就懂」。
//
// 跨提供方切换**不做**：Adelie 没有上下文压缩路由，换一家就得把别家的历史喂过去，
// 所以换家要新开会话（契约里换家还是管理员专属）。这个菜单只列当前提供方的模型，
// 别家的东西一律不出现，脚注里说明去哪换。
//
// 失败处理：控件是**受控**的，显示值 = 「正在提交的那个」??「服务端记着的那个」。
// PATCH 失败就把前一半清回 null，显示值自己回到服务端那份 —— 不留「界面显示改了、
// 服务端没改」的假象。成功时 saveConfig 已经把新配置写回，于是显示值也是新的。

import { useMemo, useState, type ReactNode } from 'react'
import { APPROVAL_OPTIONS, approvalOption, modelChoices } from '../lib/composer-options'
import type { ConfigInfo, ConfigPatch, ModelCatalog } from '../api/types'
import { ComposerMenu } from './ComposerMenu'

export function ComposerToolbar({
  config,
  catalog,
  saveConfig,
  notify,
}: {
  config: ConfigInfo | null
  /** `GET /api/models` 的模型目录；界面里一切模型名都从这里来，不硬编码 */
  catalog: ModelCatalog | null
  saveConfig: (patch: ConfigPatch) => Promise<boolean>
  /** 失败时说一句。走 App 的 toast（useToast），不在这里自己弹窗 */
  notify: (message: string) => void
}): ReactNode {
  // 只在一次 PATCH 在途时非 null；两边各自的提交互不覆盖
  const [pendingModel, setPendingModel] = useState<string | null>(null)
  const [pendingApproval, setPendingApproval] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const provider = config?.model.provider ?? ''
  const currentModel = config?.model.model ?? ''
  const currentApproval = approvalOption(config?.approvalPolicy ?? '')

  const choices = useMemo(() => modelChoices(catalog, provider, currentModel), [catalog, provider, currentModel])
  const modelValue = pendingModel ?? currentModel
  // 目录里没有这个型号（手填的 / 清单没拉到）就退回裸 id，触发件上总得有东西
  const modelLabel = choices.find((model) => model.id === modelValue)?.label ?? modelValue
  const approvalValue = pendingApproval ?? currentApproval.id
  const approval = approvalOption(approvalValue)

  const changeModel = async (next: string): Promise<void> => {
    // provider 为空说明配置还没读到，这时不提交；同值不必打一次 PATCH
    if (provider === '' || next === currentModel) return
    setPendingModel(next)
    setBusy(true)
    const ok = await saveConfig({ model: { provider, model: next } })
    setBusy(false)
    setPendingModel(null)
    if (!ok) notify('模型没换成，已回到原来的选择')
  }

  const changeApproval = async (next: string): Promise<void> => {
    const policy = approvalOption(next).id
    if (policy === currentApproval.id) return
    setPendingApproval(policy)
    setBusy(true)
    const ok = await saveConfig({ approvalPolicy: policy })
    setBusy(false)
    setPendingApproval(null)
    if (!ok) notify('审批口径没改成，已回到原来的选择')
  }

  return (
    <div className="composer-toolbar">
      <ComposerMenu
        label="模型"
        title="模型"
        glyph="cube"
        testId="model-select"
        menuName="model"
        value={modelValue}
        display={modelLabel === '' ? '模型读取中…' : modelLabel}
        disabled={busy || choices.length === 0}
        options={choices.map((model) => ({ value: model.id, label: model.label, detail: model.id }))}
        note={provider === '' ? '正在读取配置…' : `只列 ${provider} 这一家的模型；换一家提供方要新开会话`}
        onPick={(next) => {
          void changeModel(next)
        }}
      />

      <ComposerMenu
        label="审批口径"
        title="审批口径"
        glyph="shield"
        testId="approval-select"
        menuName="approval"
        value={approvalValue}
        display={config === null ? '读取中…' : approval.label}
        disabled={busy || config === null}
        options={APPROVAL_OPTIONS.map((option) => ({
          value: option.id,
          label: option.label,
          detail: option.hint,
        }))}
        note={config === null ? undefined : approval.hint}
        onPick={(next) => {
          void changeApproval(next)
        }}
      />
    </div>
  )
}
