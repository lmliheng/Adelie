// src/kimi.provider.ts
//
// Kimi（Moonshot，月之暗面）。
//
// 为什么它只是一个 15 行的子类：Moonshot 的开放平台提供 `/v1/chat/completions`
// 这套与 OpenAI 相同的协议 —— 消息翻译、工具声明、SSE 增量拼接全都一样，
// 唯一不同的只有端点、密钥变量与报错里那个厂商标。复制一份 600 行的实现，
// 意味着以后每修一个分片解析的 bug 都要修两遍。
//
// 端点与默认模型写在 core 的模型目录里，这里取过来用：那两样东西属于「厂商的
// 事实」，不属于「协议的实现」，放在一处才好改。

import type { AgentProviderConfig } from 'adelie-core'
import { defaultBaseUrlForProvider } from 'adelie-core'
import { DeepSeekProvider } from './deepseek.provider.js'

/** 未显式配置 baseUrl 时使用的默认端点（Kimi 的 OpenAI 兼容端点） */
export const DEFAULT_KIMI_BASE_URL = defaultBaseUrlForProvider('kimi')

export class KimiProvider extends DeepSeekProvider {
    override readonly name: string = 'kimi'
    protected override readonly vendor: string = 'Moonshot（Kimi）'

    constructor(config: AgentProviderConfig) {
        super({ baseUrl: DEFAULT_KIMI_BASE_URL, ...config })
    }
}
