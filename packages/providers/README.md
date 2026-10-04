# adelie-providers

模型适配层：把 deepseek / openai / kimi / qwen 收敛到同一套 `Provider` 接口上，
runtime 只认接口，不认厂商。

这四家都由 `adelie-core` 的模型目录（`config/model-catalog.ts`）登记：端点、
密钥环境变量、可选模型都在那张表里。它们说的是同一套 `/chat/completions` 协议，
所以加一家厂商通常是往目录里加一组，而不是在这里新写一个类。

依赖 `adelie-core`。构建与发布方式见仓库根 README。
