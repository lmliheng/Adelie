/**
 * readSse: the SSE framing of an AMSP body, as the SDK and the server's wire tests read it.
 *
 * - Given a body with keep-alive comments, fields other than `data`, a field without a colon and
 *   a multi-line data block, each event's data comes out once, its lines joined with `\n`.
 * - Given the same body with CRLF or lone-CR line endings, delivered whole or a byte at a time
 *   (splitting line endings and UTF-8 characters), the events read the same.
 * - Given a body that ends inside an event, that event is not dispatched.
 * - Given a body that errors (a dropped connection), the read rejects with that error after the
 *   events that arrived.
 * - Given a caller that stops after the first event, the body is cancelled: the connection
 *   closes rather than being read on.
 * - Given an abort between two events of one chunk, the next read rejects with the abort reason
 *   and the events buffered behind it are not dispatched, a buffered `[DONE]` included.
 * - Given an abort after the last event of the body was dispatched, the next read rejects rather
 *   than completing.
 */
import { describe, expect, it } from "vitest";
import { readSse } from "../src/index.js";
import { sseData } from "../src/sse.js";

const encoder = new TextEncoder();

/** A body that delivers `text` in chunks of `size` bytes (the whole text when `size` is 0). */
function body(text: string, size = 0): ReadableStream<Uint8Array> {
  const bytes = encoder.encode(text);
  const step = size || bytes.length;
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + step));
      offset += step;
    },
  });
}

async function read(stream: ReadableStream<Uint8Array>): Promise<string[]> {
  const out: string[] = [];
  for await (const data of readSse(stream)) out.push(data);
  return out;
}

const STREAM = [
  ": keep-alive",
  "",
  'data: {"type":"text.done","text":"Grüße 🐧"}',
  "",
  "event: ignored",
  "id: 7",
  "retry: 1000",
  "data:first line",
  "data: second line",
  "data",
  "",
  ": keep-alive",
  "",
  "data: [DONE]",
  "",
  "",
].join("\n");

const EVENTS = ['{"type":"text.done","text":"Grüße 🐧"}', "first line\nsecond line\n", "[DONE]"];

describe("readSse", () => {
  it("yields each event's data once, skipping comments and every other field", async () => {
    expect(await read(body(STREAM))).toEqual(EVENTS);
  });

  it.each([
    { endings: "LF", ending: "\n", size: 1, how: "a byte at a time" },
    { endings: "CRLF", ending: "\r\n", size: 0, how: "whole" },
    { endings: "CRLF", ending: "\r\n", size: 1, how: "a byte at a time" },
    { endings: "CRLF", ending: "\r\n", size: 3, how: "three bytes at a time" },
    { endings: "lone-CR", ending: "\r", size: 0, how: "whole" },
    { endings: "lone-CR", ending: "\r", size: 1, how: "a byte at a time" },
  ])("reads $endings line endings delivered $how the same", async ({ ending, size }) => {
    expect(await read(body(STREAM.replaceAll("\n", ending), size))).toEqual(EVENTS);
  });

  it("drops an event the body ends inside", async () => {
    expect(await read(body('data: {"a":1}\n\ndata: {"b":2}\n'))).toEqual(['{"a":1}']);
    expect(await read(body('data: {"a":1}\n\ndata: {"b":'))).toEqual(['{"a":1}']);
  });

  it("rejects with the body's error after the events that arrived", async () => {
    const dropped = new TypeError("terminated");
    let sent = false;
    const breaking = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent) return controller.error(dropped);
        sent = true;
        controller.enqueue(encoder.encode("data: first\n\n"));
      },
    });
    const seen: string[] = [];

    await expect(
      (async () => {
        for await (const data of readSse(breaking)) seen.push(data);
      })(),
    ).rejects.toBe(dropped);
    expect(seen).toEqual(["first"]);
  });

  it("cancels the body when the caller stops after the first event", async () => {
    let cancelled = false;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(encoder.encode("data: tick\n\n"));
      },
      cancel() {
        cancelled = true;
      },
    });
    for await (const data of readSse(endless)) {
      expect(data).toBe("tick");
      break;
    }
    expect(cancelled).toBe(true);
  });

  // The caller's loop body runs while the generator is suspended at `yield`, so an abort there
  // arrives without a read to notice it: the rest of the chunk is already parsed and must not be
  // dispatched.
  it("rejects an abort between events without delivering the rest of the chunk", async () => {
    const control = new AbortController();
    const reason = new Error("Stopped by the caller");
    const events = sseData(body("data: first\n\ndata: second\n\n"), control.signal);
    try {
      expect((await events.next()).value).toBe("first");
      control.abort(reason);
      await expect(events.next()).rejects.toBe(reason);
    } finally {
      await events.return(undefined);
    }
  });

  it("rejects an abort on a buffered [DONE] rather than ending the read", async () => {
    const control = new AbortController();
    const reason = new Error("Stopped before DONE");
    const events = sseData(body("data: keep\n\ndata: [DONE]\n\n"), control.signal);
    try {
      expect((await events.next()).value).toBe("keep");
      control.abort(reason);
      await expect(events.next()).rejects.toBe(reason);
    } finally {
      await events.return(undefined);
    }
  });

  it("rejects an abort after the event at the end of the body instead of completing", async () => {
    const control = new AbortController();
    const reason = new Error("Stopped at EOF");
    const events = sseData(body("data: final\n\n"), control.signal);
    try {
      expect((await events.next()).value).toBe("final");
      control.abort(reason);
      await expect(events.next()).rejects.toBe(reason);
    } finally {
      await events.return(undefined);
    }
  });
});
