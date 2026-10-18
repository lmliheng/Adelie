/**
 * lib/project-scope.ts unit tests: the one rule every surface holding Project-scoped state
 * follows (a tag on what was read, a check before an answer is applied).
 *
 * - A held value is handed out only for the scope it was read for; any other scope reads null.
 * - A Project's scope key is the Project; an Agent's adds the Agent (and the machine, when one
 *   is named), so the same Agent id in two Projects — or on two servers — is two scopes.
 * - An answer asked for a Project other than the current one is never applied, nor one asked
 *   for no Project at all.
 * - A row that names its own Project belongs only under that Project.
 */
import { describe, expect, it } from "vitest";
import {
  isCurrentProject,
  ofProject,
  scopeKey,
  scoped,
  scopedValue,
} from "../src/lib/project-scope";

describe("scoped / scopedValue", () => {
  it("hands the value out for the scope it was read for", () => {
    expect(scopedValue(scoped("p1", ["alpha"]), "p1")).toEqual(["alpha"]);
  });

  it("hands out nothing for another scope, or before anything was read", () => {
    expect(scopedValue(scoped("p1", ["alpha"]), "p2")).toBeNull();
    expect(scopedValue(scoped("p1", ["alpha"]), null)).toBeNull();
    expect(scopedValue(null, "p1")).toBeNull();
  });

  it("keeps a value that is itself falsy", () => {
    expect(scopedValue(scoped("p1", 0), "p1")).toBe(0);
    expect(scopedValue(scoped("p1", ""), "p1")).toBe("");
  });
});

describe("scopeKey", () => {
  it("is the Project alone when no Agent is named", () => {
    expect(scopeKey("p1")).toBe("p1");
    expect(scopeKey("p1", undefined)).toBe("p1");
  });

  it("names the Agent within the Project", () => {
    expect(scopeKey("p1", "default_agent")).toBe(scopeKey("p1", "default_agent"));
    expect(scopeKey("p1", "default_agent")).not.toBe(scopeKey("p2", "default_agent"));
    expect(scopeKey("p1", "default_agent")).not.toBe(scopeKey("p1", "alpha"));
  });

  it("separates the same Agent id on two servers", () => {
    expect(scopeKey("p1", "default_agent", "gpu-box")).not.toBe(
      scopeKey("p1", "default_agent", "lab-box"),
    );
    expect(scopeKey("p1", "default_agent", "gpu-box")).not.toBe(scopeKey("p1", "default_agent"));
  });

  it("has no key without a Project, or with an Agent explicitly unset", () => {
    expect(scopeKey(null, "default_agent")).toBeNull();
    expect(scopeKey("p1", null)).toBeNull();
  });
});

describe("isCurrentProject", () => {
  it("applies an answer only for the Project still current", () => {
    expect(isCurrentProject("p1", "p1")).toBe(true);
    expect(isCurrentProject("p1", "p2")).toBe(false);
    expect(isCurrentProject("p1", null)).toBe(false);
    expect(isCurrentProject(null, null)).toBe(false);
  });
});

describe("ofProject", () => {
  it("keeps a row under its own Project only", () => {
    expect(ofProject({ projectId: "p1" }, "p1")).toBe(true);
    expect(ofProject({ projectId: "p1" }, "p2")).toBe(false);
    expect(ofProject({ projectId: "p1" }, null)).toBe(false);
  });

  it("has nothing to place for a missing row", () => {
    expect(ofProject(null, "p1")).toBe(false);
    expect(ofProject(undefined, "p1")).toBe(false);
  });
});
