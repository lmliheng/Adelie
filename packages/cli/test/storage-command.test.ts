/**
 * `penguin storage`, driven through `cli()` in-process against the fake server's storage
 * report.
 *
 * The command's contract is small and entirely about what it *shows*, because it can cause
 * nothing else: the class table accounts for the ledger, the candidate list spells out why
 * each row is there, `--top` folds the tail instead of hiding it, and the output says in so
 * many words that nothing is removed without an approval. The last case pins that: after a
 * run, the only request the fake saw was the read-only GET — a command that could clean
 * something up would have to send something else.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StorageReport } from "@lmliheng/penguin-server/api";
import { cli } from "../src/index.js";
import { FakeServer } from "./fake-server.js";

const GB = 1024 * 1024 * 1024;

let server: FakeServer;
let uninstall: () => void;
let stdout: string[];
let stderr: string[];
let scratch: string;
let outSpy: { mockRestore(): void };
let errSpy: { mockRestore(): void };

beforeEach(() => {
  server = new FakeServer();
  uninstall = server.install();
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "penguin-storage-cli-"));
  stdout = [];
  stderr = [];
  outSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout.push(String(chunk));
    return true;
  });
  errSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr.push(String(chunk));
    return true;
  });
});
afterEach(() => {
  outSpy.mockRestore();
  errSpy.mockRestore();
  uninstall();
  fs.rmSync(scratch, { recursive: true, force: true });
});

const out = () => stdout.join("");
const err = () => stderr.join("");

/** A ledger with one row of every kind the command has a branch for. */
function report(over: Partial<StorageReport> = {}): StorageReport {
  return {
    root: "/home/user/.adelie/data",
    scannedAt: "2026-10-10T12:00:00.000Z",
    totalBytes: 6 * GB,
    classes: [
      {
        class: "protected",
        bytes: 20 * 1024 * 1024,
        files: 1269,
        entries: 43,
        candidateEntries: 0,
        candidateBytes: 0,
      },
      {
        class: "shared_env",
        bytes: 3 * GB,
        files: 101755,
        entries: 28,
        candidateEntries: 0,
        candidateBytes: 0,
      },
      {
        class: "session_drafts",
        bytes: 1.4 * GB,
        files: 56181,
        entries: 282,
        candidateEntries: 1,
        candidateBytes: 3_300_000,
      },
      {
        class: "tmp_workspaces",
        bytes: 564 * 1024 * 1024,
        files: 23731,
        entries: 83,
        candidateEntries: 26,
        candidateBytes: 146 * 1024 * 1024,
      },
      {
        class: "database",
        bytes: 23 * 1024 * 1024,
        files: 3,
        entries: 3,
        candidateEntries: 0,
        candidateBytes: 0,
      },
    ],
    candidates: [
      {
        path: "proj/agents/default_agent/workspaces/tmp-8e8a3ace",
        class: "tmp_workspaces",
        bytes: 138 * 1024 * 1024,
        files: 120,
        lastModifiedAt: "2026-09-01T04:05:06.000Z",
        referenced: false,
        rules: ["unreferenced"],
      },
      {
        path: "proj/agents/default_agent/scratchpad/session-2026-09-01-00-00-00-aaaaaaaa",
        class: "session_drafts",
        bytes: 3_300_000,
        files: 4,
        lastModifiedAt: null,
        referenced: false,
        rules: ["orphan"],
      },
      {
        path: "proj/agents/default_agent/workspaces/tmp-00000000",
        class: "tmp_workspaces",
        bytes: 0,
        files: 0,
        lastModifiedAt: "2026-10-09T00:00:00.000Z",
        referenced: false,
        rules: ["empty", "unreferenced"],
      },
    ],
    sharedEnvGroups: [
      {
        kind: "name",
        key: "csumail",
        members: [
          "proj/agents/default_agent/shared_env/csu-mail",
          "proj/agents/default_agent/shared_env/csumail",
        ],
        bytes: 88 * 1024 * 1024,
      },
    ],
    disk: { freeBytes: 8 * GB, totalBytes: 49 * GB },
    unreadable: [],
    ...over,
  };
}

describe("penguin storage", () => {
  it("prints the ledger: a header with the volume, one row per class, candidates with their rule", async () => {
    server.storage = report();
    expect(await cli(["storage"])).toBe(0);

    const text = out();
    expect(text).toContain("Data root /home/user/.adelie/data · ledger total 6GB");
    expect(text).toContain("8GB free of 49GB (84% used)");
    // Class rows, translated, with the candidate cell for the two classes that have one.
    expect(text).toMatch(/user data\s+20MB\s+1269\s+43\s+-/);
    expect(text).toMatch(/tool environments\s+3GB\s+101755\s+28\s+-/);
    expect(text).toMatch(/session drafts\s+1.4GB\s+56181\s+282\s+1 \(3.1MB\)/);
    expect(text).toMatch(/temp workspaces\s+564MB\s+23731\s+83\s+26 \(146MB\)/);
    // The candidate rows: path, size, why, and the cost sentence before anyone picks.
    expect(text).toContain("proj/agents/default_agent/workspaces/tmp-8e8a3ace");
    expect(text).toContain("2026-09-01 04:05");
    expect(text).toContain("unreferenced");
    expect(text).toContain("session gone");
    expect(text).toContain("empty, unreferenced");
    expect(text).toContain("unknown"); // a candidate with no readable mtime says so
    expect(text).toContain("What clearing each class costs");
    // Duplicated environments are reported, not proposed.
    expect(text).toContain("same name (csumail): 2 environments, 88MB together");
    expect(text).toContain("proj/agents/default_agent/shared_env/csu-mail");
    // And the one sentence that keeps this a report.
    expect(text).toContain("Read-only report.");
    expect(text).toContain("nothing runs on a timer");
  });

  it("warns about low free space without implying the command will act", async () => {
    server.storage = report({ disk: { freeBytes: 3 * GB, totalBytes: 49 * GB } });
    expect(await cli(["storage"])).toBe(0);
    expect(out()).toContain("Low on space: 3GB free.");
    expect(out()).toContain("none of them is removed until you approve a specific list");
  });

  it("folds the tail of the candidate list behind --top, and --top 0 prints every row", async () => {
    server.storage = report();
    expect(await cli(["storage", "--top", "2"])).toBe(0);
    expect(out()).toContain("… and 1 more (raise --top, or --top 0 for all).");
    expect(out()).not.toContain("tmp-00000000");

    stdout = [];
    expect(await cli(["storage", "--top", "0"])).toBe(0);
    expect(out()).toContain("tmp-00000000");
    expect(out()).not.toContain("raise --top");
  });

  it("refuses a bad --top before it reaches the server", async () => {
    server.storage = report();
    expect(await cli(["storage", "--top", "three"])).toBe(1);
    expect(err()).toContain('Invalid --top value "three"');
    expect(server.requests).toEqual([]);
  });

  it("prints the report verbatim under --json", async () => {
    server.storage = report();
    expect(await cli(["storage", "--json"])).toBe(0);
    expect(JSON.parse(out())).toEqual({ report: server.storage });
  });

  it("says nothing about which classes exist when the scan could not read part of the root", async () => {
    server.storage = report({
      unreadable: ["/home/user/.adelie/data/proj/agents/a/scratchpad/sealed"],
    });
    expect(await cli(["storage"])).toBe(0);
    expect(out()).toContain(
      "Could not be read (so the totals above are a floor, not a measurement):",
    );
    expect(out()).toContain("scratchpad/sealed");
  });

  it("sends the read-only GET and nothing else", async () => {
    server.storage = report();
    expect(await cli(["storage"])).toBe(0);
    expect(server.requests.map((r) => `${r.method} ${r.path}`)).toEqual(["GET /api/admin/storage"]);
  });

  it("reports a server that has no report to give", async () => {
    server.storage = null;
    expect(await cli(["storage"])).toBe(1);
    expect(err()).toContain("No fake storage report.");
  });
});
