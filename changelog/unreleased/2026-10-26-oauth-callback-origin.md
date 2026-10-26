# A key authorization opened on a LAN address falls back to the pasted code

- **Date:** 2026-10-26
- **Type:** fix
- **Scope:** `server`, `web`
- **Breaking:** no

[中文](2026-10-26-oauth-callback-origin.zh.md)

Connecting TokenDance from the Models page, with the Web App opened over plain HTTP on anything
but loopback (a LAN address such as `http://192.168.1.10:4000`, a hostname, `0.0.0.0`), sent the
browser to an authorization page that refused the whole request as invalid. That page redirects
back only to an HTTPS address or to plain HTTP on `localhost`, `[::1]` or `127.x.x.x`, and the
server had handed it the address the browser used.

The server now asks for the redirect only when that address can receive it. Otherwise it opens the
flow in manual mode: no callback address, the same S256 PKCE challenge. The start answer's new
`mode` field says which mode the flow opened in, and the dialog follows it — it opens straight on
the one-time code step, and the switch back to the automatic redirect is withdrawn for as long as
it stays open, because the provider would refuse it again. On loopback and HTTPS addresses the
redirect stays the default and the switch between the two works as before.

## Details

- `packages/server/src/services/model-oauth-service.ts`: new exported `openedMode(asked,
  callbackOrigin)` — `manual` is never upgraded; a `callback` request keeps its redirect only on
  `https:` or on `http:` to `localhost`, `[::1]` or `127.x.x.x`, the set the authorization page
  accepts (its `callback_url` check, read from its own client bundle). An origin that does not
  parse names nowhere a browser can be sent, so it falls back too. `start` uses it for the
  callback URL **and** for the mode the flow is stored with, so a downgraded flow refuses a
  redirect deposit exactly like a manual one; `start` also returns `mode`.
- `packages/server/src/api/types.ts`: `ModelOAuthStartResponse.mode` (required — the server always
  answers it) and the `ModelOAuthMode` comment now says why a `callback` request can open as
  `manual`.
- `packages/web/src/features/models/models-page.tsx` (`ModelOAuthDialog`): a `redirectRefused`
  state set when a callback request comes back `manual`; it feeds a single `byHand` that replaces
  the `manual` reads (code step, no poll, no redirect switch), so a retry keeps it that way. The
  dialog only looks at `res.mode === "manual"`, so a server that predates the field behaves as
  before. No new copy: the code step's existing hint already says what to do.
- `packages/server/test/model-oauth.test.ts`: the opened-mode table (loopback and HTTPS keep the
  redirect; LAN, hostname, `0.0.0.0`, `*.localhost` and an unparsable origin open as manual;
  manual is never upgraded) plus a route case reached on `http://192.168.1.10:7364` that answers
  `mode: "manual"`, carries no `callback_url`, keeps S256, and then redeems a pasted code.
- Ported from upstream `12a58d4f` (#1328), applied as its own change rather than merged; its
  header comment in the server test was merged by hand (upstream's version also describes a
  disconnect path this tree does not have) and its web test was not taken — it needs jsdom, which
  `packages/web` does not install, so the dialog half was verified in a real browser instead.

## Compatibility

- No dependency, stored-data, package-name or config change. `POST /api/projects/:p/model-oauth/start`
  gains one response field (`mode`); nothing is removed and older Web Apps ignore it.
