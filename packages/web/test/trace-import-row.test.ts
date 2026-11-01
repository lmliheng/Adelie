/**
 * The Trace import row decides, from the picked file alone and before reading a byte of it, whether
 * it may be read: a `.jsonl` Trace file is one shard and answers to the 14MB ceiling, a whole-Session
 * `.json` bundle is several shards' worth and answers to the server's 48MB one. The two ceilings are
 * the route's (`MAX_TRACE_BYTES` / `MAX_TRACE_BUNDLE_BYTES` in `agent-traces.ts`), and getting them
 * the wrong way round would either refuse a bundle the server accepts or read 40MB into a request
 * body that is then answered with 400.
 *
 * vitest runs node-only here, so the rule is checked through the function the row's file pick calls
 * — the row itself needs a browser (a real `<input type="file">` and a FileReader).
 */
import { describe, expect, it } from "vitest";
import { traceImportSizeRefusal } from "../src/features/settings/trace-import-row";
import { S } from "../src/lib/strings";

const MB = 1024 * 1024;
const TRACE_CAP = 14 * MB;
const BUNDLE_CAP = 48 * MB;

describe("traceImportSizeRefusal (what the Trace import row reads)", () => {
  it("lets a Trace file through up to its own ceiling, and refuses one byte past it", () => {
    expect(traceImportSizeRefusal("session-a.jsonl", TRACE_CAP)).toBeNull();
    expect(traceImportSizeRefusal("session-a.jsonl", TRACE_CAP + 1)).toBe(
      S.settings.importTraceTooLarge,
    );
  });

  it("judges a whole-Session bundle by the larger ceiling, so 20MB of bundle is read", () => {
    expect(traceImportSizeRefusal("bundle.json", TRACE_CAP + 1)).toBeNull();
    expect(traceImportSizeRefusal("bundle.json", BUNDLE_CAP)).toBeNull();
    expect(traceImportSizeRefusal("bundle.json", BUNDLE_CAP + 1)).toBe(
      S.settings.importTraceBundleTooLarge,
    );
  });

  it("never gives a bundle's sentence to a Trace file: past both ceilings each says its own", () => {
    expect(traceImportSizeRefusal("session-a.jsonl", BUNDLE_CAP + 1)).toBe(
      S.settings.importTraceTooLarge,
    );
    expect(S.settings.importTraceTooLarge).not.toBe(S.settings.importTraceBundleTooLarge);
  });

  it("reads the extension the way the server does: case does not matter, and only .json is a bundle", () => {
    expect(traceImportSizeRefusal("Bundle.JSON", TRACE_CAP + 1)).toBeNull();
    expect(traceImportSizeRefusal("Trace.JSONL", TRACE_CAP + 1)).toBe(
      S.settings.importTraceTooLarge,
    );
    // A file the picker's accept list does not offer still gets a ceiling rather than a pass.
    expect(traceImportSizeRefusal("trace.txt", TRACE_CAP + 1)).toBe(S.settings.importTraceTooLarge);
  });
});
