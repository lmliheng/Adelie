# The desktop pet has a figure to choose: still the penguin, or a small blue whale

- **Date:** 2026-11-23
- **Type:** feature
- **Scope:** `web`

[中文](2026-11-23-pet-figure.zh.md)

The desktop pet has always been one penguin, drawn into the code. It now has two figures, chosen in
Settings › Appearance: the penguin is still there and still the default, and the other is a small blue
whale. The change lands on the spot — no restart, and no need to put the pet away and bring it back.

## Where the whale comes from

The owner pointed at the DeepSeek Harness community's pet plugins
(`2002yxy/dsh-nailong-desktop-pet`, `xiaoshihou514/dsh-desktop-pet`), which keep DeepSeek's official
whale mark as their pet. That mark is a single-colour side profile — it cannot do either of the two
things a pet needs, an eye that follows the pointer and a belly that still reads at 72 px — so this
whale is drawn here in that direction rather than copied: a round body, blue (`#4d6bfe`), one big eye,
a dorsal fin and a forked tail, so it reads as a fish at a glance.

## The choice lives in the browser, and the two windows agree by event

The figure is drawn by the `/pet` page alone, and the shell's companion window shares this origin's
`localStorage` with the main one, so this is a browser preference like the theme or the text size
(key `penguin.petFigure`) rather than a new field in the shell's `pet.json` — the shell would have to
learn a field, store it and relay it back to answer a question only that page asks. Changing it in
Settings writes the key; the pet's window follows the browser's own `storage` event, with no reload.
Whether the pet is shown at all still belongs to the shell (the tray menu and the "Desktop pet" row);
what it looks like belongs to this page.

## Details

- `packages/web/src/features/pet/whale.tsx`: the new whale, on the penguin's own contract — one inline
  SVG, fixed colours (it does not follow the theme), the two classes the stylesheet animates
  (`.pet-eyes`, `.pet-pupils`), and the same box, so the window needs no new size.
- `packages/web/src/lib/pet-figure.ts` and `use-pet-figure.ts`: the key, its read and write, and the
  cross-window follow. A missing, empty, wrong-case or unknown value — a figure a later release
  dropped included — falls back to the penguin, and a storage that refuses to be read (private
  browsing, site data blocked) answers the default rather than taking a render down.
- `packages/web/src/features/pet/figures.ts`: the name-to-component map. `pet-page.tsx` knows only the
  map, never a drawing by name, so one more figure is one file and one name.
- Settings › Appearance grows a "Pet figure" row under the "Desktop pet" switch, drawn only in the
  shell's own window (the same gate as the switch). The "Desktop pet" row's own line no longer says
  "a small penguin".
- No API change, no new dependency.

## Tests

- `packages/web/test/pet-figure.test.ts` (new, 10 cases): the default (missing / empty / wrong case /
  unknown), a round trip, a storage that throws on every call, a write telling its followers and
  stopping at an unsubscribed one, and both figures actually rendered through the map.
- `packages/web/e2e/pet-figure.spec.mjs` (new, 1 case, real server + real browser): `/pet` draws the
  penguin → another window writes `penguin.petFigure=whale` → the pet's window swaps to the whale
  with no reload, and the penguin's own path leaves the DOM.
- The `icon-registry` and `install-scope` guards move with it: the new drawing is listed (7 paths) and
  the new key is classified as a browser preference, so a data-root switch does not reset it.
- `@adelie/web`'s `tsc --noEmit`, `oxlint` and `prettier --check` all pass.

## Compatibility

No route, storage format or wire type changed: the figure is one drawing that `/pet` makes, the
default is the penguin it always was, and a machine that has never stored anything looks as it did.
