# Offer岛 job hunting and AI-industry news, as a plugin

- **Date:** 2026-10-15
- **Type:** feat
- **Scope:** `plugins`

[中文版](2026-10-15-offerdao-plugin.zh.md)

New plugin: **Offer岛** (`@lmliheng/use-offerdao`), ported from Offer岛's official skill repository
([`offerdaoai/skills`](https://github.com/offerdaoai/skills), MIT, commit `45c2a5d8`).

Install it from the plugin library on whichever Agent should have it (it is not preinstalled). What
it adds, per the endpoints the skill drives on `https://offerdao.ai`:

- **Search and publishing** (personal API key required): filter reviewed postings by company, role,
  location, employment type and recency, or hand the skill a JD — pasted text or a link — and it
  turns it into a structured posting for Offer岛 to review. Publishes belong to whoever's key was
  used, and `/j/<id>` only opens after a moderator approves it.
- **No key needed**: the AI company directory, the curated interview guides, and the daily AI news
  feed (`/news/md/<YYYYMMDD>.md` and a JSON feed), so those work the moment the plugin is installed.

The key is read from `OFFERDAO_API_KEY` first (the agent's vault), then from a local
`~/.offerdao/config.json` if the user runs Offer島's own daemon, then from the user; publishing
always needs the person's own key, and a shared test key can only read.

Four things were adapted for Adelie while porting: a `Before you start` section (house convention
for every shipped skill), `browser-act` replaced with this repo's `browser-automation` skill
(`penguin browser`) for rendering a linked page before parsing it, the site-shaped card blocks and
the auto-updating daemon conventions dropped, and the key-vault wording added. The upstream MIT
licence ships beside the skill as `skills/offerdao/LICENSE`; `references/` (posting fields, company
object, news format) is carried verbatim.
