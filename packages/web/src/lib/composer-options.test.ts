// src/lib/composer-options.test.ts
//
// 这里钉住两件事：
//   1. 三档审批的 id 与服务端 `settings.ts` 的 `APPROVAL_MODES` 一致 —— 对不上就是一个
//      400，而这在界面上表现为「下拉点了没反应」，最难查。
//   2. 「当前这一家能选的模型」永远包含当前值 —— 少一个当前项，`<select>` 就会静默地
//      落到第一项，界面显示的模型与服务端记着的不再是同一个。
import { describe, expect, it } from 'vitest'

import {
  APPROVAL_OPTIONS,
  DEFAULT_APPROVAL_POLICY,
  approvalOption,
  modelChoices,
  providerModels,
} from './composer-options'
import type { ModelCatalog } from '../api/types'

const catalog: ModelCatalog = {
  default: 'deepseek',
  groups: [
    {
      id: 'deepseek',
      label: 'DeepSeek',
      envKey: 'DEEPSEEK_API_KEY',
      hasApiKey: true,
      models: [
        { id: 'deepseek-chat', label: 'DeepSeek Chat', default: true },
        { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner' },
      ],
    },
    {
      id: 'openai',
      label: 'OpenAI',
      envKey: 'OPENAI_API_KEY',
      hasApiKey: false,
      models: [{ id: 'gpt-4o', label: 'GPT-4o' }],
    },
  ],
}

describe('审批口径三档', () => {
  it('id 与服务端 APPROVAL_MODES 一字不差，且第一个是默认档', () => {
    expect(APPROVAL_OPTIONS.map((option) => option.id)).toEqual(['always-ask', 'read-only', 'allow-all'])
    expect(DEFAULT_APPROVAL_POLICY).toBe('always-ask')
  })

  it('每一档都有标签和一句说明（下拉里能看懂会发生什么）', () => {
    for (const option of APPROVAL_OPTIONS) {
      expect(option.label).not.toBe('')
      expect(option.hint).not.toBe('')
    }
  })

  it('认得出的值原样返回，认不出的（旧客户端的 auto-reject、空值）退回默认档', () => {
    expect(approvalOption('read-only').id).toBe('read-only')
    expect(approvalOption('allow-all').id).toBe('allow-all')
    for (const unknown of ['auto-reject', '', null, undefined, 'READ-ONLY']) {
      expect(approvalOption(unknown).id).toBe('always-ask')
    }
  })
})

describe('当前提供方能选的模型', () => {
  it('只取目录里这一家的模型，别家的一个都不出现', () => {
    expect(providerModels(catalog, 'deepseek').map((model) => model.id)).toEqual([
      'deepseek-chat',
      'deepseek-reasoner',
    ])
    expect(providerModels(catalog, 'openai').map((model) => model.id)).toEqual(['gpt-4o'])
  })

  it('目录里没有这一家、或目录没拉到，就给空表而不是猜', () => {
    expect(providerModels(catalog, 'anthropic')).toEqual([])
    expect(providerModels(null, 'deepseek')).toEqual([])
  })
})

describe('下拉候选项', () => {
  it('当前模型在目录里时原样返回，不重复', () => {
    const choices = modelChoices(catalog, 'deepseek', 'deepseek-reasoner')
    expect(choices.map((model) => model.id)).toEqual(['deepseek-chat', 'deepseek-reasoner'])
  })

  it('当前模型不在目录里（手填的型号 / 清单没拉到）时，把它补在最前面', () => {
    const choices = modelChoices(catalog, 'openai', 'mock')
    expect(choices.map((model) => model.id)).toEqual(['mock', 'gpt-4o'])
    expect(choices[0]?.label).toBe('mock')
  })

  it('目录没拉到也要留住当前值（否则 <select> 无处可落）', () => {
    expect(modelChoices(null, 'deepseek', 'deepseek-chat').map((model) => model.id)).toEqual(['deepseek-chat'])
  })

  it('配置还没读到（provider 与当前值都为空）时给空表，不凭空造一个模型', () => {
    expect(modelChoices(catalog, '', '')).toEqual([])
    expect(modelChoices(null, '', '')).toEqual([])
  })
})
