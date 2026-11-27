/**
 * The model rows' content half (api/net-log.ts): a row is drawn from the stream's
 * `request_begin`/`request_end`, and its request/response bodies are attached later from the
 * server's ring. What is checked here is the join: the row keeps the server-clock time its
 * `request_end` carried (the browser's clock cannot line up with the record), and attaching a
 * body fills exactly the fields the panel's request/response tabs read.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  attachModelExchange,
  clearNetLog,
  netLogEntries,
  netLogPrefs,
  noteNetModelEvent,
  setNetLogPrefs,
} from "../src/api/net-log";
import type { OmniMessage } from "@adelie/core/omnimessage";

const event = (type: string, extra: Record<string, unknown> = {}, ts?: string): OmniMessage =>
  ({
    timestamp: ts ?? "2026-11-27T08:00:00.000Z",
    type: "event_msg",
    payload: { type, ...extra },
  }) as unknown as OmniMessage;

beforeEach(() => {
  clearNetLog();
  setNetLogPrefs({ recordBody: true });
});
afterEach(() => {
  clearNetLog();
});

describe("model rows and their content", () => {
  it("keeps the server clock from request_end", () => {
    noteNetModelEvent("s1", event("request_begin", {}, "2026-11-27T08:00:00.000Z"));
    noteNetModelEvent(
      "s1",
      event("request_end", { status: "completed", attempt: 1 }, "2026-11-27T08:00:05.250Z"),
    );
    const [row] = netLogEntries();
    expect(row!.kind).toBe("model");
    expect(row!.serverEndedAt).toBe(Date.parse("2026-11-27T08:00:05.250Z"));
    expect(row!.requestBody).toBeNull();
  });

  it("names the provider endpoint the request_begin event carries", () => {
    noteNetModelEvent(
      "s1",
      event("request_begin", {
        endpoint: {
          model: "claude-4-8",
          clientType: "claude-4-8",
          baseUrl: "https://api.example.com",
          url: "https://api.example.com/v1/messages",
        },
      }),
    );
    const [row] = netLogEntries();
    expect(row!.url).toBe("https://api.example.com/v1/messages");
    expect(row!.path).toBe("api.example.com/v1/messages");
    expect(row!.model).toBe("claude-4-8");
    expect(row!.clientType).toBe("claude-4-8");
  });

  it("fills request and response bodies, bytes and truncation flags", () => {
    noteNetModelEvent("s1", event("request_begin"));
    noteNetModelEvent("s1", event("request_end", { status: "completed" }));
    const [row] = netLogEntries();
    attachModelExchange(row!, {
      requestBody: '{"messages":[{"role":"user"}]}',
      responseBody: '{"text":"hi"}',
      requestTruncated: false,
      responseTruncated: true,
      url: "https://api.example.com/v1/messages",
      model: "claude-4-8",
      clientType: "claude-4-8",
    });
    expect(row!.requestBody).toBe('{"messages":[{"role":"user"}]}');
    expect(row!.url).toBe("https://api.example.com/v1/messages");
    expect(row!.path).toBe("api.example.com/v1/messages");
    expect(row!.model).toBe("claude-4-8");
    expect(row!.clientType).toBe("claude-4-8");
    expect(row!.responseBody).toBe('{"text":"hi"}');
    expect(row!.requestTruncated).toBe(false);
    expect(row!.responseTruncated).toBe(true);
    expect(row!.responseBytes).toBe('{"text":"hi"}'.length);
  });

  it("leaves bodies out when body recording is off", () => {
    setNetLogPrefs({ recordBody: false });
    noteNetModelEvent("s1", event("request_begin"));
    noteNetModelEvent("s1", event("request_end", { status: "completed" }));
    const [row] = netLogEntries();
    attachModelExchange(row!, {
      requestBody: "{}",
      responseBody: "{}",
      requestTruncated: false,
      responseTruncated: false,
      url: "https://api.example.com/chat/completions",
      model: "claude-4-8",
      clientType: null,
    });
    expect(row!.requestBody).toBeNull();
    expect(row!.url).toBe("https://api.example.com/chat/completions");
    expect(row!.responseBody).toBeNull();
    expect(netLogPrefs().recordBody).toBe(false);
  });
});
