/**
 * A Session's to-do list over the real app: `TODO.json` in the Session scratchpad.
 *
 * The point of the file is that the Agent writes it too, so most of what is checked here is the
 * two sides agreeing on one artifact: a hand-written file (junk entries and all) reads back as a
 * list, what the page PUTs lands in that same file, and a file that does not exist is an empty
 * list rather than a 404 — every Session has a to-do list, most never filled one in.
 */
import fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sessionScratchpadDir } from "@adelie/core";
import type { SessionTodosResponse } from "../src/api/types.js";
import {
  MAX_TODO_ITEMS,
  MAX_TODO_TEXT,
  normalizeTodosInput,
  parseTodos,
  serializeTodos,
  todosFilePath,
} from "../src/services/session-todos.js";
import { apiClient, createTestApp, loginAdmin } from "./helpers.js";
import type { TestApp } from "./helpers.js";

const PROJECT = "default_project";
const AGENT = "default_agent";
const SESSION = "session-2026-01-01-00-00-00-todo0001";

describe("a Session's to-do list", () => {
  let t: TestApp;
  let admin: ReturnType<typeof apiClient>;

  /** The file the Agent and the page both write. */
  const file = (): string => todosFilePath(t.root, PROJECT, AGENT, SESSION);
  const url = `/api/sessions/${SESSION}/todos`;

  const writeAgentFile = async (text: string): Promise<void> => {
    await fs.mkdir(sessionScratchpadDir(t.root, PROJECT, AGENT, SESSION), { recursive: true });
    await fs.writeFile(file(), text, "utf8");
  };

  beforeEach(async () => {
    t = await createTestApp();
    const session = await loginAdmin(t.app);
    admin = apiClient(t.app, session.cookie);
    const now = new Date().toISOString();
    t.deps.sessionsRepo.insert({
      sessionId: SESSION,
      projectId: PROJECT,
      agentId: AGENT,
      provider: "probe",
      modelId: "probe-model",
      workspace: t.root,
      approvalMode: "allow-all",
      title: null,
      client: "web",
      lastActiveAt: now,
      createdAt: now,
    });
  });

  afterEach(async () => {
    await t.cleanup();
  });

  it("answers an empty list when no file was ever written", async () => {
    const res = await admin.get(url);
    expect(res.status).toBe(200);
    expect((await res.json()) as SessionTodosResponse).toEqual({ items: [] });
  });

  it("reads the file the Agent wrote, dropping what is not an entry", async () => {
    await writeAgentFile(
      JSON.stringify({
        items: [
          { text: "写完文档", done: false },
          { text: "  " },
          "not an entry",
          null,
          { text: "已核对", done: true },
          { text: 42, done: false },
        ],
      }),
    );
    const body = (await (await admin.get(url)).json()) as SessionTodosResponse;
    expect(body.items).toEqual([
      { text: "写完文档", done: false },
      { text: "已核对", done: true },
    ]);
  });

  it("writes back the file the Agent reads, in the shape both sides document", async () => {
    const res = await admin.put(url, {
      items: [
        { text: "写文档", done: false },
        { text: "核对", done: true },
      ],
    });
    expect(res.status).toBe(200);
    expect((await res.json()) as SessionTodosResponse).toEqual({
      items: [
        { text: "写文档", done: false },
        { text: "核对", done: true },
      ],
    });
    // Byte-for-byte what serializeTodos documents, so a model opening the file sees the shape.
    expect(await fs.readFile(file(), "utf8")).toBe(
      serializeTodos([
        { text: "写文档", done: false },
        { text: "核对", done: true },
      ]),
    );
    // And a second read gets the same list back.
    const again = (await (await admin.get(url)).json()) as SessionTodosResponse;
    expect(again.items).toHaveLength(2);
  });

  it("creates the scratchpad directory for the first entry typed", async () => {
    await fs.rm(sessionScratchpadDir(t.root, PROJECT, AGENT, SESSION), {
      recursive: true,
      force: true,
    });
    const res = await admin.put(url, { items: [{ text: "第一件事", done: false }] });
    expect(res.status).toBe(200);
    expect(JSON.parse(await fs.readFile(file(), "utf8"))).toEqual({
      items: [{ text: "第一件事", done: false }],
    });
  });

  it("refuses a body that is not a list of entries, without touching the file", async () => {
    await admin.put(url, { items: [{ text: "留下的", done: false }] });
    const before = await fs.readFile(file(), "utf8");
    const bad = [
      {},
      { items: "nope" },
      { items: [{ done: true }] },
      { items: [{ text: "   " }] },
      { items: [{ text: "x".repeat(MAX_TODO_TEXT + 1) }] },
      { items: Array.from({ length: MAX_TODO_ITEMS + 1 }, () => ({ text: "x" })) },
    ];
    for (const body of bad) {
      const res = await admin.put(url, body);
      expect(res.status).toBe(400);
    }
    expect(await fs.readFile(file(), "utf8")).toBe(before);
  });

  it("404s a Session that does not exist", async () => {
    const res = await admin.get("/api/sessions/session-2026-01-01-00-00-00-nope/todos");
    expect(res.status).toBe(404);
  });
});

describe("the to-do file's parser", () => {
  it("is empty for anything that is not the file", () => {
    expect(parseTodos("")).toEqual([]);
    expect(parseTodos("{oops")).toEqual([]);
    expect(parseTodos("[]")).toEqual([]);
    expect(parseTodos('{"items":{}}')).toEqual([]);
    expect(parseTodos("null")).toEqual([]);
  });

  it("keeps a missing `done` as not done, and cuts a text past the cap", () => {
    const long = "x".repeat(MAX_TODO_TEXT + 50);
    expect(parseTodos(JSON.stringify({ items: [{ text: "a" }, { text: long }] }))).toEqual([
      { text: "a", done: false },
      { text: "x".repeat(MAX_TODO_TEXT), done: false },
    ]);
  });

  it("stops at the cap rather than reading an unbounded file", () => {
    const items = Array.from({ length: MAX_TODO_ITEMS + 20 }, (_, i) => ({ text: `t${i}` }));
    expect(parseTodos(JSON.stringify({ items }))).toHaveLength(MAX_TODO_ITEMS);
  });
});

describe("the client's list, normalized", () => {
  it("trims the text and defaults `done`", () => {
    expect(normalizeTodosInput([{ text: "  a  " }])).toEqual([{ text: "a", done: false }]);
    expect(normalizeTodosInput([{ text: "a", done: true }])).toEqual([{ text: "a", done: true }]);
  });

  it("refuses a shape it cannot store", () => {
    expect(() => normalizeTodosInput("x")).toThrow(/array/);
    expect(() => normalizeTodosInput([null])).toThrow(/items\[0\]/);
    expect(() => normalizeTodosInput([{ text: "a", done: "yes" }])).toThrow(/done/);
  });
});
