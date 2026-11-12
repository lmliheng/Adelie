/**
 * A refused read of the account's copy is remembered, so the shortcuts page can say that what it
 * shows is the browser mirror rather than the account's shortcuts (7.115).
 *
 * The keymap must exist before any request answers — the dispatcher installs at module evaluation —
 * so the mirror is what the first keystroke reads, and the account's copy replaces it only when
 * `GET /api/me/prefs` answers. A refused read leaves the mirror standing, which is the previous
 * account's document or the defaults, and an edit then writes it back whole (one PUT replaces
 * `keybindings` rather than merging), so the page has to say both things. What the store owes it is
 * the raw value plus when to stop saying it: a hydrate settles the question, a write that lands makes
 * the account hold what is on screen, and an account boundary starts a new question.
 *
 * The sentence is built at render time from `refusalText`, so the last test holds both dictionaries
 * to what it has to promise: where the rows came from, what an edit does to the account, that a
 * reload retries, and the reason last.
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
  noteHydrateFailure,
  setBinding,
  setKeybindingsPersister,
  shortcutLoadFailure,
  shortcutLoadFailureVersion,
  shortcutSaveFailure,
  subscribeShortcutLoadFailure,
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

/** Let the answer the store only watched settle. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe("a refused read of the account's copy", () => {
  it("is remembered, and subscribers hear about it once", () => {
    const seen: unknown[] = [];
    const unsubscribe = subscribeShortcutLoadFailure(() => seen.push(shortcutLoadFailure()));
    const version = shortcutLoadFailureVersion();

    noteHydrateFailure(SERVER_SAID);

    expect(shortcutLoadFailure()).toBe(SERVER_SAID);
    expect(seen).toEqual([SERVER_SAID]);
    expect(shortcutLoadFailureVersion()).toBeGreaterThan(version);
    unsubscribe();
  });

  it("leaves the mirror standing, so the keyboard keeps working", () => {
    storage.map.set(KEYBINDINGS_KEY, JSON.stringify({ v: 1, linux: { "editor.save": null } }));

    noteHydrateFailure(SERVER_SAID);

    expect(bindingOf("editor.save")).toBeNull();
    expect(storage.map.get(KEYBINDINGS_KEY)).toBe(
      JSON.stringify({ v: 1, linux: { "editor.save": null } }),
    );
  });

  it("is not a save failure: nothing was written, and a later edit still has its own line", async () => {
    setKeybindingsPersister(() => Promise.reject(SERVER_SAID));
    noteHydrateFailure(SERVER_SAID);
    expect(shortcutSaveFailure()).toBeNull();

    setBinding("editor.save", null);
    await settle();

    expect(shortcutSaveFailure()).toBe(SERVER_SAID);
    // The refused write answered nothing about what the account holds: the read is still unread.
    expect(shortcutLoadFailure()).toBe(SERVER_SAID);
  });

  it("is dropped by a hydrate — the account's copy has now been read", () => {
    noteHydrateFailure(SERVER_SAID);

    hydrateFromServer({ v: 1, linux: { "terminal.close": "Mod+Alt+KeyW" } });

    expect(shortcutLoadFailure()).toBeNull();
  });

  it("is dropped by a hydrate that answers with no copy at all", () => {
    noteHydrateFailure(SERVER_SAID);

    hydrateFromServer(undefined);

    // "Nothing stored" is still an answer: the page is the account's copy (the defaults).
    expect(shortcutLoadFailure()).toBeNull();
  });

  it("is dropped by a write that lands: the account now holds what is on screen", async () => {
    setKeybindingsPersister(() => Promise.resolve());
    noteHydrateFailure(SERVER_SAID);

    setBinding("editor.save", null);
    await settle();

    expect(shortcutLoadFailure()).toBeNull();
  });

  it("is not dropped by a write that was refused, or by one that never answers", async () => {
    let answer: () => unknown = () => Promise.reject(SERVER_SAID);
    setKeybindingsPersister(() => answer());
    noteHydrateFailure(SERVER_SAID);

    setBinding("editor.save", null);
    await settle();
    expect(shortcutLoadFailure()).toBe(SERVER_SAID);

    // A writer still in flight has answered nothing about what the account holds: the question is
    // exactly as unsettled as it was.
    answer = () => new Promise(() => {});
    setBinding("terminal.close", parseChord("Mod+Alt+KeyW"));
    await settle();
    expect(shortcutLoadFailure()).toBe(SERVER_SAID);
  });

  it("does not follow the tab into the next account signed in", () => {
    noteHydrateFailure(SERVER_SAID);

    setKeybindingsPersister(null); // account A signs out
    setKeybindingsPersister(() => Promise.resolve()); // account B signs in

    expect(shortcutLoadFailure()).toBeNull();
  });
});

describe("the sentence the page draws for it", () => {
  it("says where the rows came from, what an edit does to the account, and that a reload retries", () => {
    const zh = S.shortcuts.loadRefused(refusalText(SERVER_SAID));
    // The interface's own words for `internal`, not the wire message.
    expect(zh).toContain("服务器内部错误，请稍后重试。");
    expect(zh).not.toContain("RAW ENGLISH SERVER MESSAGE");
    expect(zh.startsWith("没能从账号读取快捷键")).toBe(true);
    expect(zh).toContain("来自这个浏览器");
    expect(zh).toContain("盖掉账号上原来的按键");
    expect(zh).toContain("重新加载");
    // The reason ends the sentence — the app-wide shape — and the reason's own full stop is not doubled.
    expect(zh.endsWith("服务器内部错误，请稍后重试。")).toBe(true);
    expect(zh).not.toContain("。。");

    setActiveStrings(EN);
    const en = S.shortcuts.loadRefused(refusalText(SERVER_SAID));
    expect(en).toContain("The server hit an internal error. Please try again shortly.");
    expect(en).not.toContain("RAW ENGLISH SERVER MESSAGE");
    expect(en.startsWith("The account's shortcuts could not be read")).toBe(true);
    expect(en).toContain("from this browser");
    expect(en).toContain("Reloading this page");
  });
});
