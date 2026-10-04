// src/qwen.provider.ts
//
// 通义千问（阿里云 DashScope 的「兼容模式」端点）。
//
// 与 Kimi 同源：DashScope 的 compatible-mode 就是 `/chat/completions` 那一套，
// 所以这里同样只换端点、密钥变量与厂商标，协议实现复用 DeepSeek 那份。
//
// 为什么不去接 DashScope 的原生协议（`/api/v1/services/aigc/text-generation/generation`）：
// 多一套协议就多一份要跟着上游改的翻译层，而兼容端点在功能上已经等价。
// 真要原生能力（比如某些多模态接口）时再单独加，而不是现在就写一份用不上的。

import type { AgentProviderConfig } from 'adelie-core'
import { defaultBaseUrlForProvider } from 'adelie-core'
import { DeepSeekProvider } from './deepseek.provider.js'

/** 未显式配置 baseUrl 时使用的默认端点（DashScope 兼容模式） */
export const DEFAULT_QWEN_BASE_URL = defaultBaseUrlForProvider('qwen')

export class QwenProvider extends DeepSeekProvider {
    override readonly name: string = 'qwen'
    protected override readonly vendor: string = 'DashScope（通义千问）'

    constructor(config: AgentProviderConfig) {
        super({ baseUrl: DEFAULT_QWEN_BASE_URL, ...config })
    }
}
