# The Linux sandbox has a documented step for Ubuntu 23.10 and later

- **Date:** 2026-10-09
- **Type:** fix
- **Scope:** `plugins`, `docs`

[中文版](2026-10-09-sandbox-ubuntu-userns.zh.md)

On a default Ubuntu 24.04, `kernel.apparmor_restrict_unprivileged_userns` is `1`: only programs with
an AppArmor profile that allows it may create unprivileged user namespaces, so the bubblewrap the
backend ships fails its startup check with `setting up uid map: Permission denied`. The docs named
only Debian's switch, and no install that runs as an ordinary user — the install script, npm, the
release archive, a Docker container — can install the profile that takes root. Ported from upstream
PenguinHarness (#977, commit `45885985`), which the fork did not carry.

- The CLI quickstart gains a **Sandbox on Ubuntu** section, in both languages. It gives the one-time
  root step: an AppArmor profile for the bubblewrap the backend ships, matched by a path pattern
  that covers every place the package is unpacked under the data root's parent — the installation's
  bundled plugins, a plugin downloaded into the data root and the plugins a hot push carries — so
  an upgrade at the same path stays covered. It also names the two alternatives (a profile for a
  root-owned bwrap, or lifting the switch for every program) and what to do when the data root or
  the install directory sits outside `~/.adelie`.
- When the backend cannot build its base profile, the reason on the Sandbox card names Ubuntu's
  switch next to Debian's and points at that section; the backend's README states the requirement.
- A new test asserts that the rejection names both switches.

The section is written with Adelie's own names (`@lmliheng/penguin-plugin-sandbox-bwrap`, the
`~/.adelie` data root and its `ADELIE_HOME`, whose pre-rename name `PENGUIN_HOME` is still read),
not upstream's.
