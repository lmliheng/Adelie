
/** 输出形态。text = 人读（默认）；json = 结束时一行结构化结果；stream-json = 事件逐行 NDJSON */
export type OutputFormat = 'text' | 'json' | 'stream-json';

/**
 * 提供方（协议族）。
 *
 * `openai` 指的是 `/chat/completions` 这一套协议而不是某一家厂商：Moonshot、通义、
 * 智谱、本机的 Ollama / vLLM 都能用它，靠 baseUrl 指到对应端点。
 * anthropic 与 gemini 是另一套协议，尚未实现。
 */
export type ProviderName = 'deepseek' | 'openai';

export interface CliArgs {
  /**
   * 顶层命令。
   *
   * `chat`（默认）是会话模式：交互式或 `--task` 一次性跑完。
   * `serve` 起 Web / PWA 用的后端（`adelie serve`），把界面交给浏览器或手机。
   */
  command: 'chat' | 'serve';
  workspacePath: string;
  resume: boolean;
  resumeSessionId: string | undefined;
  list: boolean;
  task: string | undefined;
  model: string;
  provider: ProviderName;
  /** 覆盖提供方的端点（本机 Ollama / vLLM 之类）。不传就用该提供方的默认端点 */
  baseUrl: string | undefined;
  maxIterations: number;
  /** 累计 token 上限；不传表示不限制 */
  maxTokens: number | undefined;
  outputFormat: OutputFormat;
  /** 不询问，自动批准需要审批的动作（无人值守脚本用；会真的改文件、跑命令） */
  yes: boolean;
  help: boolean;
  /** 只打印版本号然后退出 */
  version: boolean;
  /** `serve` 专用：监听端口；不传用服务端默认（7370，可用 PORT 覆盖） */
  servePort: number | undefined;
  /** `serve` 专用：监听地址；不传用 127.0.0.1（给手机连要显式 `--host 0.0.0.0`） */
  serveHost: string | undefined;
  /** `serve` 专用：访问凭证；绑非回环时服务端没给就自己随机生成一个 */
  serveToken: string | undefined;
  dev:boolean; // 调试模式
}