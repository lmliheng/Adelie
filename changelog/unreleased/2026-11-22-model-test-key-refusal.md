# A connectivity test that blamed the network when the key carried a character no header can send

- **Date:** 2026-11-22
- **Type:** fix
- **Scope:** `server`, `web`

[中文](2026-11-22-model-test-key-refusal.zh.md)

"Test connection" in the model config dialog answered with this whenever the credential had picked up
a CJK character, a full-width mark, or an invisible one while being pasted:

> Failed: Cannot convert argument to a ByteString because the character at index 67 has a value of
> 32416 which is greater than 255.

A request header holds Latin-1 only, so undici refused the request, and the SDK reported that refusal
as a **retryable network failure** — which the dialog relayed verbatim. It never said the problem was
the key, and the field that fixes it sits in the same form the reader is looking at; they went to
check their network instead.

That answer is now a sentence that says what to do: this API key carries a character no request
header can send, so paste the key again (and check the matching record under User keys if that is
where it came from). The credential can come from the entry, the request draft, the environment, or
the resolver that rotates it — all four reach the same sentence, because what is judged is the
transport's message rather than any one of those values.

## Details

- `packages/server/src/services/project-config-service.ts`: new exported `headerRefusalCause(message)`
  — the transport's own wording (`Cannot convert argument to a ByteString`) maps to `key_not_latin1`.
  Both of `testModel`'s failure exits (the `probeVerdict` at the end of the stream, and the defensive
  catch around construction/iteration) run the message through it and carry the `cause` when it hits.
- `packages/server/src/api/types.ts`: `ModelTestResponse.cause` gains `key_not_latin1`.
- `packages/web/src/features/models/model-test-refusal.ts`: that cause renders `testKeyNotLatin1`
  instead of the server's English sentence under the button.
- `packages/web/src/lib/strings.ts` / `strings-en.ts`: new `models.testKeyNotLatin1`.

## Tests

- `packages/server/test/model-probe.test.ts` (+2): the transport's wording is recognized as
  `key_not_latin1`; every other failure (`unexpected EOF`, `401 unauthorized`, `fetch failed`, and a
  sentence that merely mentions an index) is left alone.
- `packages/server/test/models.test.ts` (+1, real server + stubbed fetch): `POST /models/test` with a
  key whose 60th character is 「纠」 → `cause` is `key_not_latin1`, the raw message is kept, and **no
  request leaves the process** (the refusal happens while the SDK assembles the request).
- `packages/web/test/model-test-refusal.test.ts` (+1, plus one arm in the language test): that cause
  yields `testKeyNotLatin1`, and the English sentence is gone from the returned line.

## Compatibility

One optional field and one new string; requests, responses and stored config are unchanged.
