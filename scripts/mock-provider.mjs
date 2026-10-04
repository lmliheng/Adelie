#!/usr/bin/env node
/**
 * 假的模型端点：一个最小的 OpenAI 兼容 `/chat/completions` 服务，用来在**没有 API Key**
 * 的情况下把整条链路跑通（浏览器 → adelie-server → runtime → tools → provider）。
 *
 * 它按剧本回话，不认识任何真实语义：
 *   1. 规划轮（用户消息里带「请先给出执行计划」）→ 回一个 request_replan 调用，给出两步计划；
 *   2. 还没有工具结果时 → 回一个 create_file 调用（这个工具需要审批，于是能顺带验审批链路）；
 *   3. 已经拿到工具结果 → 回一段正文，本轮结束。
 *
 * 用法：
 *   node scripts/mock-provider.mjs [--port 7699]
 *
 * 然后让 Adelie 指向它：
 *   OPENAI_API_KEY=mock ADELIE_WEB_DIST=packages/web/dist node packages/server/dist/main.js
 *   curl -X PATCH localhost:7370/api/config -H 'content-type: application/json' \
 *        -d '{"provider":"openai","baseUrl":"http://127.0.0.1:7699/v1/chat/completions","model":"mock"}'
 *
 * 它只该在你的机器上跑，不要暴露到网络上。
 */
import { createServer } from 'node:http';

const portArg = process.argv.indexOf('--port');
const PORT = portArg === -1 ? 7699 : Number(process.argv[portArg + 1]);

const MODEL = 'mock';
const TOOL_CALL_ID = 'call_mock_1';

/** 剧本：三步走。planning 只认规划轮的措辞，其余按「有没有工具结果」推进。 */
function scriptFor(messages) {
  const last = messages.at(-1);
  const lastText = typeof last?.content === 'string' ? last.content : '';

  if (lastText.includes('请先给出执行计划')) {
    return {
      kind: 'tool',
      reasoning: '先给一份两步计划。',
      name: 'request_replan',
      args: {
        reason: '初始计划',
        newPlan: [
          { description: '在工作区创建 ADELIE_E2E.md' },
          { description: '确认文件已写入' },
        ],
      },
      finish: 'tool_calls',
    };
  }

  const hasToolResult = messages.some((message) => message.role === 'tool');
  if (!hasToolResult) {
    return {
      kind: 'tool',
      reasoning: '用户要一个文件，先创建它。',
      name: 'create_file',
      args: {
        path: 'ADELIE_E2E.md',
        content: '# Adelie 端到端\n\n这一行由 mock provider 驱动的一次真实运行写入。\n',
      },
      finish: 'tool_calls',
    };
  }

  return {
    kind: 'content',
    reasoning: '文件已经创建好了，收尾。',
    // 收尾正文带上几种 Markdown：端到端要能看出「正文是渲染出来的，不是把源码显示出来」
    // （列表 / 行内代码 / 围栏代码块 —— 这三样一段纯文本回话里最容易分辨）
    content: [
      '已创建 ADELIE_E2E.md，里面有这次端到端运行写入的一行字。',
      '',
      '这次顺手验到的：',
      '',
      '- **审批链**：`create_file` 要人工点批准',
      '- **流式**：正文是切块送来的',
      '',
      '```bash',
      'cat ADELIE_E2E.md',
      '```',
    ].join('\n'),
    finish: 'stop',
  };
}

const usage = (messages) => ({
  prompt_tokens: 100 + JSON.stringify(messages).length / 4,
  completion_tokens: 40,
  total_tokens: 140 + JSON.stringify(messages).length / 4,
});

function toolCallDelta(script) {
  return {
    id: `chatcmpl-mock-${Date.now()}`,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: MODEL,
    choices: [
      {
        index: 0,
        delta: {
          role: 'assistant',
          reasoning_content: script.reasoning,
          tool_calls: [
            {
              index: 0,
              id: TOOL_CALL_ID,
              type: 'function',
              function: { name: script.name, arguments: JSON.stringify(script.args) },
            },
          ],
        },
        finish_reason: null,
      },
    ],
  };
}

function contentDeltas(script) {
  // 正文切成几块发：浏览器端只有真的按分片渲染，才算是验过流式。
  const pieces = script.content.match(/.{1,12}/gs) ?? [script.content];
  return pieces.map((piece, index) => ({
    id: `chatcmpl-mock-${Date.now()}`,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: MODEL,
    choices: [
      {
        index: 0,
        delta:
          index === 0
            ? { role: 'assistant', reasoning_content: script.reasoning, content: piece }
            : { content: piece },
        finish_reason: null,
      },
    ],
  }));
}

const server = createServer(async (req, res) => {
  if (!req.url?.startsWith('/v1/chat/completions')) {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'mock provider: 只有 /v1/chat/completions' } }));
    return;
  }

  let body = '';
  for await (const chunk of req) body += chunk;

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { message: '请求体不是 JSON' } }));
    return;
  }

  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const script = scriptFor(messages);
  const stream = payload.stream !== false;

  if (!stream) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        id: 'chatcmpl-mock',
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: MODEL,
        choices: [
          {
            index: 0,
            message:
              script.kind === 'tool'
                ? {
                    role: 'assistant',
                    content: null,
                    reasoning_content: script.reasoning,
                    tool_calls: [
                      {
                        id: TOOL_CALL_ID,
                        type: 'function',
                        function: { name: script.name, arguments: JSON.stringify(script.args) },
                      },
                    ],
                  }
                : { role: 'assistant', content: script.content },
            finish_reason: script.finish,
          },
        ],
        usage: usage(messages),
      }),
    );
    return;
  }

  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });

  const send = (chunk) => res.write(`data: ${JSON.stringify(chunk)}\n\n`);

  if (script.kind === 'tool') {
    send(toolCallDelta(script));
    send({
      ...toolCallDelta(script),
      choices: [{ index: 0, delta: {}, finish_reason: script.finish }],
    });
  } else {
    for (const chunk of contentDeltas(script)) send(chunk);
    send({
      choices: [{ index: 0, delta: {}, finish_reason: script.finish }],
      model: MODEL,
      usage: usage(messages),
    });
  }

  res.write('data: [DONE]\n\n');
  res.end();
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`mock provider 已启动：http://127.0.0.1:${PORT}/v1/chat/completions（model=${MODEL}）`);
});
