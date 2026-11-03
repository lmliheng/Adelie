# A refused flip of an Agent tab's enable switch says so under its card, past the toast it used to be

- **Date:** 2026-11-03
- **Type:** fix
- **Scope:** `web`
- **Breaking:** no

[中文](2026-11-03-agent-switch-refusal.zh.md)

Agent settings opens each tab with an enable switch: Memory has its own card, and Skills, Vault,
Schedules and Hooks share one (`usePromptInjection`). None of them writes optimistically — the card
is drawn from the config the server answered with — so a refused flip left the switch exactly where
it was, with the reason in a six-second notification. Six seconds later the tab looked as if the
switch had been pressed and come back on its own, and that switch is what gates the whole feature
below it: memory entering the context, a vault the agent can reach, hooks assembled into a new
Session.

The reason now stays under the switch's card, as `role="alert"` — the only account of a switch that
did not move — and it names the direction that failed, since the switch is still in the other
position. It nods to the feature by its own noun ("记忆" / "hooks"), not by the card's label, which
already begins with "启用" / "Enable" and would read twice inside a sentence about turning it on. It
stays until the next flip is sent; the same switch is the retry.

## Details

- `packages/web/src/features/agents/feature-switch-refusal.ts` (new):
  `featureSwitchRefused(noun, enabled, reason)` — the feature, the direction the flip asked for, and
  the server's reason as given. Both code paths draw the same sentence from it.
- `packages/web/src/lib/strings{,-en}.ts`: `agent.switchOnRefused` / `agent.switchOffRefused`, plus
  the noun beside each card's own label (`memory.switchNoun` and `{skills,vault,schedule,hooks}.
  injection.switchNoun`).
- `packages/web/src/features/agents/prompt-injection-controls.tsx`: one `switchRefusal` state,
  cleared when a flip is sent and set when the write is refused; the line is drawn directly under
  the shared card. The failure notification stays — this adds the account that outlives it.
- `packages/web/src/features/agents/memory-tab.tsx`: the same state and the same line under the
  Memory card, which renders its switch before the overview has loaded and therefore also needs
  nothing else to say why it would not move.

## Tests

- `packages/web/test/feature-switch-refusal.test.ts` (new, 6 cases): each direction, the reason
  travelling verbatim, every feature's own noun (and that the label's "启用" is not repeated), the
  active language.
- `packages/web/e2e/agent-switch-refusal.spec.mjs` (new, two cases on a real server): the config
  write is stubbed at `page.route`, once for the Memory card and once for the shared Skills card.
  A refused flip puts one sentence under that card, the notification region holds no dismissal for
  it, the switch does not move, and seven seconds later the sentence is still there; with the
  refusal lifted the same switch goes through and the sentence goes.

## Compatibility

- No interface, request or storage change: the same `PUT …/agents/:id/config`, and the same
  positions. Only where a refused flip is drawn has moved — from a notification alone to a line
  under the card, which the notification no longer has to carry on its own.
