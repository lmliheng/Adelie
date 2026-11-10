# A retired machines generation installs no re-hold timer

- **Date:** 2026-11-10
- **Type:** fix
- **Scope:** `server`
- **Breaking:** no

[中文版](2026-11-10-machines-hold-timer-after-stop.zh.md)

When the App is hot-pushed, the outgoing generation's dispose effect calls `MachinesService.stop()`. But `start()` reaches out over the network before it settles — it hands its build to machines that carry a different one, then re-holds the connections the record says were held — so a push can land in the middle of that. The timer that sweeps for dropped connections once a minute was installed **after** those awaits with no regard for the stop that may have arrived in between: it was never cleared, and it went on reading a database the retired generation had already closed, raising an unhandled rejection in the process every minute.

A generation now remembers that it was retired (`#stopped`): `stop()` sets it, and `start()` looks at it before it touches anything, after each await, and again before installing the timer. A successor generation is a new instance, so it starts afresh as before.

The test suite had the same leak from the other end: `createTestApp`'s cleanup disposed the hot host and closed the database, but never called `machines.stop()`, so an App booted inside a test file left that timer behind for the rest of the worker's life. Cleanup now retires the machines generation the way the platform's own dispose effect does.

## Verification

`test/machines-lifecycle.test.ts` pins the three states — a live generation re-holds once a minute, a `stop()` landing mid-start installs no timer, and a retired generation's `start()` reaches nothing — plus an App's cleanup retiring its generation.
