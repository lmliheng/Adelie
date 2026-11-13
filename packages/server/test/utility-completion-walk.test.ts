/**
 * The walk `completeOnce` takes over a Project's free models, against a real socket: a free
 * endpoint that refuses is followed by the next free one, and the Project's paid default model
 * is never asked at all — the point of the walk being that generating an id costs nothing.
 *
 * The mock speaks the OpenAI streaming shape on `/chat/completions`, the same branch
 * `packages/web/e2e/mock-llm.mjs` serves: a model pinned to `openai-chat` reaches it. Nothing
 * outside this process is contacted.
 */
import http from "node:http";
import fs from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { wire } from "@adelie/core/kernel";
import { projectConfigPath, projectDir } from "@adelie/core";
import { ProjectConfigService } from "../src/services/project-config-service.js";
import { makeTempRoot } from "./helpers.js";

/** One streaming chat completion, as the OpenAI client expects to read one. */
function answer(res: http.ServerResponse, model: string, text: string): void {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  const chunk = (delta: Record<string, unknown>, finish: string | null = null) =>
    `data: ${JSON.stringify({
      id: "chatcmpl-walk",
      object: "chat.completion.chunk",
      created: 0,
      model,
      choices: [{ index: 0, delta, finish_reason: finish }],
    })}\n\n`;
  res.write(chunk({ role: "assistant", content: "" }));
  res.write(chunk({ content: text }));
  res.write(chunk({}, "stop"));
  res.write(
    `data: ${JSON.stringify({
      id: "chatcmpl-walk",
      object: "chat.completion.chunk",
      created: 0,
      model,
      choices: [],
      usage: { prompt_tokens: 20, completion_tokens: 3, total_tokens: 23 },
    })}\n\n`,
  );
  res.write("data: [DONE]\n\n");
  res.end();
}

describe("completeOnce's walk over a Project's free models", () => {
  let server: http.Server | undefined;

  afterEach(() => {
    server?.close();
    server = undefined;
  });

  it("moves on from a free model that refuses, and never asks the paid default", async () => {
    const asked: string[] = [];
    server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        if (req.method !== "POST" || !(req.url ?? "").includes("chat/completions")) {
          res.writeHead(404).end();
          return;
        }
        let model = "";
        try {
          model = String((JSON.parse(body) as { model?: unknown }).model ?? "");
        } catch {
          /* a body this test cannot read is not what it is here to check */
        }
        asked.push(model);
        // The first free model of the config is throttled out of existence; the second one
        // answers. `paid-model` would answer too — it must never be reached.
        if (model === "free-one") {
          res.writeHead(401, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: { message: "invalid api key", type: "auth" } }));
          return;
        }
        answer(res, model, model === "free-two" ? "report_writer" : "paid_model_answer");
      });
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;

    const root = await makeTempRoot();
    await fs.mkdir(projectDir(root, "p1"), { recursive: true });
    const free = (modelId: string) =>
      `[[models]]\nprovider = "custom"\nmodel_id = "${modelId}"\n` +
      `api_key = "sk-${modelId}"\nbase_url = "http://127.0.0.1:${port}/v1"\n` +
      `client_type = "openai-chat"\n` +
      `pricing = { unit = "usd_per_mtok", cache_read = 0, cache_write = 0, output = 0 }\n`;
    // The paid row is the Project's default model, and the one an earlier build would have
    // asked: it sits first in the file, so only the free filter keeps it out of the walk.
    await fs.writeFile(
      projectConfigPath(root, "p1"),
      '[default_model]\nprovider = "custom"\nmodel_id = "paid-model"\n\n' +
        `[[models]]\nprovider = "custom"\nmodel_id = "paid-model"\n` +
        `api_key = "sk-paid"\nbase_url = "http://127.0.0.1:${port}/v1"\n` +
        `client_type = "openai-chat"\n` +
        `pricing = { unit = "usd_per_mtok", cache_read = 0.04, cache_write = 2, output = 8 }\n\n` +
        free("free-one") +
        "\n" +
        free("free-two"),
      "utf8",
    );

    const service = wire(ProjectConfigService, { paths: { root } });
    expect(await service.completeOnce("p1", "Name: Report Writer")).toEqual({
      ok: true,
      text: "report_writer",
    });
    // Config order, and the paid default never asked.
    expect(asked).toEqual(["free-one", "free-two"]);
  });
});
