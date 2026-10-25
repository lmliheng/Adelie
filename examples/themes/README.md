<!-- English | [简体中文](README.zh.md) -->

# Example: a theme an installation imports

`warm-paper.json` is a theme in the format the app reads: warm paper surfaces, a terracotta accent
and three accent presets.

```bash
cp examples/themes/warm-paper.json "<data root>/themes/"
```

It then appears in **Settings › Appearance**, in the theme list, on the next page load — and the
page prints the exact directory it read, so there is nothing to guess. A default installation's data
root is `~/.penguin/data`. There is no restart and no cache: the server reads the directory on every
request, so a file edited, added or deleted is what the next page load shows.

An admin can skip the walk: in **Settings › Appearance**, the line naming the directory carries
"Import a theme…" — pick this file, or paste a URL that serves it, and either way what lands is
exactly what the `cp` above puts there.

## What a theme may say

A theme is **values for the UI's token names**, and nothing else — no components, no layout, no code
that runs. That is why importing one needs no build: every component reads those names, and none of
them asks which theme is active, so the same files that paint a shipped theme paint an imported one.

- The names are the contract in `packages/ui/src/tokens.ts`. The three shipped themes
  (`packages/ui/src/themes/*.css`) each set **every** name in both modes; a name your file leaves out
  keeps the shipped default's value, so a half-filled theme still paints.
- `light` is the base both modes start from, `dark` changes only what differs, and `accents`
  (optional, at most 12) are the presets the accent row offers — each scoped to this theme, so a
  preset of another theme's does not paint here.
- Values are one line each, bounded to 120 characters. They may not contain `;`, `{`, `}`, `<`, `\`,
  `@` or a newline, and may not fetch anything (`url(`, `image-set(`): an imported theme is confined
  to the token names, so it cannot add a rule, hide an element or call home.

The appearance page reports what a file got wrong: a name the contract does not know paints nothing
and is listed as unknown, while a file that does not read at all is listed with the reason and
paints nothing.
