// vitest.config.ts
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        // 集成测试要起真实的 http 服务、跑完一整轮运行时循环（含验收），
        // 默认的 5s 在冷启动时会不够
        testTimeout: 40000,
        hookTimeout: 20000,
        exclude: [...configDefaults.exclude, '**/.qwen/**'],
    },
});
