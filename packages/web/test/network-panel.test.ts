/**
 * The network panel's reading logic (features/network/net-rows.ts) and the recorder's own
 * guarantees (api/net-log.ts): which recorded requests a set of toolbar choices draws, how they
 * group by turn, what the summary counts, and — on the recorder's side — the ring's size, the
 * body cap, the turn a request is stamped with, and the masking the panel and the export both
 * rely on.
 *
 * These are pure/node-level checks (the package's tests run without a DOM): the entries are
 * built by hand, so a rule (a failed row, a slow one, a retried one) is pinned by construction
 * rather than by arranging a browser.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  NET_BODY_CAP,
  beginTurn,
  clearNetLog,
  finishNetRequest,
  isSensitiveName,
  maskBody,
  maskHeaders,
  maskSecret,
  maskUrlQuery,
  netLogEntries,
  netLogPaused,
  sessionIdForPath,
  sessionTurn,
  setNetLogPaused,
  setNetLogPrefs,
  startNetRequest,
} from "../src/api/net-log";
import type { NetRequest } from "../src/api/net-log";
import { netLogJson } from "../src/features/network/net-export";
import {
  filterNetEntries,
  groupByTurn,
  isNetFailure,
  isNetPending,
  isNetSlow,
  netStatusLabel,
  summarizeNet,
} from "../src/features/network/net-rows";

let seq = 0;

/** One recorded request, identified by arrival order so a list can be checked exactly. */
function entry(over: Partial<NetRequest> = {}): NetRequest {
  seq += 1;
  return {
    id: seq,
    kind: "http",
    method: "GET",
    path: `/api/sessions/s1/x${seq}`,
    url: `/api/sessions/s1/x${seq}`,
    sessionId: "s1",
    turn: 1,
    requestId: `r${seq}`,
    startedAt: 1_000_000 + seq * 1000,
    endedAt: 1_000_000 + seq * 1000 + 20,
    durationMs: 20,
    status: 200,
    resolution: null,
    error: null,
    attempts: 1,
    headers: [],
    requestBody: null,
    requestTruncated: false,
    responseHeaders: [],
    responseBody: null,
    responseTruncated: false,
    responseBytes: 0,
    frameCount: null,
    serverEndedAt: null,
    ...over,
  };
}

describe("filterNetEntries", () => {
  const rows = [
    entry({ sessionId: "s1", turn: 0, path: "/api/sessions/s1/messages" }),
    entry({ sessionId: "s1", turn: 1, path: "/api/sessions/s1/task" }),
    entry({ sessionId: "s1", turn: 2, path: "/api/sessions/s1/task" }),
    entry({ sessionId: "s2", turn: 1, path: "/api/sessions/s2/task" }),
  ];

  it("keeps only the Session on screen", () => {
    const out = filterNetEntries(rows, {
      sessionId: "s1",
      scope: "all",
      currentTurn: 2,
      type: "all",
      query: "",
    });
    expect(out.map((r) => r.sessionId)).toEqual(["s1", "s1", "s1"]);
  });

  it("'本次回复' keeps the current turn and the pre-turn group, newest first", () => {
    const out = filterNetEntries(rows, {
      sessionId: "s1",
      scope: "turn",
      currentTurn: 2,
      type: "all",
      query: "",
    });
    expect(out.map((r) => r.turn)).toEqual([2, 0]);
  });

  it("'最近 5 回合' keeps the newest five turns", () => {
    const many = Array.from({ length: 8 }, (_, i) => entry({ turn: i + 1 }));
    const out = filterNetEntries(many, {
      sessionId: "s1",
      scope: "recent",
      currentTurn: 8,
      type: "all",
      query: "",
    });
    expect([...new Set(out.map((r) => r.turn))].sort((a, b) => a - b)).toEqual([4, 5, 6, 7, 8]);
  });

  it("filters by type and searches path, status and kind", () => {
    const mixed = [
      entry({ kind: "http", path: "/api/a" }),
      entry({ kind: "model", path: "/api/sessions/s1/model" }),
      entry({ kind: "stream", path: "/api/sessions/s1/stream" }),
      entry({ kind: "upload", path: "/api/b" }),
    ];
    const base = { sessionId: "s1", scope: "all" as const, currentTurn: 1, query: "" };
    expect(filterNetEntries(mixed, { ...base, type: "model" })).toHaveLength(1);
    expect(filterNetEntries(mixed, { ...base, type: "all", query: "stream" })).toHaveLength(1);
    expect(filterNetEntries(mixed, { ...base, type: "all", query: "API/B" })).toHaveLength(1);
  });

  it("returns newest first", () => {
    const out = filterNetEntries(rows, {
      sessionId: "s1",
      scope: "all",
      currentTurn: 0,
      type: "all",
      query: "",
    });
    expect(out.map((r) => r.id)).toEqual(
      rows
        .filter((r) => r.sessionId === "s1")
        .map((r) => r.id)
        .reverse(),
    );
  });
});

describe("groupByTurn", () => {
  it("groups by turn, newest turn first, rows keeping arrival order", () => {
    const a = entry({ turn: 1 });
    const b = entry({ turn: 2 });
    const c = entry({ turn: 1 });
    const d = entry({ turn: 0 });
    const groups = groupByTurn([a, b, c, d]);
    expect(groups.map((g) => g.turn)).toEqual([2, 1, 0]);
    expect(groups[1]!.items.map((r) => r.id)).toEqual([a.id, c.id]);
  });
});

describe("row predicates and summary", () => {
  it("a 4xx/5xx status or a transport error is a failure; 200 is not", () => {
    expect(isNetFailure(entry({ status: 200 }))).toBe(false);
    expect(isNetFailure(entry({ status: 404 }))).toBe(true);
    expect(isNetFailure(entry({ status: null, error: "network_error" }))).toBe(true);
  });

  it("a row is pending until it is finished, and slow past the tag threshold", () => {
    expect(isNetPending(entry({ endedAt: null, durationMs: null }))).toBe(true);
    expect(isNetSlow(entry({ durationMs: 2000 }))).toBe(true);
    expect(isNetSlow(entry({ durationMs: 1999 }))).toBe(false);
  });

  it("the status cell names the code, the model mark, or the in-flight dots", () => {
    expect(netStatusLabel(entry({ status: 201 }))).toBe("201");
    expect(netStatusLabel(entry({ endedAt: null }))).toBe("···");
    expect(netStatusLabel(entry({ status: null, resolution: "completed" }))).toBe("completed");
  });

  it("counts requests, model calls, the failing ones and the frames", () => {
    const summary = summarizeNet([
      entry({ kind: "http", status: 200, durationMs: 10 }),
      entry({ kind: "model", status: 200, durationMs: 30 }),
      entry({ kind: "stream", frameCount: 12, durationMs: 5 }),
      entry({ kind: "http", status: 500, durationMs: 1 }),
    ]);
    expect(summary).toMatchObject({
      requests: 4,
      modelCalls: 1,
      durationMs: 46,
      failures: 1,
      frames: 12,
    });
  });
});

describe("sessionIdForPath", () => {
  it("reads the id from a session path, machine prefix and all", () => {
    expect(sessionIdForPath("/api/sessions/abc/task")).toBe("abc");
    expect(sessionIdForPath("/server/m1/api/sessions/abc/stream")).toBe("abc");
    expect(sessionIdForPath("/api/events")).toBeNull();
    expect(sessionIdForPath("/api/agents/x")).toBeNull();
  });
});

describe("masking", () => {
  it("names the sensitive headers and fields, and only those", () => {
    for (const name of [
      "authorization",
      "cookie",
      "set-cookie",
      "x-api-key",
      "refresh_token",
      "Api-Secret",
      "userPassword",
    ]) {
      expect(isSensitiveName(name)).toBe(true);
    }
    expect(isSensitiveName("content-type")).toBe(false);
    expect(isSensitiveName("accept")).toBe(false);
  });

  it("keeps the last four characters of a secret", () => {
    expect(maskSecret("abcdefgh")).toBe("••••efgh");
    expect(maskSecret("abc")).toBe("••••");
  });

  it("masks sensitive header values but leaves the rest", () => {
    const masked = maskHeaders([
      ["authorization", "Bearer supersecret1234"],
      ["content-type", "application/json"],
    ]);
    expect(masked[0]![1]).toBe("••••1234");
    expect(masked[1]![1]).toBe("application/json");
  });

  it("masks the sensitive query parameters", () => {
    expect(maskUrlQuery("/api/x?key=abcdefgh&page=2")).toBe("/api/x?key=••••efgh&page=2");
    expect(maskUrlQuery("/api/x?access_token=zzzz9999")).toBe("/api/x?access_token=••••9999");
  });

  it("masks secret-named JSON fields, nested ones included, and leaves other bodies alone", () => {
    const masked = maskBody(JSON.stringify({ api_key: "abcdefgh", nested: { token: "12345678" } }));
    expect(JSON.parse(masked!)).toEqual({ api_key: "••••efgh", nested: { token: "••••5678" } });
    expect(maskBody("not json")).toBe("not json");
    expect(maskBody(null)).toBeNull();
  });
});

describe("the recorder store", () => {
  beforeEach(() => {
    clearNetLog();
    setNetLogPaused(false);
    setNetLogPrefs({ capacity: 300, recordBody: true, inlineRow: true, slowHighlight: true });
  });

  it("stamps a request with the Session's current turn", () => {
    beginTurn("s1", 4);
    expect(sessionTurn("s1")).toBe(4);
    const rec = startNetRequest({
      kind: "http",
      method: "GET",
      path: "/api/sessions/s1/x",
      url: "/x",
    });
    expect(rec!.turn).toBe(4);
    expect(rec!.sessionId).toBe("s1");
  });

  it("completes a row with its status and body, and truncates a body over the cap", () => {
    const rec = startNetRequest({ kind: "http", method: "GET", path: "/api/x", url: "/api/x" });
    finishNetRequest(rec, { status: 200, responseBody: "z".repeat(NET_BODY_CAP + 10) });
    expect(rec!.status).toBe(200);
    expect(rec!.responseBody!.length).toBe(NET_BODY_CAP);
    expect(rec!.responseTruncated).toBe(true);
    expect(rec!.durationMs).not.toBeNull();
  });

  it("keeps the ring at its capacity, dropping the oldest", () => {
    setNetLogPrefs({ capacity: 20 });
    for (let i = 0; i < 25; i += 1) {
      startNetRequest({ kind: "http", method: "GET", path: `/api/x/${i}`, url: `/api/x/${i}` });
    }
    const kept = netLogEntries();
    expect(kept).toHaveLength(20);
    expect(kept[kept.length - 1]!.path).toBe("/api/x/24");
  });

  it("records nothing while paused, and again once resumed", () => {
    setNetLogPaused(true);
    expect(netLogPaused()).toBe(true);
    expect(
      startNetRequest({ kind: "http", method: "GET", path: "/api/x", url: "/api/x" }),
    ).toBeNull();
    expect(netLogEntries()).toHaveLength(0);
    setNetLogPaused(false);
    startNetRequest({ kind: "http", method: "GET", path: "/api/x", url: "/api/x" });
    expect(netLogEntries()).toHaveLength(1);
  });
});

// The export path's mask-on-the-way-out rule, kept pinned without the DOM download itself.
describe("netLogJson", () => {
  it("masks headers and bodies as it serializes", () => {
    const json = netLogJson([
      entry({
        headers: [["authorization", "Bearer secret9999"]],
        requestBody: JSON.stringify({ api_key: "abcdefgh" }),
      }),
    ]);
    expect(json).not.toContain("secret9999");
    expect(json).not.toContain("abcdefgh");
    expect(json).toContain("••••9999");
    expect(json).toContain("••••efgh");
  });
});
