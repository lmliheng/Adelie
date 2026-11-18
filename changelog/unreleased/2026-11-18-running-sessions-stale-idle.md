# "Running now" no longer hides a live Session behind a stale status

- **Date:** 2026-11-18
- **Type:** fix
- **Scope:** `web`

[中文版](2026-11-18-running-sessions-stale-idle.zh.md)

The account menu's "running now" block reconciles two sources: a project-level snapshot fetched when
the menu opens (`GET /sessions/running`), and the statuses the user channel pushes. The merge used to
be an unconditional override — whatever the channel held won. The channel is the ONLY source that
reports a run ENDING, so it has to remember `idle`; which also means that, once a page has seen one
`idle` for a Session, the next run of that Session is hidden whenever its `running` does not arrive
(a middlebox holding the response body, the shape of the report from a cafe network): the snapshot
says the Session is running, the remembered `idle` overrules it, the row is filtered out as finished,
and the menu says **nothing is running** while something is.

Only a status that moved since that snapshot may now rewrite a row. A status the channel already held
when the request went out is older than the server's own read, so the fetched row stands; a status
that changed after that instant is the one that can be newer than the answer, so it relabels or drops
the row.

## Details

- `packages/web/src/features/account/running-sessions.ts`: `mergeRunningSessions(fetched, live,
  baseline)` takes a third argument, the `liveStatuses` map as it stood when the request was sent. An
  entry equal to that baseline no longer overrides the row; "a run ended, the row goes" still holds,
  now scoped to endings SINCE the fetch.
- `useRunningSessions` keeps the answer and the baseline it was asked against in one piece of state
  (`{ sessions, baseline }`), reading `liveStatuses` before firing the request; with no answer yet the
  baseline is an empty map, so nothing can count as newer.
- One known seam, written into the function's comment: a status that flips and flips back inside the
  round trip leaves the map looking untouched, and the row keeps the fetched status. Removing it would
  mean a write timestamp per status, which changes the shape of that store; not this change.

## Tests

- `packages/web/test/running-sessions.test.ts`, 7 cases: a status that moved after the request
  relabels the row, one the channel never held relabels it, an `idle` that moved drops the row, a
  **remembered idle does not hide a row the fetch reports as running** (the reported bug), a status
  the channel repeats leaves the row's own status, an unnamed Session keeps its row, and the order is
  the fetch's.
- Two-way browser check against a temporary instance started from the live program directory with the
  repo's own mock model, the page behind a TCP relay that can be flipped to swallow
  `text/event-stream`:
  - old bundle (`index-KpKmrzbd.js`, byte-identical to the live one) → the menu says nothing is
    running while the server's endpoint says `running`: the case fails.
  - new bundle → the page's own `sessions/running` request answers 200 with that Session and the menu
    shows it; both cases (healthy, relayed) pass.

## Compatibility

One merge rule and its tests, front end only. No API, wire format or stored data changed.
