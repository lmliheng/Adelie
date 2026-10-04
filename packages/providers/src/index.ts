// adelie-providers —— 模型适配（deepseek / openai 兼容端点 / kimi / qwen）
//
// 这里只有一套协议实现：`/chat/completions`。每多一家厂商，通常只是加一个
// 十几行的子类（换端点、换厂商标），协议本身不动。
export * from './Provider.js';
export * from './deepseek.provider.js';
export * from './openai.provider.js';
export * from './kimi.provider.js';
export * from './qwen.provider.js';
