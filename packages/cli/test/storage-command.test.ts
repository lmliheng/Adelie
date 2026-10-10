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
import type { StoragePlanView, StorageReport } from "@lmliheng/penguin-server/api";
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
    // And the one sentence that keeps this a report while the mode is off.
    expect(text).toContain("Read-only report: cleanup mode is off");
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

  it("reads the report and the mode, and writes nothing", async () => {
    server.storage = report();
    expect(await cli(["storage"])).toBe(0);
    // Two GETs, no POST, no PUT: the bare command reports, and the only thing it learns beyond
    // the ledger is whether cleanup mode is on, which decides its closing sentence.
    expect(server.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      "GET /api/admin/storage",
      "GET /api/admin/storage/settings",
    ]);
  });

  it("closes the report with the next step once the cleanup mode is on", async () => {
    server.storage = report();
    server.storageSettings = { enabled: true, trashTtlDays: 14, pins: [] };
    expect(await cli(["storage"])).toBe(0);
    expect(out()).toContain("Cleanup mode is on.");
    expect(out()).toContain("penguin storage apply <planId> --path <path>");
    expect(out()).not.toContain("cleanup mode is off");
  });

  it("reports a server that has no report to give", async () => {
    server.storage = null;
    expect(await cli(["storage"])).toBe(1);
    expect(err()).toContain("No fake storage report.");
  });
});

const TMP = "proj/agents/default_agent/workspaces/tmp-8e8a3ace";
const DRAFT = "proj/agents/default_agent/scratchpad/session-2026-09-01-00-00-00-aaaaaaaa";

/** A bill with one entry this version may move and one it only reports, like a real one. */
function planView(over: Partial<StoragePlanView> = {}): StoragePlanView {
  return {
    id: "2026-10-10-13-05-22-4f2a",
    root: "/home/user/.adelie/data",
    createdAt: "2026-10-10T13:05:22.000Z",
    expiresAt: "2026-10-11T13:05:22.000Z",
    fingerprint: "0123456789abcdef0123456789abcdef",
    totalBytes: 138 * 1024 * 1024,
    entries: [
      {
        path: TMP,
        class: "tmp_workspaces",
        bytes: 138 * 1024 * 1024,
        files: 120,
        lastModifiedAt: "2026-09-01T04:05:06.000Z",
        rules: ["unreferenced"],
        fingerprint: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        executable: true,
      },
      {
        path: DRAFT,
        class: "session_drafts",
        bytes: 3_300_000,
        files: 4,
        lastModifiedAt: null,
        rules: ["orphan"],
        fingerprint: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        executable: false,
      },
    ],
    excluded: [],
    executableClasses: ["tmp_workspaces"],
    appliedAt: null,
    appliedPaths: [],
    usable: true,
    expired: false,
    ...over,
  };
}

/**
 * The reviewed cleanup at the command line: scan, read a bill back, apply a selection, and
 * empty the trash. Every case here is about the instruction the CLI sends or refuses to send —
 * the fake server records the requests, and the assertions read them — because that is what a
 * CLI can get wrong about a destructive operation: naming the wrong paths, or sending none.
 */
describe("penguin storage — the reviewed cleanup", () => {
  it("scans a bill, marks what may be moved, and points at the approval command", async () => {
    server.storageScan = planView() as unknown as Record<string, unknown>;
    expect(await cli(["storage", "scan"])).toBe(0);

    const text = out();
    expect(text).toContain("Plan 2026-10-10-13-05-22-4f2a");
    expect(text).toContain("2 entries · 138MB");
    expect(text).toMatch(/temp workspaces\s+138MB\s+120\s+2026-09-01 04:05\s+unreferenced\s+✓/);
    expect(text).toMatch(/session drafts\s+3.1MB\s+4\s+unknown\s+session gone\s+—/);
    expect(text).toContain("only moves temp workspaces");
    expect(text).toContain("Nothing has moved. Approve the entries you select:");
    expect(server.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      "POST /api/admin/storage/plans",
    ]);
  });

  it("prints the bill verbatim under --json", async () => {
    server.storageScan = planView() as unknown as Record<string, unknown>;
    expect(await cli(["storage", "scan", "--json"])).toBe(0);
    expect(JSON.parse(out())).toEqual({ plan: planView() });
  });

  it("lists the plans and reads one back by id", async () => {
    server.storageScan = planView() as unknown as Record<string, unknown>;
    await cli(["storage", "scan"]);

    stdout = [];
    expect(await cli(["storage", "plan"])).toBe(0);
    expect(out()).toContain("2026-10-10-13-05-22-4f2a");
    expect(out()).toContain("open");

    stdout = [];
    expect(await cli(["storage", "plan", "2026-10-10-13-05-22-4f2a"])).toBe(0);
    expect(out()).toContain("Nothing has moved.");
    expect(out()).toContain("valid until 2026-10-11 13:05");
  });

  it("says so when no plan has ever been written, and when an id is not a plan", async () => {
    expect(await cli(["storage", "plan"])).toBe(0);
    expect(out()).toContain("No plan has been written yet");

    stdout = [];
    expect(await cli(["storage", "plan", "2026-01-01-00-00-00-ffffff"])).toBe(1);
    expect(err()).toContain("No plan 2026-01-01-00-00-00-ffffff.");
  });

  it("applies the entries it is given, quoting the plan's own fingerprint", async () => {
    server.storageScan = planView() as unknown as Record<string, unknown>;
    server.storageApply = {
      planId: "",
      trashId: "20261010-130522",
      moved: [{ path: TMP, bytes: 138 * 1024 * 1024, files: 120 }],
      failed: [],
      freedBytes: 138 * 1024 * 1024,
    };
    expect(await cli(["storage", "apply", "2026-10-10-13-05-22-4f2a", "--path", TMP])).toBe(0);

    expect(out()).toContain("Moved 1 entry (138MB) into the trash as 20261010-130522.");
    const apply = server.requests.find((r) => r.path === "/api/admin/storage/apply");
    expect(apply?.body).toEqual({
      planId: "2026-10-10-13-05-22-4f2a",
      fingerprint: "0123456789abcdef0123456789abcdef",
      paths: [TMP],
    });
  });

  it("sends only the moveable entries under --all, and reports what could not move", async () => {
    server.storageScan = planView() as unknown as Record<string, unknown>;
    server.storageApply = {
      planId: "",
      trashId: "20261010-130522",
      moved: [],
      failed: [{ path: TMP, reason: "changed since the scan" }],
      freedBytes: 0,
    };
    expect(await cli(["storage", "apply", "2026-10-10-13-05-22-4f2a", "--all"])).toBe(0);
    const apply = server.requests.find((r) => r.path === "/api/admin/storage/apply");
    // The draft directory is on the bill but not in the selection: report-only means the CLI
    // does not offer it to the server at all.
    expect((apply?.body as { paths?: string[] })?.paths).toEqual([TMP]);
    expect(out()).toContain("Nothing was moved (see the failures above).");
    expect(out()).toContain(`not moved: ${TMP} — changed since the scan`);
  });

  it("refuses to apply without naming an entry", async () => {
    server.storageScan = planView() as unknown as Record<string, unknown>;
    expect(await cli(["storage", "apply", "2026-10-10-13-05-22-4f2a"])).toBe(1);
    expect(err()).toContain("Nothing selected");
    // Nothing was asked of the server at all: no plan was read, no approval was sent.
    expect(server.requests).toEqual([]);
  });

  it("lists the trash with what each entry holds, and says when it is empty", async () => {
    server.storageTrash = {
      entries: [
        {
          id: "20261010-130522",
          createdAt: "2026-10-10T13:05:22.000Z",
          planId: "2026-10-10-13-05-22-4f2a",
          bytes: 138 * 1024 * 1024,
          files: 120,
          items: [{ path: TMP, class: "tmp_workspaces", bytes: 138 * 1024 * 1024, files: 120 }],
          expired: true,
        },
      ],
      ttlDays: 14,
    };
    expect(await cli(["storage", "trash"])).toBe(0);
    const text = out();
    expect(text).toContain("20261010-130522");
    expect(text).toContain("past the retention (14d)");
    expect(text).toContain(`20261010-130522  temp workspaces  ${TMP}`);

    stdout = [];
    server.storageTrash = { entries: [], ttlDays: 14 };
    expect(await cli(["storage", "trash"])).toBe(0);
    expect(out()).toContain("The trash is empty.");
  });

  it("restores an entry, and names what it could not put back", async () => {
    server.storageRestore = {
      id: "",
      restored: [TMP],
      skipped: [{ path: DRAFT, reason: "target_exists" }],
      remaining: true,
    };
    expect(await cli(["storage", "trash", "restore", "20261010-130522"])).toBe(0);
    const text = out();
    expect(text).toContain("Restored 1 entry from 20261010-130522.");
    expect(text).toContain("The entry still holds what could not be put back.");
    expect(text).toContain(`not restored: ${DRAFT} — target_exists`);
    const request = server.requests.find((r) => r.path === "/api/admin/storage/trash/restore");
    expect(request?.body).toEqual({ id: "20261010-130522" });
  });

  it("purges the named entry, and says when the retention has nothing to give", async () => {
    server.storagePurge = {
      purged: [{ id: "20261010-130522", bytes: 138 * 1024 * 1024, files: 120 }],
    };
    expect(await cli(["storage", "trash", "purge", "20261010-130522"])).toBe(0);
    expect(out()).toContain("Purged 20261010-130522 (138MB).");
    expect(server.requests.find((r) => r.path === "/api/admin/storage/trash/purge")?.body).toEqual({
      id: "20261010-130522",
    });

    stdout = [];
    server.storagePurge = { purged: [] };
    expect(await cli(["storage", "trash", "purge"])).toBe(0);
    expect(out()).toContain("Nothing to purge");
    // Without an id the body is empty: the server then removes only what is past the retention.
    expect(server.requests.filter((r) => r.path.endsWith("/trash/purge")).at(-1)?.body).toEqual({});
  });

  it("shows the cleanup mode and turns it on and off", async () => {
    expect(await cli(["storage", "mode"])).toBe(0);
    expect(out()).toContain("Cleanup mode is off. Trash retention 14 days, 0 pinned path(s).");

    stdout = [];
    expect(await cli(["storage", "mode", "on"])).toBe(0);
    expect(out()).toContain("Cleanup mode is now on.");
    expect(server.requests.find((r) => r.method === "PUT")?.body).toEqual({ enabled: true });

    stdout = [];
    expect(await cli(["storage", "mode", "off"])).toBe(0);
    expect(out()).toContain("Cleanup mode is now off.");
    expect(server.storageSettings.enabled).toBe(false);
  });

  it("refuses a mode it does not know, without asking the server", async () => {
    expect(await cli(["storage", "mode", "maybe"])).toBe(1);
    expect(err()).toContain("usage: penguin storage mode [on|off]");
    expect(server.requests).toEqual([]);
  });
});
