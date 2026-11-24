# The pet's second figure is the whale girl — the illustration you sent now ships

- **Date:** 2026-11-24
- **Type:** fix
- **Scope:** `web`

[中文](2026-11-24-pet-whale-girl.zh.md)

The second option in Settings › Appearance › Pet figure used to read "My picture": choosing it meant
choosing a file as well, and until one was picked the desktop showed nothing (the row said so —
"no image chosen yet, so the pet is still the penguin"). The second option is now the **whale girl**:
pick her and she is on the desktop at once — no file to choose, no restart, no reopening the pet's
window. The penguin is still first and still the default, and "My picture" moved to third, so your own
image is still one click away.

## Why

The previous round built these two illustrations into that upload slot, which was not what was asked
for: the second option should be the whale girl, and choosing it should draw her. This release cuts the
first illustration (beanie, whale sweater) to a transparent background and ships it inside the app.

## Details

- `packages/web/public/pet-figures/whale-girl.png`: that illustration, transparent, 256px on its long
  side, shipped with the front-end build.
- `packages/web/src/features/pet/whale-girl.tsx` (new): draws it into the pet's box — the same
  `className` the page hands every figure, `object-contain`, and not draggable (dragging is the pet
  window's own gesture, and handing it to the browser takes it away).
- `packages/web/src/features/pet/figures.ts`: one more entry in the name-to-drawing map.
- `packages/web/src/lib/pet-figure.ts`: `PET_FIGURES` becomes `["penguin", "whaleGirl", "picture"]`.
  The stored name is the new `whaleGirl`, deliberately **not** the `whale` the retired fish left
  behind: reusing that would wake every desktop still holding it and silently redraw them.
- `packages/web/src/lib/strings.ts` / `strings-en.ts`: the option is "Whale girl" / 「鲸鱼娘」, and the
  row's description now reads "the classic penguin, the whale girl, or a picture of your own".
- No new dependency and no API change; the whole change adds one image file.

## Tests

- `packages/web/test/pet-figure.test.ts`: `whaleGirl` draws that image (`src`, `object-contain`,
  `draggable="false"`, no inline SVG), and a browser holding `whaleGirl` draws her rather than the
  penguin; the "a name this build no longer knows falls back to the penguin" case (using `whale`)
  stays.
- `packages/web/e2e/pet-figure.spec.mjs` (real server + real browser, 3 cases): one new — another
  window writes `penguin.petFigure=whaleGirl` and the `/pet` window draws
  `/pet-figures/whale-girl.png` with no reload, the file really decodes (`naturalWidth > 0`), and
  switching back to the penguin takes the image away.
- `@adelie/web`'s `tsc --noEmit`, `oxlint` and `prettier --check` all pass; the full unit suite passes.
- Each of the three figures was shot in a real browser at the pet window's own size (260×300), kept
  outside the repo in `pet-figures-shots/`.

## Compatibility

No route, wire type or storage key changed. A browser holding `picture` is untouched; one holding
`whale` (the retired fish) still falls back to the penguin — this build does not know that name.
