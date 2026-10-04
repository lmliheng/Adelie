# CHANGELOG

## 0.1.0 — 2026-10-04

第一个版本：把 AgentCode 里的 agent 应用迁到 Adelie，并给它加上三种新外壳。

### 引擎（从 AgentCode 迁入并改名）

- `adelie-core` / `adelie-providers` / `adelie-tools` / `adelie-runtime`：ReAct 循环、计划与
  真 replan、审批（默认拒绝 + 决定入事件流）、多重预算与 token 闸门、上下文折叠、
  交付物断言与回归验收、会话持久化 / 恢复 / 导出、MCP stdio 客户端、fs-guard 边界。
- 用户级配置目录 `~/.adelie/`；工作区指令文件认 `ADELIE.md` / `AGENTS.md` / `CLAUDE.md`。
- 迁移验证：类型检查与构建通过，**557 个测试通过 / 7 个跳过**（core 66、providers 37、
  tools 190、runtime 149、cli 115）。

### 新增

- `adelie-server`：HTTP + SSE 后端（会话、对话流、工具审批、取消、静态托管），契约见 docs/api.md。
- `adelie-web`：React + Vite 的对话界面，移动优先，含工具时间线、审批卡、设置与用量；可安装 PWA。
- `adelie-desktop`：Electron 壳（Windows）：挑端口、内置服务端、单实例、优雅退出；NSIS 安装包与免安装版。
- `adelie` CLI 新增 `--version`。
- 品牌：名字 Adelie 与图标（brand/BRAND.md）。
