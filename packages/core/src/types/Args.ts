
/** 输出形态。text = 人读（默认）；json = 结束时一行结构化结果；stream-json = 事件逐行 NDJSON */
export type OutputFormat = 'text' | 'json' | 'stream-json';

/**
 * 提供方（协议族）的 id。
 *
 * 这里是**联合类型**而不是 `string`：它决定密钥读哪个环境变量、默认端点在哪、
 * 有哪些模型可选，所以不该允许一个拼错的名字悄悄走到运行时。具体的端点、密钥
 * 环境变量与模型清单在 `config/model-catalog.ts` 的目录里 —— 加一家厂商要先
 * 在这里加一个字面量，目录里少一组会被类型检查挡下。
 *
 * `openai` 指的还是 `/chat/completions` 这一套协议而不是某一家厂商：本机的
 * Ollama / vLLM 之类都能用它，把 `baseUrl` 指过去即可。Kimi 与通义（兼容模式）
 * 走的是同一套协议，因此在目录里各占一组、各自钉住自己的端点与密钥变量。
 */
export type ProviderName = 'deepseek' | 'openai' | 'kimi' | 'qwen';

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