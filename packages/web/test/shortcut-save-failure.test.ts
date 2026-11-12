/**
 * A refused write to the account's copy is remembered, so the shortcuts page can say why instead
 * of leaving the rows looking as though the edit had landed (7.114).
 *
 * The mirror is written first — that is what makes an edit apply at once, before any request — so
 * the failure cannot be read off the rows: they show the new chord either way, and the next load
 * hydrates the account's copy over the mirror, which is the change quietly disappearing. What the
 * store owes the page is therefore only the fact: the raw value that failed, cleared by the next
 * attempt (that edit may be the one that lands), by a hydrate (the screen is the account's copy
 * again) and at an account boundary (another account's failure is not this one's news).
 *
 * The sentence itself is built at render time from `refusalText`, so the last test holds both
 * dictionaries to what the sentence has to promise: the cause, and that the next load reverts.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import { refusalText } from "../src/lib/api-error";
import { parseChord } from "../src/lib/shortcuts/chord";
import { setPlatformForTests } from "../src/lib/shortcuts/platform";
import {
  KEYBINDINGS_KEY,
  bindingOf,
  configureKeybindingsStoreForTests,
  hydrateFromServer,
  resetAll,
  setBinding,
  setKeybindingsPersister,
  shortcutSaveFailure,
  shortcutSaveFailureVersion,
  subscribeShortcutSaveFailure,
} from "../src/lib/shortcuts/store";
import { S, setActiveStrings, zh as ZH } from "../src/lib/strings";
import { en as EN } from "../src/lib/strings-en";
import { memoryStorage } from "./helpers/storage";

let storage = memoryStorage();

beforeEach(() => {
  storage = memoryStorage();
  setPlatformForTests("linux");
  configureKeybindingsStoreForTests({ storage, layout: null });
  setActiveStrings(ZH);
});

afterEach(() => {
  setPlatformForTests(null);
  configureKeybindingsStoreForTests({ storage: null, layout: null });
  setActiveStrings(ZH);
});

/** A 500 the interface has its own words for — so the sentence that shows is not the wire's. */
const SERVER_SAID = new ApiError(500, "internal", "RAW ENGLISH SERVER MESSAGE");

/** Let the rejection the store only watched settle. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe("a refused write to the account's copy", () => {
  it("is remembered, and subscribers hear about it once", async () => {
    const seen: unknown[] = [];
    const unsubscribe = subscribeShortcutSaveFailure(() => seen.push(shortcutSaveFailure()));
    const version = shortcutSaveFailureVersion();
    setKeybindingsPersister(() => Promise.reject(SERVER_SAID));

    setBinding("editor.save", null);
    await settle();

    expect(shortcutSaveFailure()).toBe(SERVER_SAID);
    expect(seen).toEqual([SERVER_SAID]);
    expect(shortcutSaveFailureVersion()).toBeGreaterThan(version);
    unsubscribe();
  });

  it("is remembered when the writer throws before it ever answers", () => {
    setKeybindingsPersister(() => {
      throw SERVER_SAID;
    });

    setBinding("editor.save", null);

    expect(shortcutSaveFailure()).toBe(SERVER_SAID);
    // The edit still applies here: the mirror is what the page reads.
    expect(bindingOf("editor.save")).toBeNull();
  });

  it("is not invented for a writer that carries the document and answers with nothing", () => {
    const sent: unknown[] = [];
    setKeybindingsPersister((doc) => {
      sent.push(doc);
    });

    setBinding("editor.save", null);

    expect(sent).toHaveLength(1);
    expect(shortcutSaveFailure()).toBeNull();
  });

  it("is replaced by the next edit's answer — an attempt that lands leaves nothing to say", async () => {
    let refusing = true;
    setKeybindingsPersister(() => (refusing ? Promise.reject(SERVER_SAID) : Promise.resolve()));
    setBinding("editor.save", null);
    await settle();
    expect(shortcutSaveFailure()).toBe(SERVER_SAID);

    refusing = false;
    setBinding("terminal.close", parseChord("Mod+Alt+KeyW"));
    // The attempt itself supersedes the sentence, before its answer is known: this edit may land.
    expect(shortcutSaveFailure()).toBeNull();
    await settle();
    expect(shortcutSaveFailure()).toBeNull();
  });

  it("is dropped by a hydrate: the screen is the account's copy again", async () => {
    setKeybindingsPersister(() => Promise.reject(SERVER_SAID));
    setBinding("editor.save", null);
    await settle();

    hydrateFromServer({ v: 1, linux: { "terminal.close": "Mod+Alt+KeyW" } });

    expect(shortcutSaveFailure()).toBeNull();
    expect(storage.map.get(KEYBINDINGS_KEY)).toBe(
      JSON.stringify({ v: 1, linux: { "terminal.close": "Mod+Alt+KeyW" } }),
    );
  });

  it("does not follow the tab into the next account signed in", async () => {
    setKeybindingsPersister(() => Promise.reject(SERVER_SAID));
    setBinding("editor.save", null);
    await settle();
    expect(shortcutSaveFailure()).toBe(SERVER_SAID);

    setKeybindingsPersister(null); // account A signs out
    setKeybindingsPersister(() => Promise.resolve()); // account B signs in

    expect(shortcutSaveFailure()).toBeNull();
  });

  it("is dropped by Reset all as well — it is a write like any other", async () => {
    let refusing = true;
    setKeybindingsPersister(() => (refusing ? Promise.reject(SERVER_SAID) : Promise.resolve()));
    setBinding("editor.save", null);
    await settle();
    expect(shortcutSaveFailure()).toBe(SERVER_SAID);

    refusing = false;
    resetAll();

    expect(shortcutSaveFailure()).toBeNull();
  });
});

describe("the sentence the page draws for it", () => {
  it("carries the localized reason and says the change reverts on the next load, in both languages", () => {
    const zh = S.shortcuts.saveRefused(refusalText(SERVER_SAID));
    // The interface's own words for `internal`, not the wire message.
    expect(zh).toContain("服务器内部错误，请稍后重试。");
    expect(zh).not.toContain("RAW ENGLISH SERVER MESSAGE");
    expect(zh).toContain("重新加载");
    expect(zh.startsWith("快捷键没能保存到账号")).toBe(true);
    // The reason ends the sentence — the app-wide shape — and the reason's own full stop is not doubled.
    expect(zh.endsWith("服务器内部错误，请稍后重试。")).toBe(true);
    expect(zh).not.toContain("。。");

    setActiveStrings(EN);
    const en = S.shortcuts.saveRefused(refusalText(SERVER_SAID));
    expect(en).toContain("The server hit an internal error. Please try again shortly.");
    expect(en).not.toContain("RAW ENGLISH SERVER MESSAGE");
    expect(en.startsWith("Shortcuts could not be saved to the account")).toBe(true);
    expect(en).toContain("next load");
  });
});
