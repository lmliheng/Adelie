/**
 * What a conversation offers for a picture a reply points at, once the picture is open in the
 * lightbox: two things, whatever the Agent's image tool can actually do from a file it is handed.
 *
 * The App has no image endpoint of its own — the model call, the credential and the picture all
 * live on the Agent's side — so neither action is a request the browser makes. Both are
 * instructions to the Agent, which is why this module builds text rather than URLs:
 *
 * - **Split into layers** is one Seedream call with `--layers`, deterministic in its options, so
 *   the turn is posted straight away (`ask`) and the answer is a directory of transparent PNGs.
 *   It goes out wrapped in a `[use_skills]` block, exactly as the composer wraps a selection, so
 *   the Skill runs whether or not the model would have reached for it by itself.
 * - **Redraw from this one** is not deterministic: what changes is the prompt, and the prompt is
 *   the user's. It stops at the composer (`compose`), prefilled with the reference picture pinned
 *   as the seedream Skill — generation is billed per image, and nobody should buy one by tapping
 *   a button they read only as "redo this".
 *
 * Nothing here without the Skill: an Agent that cannot run `seedream` is offered neither button,
 * because a control that can only fail is worse than no control (the same rule the lightbox's bar
 * follows, see the package's lightbox.tsx). The words and the instructions arrive from the active
 * dictionary, so this module stays pure and both languages stay in one place.
 */
import { buildSkillsMessage } from "@adelie/core/markers";
import type { LightboxAction } from "@adelie/ui";

/**
 * The Skill directory name the image tool ships as — what an Agent lists once
 * `@adelie/use-seedream` is installed on it, and what `[use_skills]` names. A name, not a kind:
 * the actions read the Agent's installed list, not a plugin table, because the Skill is what the
 * turn will actually invoke.
 */
export const SEEDREAM_SKILL = "seedream";

/** Whether an Agent can run the image tool at all, from its installed Skill list. */
export function hasSeedreamSkill(skills: readonly { name: string }[]): boolean {
  return skills.some((skill) => skill.name === SEEDREAM_SKILL);
}

/** What the two buttons are called, and what each one carries, in the interface's language. */
export interface ReplyImageWords {
  /** The button that asks for the layer split. */
  layers: string;
  /** The button that puts the redraw instruction in the composer. */
  redraw: string;
  /** The layer split's instruction, for the picture at this Workspace-relative path. */
  layersPrompt: (path: string) => string;
  /** The redraw instruction, ending where the user writes what to change. */
  redrawPrompt: (path: string) => string;
}

/** How the conversation acts on an action, given as two callbacks so this module posts nothing itself. */
export interface ReplyImageActionWiring {
  /** The Session Agent's installed Skills (what decides whether there is anything to offer). */
  skills: readonly { name: string }[];
  /** The active dictionary's words for this feature (`S.chat.imageAction`). */
  words: ReplyImageWords;
  /** Sends an instruction to the Agent as a message of the user's own. */
  ask: (message: string) => void;
  /** Puts an instruction in the composer, to be finished and sent by hand. */
  compose: (prompt: string) => void;
}

/**
 * The resolver a conversation hands to its Markdown (`ProseImagesProvider`'s `actions`), or
 * `undefined` when the Agent has no image tool: `undefined` is what the provider takes to mean
 * "nothing extra", and it keeps the lightbox exactly the bar it was before this existed.
 *
 * Stable per wiring, like the image and link resolvers beside it: a new function identity
 * re-renders every picture in the transcript (memoized message bodies included).
 */
export function replyImageActionBuilder(
  wiring: ReplyImageActionWiring,
): ((path: string) => readonly LightboxAction[] | null) | undefined {
  if (!hasSeedreamSkill(wiring.skills)) return undefined;
  const { words } = wiring;
  return (path: string) => [
    {
      key: "seedream-layers",
      label: words.layers,
      onSelect: () => wiring.ask(buildSkillsMessage([SEEDREAM_SKILL], words.layersPrompt(path))),
    },
    {
      key: "seedream-redraw",
      label: words.redraw,
      onSelect: () => wiring.compose(words.redrawPrompt(path)),
    },
  ];
}
