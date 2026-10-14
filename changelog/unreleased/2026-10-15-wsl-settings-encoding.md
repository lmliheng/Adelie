# Readable WSL diagnostics in settings

- **Date:** 2026-10-15
- **Type:** fix
- **Scope:** `sandbox-wsl`

[中文版](2026-10-15-wsl-settings-encoding.zh.md)

Ported from upstream PenguinHarness (#1125, commit `842571de`).

Settings → Plugins showed garbled Chinese wherever `wsl.exe` answered in UTF-16LE despite the
`WSL_UTF8=1` request: the bytes were decoded as UTF-8 first, and deleting the NULs that a UTF-16
answer then leaves cannot bring the characters back.

The host now keeps `wsl.exe` output as bytes and decodes it once, at the end: UTF-16LE with or
without a BOM is recognized (its ASCII labels, spaces and line endings still have zero high bytes,
while UTF-8 text does not), and UTF-8 output is left as it is. The same decoder reads the
installation logs, and live provisioning progress keeps its streaming UTF-8 decoder, so a line
split inside a Chinese character arrives whole.
