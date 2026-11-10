# A failed re-hold sweep is recorded instead of escaping the process

- **Date:** 2026-11-10
- **Type:** fix
- **Scope:** `server`
- **Breaking:** no

[中文版](2026-11-10-machines-keep-held-tick-error.zh.md)

The timer that re-holds dropped machine connections once a minute called `void autoConnect()`, and nothing took the rejection. A timer callback has no caller to throw to: any failure of that sweep — an ssh config that cannot be read, a database closed underneath it — came out as an unhandled rejection once a minute for as long as the App lived, visible only in the process log.

The tick now goes through a small private step that awaits the sweep and reports a failure to the error centre, under the same source and code the boot path already uses for the same fault (`process` / `machines_reconnect_failed`): one machine that will not come back is one class in the panel, and one ignore rule there silences both the boot attempt and the retries.

A `stop()` that arrives while the sweep is still reaching out is not reported: the closed database is the retirement itself, not a fault, so a retired generation says nothing about its own shutdown.

## Verification

`test/machines-lifecycle.test.ts` gains two cases: a failing tick is recorded and nothing escapes the process (a `unhandledRejection` listener observes the escape and sees none), and a `stop()` landing mid-sweep records nothing.
