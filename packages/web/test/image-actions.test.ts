/**
 * A reply picture's actions (lib/image-actions.ts): what a conversation offers for the picture a
 * reply points at, once it is open in the lightbox.
 *
 * The App posts nothing against an image endpoint — it has none, and the model, the credential
 * and the file all live on the Agent's side — so an action is a sentence to the Agent, and this
 * module is where the sentence is built. The two rules worth pinning: nothing is offered to an
 * Agent that has no image Skill (a button that can only fail is worse than none), and the
 * layer split goes out inside a `[use_skills]` block, so the turn runs the Skill whether or not
 * the model would have reached for it.
 */
import { describe, expect, it, vi } from "vitest";
import {
  SEEDREAM_SKILL,
  hasSeedreamSkill,
  replyImageActionBuilder,
} from "../src/lib/image-actions";
import type { ReplyImageActionWiring } from "../src/lib/image-actions";

const WORDS = {
  layers: "拆图层",
  redraw: "照这张改一版",
  layersPrompt: (path: string) => `拆 ${path}`,
  redrawPrompt: (path: string) => `改 ${path}：`,
};

/** A wiring that records what each action did, with the picture named `shot.png`. */
function wiring(overrides: Partial<ReplyImageActionWiring> = {}) {
  const ask = vi.fn();
  const compose = vi.fn();
  const builder = replyImageActionBuilder({
    skills: [{ name: SEEDREAM_SKILL }],
    words: WORDS,
    ask,
    compose,
    ...overrides,
  });
  return { builder, ask, compose };
}

describe("hasSeedreamSkill", () => {
  it("finds the image Skill by the name the Agent lists it under", () => {
    expect(hasSeedreamSkill([{ name: "web-design" }, { name: "seedream" }])).toBe(true);
  });

  it("is not fooled by a neighbouring name", () => {
    expect(hasSeedreamSkill([{ name: "seedream-layers" }, { name: "seedance" }])).toBe(false);
    expect(hasSeedreamSkill([])).toBe(false);
  });
});

describe("replyImageActionBuilder", () => {
  it("offers nothing at all to an Agent without the Skill", () => {
    const { builder } = wiring({ skills: [{ name: "software-engineering" }] });
    expect(builder).toBeUndefined();
  });

  it("answers each picture with the two buttons, in the interface's words", () => {
    const { builder } = wiring();
    expect(builder?.("shot.png")?.map((a) => [a.key, a.label])).toEqual([
      ["seedream-layers", "拆图层"],
      ["seedream-redraw", "照这张改一版"],
    ]);
  });

  it("runs the layer split as the user's own turn, with the Skill pinned", () => {
    const { builder, ask, compose } = wiring();
    builder?.("shots/cat.png")?.[0]?.onSelect();
    expect(ask).toHaveBeenCalledWith(
      "[use_skills]\nskills: seedream\n[/use_skills]\n\n拆 shots/cat.png",
    );
    // The split is deterministic in its options and goes out; the redraw waits for the user.
    expect(compose).not.toHaveBeenCalled();
  });

  it("stops the redraw at the composer, leaving the send to the user", () => {
    const { builder, ask, compose } = wiring();
    builder?.("shots/cat.png")?.[1]?.onSelect();
    expect(compose).toHaveBeenCalledWith("改 shots/cat.png：");
    // Nothing is posted: generation is billed per image, and what changes is the prompt.
    expect(ask).not.toHaveBeenCalled();
  });

  it("carries the picture's path to each action, never a URL", () => {
    const { builder, compose } = wiring();
    builder?.("中文 名.png")?.[1]?.onSelect();
    expect(compose).toHaveBeenCalledWith("改 中文 名.png：");
  });
});
