# The pet's second figure is the blue fat fish now: fatter, rounder, and renamed

- **Date:** 2026-11-24
- **Type:** fix
- **Scope:** `web`

[中文](2026-11-24-fat-blue-fish.zh.md)

The second option in the "Pet figure" row of Settings › Appearance used to be a small blue whale. It
is now the **blue fat fish**: a fatter, rounder body in the logo's own blue, two big eyes, a pale
belly and a smile. The option itself is renamed too — "Blue whale" became "Blue fat fish". The
penguin is still the default and is untouched.

## Why it changed

The option was asked for as "I want to switch it to the blue fat fish", and what the last round drew
from the DeepSeek Harness community's plugins was a round-bodied whale — reasoned from the official
whale mark's side profile, and not much like the community's own fat fish. The owner then sent that
character's reference sheet (a blue-haired whale girl in a blue-and-white maid outfit with whale
fins and a tail; the "eating plain rice" joke comes from comparing compute tokens to plain rice) and,
of the three ways to land it, picked "redraw the fish that is already there as the fat fish itself".

## Details

- `packages/web/src/features/pet/whale.tsx`: redrawn throughout. The body is a size larger and much
  closer to a circle; two big eyes replace the single one; the belly is one large pale mass, which is
  what carries the "fat"; and the fins are redrawn — the tail went from two sharp blades to **one
  caudal fin with a notch**, so it no longer reads as a pair of spikes at small sizes. Nothing about
  the contract moved: one inline SVG, fixed colours (it does not follow the theme), the two classes
  the stylesheet animates (`.pet-eyes`, `.pet-pupils`), and the same `viewBox` — so the window size,
  the animations and the page's own code are untouched.
- **The figure's stored name is still `whale`** (`PET_FIGURES` in `lib/pet-figure.ts`, the key
  `penguin.petFigure`, and the file and component names). That string is what browsers have already
  saved; renaming it would quietly send every desktop that had picked this fish back to the penguin.
  The code says so, where the name and the drawing meet.
- `packages/web/src/lib/strings.ts` / `strings-en.ts`: the row's line now reads "the classic penguin,
  or a blue fat fish" (中文「经典企鹅，或一条蓝色大肥鱼」), and the option is "Blue fat fish"
  (「蓝色小鲸鱼」→「蓝色大肥鱼」).
- `packages/web/test/icon-registry.test.ts`: that guard counts `d="…"` literals per file, and the
  redraw leaves **six** (the dorsal fin, the tail, the pectoral fin, the body, the belly and the
  mouth, down from seven), so the entry moves with it.
- No API change, no new dependency, no new image asset — it is still pure paths.

## Tests

- `packages/web/test/icon-registry.test.ts`: the new path count (6), pinned to the file.
- `packages/web/test/pet-figure.test.ts`: the figure rendered through the map is still this fish (the
  `#4d6bfe` body, both animated classes present, and none of the penguin's three warm paths).
- `packages/web/e2e/pet-figure.spec.mjs` (real server + real browser): `/pet` draws the penguin →
  another window writes `penguin.petFigure=whale` → the pet's window swaps to this fish with no
  reload.
- `@adelie/web`'s `tsc --noEmit`, `oxlint` and `prettier --check` all pass.
- Looked at in a real browser after drawing: 72 / 148 / 260 px, on a light and a dark desktop, with
  the three pointer offsets the eyes follow. At 72 px it still reads as a fat blue fish with big eyes
  and a pale belly, in the same style as the penguin.

## Compatibility

No route, storage format or wire type changed: the figure is still one drawing the `/pet` page makes,
a machine that had picked it still has it picked (the key is the same), and one that had picked the
penguin — or never stored anything — looks exactly as it did.
