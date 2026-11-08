# The cost center can ignore a class of errors, and deletes nothing

- **Date:** 2026-11-08
- **Type:** feature
- **Scope:** `server`, `web`
- **Breaking:** no

[中文](2026-11-08-errors-ignore-rules.zh.md)

The error table has always been "watch it, or clear it". Clearing is a real delete: the rows the
filter is showing leave the store for everyone, and nobody in the Project can look them up
afterwards. For a class that retries hundreds of times an afternoon under one name
(`[llm] llm_fatal`), that price is too high, so it stayed on the first page and pushed the three
rows worth reading further down.

A class can now be ignored on its own: every row grows an eye icon, and pressing it writes one rule
for that row's **source + code**, which takes those records off this table — without deleting a
single one. A rule can also be narrowed to "the message contains this text", so within one source
and code only the records carrying that fragment are held back (the one 500 a class ever returned
can stay while the afternoon of dropped sockets does not).

Ignoring and un-ignoring are the Project owner's, the same line clearing draws: a rule changes the
table everyone reads. Members still see the "已忽略 N" count in the stats and can still open the
Ignored view and read those records — what a rule hides is never hidden from them.

## Details

- Server: a new table `error_ignore_rules` (per Project, `source` + `code` + an optional
  `message_like`). Records are still written to `error_records` exactly as before; **the filtering
  happens only on the read path** (one more condition in `ErrorsRepo.conds` — "no rule covers this
  row", inverted under `ignored=1`), and deleting records still has exactly one road, the clear.
  Three routes, all behind `requireProjectOwner`: `GET /api/projects/:p/usage/errors/ignores` (the
  rules, each with how many records it covers and when the newest was),
  `POST …/ignores?from&to&fromTs&toTs&agentId` (adds one and answers how many it hides in that range;
  the same class twice is `409 ignore_rule_exists`), and `DELETE …/ignores/:id` (removing the rule is
  the whole of the undo; `404 ignore_rule_not_found`). `GET/DELETE /usage/errors` take a new `ignored`
  parameter (`1`/`0`, anything else a 400), and the dashboard carries a new `errors.ignored`. Rules
  deliberately carry **no expiry**: they last until somebody removes them, and nothing anywhere reads
  a "when does this lapse" field.
- Web: the table's segmented control goes from three to four (all / unexpected / expected / ignored,
  four chips on one row) and the stats row gains "已忽略 N". The row action is an eye icon named
  忽略这类异常; it opens a card that names the row's source and code and offers an optional "only
  ignore records whose message contains…". After ignoring, a **reversible** strip stays above the
  table ("已忽略 … · 本次隐藏 N 条记录" with 撤销) — it stands where the table is, because the row the
  button lived on is gone; the notification region carries the same sentence and dismisses itself
  after six seconds, the strip does not. The Ignored view draws the rules above its table: each rule
  says what it covers, how many records it holds back, when the newest was, and offers 取消忽略.
- Clearing still takes exactly the rows on screen, but its confirmation now says the ignored ones are
  not among them ("另有 N 条已忽略的记录不在此列。"); standing on the Ignored view, the sentence names
  that view's own rows, because those are what its table shows.

## Tests

- `packages/server/test/errors.test.ts` (+391 lines): the covered count within the range, `message_like`
  matching, the 409 on a duplicate rule, the 404 with no such rule, the 400 on a malformed id, the
  `ignored` parameter's validation, filtering staying on the read path (not one record fewer, and all
  of them back after the rule goes), and the three routes answering the owner only (a member reads
  `errors.ignored` but neither reads nor writes rules).
- `packages/web/test/errors-panel.test.ts` (+151 lines): `errorsClearScopeText` on the Ignored view,
  `errorsClearKeepsIgnoredText` (present where the ignored records must be called out, absent on their
  own view), `IgnoreRulesBox`'s three states, and how `ignoreRuleText` words a narrowed rule.
- `packages/web/e2e/errors-ignore.spec.mjs` (new, 2 cases, real server + real browser): one drives the
  row action — the table loses the class, the notification and the strip both say how many rows went,
  and the API still hands the record back (same id), gone from the default read and present under
  `ignored=1`; the rules list holds exactly that class; 撤销 leaves no rule and puts the record back on
  the default view. The other drives the Ignored view — the clear confirmation's extra sentence, the
  rules list naming the class and its hidden count, that view's table holding those records, and
  取消忽略 clearing the rules and returning the records to the All view.

## Compatibility

A new table and new routes; no existing interface changes shape (the error reads gain one optional
parameter, the dashboard one field). Existing data is untouched, and a Project with no rules reads a
table identical to before, row for row. No new dependency, no Project config change.
