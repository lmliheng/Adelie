# CI really runs the sandbox plugins' suites, and a declared one that cannot open turns red

- **Date:** 2026-10-08
- **Type:** fix
- **Scope:** `ci`, `plugins`

[中文版](2026-10-08-ci-ubuntu-runs-plugin-suites.zh.md)

Every sandbox backend has a set of live tests: they really start the sandbox program, have a command
write a file outside the workspace, and assert that the kernel refuses it. These are the only tests
that prove a sandbox works. They first probe once whether the host can open the sandbox, and skip the
whole set if it cannot — running the Linux suite on macOS, skipping is correct. The problem had two
layers: Linux's `rest` shard was a list of names and `plugins/*` was never added to it (the four
sandbox backend packages ran nowhere on Linux CI), and even where they were scheduled, GitHub's
Ubuntu machines do not let ordinary programs create a user namespace by default, so every bwrap live
test would "skip" and CI would stay green — a skip and a pass cannot be told apart. Ported from
upstream PenguinHarness (#872, commit `e3a9eb66`), which the fork did not carry.

- Linux's `rest` shard takes the macOS/Windows form: run the whole repository, minus core, server,
  web, ui and cli, which the other shards already run, with the same build list. A package added
  later lands here by default.
- Each platform's `rest` shard declares the suites it must really run with `ADELIE_MUST_RUN`
  (directory names under `plugins/`, comma-separated, spaces around a name ignored): ubuntu
  `sandbox-bwrap,sandbox-dsh`, macOS `sandbox-seatbelt,sandbox-dsh`. **A declared suite that cannot
  open turns the run red**, carrying the probe's reason; an undeclared one skips as before, so a
  developer machine is unchanged. The check is one function in `scripts/must-run.mjs`.
- bubblewrap is prepared by the plugin's own tests: `sandbox-bwrap`'s vitest `globalSetup` calls
  `scripts/vendor-bwrap.mjs`, so a test run alone (no build) still tests the bwrap users get, and CI
  need not know what that takes. The vendorer's "already in place" now means the marker names the
  current pinning **and** every architecture's `bin/bwrap` exists and is executable — a deleted or
  non-executable binary is laid down again from the cache.
- Ubuntu's user-namespace switch stays in CI as a machine prerequisite (`sysctl -w …=0`), named
  without mentioning the sandbox; on a kernel without that switch the step fails rather than being
  skipped silently.
- `sandbox-bwrap`'s refusal now names Ubuntu's switch beside Debian's: Debian gates unprivileged
  user namespaces with a sysctl, Ubuntu 23.10 and later lets only AppArmor-profiled programs create
  them (24.04's default). That sentence is what an operator sees on the Sandbox card.
