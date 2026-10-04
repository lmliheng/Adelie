// src/components/ComposerToolbar.tsx
//
// 输入区控制带上的两个下拉：**模型** 与 **审批口径**。
//
// 为什么单独一个组件：Composer 是哑的（只管把节点排进 `.composer-tools`），而这两个
// 控件要读配置、要发 `PATCH /api/config`、要在失败时说一句 —— 那些是应用的活。把它从
// 输入框里拆出来，输入框才能继续「看一遍就懂」。
//
// 跨提供方切换**不做**：Adelie 没有上下文压缩路由，换一家就得把别家的历史喂过去，
// 所以换家要新开会话（契约里换家还是管理员专属）。这个下拉只列当前提供方的模型，
// 别家的东西一律不出现，用 title 说明去哪换。
//
// 失败处理：控件是**受控**的，显示值 = 「正在提交的那个」??「服务端记着的那个」。
// PATCH 失败就把前一半清回 null，显示值自己回到服务端那份 —— 不留「界面显示改了、
// 服务端没改」的假象。成功时 saveConfig 已经把新配置写回，于是显示值也是新的。

import { useMemo, useState, type ReactNode } from 'react'
import { APPROVAL_OPTIONS, approvalOption, modelChoices } from '../lib/composer-options'
import type { ConfigInfo, ConfigPatch, ModelCatalog } from '../api/types'

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
  const approval = approvalOption(pendingApproval ?? currentApproval.id)

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
      {/* 标签给屏幕阅读器：控制带只有几十像素高，肉眼看下拉里的模型名就知道是什么 */}
      <label className="sr-only" htmlFor="composer-model">
        模型
      </label>
      <select
        id="composer-model"
        className="composer-select"
        data-testid="model-select"
        title={
          provider === ''
            ? '正在读取配置…'
            : `只列 ${provider} 这一家的模型；换一家提供方要新开会话`
        }
        value={pendingModel ?? currentModel}
        disabled={busy || choices.length === 0}
        onChange={(event) => {
          void changeModel(event.target.value)
        }}
      >
        {choices.length === 0 && <option value="">模型读取中…</option>}
        {choices.map((model) => (
          <option key={model.id} value={model.id}>
            {model.label}
          </option>
        ))}
      </select>

      <label className="sr-only" htmlFor="composer-approval">
        审批口径
      </label>
      <select
        id="composer-approval"
        className="composer-select"
        data-testid="approval-select"
        title={approval.hint}
        value={approval.id}
        disabled={busy || config === null}
        onChange={(event) => {
          void changeApproval(event.target.value)
        }}
      >
        {config === null ? (
          <option value={approval.id}>审批口径读取中…</option>
        ) : (
          APPROVAL_OPTIONS.map((option) => (
            <option key={option.id} value={option.id} title={option.hint}>
              {option.label}
            </option>
          ))
        )}
      </select>
    </div>
  )
}
