# An interrupted turn's picture is still there when the turn is resent

- **Date:** 2026-11-25
- **Type:** fix
- **Scope:** `core`

[中文](2026-11-25-interrupted-turn-keeps-image.zh.md)

When a turn ends before the model finished — the reader pressed stop, the provider answered with a
fatal error, an attempt was abandoned — the engine resends that turn's input with the next message.
The text was transcribed into a `[turn_aborted]` block, and an attached picture was simply dropped:
the next request asked the model about a picture that was no longer in it. Now the picture rides
along as a message of its own, ahead of the block, and the block opens with a line saying so. A
picture is identified by its address or bytes, so a second interruption re-flattening the same
carry-over keeps it once rather than once per interruption.

## Details

- `packages/core/src/engine/context-engine.ts`: `flattenCarryOver` keeps the input's image messages
  (`image_url`, and `inline_data` whose media type is an image) beside the structured
  `tool_call_output` it already kept, and puts them before the `[turn_aborted]` text, which opens
  with `(the input also carried 1 image, kept above this block as image message)`. The note line is
  dropped when an already-flattened carry-over is re-flattened, so the count is always this
  request's.
- `packages/core/test/engine.test.ts`: two cases — the picture (and that note, and its position
  ahead of the block) survives a fatal exit, and a second interruption does not duplicate it.

## Compatibility

Only what one request carries. Trace, the stored conversation and the wire format are unchanged;
the carry-over was and is memory-only. A seller's per-request image cap still trims a request whose
input carries more images than it accepts (`fitReplayedImages`).
