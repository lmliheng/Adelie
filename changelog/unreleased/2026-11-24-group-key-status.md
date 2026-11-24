# A folded model group now says on its header whether its key is set

- **Date:** 2026-11-24
- **Type:** fix
- **Scope:** `web`

[中文](2026-11-24-group-key-status.zh.md)

The provider groups on the Models page said nothing about a hand-written key while they were folded:
the header looked identical with a key and without one, and the only proof — the mask on the model's
card — sat inside the fold. Those headers now carry a status line of their own: a green dot with
**Key configured**, a grey one with **No key**, drawn the same way as the connection status beside it.
The three groups with a connect flow (TokenDance, Penguin Go, ModelScope) still read out only whether
they are connected, and **Custom** gets neither: its rows each reach their own endpoint, so there is
no group key for a status to be about.

## Details

- `packages/web/src/features/models/group-header.ts`: `hasKeyStatus()` and `keyStatus()` are new, and
  the action list gains `keyStatus` right after `connect`, before the owner gate — a member sees it
  too, exactly as they see the connection status.
- `packages/web/src/features/models/models-page.tsx`: `renderGroupAction` gains the `keyStatus` case,
  drawn identically to the connection status (the same `data-tooltip`, the same `HEADER_TEXT`,
  `toneDot`'s green/grey dot, and the words giving way to the tooltip on a narrow header).
- `packages/web/src/lib/strings.ts` / `strings-en.ts`: **已配置密钥** / **未配置密钥** ("Key
  configured" / "No key").
- It reads **stored** keys only (`apiKeyMasked`): a key the server's environment lends the group does
  not count, which is the connection status's rule as well.
- `packages/docs/content/models.zh.md` / `models.en.md`: the header-actions list gains the line, the
  member paragraph names it, and the "a whole group" key step says where to look to see it landed.
- No API, route or storage change, and no new dependency.

## Tests

- `packages/web/test/model-group-header.test.ts`: the action lists stay pinned per group kind (the
  member's included), plus a new block — the groups with the status are exactly those carrying Enter
  key and having no connect flow of their own (Venice AI, TokenHub, DeepSeek, OpenRouter, vLLM and
  OpenAI among them; TokenDance, Penguin Go, ModelScope and Custom not), and `keyStatus()`'s values
  (an environment-backed key still counts as unconfigured).
- `packages/web/e2e/models-group-key-status.spec.mjs` (new, 2 cases, real server + real browser):
  ① search out Venice AI — folded, its header reads **No key**; write one through the header's own
  Enter key and it reads **Key configured**, with the mask really stored on the server; ② TokenDance
  shows only its own **Not connected**, and Custom shows none of the three.
- `@adelie/web`'s `tsc --noEmit`, `oxlint` and `prettier --check` all pass; the full unit suite (356
  files) passes.

## Compatibility

No route, wire type or storage format changed: the header gains one read-only status, and on a narrow
window it keeps only its dot and its tooltip, like the connection status.
