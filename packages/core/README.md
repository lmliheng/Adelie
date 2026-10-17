# @adelie/core

The Adelie SDK and execution engine: the ReAct loop (`context_engine`), the OmniMessage protocol, the LLM / Environment interface contracts, Agent State and append-only Traces.

The engine speaks only OmniMessage and delegates everything else through two swappable interfaces — `LLMInterface` (models, via the [`@prismshadow/agenthub`](https://www.npmjs.com/package/@prismshadow/agenthub) gateway) and `EnvironmentInterface` (tool execution). The SDK caller is the Human boundary: one entry point, `session.run`, streams the whole loop.

```ts
import { createAgent, isCompleteModelMessage, userText } from "@adelie/core";

const agent = await createAgent({ agentId: "default_agent" });
const session = await agent.createSession({ workspaceDir: process.cwd() });

for await (const output of session.run([userText("Create hello.txt containing hi")], {
  approve: async () => "allow", // per-tool-call approval
})) {
  if (isCompleteModelMessage(output) && output.payload.type === "text") {
    console.log(output.payload.text);
  }
}
```

A single `run` drives a complete Task: streaming output, per-call approvals, concurrent tool execution, interrupt carry-over, automatic reconnect and context compaction. State lives under `~/.adelie/data` (`ADELIE_HOME`, or the pre-rename `PENGUIN_HOME`); every Session restores fully from its Trace.

## Documentation

- [Architecture](https://lmliheng.github.io/Adelie/docs/architecture)
- [The OmniMessage Protocol](https://lmliheng.github.io/Adelie/docs/omni-message)
- [Core Interfaces](https://lmliheng.github.io/Adelie/docs/interfaces)
- [The Agent Loop](https://lmliheng.github.io/Adelie/docs/agent-loop)
- [Sessions & Traces](https://lmliheng.github.io/Adelie/docs/sessions-and-traces)

## Development

```bash
pnpm --filter @adelie/core build       # tsup → dist/ (exports point at dist)
pnpm --filter @adelie/core typecheck
pnpm --filter @adelie/core test
pnpm test:e2e                                       # live-model e2e (needs DEEPSEEK_API_KEY)
```

Part of [Adelie](https://github.com/lmliheng/Adelie) · Apache-2.0
