/**
 * The per-request image budget: a conversation accumulates images (every `read_file` of a
 * picture, every attachment), every request replays them, and a seller that counts them refuses
 * the whole conversation once the total passes its limit — Abliteration answers
 * `400 This request has more images than the limit of 4 … (media_count_exceeded)` for good, so
 * the Session itself has to send fewer.
 *
 * What is checked here: the pure trimming (newest images kept, older ones replaced by a text
 * note, tool results trimmed inside their own image list) and the wiring — a configured
 * `maxImages` reaches the client's history before the request opens, and the new input's own
 * images are counted against the same budget.
 */
import { describe, expect, it, vi } from "vitest";
import type { UniEvent, UniMessage } from "@prismshadow/agenthub";
import type { OmniMessage } from "../src/omnimessage/index.js";

const state = vi.hoisted(() => ({ clients: [] as { history: UniMessage[] }[] }));

vi.mock("@prismshadow/agenthub", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@prismshadow/agenthub")>();
  class FakeAutoLLMClient {
    history: UniMessage[] = [];
    constructor(_options: Record<string, unknown>) {
      state.clients.push(this);
    }
    getHistory(): UniMessage[] {
      return this.history;
    }
    setHistory(history: UniMessage[]): void {
      this.history = history;
    }
    async *streamingResponseStateful(): AsyncIterable<UniEvent> {
      // Nothing upstream: the tests only care about what the request would carry.
    }
    appendHistory(message: UniMessage): void {
      this.history = [...this.history, message];
    }
  }
  return { ...mod, AutoLLMClient: FakeAutoLLMClient };
});

const { GenerativeModel, capHistoryImages, countMessageImages, imageOmittedNote } =
  await import("../src/llm/generative-model.js");
const { imageUrlMessage, toolCallOutput, userText } = await import("../src/omnimessage/index.js");

const IMAGE = "data:image/png;base64,AAAA";

/** A user message carrying N images. */
const imageMessage = (n: number): UniMessage => ({
  role: "user",
  content_items: Array.from({ length: n }, () => ({
    type: "image_url" as const,
    image_url: IMAGE,
  })),
});

/** A tool result carrying N images, as read_file returns for a picture. */
const toolImageMessage = (n: number): UniMessage => ({
  role: "user",
  content_items: [
    {
      type: "tool_result",
      tool_call_id: "call_1",
      text: "image/png, 1 kB",
      images: Array.from({ length: n }, () => IMAGE),
    },
  ],
});

const imageCount = (history: UniMessage[]): number =>
  history.reduce((sum, msg) => sum + countMessageImages(msg), 0);

describe("countMessageImages", () => {
  it("counts image items, inline image blobs and a tool result's own images", () => {
    expect(countMessageImages(imageMessage(3))).toBe(3);
    expect(countMessageImages(toolImageMessage(2))).toBe(2);
    expect(
      countMessageImages({
        role: "user",
        content_items: [
          { type: "text", text: "hi" },
          { type: "inline_data", data: Buffer.from("x"), mime_type: "image/png" },
          // A non-image blob is not an image.
          { type: "inline_data", data: Buffer.from("x"), mime_type: "application/pdf" },
        ],
      }),
    ).toBe(1);
  });
});

describe("capHistoryImages", () => {
  it("keeps the newest images and replaces the older ones with a note", () => {
    const history = [imageMessage(2), imageMessage(2), imageMessage(1)];
    const capped = capHistoryImages(history, 4);
    expect(imageCount(capped)).toBe(4);
    // Walking backwards: the newest message (1) fits whole and message 1 fits too, which
    // leaves one image of the two in the oldest message.
    expect(capped[2]).toBe(history[2]);
    expect(capped[1]).toBe(history[1]);
    expect(countMessageImages(capped[0]!)).toBe(1);
    expect(capped[0]!.content_items).toEqual([
      { type: "text", text: imageOmittedNote(4) },
      { type: "image_url", image_url: IMAGE },
    ]);
  });

  it("trims a tool result inside its own image list and says so in its text", () => {
    const history = [toolImageMessage(3)];
    const capped = capHistoryImages(history, 1);
    const item = capped[0]!.content_items[0]!;
    expect(item.type).toBe("tool_result");
    if (item.type !== "tool_result") throw new Error("unreachable");
    expect(item.images).toEqual([IMAGE]);
    expect(item.text).toContain(imageOmittedNote(1));
    // The original message is not mutated: the same conversation may be replayed later.
    const original = history[0]!.content_items[0]!;
    if (original.type !== "tool_result") throw new Error("unreachable");
    expect(original.images).toHaveLength(3);
    expect(original.text).not.toContain("omitted");
  });

  it("leaves a fitting history alone: same array contents, same message objects", () => {
    const history = [imageMessage(1), imageMessage(2)];
    const capped = capHistoryImages(history, 4);
    expect(capped[0]).toBe(history[0]);
    expect(capped[1]).toBe(history[1]);
  });

  it("drops every replayed image when the budget is zero", () => {
    const capped = capHistoryImages([imageMessage(2), toolImageMessage(1)], 0);
    expect(imageCount(capped)).toBe(0);
    const tool = capped[1]!.content_items[0]!;
    if (tool.type !== "tool_result") throw new Error("unreachable");
    expect(tool.images).toBeUndefined();
    expect(tool.text).toContain(imageOmittedNote(0));
  });
});

describe("GenerativeModel image budget", () => {
  const build = (over: { maxImages?: number } = {}): GenerativeModel =>
    new GenerativeModel({
      modelId: "abliterated-model-large-flash",
      apiKey: "ak-test",
      clientType: "openai-chat",
      baseUrl: "https://api.abliteration.ai/v1",
      tools: [],
      ...over,
    });

  const lastClient = (): { history: UniMessage[] } => state.clients.at(-1)!;

  const run = async (model: GenerativeModel, newMessages: OmniMessage[]): Promise<void> => {
    for await (const _ of model.streamGenerate({ newMessages })) {
      // Nothing is produced — the fake stream is empty.
    }
  };

  it("trims the replayed history to the configured cap before the request opens", async () => {
    const model = build({ maxImages: 4 });
    model.setHistory([
      toolCallOutput({ toolCallId: "call_1", output: "image/png, 1 kB", images: [IMAGE] }),
      toolCallOutput({ toolCallId: "call_2", output: "image/png, 1 kB", images: [IMAGE] }),
      toolCallOutput({ toolCallId: "call_3", output: "image/png, 1 kB", images: [IMAGE] }),
      toolCallOutput({ toolCallId: "call_4", output: "image/png, 1 kB", images: [IMAGE] }),
      toolCallOutput({ toolCallId: "call_5", output: "image/png, 1 kB", images: [IMAGE] }),
    ]);
    expect(imageCount(lastClient().history)).toBe(5);
    await run(model, [userText("这几张图里哪个是红色的？")]);
    expect(imageCount(lastClient().history)).toBe(4);
  });

  it("counts the new input's images against the same budget", async () => {
    const model = build({ maxImages: 4 });
    model.setHistory([
      toolCallOutput({ toolCallId: "call_1", output: "image/png, 1 kB", images: [IMAGE] }),
      toolCallOutput({ toolCallId: "call_2", output: "image/png, 1 kB", images: [IMAGE] }),
      toolCallOutput({ toolCallId: "call_3", output: "image/png, 1 kB", images: [IMAGE] }),
      toolCallOutput({ toolCallId: "call_4", output: "image/png, 1 kB", images: [IMAGE] }),
    ]);
    // Two new pictures: the replay may keep only two of the four in history.
    await run(model, [imageUrlMessage(IMAGE), imageUrlMessage(IMAGE)]);
    expect(imageCount(lastClient().history)).toBe(2);
  });

  it("sends the history untouched when no cap is configured", async () => {
    const model = build();
    model.setHistory([
      toolCallOutput({ toolCallId: "call_1", output: "image/png, 1 kB", images: [IMAGE] }),
      toolCallOutput({ toolCallId: "call_2", output: "image/png, 1 kB", images: [IMAGE] }),
      toolCallOutput({ toolCallId: "call_3", output: "image/png, 1 kB", images: [IMAGE] }),
      toolCallOutput({ toolCallId: "call_4", output: "image/png, 1 kB", images: [IMAGE] }),
      toolCallOutput({ toolCallId: "call_5", output: "image/png, 1 kB", images: [IMAGE] }),
    ]);
    const before = lastClient().history;
    await run(model, [userText("hi")]);
    expect(lastClient().history).toBe(before);
    expect(imageCount(lastClient().history)).toBe(5);
  });
});
