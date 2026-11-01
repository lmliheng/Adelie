---
name: gpu-model-serving
description: Stand up an OpenAI-compatible LLM endpoint on a rented or owned GPU box — choose the instance and disk layout, fetch and quantize the weights, serve with SGLang (speculative decoding, prefix caching, tool calling), then verify it and expose the port. Use when a task needs a self-hosted model service, especially one GPU of 24–48GB serving an agent workload.
---

# GPU Model Serving

You are standing up a **self-hosted, OpenAI-compatible LLM endpoint** on a GPU machine — rented by the hour from a cloud, or a box you already have. The deliverable is a URL like `http://<host>:<port>/v1` plus a model name, good enough that an agent framework can point at it and call tools.

Two things make this harder than it looks, and both are scheduling, not modelling: the **build toolchain** (CUDA headers, nvcc, JIT kernel compilation) and the **memory budget** of a single card. Read [`reference/pitfalls.md`](reference/pitfalls.md) before you start typing; every entry there is a real failure that costs 10–60 minutes when it first appears.

## Before you start

If the message only names this skill with no job behind it, ask what the endpoint is for before touching a machine: the agent framework that will call it, and roughly how much traffic and how much context it needs. Those two answers decide the model class, the quantization and the card.

**Renting costs money by the hour, and prepaid balances stop the instance without warning.** Confirm which machine to use — a box the user owns, or a rented instance and which one — and say what an hour costs before starting a download that takes thirty minutes. Do not rent a larger card than the job needs; a 24–48GB single card covers most agent workloads, and the arithmetic in [`reference/sglang-serve.md`](reference/sglang-serve.md) is what says whether it is enough.

Nothing here is destructive to existing data, but a `sglang serve` occupies the whole card and its port. Before taking both, read back which service, if any, is already running there and get agreement to replace it.

## The shape of the job

1. **Pick the machine and where the bytes live.** A single 24–48GB card runs a 27B-class model at 4-bit with room for a draft model and KV cache. Put weights, virtualenv and scripts on a **persistent data disk**, never on the small system disk — a stopped/restarted instance keeps the data disk and loses nothing else, and re-downloading 20–30GB is the slowest thing in the whole job.
2. **Get the weights.** Prefer an already-quantized checkpoint (NVFP4 / AWQ / FP8) over quantizing yourself. Check the file set: an index plus its shards, the tokenizer, and a chat template that advertises `tools`. **Delete or move aside zero-byte leftovers** — a stale empty `*.index.json` or shard makes the loader crash on read.
3. **Build the environment.** One virtualenv with the torch build matching the driver, `sglang[all]`, and a CUDA toolkit from pip. Pin nvcc deliberately (see *Toolchain* below).
4. **Write a `serve.sh`** that exports the environment and ends in `exec sglang serve …`. Launch it detached: `setsid nohup ./serve.sh > serve.log 2>&1 < /dev/null &`. The first start compiles kernels and can take 20–60 minutes; every later start reuses the cache and takes minutes.
5. **Verify before wiring clients** — `/health`, `/v1/models`, a tool call, a streamed response, a repeated prefix. [`reference/verify.md`](reference/verify.md) has the exact commands and what each answer should look like.
6. **Expose the port and hand over** the base URL, the model name, the concurrency limit, and the cost per hour.

## Toolchain — the part that actually bites

- The pip-installed CUDA packages must be on the environment's path: `CUDA_HOME`/`CUDA_PATH` at `<venv>/…/nvidia/cu13` (with its `bin` on `PATH`), `LD_LIBRARY_PATH` and `LIBRARY_PATH` at `<venv>/…/nvidia/cu13/lib`. Without this, `deep_gemm` asserts `cuda_home is not None` and sgl_kernel fails to load `libnvrtc`.
- pip ships `libcudart.so.13` but no `libcudart.so`; linkers ask for the latter. Symlink `libcudart.so`, `libcublas.so`, `libcublasLt.so` in that lib directory.
- **CCCL refuses a nvcc that does not exactly match the CUDA headers** (`#error "CUDA compiler and CUDA toolkit headers are incompatible"`). If you cannot make them match, set `#define CCCL_DISABLE_CTK_COMPATIBILITY_CHECK 1` at the top of every `cuda_toolkit.h` in the venv — there is more than one copy, and the second one only shows up when SGLang's own JIT kernels compile. Find them all first: `grep -rln "headers are incompatible" <venv>/lib/python3.*/site-packages`.
- **Cap the compile parallelism.** `ninja` defaults to one compiler per core plus two; a 27B CUTLASS/FP4 template can take gigabytes each, and a 60GB container gets OOM-killed mid-build (`ninja` exits 137, the log only says `Received sigquit from a child process`). `export MAX_JOBS=3` in `serve.sh` fixes it; the JIT cache keeps whatever already compiled.
- flashinfer's cubin package lags the runtime, and the version check is fatal. `FLASHINFER_DISABLE_VERSION_CHECK=1`; the venv's flashinfer cache (`~/.cache/sglang/.cache/flashinfer`) is worth keeping between restarts.

## Serving choices for an agent workload

- **Speculative decoding** is a large win on a single card: a small draft model plus `--speculative-algorithm` (e.g. `DFLASH`, `EAGLE`) and 4–8 draft tokens. Expect an accept length of ~3–4; watch `accept len` in the decode log line.
- **Prefix caching** matters more than raw throughput when your client sends the same system prompt and tool schemas every turn. A repeat request should show `#cached-token:` close to the prompt length in the log.
- **Tool calling and reasoning** are parser settings, not model settings: `--tool-call-parser` (e.g. `qwen3_coder`), `--reasoning-parser` (e.g. `qwen3`). With a reasoning parser the chain of thought arrives in `reasoning_content` and the answer in `content`; without it your client sees raw think-tags.
- **Concurrency is usually not what you set.** Hybrid (mamba/GDN) models cap `max_running_requests` by the state cache and say so in the log: `max_running_requests is capped to 1 by the mamba state cache (max_mamba_cache_size=8, 5 state slots per request)`. Either raise `--max-mamba-cache-size` and accept a smaller KV pool, or tell the user it serialises.
- Budget the card explicitly: `--mem-fraction-static` sizes the KV pool off what is left; `--kv-cache-dtype fp8_e4m3`, `--context-length` and `--cuda-graph-max-bs-decode` trade context, concurrency and speed against each other. Read the two lines `KV Cache is allocated … #tokens:` and `available_gpu_mem` from the log and report them as the real limit.

The complete working example — every flag, every export, and the memory arithmetic — is in [`reference/sglang-serve.md`](reference/sglang-serve.md).

## Rented GPU clouds

The console, the port mapping and the billing are where a rented instance differs from your own box, and where an agent usually needs help: the container listens on one fixed port, the public port is assigned per boot, the port switch turns itself off when the instance stops, and a depleted balance stops the instance without warning. [`reference/gpu-cloud-console.md`](reference/gpu-cloud-console.md) walks through it with the 算家云 (suanjiayun) console as the concrete case, including how to drive its web terminal when SSH is password-only.

## Reporting

Give the user: the base URL and model name; what you verified (and what you could not); the measured concurrency and context limits with the reason; the hourly cost and the remaining balance; and the exact commands to restart the service after a reboot. If a client needs configuration, hand them the `base_url` / `model` pair and note that the placeholder API key can be any string when the server has no `--api-key`.

## Reference

- [`reference/pitfalls.md`](reference/pitfalls.md) — the failure list: symptom → cause → fix.
- [`reference/sglang-serve.md`](reference/sglang-serve.md) — environment setup, the full `serve.sh`, flag-by-flag notes, memory math, restart behaviour.
- [`reference/verify.md`](reference/verify.md) — verification commands and expected answers, prefix-cache evidence, client wiring.
- [`reference/gpu-cloud-console.md`](reference/gpu-cloud-console.md) — renting and operating the instance: console, ports, web terminal, billing.
