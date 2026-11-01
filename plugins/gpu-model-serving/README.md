# GPU Model Serving

An Adelie plugin that teaches an agent to **stand up an OpenAI-compatible LLM endpoint on a GPU box** — a rented instance or your own machine — and to survive the parts that normally cost a day.

## What it installs

One skill, `gpu-model-serving`, plus its references:

| File | Contents |
| --- | --- |
| `skills/gpu-model-serving/SKILL.md` | The job in order: instance and disk layout, weights, environment, `serve.sh`, detached start, verification, hand-over — and the toolchain rules that actually bite. |
| `reference/sglang-serve.md` | Environment setup, a complete working `serve.sh` for a 27B 4-bit model + draft model on one 32GB card, flag-by-flag notes, memory arithmetic, startup and restart behaviour. |
| `reference/pitfalls.md` | The failure list: symptom → cause → fix, 14 entries, from NVFP4 checkpoint loading and CCCL header checks to JIT build OOM. |
| `reference/verify.md` | The five checks that decide whether the service is done — health, model list, tool call, stream, prefix cache — plus client wiring and the restart checklist. |
| `reference/gpu-cloud-console.md` | Operating the rented instance: console actions, the single exposed port, the public port that changes per boot, driving the web terminal, and prepaid billing that stops the instance at zero. |

## When it fires

The skill is loaded when a task involves self-hosting a model: deploying or moving an inference service, choosing quantization or serving flags, diagnosing a server that will not start, or wiring an agent framework to a local endpoint. It is written for the single-GPU, 24–48GB case that most agent workloads land on, and scales by arithmetic rather than by hope.

## Install

From the Adelie **Plugins** page, import from npm: `@adelie/gpu-model-serving`. The same string works from a URL — `https://www.npmjs.com/package/@adelie/gpu-model-serving` — or point the importer at the registry tarball. The plugin installs under the name `gpu-model-serving`.

## Provenance

Distilled from a real deployment: **算家云 RTX 5090 ×1 (32GB, sm_120), SGLang 0.5.21, a 27B NVFP4 model with a DFlash2 draft model**, serving tool-calling agent traffic with prefix caching on, verified end to end (health, `/v1/models`, `tool_calls`, streaming SSE, `#cached-token`, speculative accept length). Every entry in `pitfalls.md` is a failure that happened on the way there.

## License

Apache-2.0.
