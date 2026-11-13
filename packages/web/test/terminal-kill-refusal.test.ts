/**
 * Ending a terminal the server REFUSES (features/terminal/terminal-list.ts).
 *
 * The kill is optimistic — the entry leaves the list before the round trip, so the tab and the
 * count react to the user's own click — which used to make a refusal invisible twice over: the
 * non-2xx answer was not even read, a network failure was swallowed, and the entry was never
 * given back, so the screen showed a shell as ended while it was still running. What is pinned
 * here is the other half of the contract: a refusal hands the entry back and rejects with the
 * server's words (a `terminal_not_found` is the app's own sentence), a network failure is the
 * app's `network_error`, and the DELETE still addresses the machine that holds the shell.
 */
import { describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import {
  killTerminal,
  liveTerminals,
  noteTerminalCreated,
} from "../src/features/terminal/terminal-list";
import { rememberTerminalMachine, forgetTerminalMachines } from "../src/lib/terminal-machines";
import { apiError, json, stubFetch } from "./helpers/fetch";
import type { TerminalInfo } from "../src/features/terminal/terminal-view";

/** A live shell as the list holds it. */
function terminal(id: string): TerminalInfo {
  return { id, name: id, cwd: "/tmp", alive: true };
}

/** Is this terminal in the list the UI draws? */
function listed(id: string): boolean {
  return liveTerminals().some((t) => t.id === id);
}

describe("a kill the server refused", () => {
  it("puts the entry back and rejects with the server's own code", async () => {
    // The server still lists the shell (it was never ended) and refuses the DELETE under it.
    const fake = stubFetch((request) =>
      request.method === "DELETE"
        ? apiError(404, "terminal_not_found", "Terminal does not exist or has been closed.")
        : json({ terminals: [terminal("t-refused")] }),
    );
    noteTerminalCreated(terminal("t-refused"));

    await expect(killTerminal("t-refused")).rejects.toMatchObject({
      name: "ApiError",
      status: 404,
      code: "terminal_not_found",
    });
    // The shell is still there, so the list the tabs are drawn from has to hold it again.
    expect(listed("t-refused")).toBe(true);
    expect(fake.requests.filter((r) => r.method === "DELETE").map((r) => r.path)).toEqual([
      "/api/terminals/t-refused",
    ]);
    // The refusal also re-reads the list: the answer, not the optimistic removal, decides.
    expect(fake.requests.some((r) => r.method === "GET")).toBe(true);
  });

  it("treats a dropped connection as a refusal too — the shell never heard the request", async () => {
    stubFetch(() => {
      throw new TypeError("Failed to fetch");
    });
    noteTerminalCreated(terminal("t-unreachable"));

    const refusal = await killTerminal("t-unreachable").catch((err: unknown) => err);
    expect(refusal).toBeInstanceOf(ApiError);
    expect((refusal as ApiError).code).toBe("network_error");
    expect(listed("t-unreachable")).toBe(true);
  });
});

describe("a kill that landed", () => {
  it("leaves the entry out of the list, and goes to the machine that holds the shell", async () => {
    const fake = stubFetch(() => new Response(null, { status: 204 }));
    noteTerminalCreated(terminal("t-landed"));
    rememberTerminalMachine("t-landed", "M1");
    try {
      await killTerminal("t-landed");
      expect(listed("t-landed")).toBe(false);
      // The pty is on one machine's kernel: a DELETE sent to this server ends nothing.
      expect(fake.requests.map((r) => r.url)).toEqual(["/server/M1/api/terminals/t-landed"]);
    } finally {
      forgetTerminalMachines();
    }
  });

  it("does not treat a 200 with a body as a failure", async () => {
    stubFetch(() => json({ ok: true }));
    noteTerminalCreated(terminal("t-json"));
    await expect(killTerminal("t-json")).resolves.toBeUndefined();
    expect(listed("t-json")).toBe(false);
  });
});
