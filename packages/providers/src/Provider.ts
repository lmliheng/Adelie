import type { AgentProvider, AgentProviderConfig, ProviderName } from 'adelie-core'
import { MODEL_CATALOG } from 'adelie-core'
import { DeepSeekProvider } from './deepseek.provider.js'
import { OpenAIProvider } from './openai.provider.js'
import { KimiProvider } from './kimi.provider.js'
import { QwenProvider } from './qwen.provider.js'

/**
 * 支持的 Provider 类型 —— 就是模型目录里的那些组 id。
 *
 * 别名留在 `adelie-core` 的 `ProviderName` 上（那里是联合类型的定义处），
 * 这里再导出一次，是为了让「协议层」自己也说得清它认识哪几家。
 */
export type ProviderType = ProviderName;

/**
 * 各家读取密钥的环境变量名。
 *
 * 从模型目录派生，而不是在这里再抄一份 —— 抄一份的代价是「加了一家厂商，
 * 命令行说你没配 key，可你明明配了」，而那是查起来最费时间的一类问题。
 */
export const PROVIDER_API_KEY_ENV = Object.fromEntries(
    MODEL_CATALOG.map((group) => [group.id, group.envKey]),
) as Record<ProviderType, string>;

/**
 * 创建 Provider 实例的工厂函数。
 *
 * 每一家都只是「同一个 chat-completions 实现 + 自己的端点」：目录里标了
 * `clientType: 'chat-completions'` 的组，装配方式完全相同。
 */
export function createProvider(
    type: ProviderType,
    config: AgentProviderConfig
): AgentProvider {
    switch (type) {
        case 'openai':
            return new OpenAIProvider(config);
        case 'deepseek':
            return new DeepSeekProvider(config);
        case 'kimi':
            return new KimiProvider(config);
        case 'qwen':
            return new QwenProvider(config);
        default:
            throw new Error(`不支持的 Provider 类型：${type satisfies never}`);
    }
}
