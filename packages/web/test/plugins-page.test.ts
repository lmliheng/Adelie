/**
 * The Plugins page's pure decisions (features/plugins/plugins-page.tsx). One file, so the page
 * module is imported once.
 *
 * - All machines: every plugin is listed, and a machine-only one says where it runs. This
 *   server: what it is asked for, a shared plugin not removable from its table. Another
 *   machine: the state that machine reports, and what it has not received yet.
 * - A plugin is installed on an Agent once any part of it is there (a skill, or its hook
 *   package), read off the two installed lists; nothing is installed for an Agent with no
 *   snapshot or for a plugin that ships nothing.
 * - The market shelf's state for one Agent is not installed / installed / updatable, the third
 *   only ever off the server's own list of installs it says are behind.
 * - The installable list is what the deployment SHIPS, described by the registry's entry: the
 *   shelf carries an entry per plugin package the build carries, skills/hooks packages among
 *   them, and the server refuses the ones it does not ship.
 * - A library plugin's market entry is found by its package: the same bare name, or the scoped
 *   specifier carrying the card's version.
 * - The installed version is the hook package's where there is one, else the first installed
 *   skill's, and undefined where the plugin is not installed.
 * - The per-plugin reminder names the Agents the server lists as behind on it, in list order
 *   (versions are never compared here).
 * - The "update all" plan is empty when no Agent is behind, sends one request per Agent with
 *   every plugin it is behind on, and counts distinct plugins as the notice does.
 */
import { describe, expect, it } from "vitest";
import type { InstalledPluginsResponse, PluginIndexEntry } from "@lmliheng/penguin-server/api";
import {
  availablePluginRows,
  installedPluginRows,
  installedPluginVersion,
  marketEntryFor,
  marketState,
  outdatedAgentIds,
  pluginInstalled,
  pluginUpdatePlan,
  type AgentInstalls,
  type PluginParts,
  type PluginView,
} from "../src/features/plugins/plugins-page";

const SELF = "Self000000000000";
const GPU = "Gpu0000000000000";

const row = (
  specifier: string,
  where: { everywhere: boolean; machines: string[]; here: boolean },
  active = where.here,
): InstalledPluginsResponse["plugins"][number] => ({
  specifier,
  active,
  builtin: false,
  modules: [],
  replaces: [],
  ...where,
});

const deployment: InstalledPluginsResponse = {
  plugins: [
    row("@acme/shared", { everywhere: true, machines: [], here: true }),
    row("@acme/gpu-only", { everywhere: false, machines: [GPU], here: false }),
  ],
  shipped: [],
  file: ".project_config.toml",
  machineId: SELF,
  restartPending: false,
};

const nameOf = (id: string) => (id === GPU ? "gpu-box" : "this server");
const modules = (rows: ReturnType<typeof installedPluginRows>) =>
  rows.flatMap((r) => (r.kind === "module" ? [r] : []));

describe("plugin rows per machine", () => {
  it("all machines: every plugin, and a machine-only one says where it runs", () => {
    const view: PluginView = { machineId: null, remote: null, nameOf };
    const rows = modules(installedPluginRows([], "en", deployment, [], view));
    expect(rows.map((r) => [r.specifier, r.state, r.onlyOn])).toEqual([
      ["@acme/shared", "active", undefined],
      ["@acme/gpu-only", "elsewhere", ["gpu-box"]],
    ]);
    // Offered for all machines, since the shared table does not list it.
    expect(availablePluginRows(deployment, [], view)).toEqual([]);
  });

  it("this server: what it is asked for, and a shared plugin cannot be removed from its table", () => {
    const view: PluginView = { machineId: SELF, remote: null, nameOf };
    const rows = modules(installedPluginRows([], "en", deployment, [], view));
    expect(rows.map((r) => r.specifier)).toEqual(["@acme/shared"]);
    expect(rows[0]!.removeBlocked).toBeDefined();
  });

  it("another machine: the state it reports, and what it has not received yet", () => {
    const remote: InstalledPluginsResponse = {
      ...deployment,
      machineId: GPU,
      plugins: [row("@acme/gpu-only", { everywhere: true, machines: [], here: true }, false)],
    };
    remote.plugins[0]!.error = "npm: 404";
    const view: PluginView = { machineId: GPU, remote, nameOf };
    const rows = modules(installedPluginRows([], "en", deployment, [], view));
    expect(rows.map((r) => [r.specifier, r.state, r.removeBlocked === undefined])).toEqual([
      ["@acme/shared", "unsynced", false],
      ["@acme/gpu-only", "failed", true],
    ]);
  });
});

/** One registry entry, as the shelf serves it (the fields the page reads). */
const entry = (name: string, version = "0.2.2"): PluginIndexEntry => ({
  name,
  version,
  description: `${name} as its package describes it`,
  authors: ["Prism Shadow"],
  license: "Apache-2.0",
});

describe("availablePluginRows", () => {
  const shipped: InstalledPluginsResponse = {
    ...deployment,
    shipped: ["@lmliheng/sandbox-bwrap"],
  };

  it("offers what the deployment ships, with the registry's entry for it", () => {
    const rows = availablePluginRows(shipped, [entry("@lmliheng/sandbox-bwrap")]);
    expect(rows.map((r) => [r.specifier, r.entry?.name, r.shipped])).toEqual([
      ["@lmliheng/sandbox-bwrap", "@lmliheng/sandbox-bwrap", true],
    ]);
  });

  it("leaves out a shelf entry this deployment does not ship, rather than offering one the server refuses", () => {
    // The shelf carries an entry per plugin package the build carries, and a skills package is
    // one of them — but a Project cannot ask for it: it installs to an Agent, and the install
    // endpoint answers `plugin_not_shipped` for anything outside the build's own list.
    const rows = availablePluginRows(shipped, [
      entry("@lmliheng/csu-mail", "2026.10.05.1"),
      entry("@lmliheng/sandbox-bwrap"),
    ]);
    expect(rows.map((r) => r.specifier)).toEqual(["@lmliheng/sandbox-bwrap"]);
  });

  it("offers a shipped package the registry has no entry for, with nothing to describe it", () => {
    const rows = availablePluginRows(shipped, []);
    expect(rows.map((r) => [r.specifier, r.entry, r.shipped])).toEqual([
      ["@lmliheng/sandbox-bwrap", undefined, true],
    ]);
  });
});

describe("marketEntryFor", () => {
  const card = { name: "csu-mail", version: "2026.10.05.1" };

  it("finds the entry by the package specifier, when it carries the card's version", () => {
    const index = [entry("@lmliheng/csu-mail", "2026.10.05.1"), entry("@lmliheng/other")];
    expect(marketEntryFor(card, index)?.name).toBe("@lmliheng/csu-mail");
  });

  it("takes an entry named by the bare name as it is", () => {
    expect(marketEntryFor(card, [entry("csu-mail", "2026.10.05.1")])?.name).toBe("csu-mail");
  });

  it("is undefined for a name and version no entry carries — a user plugin has no package of the build's", () => {
    expect(marketEntryFor(card, [entry("@lmliheng/csu-mail", "2026.09.01.1")])).toBeUndefined();
    expect(marketEntryFor(card, [entry("@acme/other")])).toBeUndefined();
    expect(marketEntryFor(card, [])).toBeUndefined();
  });
});

const skill = (name: string) => ({ name, description: "", version: "2026.08.01.1" });

/** A plugin shipping two skills and a stop hook, one with a skill only, and one with a hook only. */
const FULL: PluginParts = {
  name: "orchestration",
  skills: [skill("plan"), skill("run")],
  hooks: ["stop"],
};
const SKILL_ONLY: PluginParts = { name: "web-design", skills: [skill("web-design")], hooks: [] };
const HOOK_ONLY: PluginParts = { name: "goal", skills: [], hooks: ["stop"] };

const installs = (
  skills: Record<string, string>,
  hooks: Record<string, string>,
): AgentInstalls => ({
  skills: new Map(Object.entries(skills)),
  hooks: new Map(Object.entries(hooks)),
});

describe("pluginInstalled", () => {
  it("counts a plugin as installed once any part of it is there, so a partial copy can be updated", () => {
    const whole = installs(
      { plan: "2026.08.01.1", run: "2026.08.01.1" },
      { orchestration: "2026.08.01.1" },
    );
    expect(pluginInstalled(FULL, whole)).toBe(true);
    // An older version that shipped one skill fewer, or a copy missing its hook package, is
    // what the server lists as behind: an installed plugin an update completes.
    expect(
      pluginInstalled(FULL, installs({ plan: "2026.08.01.1" }, { orchestration: "2026.08.01.1" })),
    ).toBe(true);
    expect(pluginInstalled(FULL, installs({ plan: "2026.08.01.1", run: "2026.08.01.1" }, {}))).toBe(
      true,
    );
    expect(pluginInstalled(FULL, installs({ other: "2026.08.01.1" }, {}))).toBe(false);
  });

  it("reads a skill-only plugin off the skills list and a hook-only one off the hooks list", () => {
    expect(pluginInstalled(SKILL_ONLY, installs({ "web-design": "2026.07.30.1" }, {}))).toBe(true);
    expect(pluginInstalled(SKILL_ONLY, installs({}, { "web-design": "2026.07.30.1" }))).toBe(false);
    expect(pluginInstalled(HOOK_ONLY, installs({}, { goal: "2026.08.29.1" }))).toBe(true);
    expect(pluginInstalled(HOOK_ONLY, installs({ goal: "2026.08.29.1" }, {}))).toBe(false);
  });

  it("is false for an Agent with no snapshot yet, and for a plugin that ships nothing", () => {
    expect(pluginInstalled(SKILL_ONLY, undefined)).toBe(false);
    expect(pluginInstalled({ name: "empty", skills: [], hooks: [] }, installs({}, {}))).toBe(false);
  });
});

describe("marketState", () => {
  it("reads not installed for an Agent holding none of the plugin, so the shelf offers the one click", () => {
    expect(marketState(SKILL_ONLY, undefined, false)).toBe("available");
    expect(marketState(SKILL_ONLY, installs({ other: "2026.07.01.1" }, {}), false)).toBe(
      "available",
    );
  });

  it("is installed when that Agent's copy is current, and updatable when the server lists it behind", () => {
    const there = installs({ "web-design": "2026.08.01.1" }, {});
    expect(marketState(SKILL_ONLY, there, false)).toBe("installed");
    // The flag is the server's own comparison (AgentSummary.pluginUpdates), never re-derived from
    // the two version strings here — so the tag and the library's update badge cannot disagree.
    expect(marketState(SKILL_ONLY, there, true)).toBe("updatable");
  });

  it("never calls a plugin the Agent does not have updatable, whatever the server lists", () => {
    expect(marketState(HOOK_ONLY, installs({}, {}), true)).toBe("available");
  });
});

describe("installedPluginVersion", () => {
  it("reads the hook package's version where there is one, else the first skill's", () => {
    expect(
      installedPluginVersion(
        FULL,
        installs({ plan: "2026.07.01.1", run: "2026.07.01.1" }, { orchestration: "2026.07.02.1" }),
      ),
    ).toBe("2026.07.02.1");
    expect(installedPluginVersion(SKILL_ONLY, installs({ "web-design": "2026.07.30.1" }, {}))).toBe(
      "2026.07.30.1",
    );
  });

  it("is undefined where the plugin is not installed, and reads a partial copy's first installed skill", () => {
    expect(installedPluginVersion(SKILL_ONLY, undefined)).toBeUndefined();
    expect(
      installedPluginVersion(SKILL_ONLY, installs({ other: "2026.07.01.1" }, {})),
    ).toBeUndefined();
    expect(
      installedPluginVersion(
        { name: "pair", skills: [skill("plan"), skill("run")], hooks: [] },
        installs({ run: "2026.07.01.1" }, {}),
      ),
    ).toBe("2026.07.01.1");
  });
});

/** Just the two fields the update questions read (they take a Pick, so the fixture can be one too). */
const agent = (agentId: string, ...updates: Array<{ name: string; version: string }>) => ({
  agentId,
  pluginUpdates: updates,
});

describe("outdatedAgentIds", () => {
  it("names the Agents the server lists as behind on that plugin, in list order", () => {
    const agents = [
      agent("stale", { name: "web-design", version: "2026.08.01.1" }),
      agent("current"),
      agent("other", { name: "vllm", version: "2026.08.01.1" }),
      agent(
        "also_stale",
        { name: "web-design", version: "2026.08.01.1" },
        { name: "vllm", version: "2026.08.01.1" },
      ),
    ];
    expect(outdatedAgentIds(agents, "web-design")).toEqual(["stale", "also_stale"]);
    expect(outdatedAgentIds(agents, "vllm")).toEqual(["other", "also_stale"]);
    expect(outdatedAgentIds(agents, "goal")).toEqual([]);
  });
});

describe("pluginUpdatePlan", () => {
  it("is empty when no Agent is behind, so the notice has nothing to offer", () => {
    expect(pluginUpdatePlan([agent("a"), agent("b")])).toEqual({ perAgent: [], plugins: [] });
  });

  it("sends one request per Agent, carrying every plugin that Agent is behind on", () => {
    // The install endpoint takes a list, and an Agent behind on two plugins is one overwrite
    // either way.
    expect(
      pluginUpdatePlan([
        agent(
          "alpha",
          { name: "web-design", version: "2026.08.01.3" },
          { name: "vllm", version: "2026.08.01.2" },
        ),
        agent("beta"),
        agent("gamma", { name: "web-design", version: "2026.08.01.3" }),
      ]),
    ).toEqual({
      perAgent: [
        { agentId: "alpha", names: ["vllm", "web-design"] },
        { agentId: "gamma", names: ["web-design"] },
      ],
      plugins: ["vllm", "web-design"],
    });
  });

  it("counts distinct plugins, matching what the notice above the button says", () => {
    // The gate counts by plugin because the page lists the library once. The plan's `plugins`
    // is what the confirmation lists, so the two must be the same number or the dialog would
    // contradict the block that opened it.
    const plan = pluginUpdatePlan([
      agent("alpha", { name: "shared", version: "2026.08.01.2" }),
      agent("beta", { name: "shared", version: "2026.08.01.2" }),
      agent("gamma", { name: "shared", version: "2026.08.01.2" }),
    ]);
    expect(plan.plugins).toEqual(["shared"]);
    expect(plan.perAgent).toHaveLength(3);
  });
});
