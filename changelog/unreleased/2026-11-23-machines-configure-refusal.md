# A machine card whose ssh record could not be read keeps its reason on the card

- **Date:** 2026-11-23
- **Type:** fix
- **Scope:** `web`

[中文](2026-11-23-machines-configure-refusal.zh.md)

The gear on a machine card asks the server for that host's ssh record and opens the form with it.
That read can fail — the alias left the config, or the file cannot be read — and when it did, the
reason was only a notification: it dismissed itself after six seconds, and the card and its gear
went back to looking exactly as they had before the click.

The reason now stays on the card that asked, in the server's own words (「操作被拒绝：…」), drawn
under the card's two lines rather than inside the unfolded details, so folding the card does not
take it away either. The same gear is the retry: a new attempt clears the sentence, and a read that
lands opens the form as before.

## Details

- `packages/web/src/features/machines/machines-page.tsx`: `configure` no longer calls
  `toastError`; a failed read writes `configureRefusal` (`{ alias, text }`, through `refusalText`),
  cleared when another attempt starts and when the reader switches Project. Only the card whose
  alias matches draws it (`role="alert"`, danger ink, two lines at most, the whole sentence on
  hover).
- No new wording, no new dependency, no API changes.

## Tests

- `packages/web/e2e/machines-configure-refusal.spec.mjs` (new, 1 case, real server + real browser;
  the fleet is stubbed because a development data root has no remote host in its ssh config): the
  card's gear opens after the details are unfolded, the read answers 500 in its own words → the
  sentence is on that card and in no notification, the gear is still there, folding the card does
  not hide the sentence, it is still there after six and a half seconds; once the intercept is
  lifted the same gear opens the form and the sentence is gone. On the pre-change build there is no
  sentence on the card at all.

## Compatibility

No route, storage format or wire type changed: the refusal is one client-side read.
