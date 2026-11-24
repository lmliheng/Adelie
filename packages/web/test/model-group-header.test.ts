/**
 * A provider group's header on the models page (group-header.ts): which actions each kind of
 * group offers, in the order they stand, the connection status of a group whose key comes from an
 * authorization flow, and the key status of one whose key is written by hand.
 *
 * The matrix, per group kind: the balance where the catalog declares one (TokenDance, DeepSeek)
 * and the group holds a key; Connect with its status on the three groups with a flow; the key
 * status on the hand-keyed groups — the same ones that carry Enter key, so every group but the
 * three flow groups and custom; Enter key and Assign a user key everywhere but custom (whose rows
 * each reach their own endpoint, so one key written across them is never right); the speed test
 * everywhere; Add model only where hand-added models are taken (custom, vLLM, user-defined); Delete
 * group only on a user-defined group. A member keeps the three read-only parts and nothing that
 * writes. A divider follows the balance wherever something comes after it.
 */
import { describe, expect, it } from "vitest";
import { MODEL_PROVIDERS, providerInfo } from "@adelie/core/model-catalog";
import type { ModelProviderInfo } from "@adelie/core/model-catalog";
import {
  connectionStatus,
  dividerAfterBalance,
  groupHeaderActions,
  groupKeyFromEnv,
  groupKeyStored,
  hasConnectFlow,
  hasKeyStatus,
  keyStatus,
} from "../src/features/models/group-header";
import { userProviderInfo } from "../src/features/models/model-grouping";

const group = (id: string): ModelProviderInfo => providerInfo(id) ?? userProviderInfo(id);
const owner = (id: string, keyStored = false, balancePinned = false) =>
  groupHeaderActions(group(id), { isOwner: true, keyStored, balancePinned });
const member = (id: string, keyStored = false, balancePinned = false) =>
  groupHeaderActions(group(id), { isOwner: false, keyStored, balancePinned });

const keyed = [{ credential: { apiKeyMasked: "sk-t…1234" } }, {}];
const keyless = [{}, { credential: {} }];

describe("the group header's actions, in order, by group kind", () => {
  it("TokenDance: balance once a key is stored, Connect, Enter key, Assign a user key, speed test — no Add model", () => {
    expect(owner("tokendance", true)).toEqual([
      "balance",
      "connect",
      "groupKey",
      "assignUserKey",
      "speedTest",
    ]);
    // Without a key there is nothing to ask the vendor with.
    expect(owner("tokendance", false)).toEqual([
      "connect",
      "groupKey",
      "assignUserKey",
      "speedTest",
    ]);
  });

  it("Penguin Go and ModelScope connect; a connected Penguin Go also syncs its catalog", () => {
    const tail = ["groupKey", "assignUserKey", "speedTest"];
    expect(owner("penguin-go", false)).toEqual(["connect", ...tail]);
    expect(owner("penguin-go", true)).toEqual(["connect", "platformSync", ...tail]);
    expect(owner("modelscope", true)).toEqual(["connect", ...tail]);
  });

  it("DeepSeek shows its balance and connects nowhere; the other vendors and gateways read their key and test", () => {
    expect(owner("deepseek", true)).toEqual([
      "balance",
      "keyStatus",
      "groupKey",
      "assignUserKey",
      "speedTest",
    ]);
    for (const id of [
      "openrouter",
      "siliconflow",
      "opencode-go",
      "anthropic",
      "openai",
      "google",
    ]) {
      expect(owner(id, true), id).toEqual(["keyStatus", "groupKey", "assignUserKey", "speedTest"]);
    }
  });

  it("vLLM, custom and user-defined groups take hand-added models; only a user-defined group deletes", () => {
    expect(owner("vllm")).toEqual([
      "keyStatus",
      "groupKey",
      "assignUserKey",
      "speedTest",
      "addModel",
    ]);
    // Custom's rows each reach their own endpoint: no key written across them, by either action,
    // and so no group key for a status to be about.
    expect(owner("custom")).toEqual(["speedTest", "addModel"]);
    expect(owner("my-own-group")).toEqual([
      "keyStatus",
      "groupKey",
      "assignUserKey",
      "speedTest",
      "addModel",
      "deleteGroup",
    ]);
  });

  it("Add model appears on no built-in group but custom and vLLM", () => {
    const adding = MODEL_PROVIDERS.filter((p) => owner(p.id, true).includes("addModel")).map(
      (p) => p.id,
    );
    expect(adding.sort()).toEqual(["custom", "vllm"]);
  });

  it("a member keeps the balance, the connection status and the key status, and nothing that writes", () => {
    expect(member("tokendance", true)).toEqual(["balance", "connect"]);
    expect(member("deepseek", true)).toEqual(["balance", "keyStatus"]);
    expect(member("vllm")).toEqual(["keyStatus"]);
    expect(member("my-own-group")).toEqual(["keyStatus"]);
    // Custom is the one group with neither reading: no flow, and no group key.
    expect(member("custom")).toEqual([]);
  });

  it("a pinned balance stays in its header after the key is gone, so the pin can come off there", () => {
    expect(owner("deepseek", false, true)).toEqual([
      "balance",
      "keyStatus",
      "groupKey",
      "assignUserKey",
      "speedTest",
    ]);
    // Only where the catalog declares a balance at all.
    expect(owner("openrouter", false, true)).toEqual([
      "keyStatus",
      "groupKey",
      "assignUserKey",
      "speedTest",
    ]);
  });
});

describe("a key lent by the server's environment", () => {
  it("shows DeepSeek's balance, as a stored key does", () => {
    const facts = { isOwner: true, keyStored: false, keyFromEnv: true, balancePinned: false };
    expect(groupHeaderActions(group("deepseek"), facts)).toEqual([
      "balance",
      "keyStatus",
      "groupKey",
      "assignUserKey",
      "speedTest",
    ]);
    expect(groupHeaderActions(group("deepseek"), { ...facts, isOwner: false })).toEqual([
      "balance",
      "keyStatus",
    ]);
  });

  it("is read off the rows' masked preview, and does not make a group connected", () => {
    const envRows = [{ envKeyMasked: "sk-d…0003" }, {}];
    expect(groupKeyFromEnv(envRows)).toBe(true);
    expect(groupKeyFromEnv(keyed)).toBe(false);
    expect(groupKeyFromEnv([])).toBe(false);
    expect(connectionStatus(group("tokendance"), envRows)).toBe("notConnected");
  });
});

describe("the key status beside Enter key", () => {
  it("is exactly the groups whose key is written by hand", () => {
    const reading = MODEL_PROVIDERS.filter(hasKeyStatus).map((p) => p.id);
    // The three groups with a flow say it through Connect's status instead, and custom has no
    // group key for either to be about.
    for (const id of ["tokendance", "penguin-go", "modelscope", "custom"]) {
      expect(reading, id).not.toContain(id);
    }
    // Everything else does, the two vendors this was reported about among them.
    for (const id of ["venice", "tokenhub", "deepseek", "openrouter", "vllm", "openai"]) {
      expect(reading, id).toContain(id);
    }
    // The same set as the groups carrying Enter key with no Connect of their own: the groups whose
    // header would otherwise say nothing about a key written across them.
    expect(reading.sort()).toEqual(
      MODEL_PROVIDERS.filter((p) => owner(p.id, true).includes("groupKey") && !hasConnectFlow(p))
        .map((p) => p.id)
        .sort(),
    );
  });

  it("reads off the stored key, and is absent where the header does not read one out", () => {
    expect(keyStatus(group("venice"), keyed)).toBe("configured");
    expect(keyStatus(group("venice"), keyless)).toBe("missing");
    expect(keyStatus(group("venice"), [])).toBe("missing");
    expect(keyStatus(group("my-own-group"), keyed)).toBe("configured");
    // A key the server lends is not a key this page wrote: the group stays unconfigured, the way
    // it stays unconnected — even though that same env key makes the balance readable.
    expect(keyStatus(group("deepseek"), [{ envKeyMasked: "sk-d…0003" }])).toBe("missing");
    expect(keyStatus(group("tokendance"), keyed)).toBeNull();
    expect(keyStatus(group("custom"), keyed)).toBeNull();
  });
});

describe("the connection status beside Connect", () => {
  it("is exactly the three groups with an authorization flow", () => {
    const connecting = MODEL_PROVIDERS.filter(hasConnectFlow).map((p) => p.id);
    expect(connecting).toEqual(["tokendance", "penguin-go", "modelscope"]);
  });

  it("reads connected once any row holds a stored key, however it got there", () => {
    expect(groupKeyStored(keyed)).toBe(true);
    expect(groupKeyStored(keyless)).toBe(false);
    expect(groupKeyStored([])).toBe(false);
    expect(connectionStatus(group("tokendance"), keyed)).toBe("connected");
    expect(connectionStatus(group("penguin-go"), keyless)).toBe("notConnected");
    expect(connectionStatus(group("modelscope"), [])).toBe("notConnected");
  });

  it("is absent on a group that does not connect", () => {
    expect(connectionStatus(group("deepseek"), keyed)).toBeNull();
    expect(connectionStatus(group("my-own-group"), keyed)).toBeNull();
  });
});

describe("the divider after the balance", () => {
  it("stands between the balance and whatever follows it", () => {
    expect(dividerAfterBalance(owner("tokendance", true))).toBe(true);
    expect(dividerAfterBalance(owner("deepseek", true))).toBe(true);
    // A member of TokenDance: the balance, then the connection status.
    expect(dividerAfterBalance(member("tokendance", true))).toBe(true);
    // A member of DeepSeek: the balance, then the key status.
    expect(dividerAfterBalance(member("deepseek", true))).toBe(true);
  });

  it("is left out where it would separate nothing", () => {
    // No balance to lead — nothing reads a balance without a key, and a group without a balance
    // never gets one: the figure, where it shows at all, is always followed by a status.
    expect(dividerAfterBalance(owner("tokendance", false))).toBe(false);
    expect(dividerAfterBalance(owner("openai", true))).toBe(false);
    expect(dividerAfterBalance([])).toBe(false);
  });
});
