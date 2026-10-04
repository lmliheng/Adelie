import { defineConfig } from 'vitest/config'

// 单独一个配置（而不是塞进 vite.config.ts）：单测只覆盖纯逻辑，不需要 react 插件，
// 分开也让 vite 的插件类型不必和 vitest 自带的那份 vite 类型混在一起。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
