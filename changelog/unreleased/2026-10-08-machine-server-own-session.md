# A machine's server outlives the ssh session that started it

- **Date:** 2026-10-08
- **Type:** fix
- **Scope:** `server`

[中文版](2026-10-08-machine-server-own-session.zh.md)

When this server starts a machine's server over ssh, that server now runs in a session of its own
(`setsid`, where the host has it). Started from this side's ssh session it belonged to that session,
so dropping the connection — a network blip, this side's machine sleeping — made sshd hang the
session up and took the far server down with it, and every program it was running along. `nohup`
alone does not cover that: the server's own child resets SIGHUP. Ported from upstream PenguinHarness
(branch `fix/machine-server-own-session`, commit `7e1dca63`), which the fork did not carry.

- `startServerCommand` prefixes the launch with `setsid` when `command -v setsid` finds one — Linux
  has it, macOS does not — and is unchanged where there is none.
- `setsid` execs in the backgrounded job's place (that job is no process group leader), so the pid
  the command prints is still the server's and the readiness probe keeps working.
- The name holding that lookup is this fork's (`ADELIE_SETSID`).
