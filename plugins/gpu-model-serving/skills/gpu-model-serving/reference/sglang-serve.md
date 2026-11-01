# Deploying with SGLang — the working setup

Everything here was run on **one RTX 5090 (32GB, sm_120), 15 vCPU, 60GB RAM**, serving a 27B 4-bit model with a draft model for speculative decoding, Python 3.10. Scale the numbers, keep the shape.

## 1. Environment

```bash
apt-get install -y python3-venv || true
cd /root/sj-tmp                       # the persistent data disk
python3 -m venv venv && . venv/bin/activate
pip install -U pip
pip install "sglang[all]==0.5.21"            # 0.5.15 could not load the NVFP4 checkpoint
pip install nvidia-cuda-nvcc==13.2.86        # pin the toolchain; see pitfalls 7 & 8
```

`torch 2.13.0+cu130` came in with `sglang[all]`. The pip CUDA packages land in the venv at `lib/python3.<x>/site-packages/nvidia/cu13/`, which is the toolkit you point everything at.

Three fixes to apply once, after installing:

```bash
CS=venv/lib/python3.10/site-packages
# (a) linker names pip does not ship
ln -sf libcudart.so.13  $CS/nvidia/cu13/lib/libcudart.so
ln -sf libcublas.so.13  $CS/nvidia/cu13/lib/libcublas.so 2>/dev/null || true
ln -sf libcublasLt.so.13 $CS/nvidia/cu13/lib/libcublasLt.so 2>/dev/null || true
# (b) find every CCCL copy that guards the toolkit-header check, then disable the check
grep -rln "headers are incompatible" $CS | tee /tmp/cccl.txt
while read -r f; do
  grep -q '^#define CCCL_DISABLE_CTK_COMPATIBILITY_CHECK 1' "$f" || \
    sed -i '1i #define CCCL_DISABLE_CTK_COMPATIBILITY_CHECK 1' "$f"
done < /tmp/cccl.txt
```

## 2. `serve.sh`

```bash
#!/bin/bash
cd /root/sj-tmp
. venv/bin/activate

export MAX_JOBS=3                                  # ninja parallelism -> container RAM
export FLASHINFER_DISABLE_VERSION_CHECK=1          # vendored cubin lags the runtime
CS=/root/sj-tmp/venv/lib/python3.10/site-packages
export LD_LIBRARY_PATH=$CS/nvidia/cu13/lib:$LD_LIBRARY_PATH
export LIBRARY_PATH=$CS/nvidia/cu13/lib:$LIBRARY_PATH
export CUDA_HOME=$CS/nvidia/cu13
export CUDA_PATH=$CUDA_HOME
export PATH=$CUDA_HOME/bin:$PATH

M=/root/sj-tmp/models/<target-model>
D=/root/sj-tmp/models/<draft-model>

exec sglang serve \
  --model-path "$M" \
  --served-model-name qwen3.8-27b-uncensored \
  --quantization modelopt_fp4 \
  --trust-remote-code \
  --speculative-algorithm DFLASH \
  --speculative-draft-model-path "$D" \
  --speculative-num-draft-tokens 8 \
  --context-length 122880 \
  --max-mamba-cache-size 8 \
  --mamba-radix-cache-strategy extra_buffer \
  --mamba-ssm-dtype bfloat16 \
  --kv-cache-dtype fp8_e4m3 \
  --attention-backend triton \
  --chunked-prefill-size 1024 \
  --mm-feature-transport cpu \
  --cuda-graph-max-bs-decode 1 \
  --mem-fraction-static 0.86 \
  --max-running-requests 4 \
  --reasoning-parser qwen3 \
  --tool-call-parser qwen3_coder \
  --host 0.0.0.0 --port 8080
```

Start it detached, and keep it that way — the service must survive the terminal that launched it:

```bash
cd /root/sj-tmp
setsid nohup ./serve.sh > serve.log 2>&1 < /dev/null &
```

## 3. Flags, and why each one is there

| Flag | Why |
| --- | --- |
| `--quantization modelopt_fp4` | The checkpoint is NVFP4 (ModelOpt). Wrong value → shape assertion while loading. |
| `--speculative-algorithm DFLASH` + `--speculative-draft-model-path` | A small draft model proposes tokens; the target verifies them. Cheapest latency win on one card. |
| `--speculative-num-draft-tokens 8` | 4–8 is the useful range; watch `accept len` in the decode log. |
| `--mamba-radix-cache-strategy extra_buffer` | Hybrid GDN models need this variant for prefix caching; the `*_lazy` strategies assert under speculative decoding. |
| `--mamba-ssm-dtype bfloat16` | Halves the mamba state size — the thing that caps concurrency. |
| `--kv-cache-dtype fp8_e4m3` | Doubles the tokens the KV pool holds at a small quality cost. |
| `--attention-backend triton` | Avoids a flashinfer attention path on sm_120; the JIT then compiles less. |
| `--chunked-prefill-size 1024` | Bounds the prefill burst so long prompts do not spike memory. |
| `--mm-feature-transport cpu` | Multimodal feature transport off the GPU; only exists from 0.5.21. |
| `--cuda-graph-max-bs-decode 1` | Capture CUDA graphs only up to this batch; more concurrency needs a bigger value and more memory. |
| `--mem-fraction-static 0.86` | Fraction of the card the server may use. Everything else (KV pool) is sized from what remains. |
| `--reasoning-parser qwen3` | Splits `…` into `reasoning_content`. |
| `--tool-call-parser qwen3_coder` | Turns the model's tool-call syntax into OpenAI `tool_calls`. |
| `--host 0.0.0.0 --port 8080` | The port the platform exposes; binding to `127.0.0.1` makes it unreachable from outside. |

## 4. Memory arithmetic (read these four log lines)

```
Load weight end. elapsed=32.91 s, type=… quant=modelopt_fp4, quant_algo=NVFP4, avail mem=11.89 GB
Mamba Cache is allocated. max_mamba_cache_size: 8, conv_state 0.02GB, ssm_state 0.63GB …
KV Cache is allocated. dtype torch.float8_e4m3fn, #tokens: 45259, K size: 0.22 GB, V size: 0.22 GB
max_running_requests is capped to 1 by the mamba state cache …
max_total_num_tokens=45259, chunked_prefill_size=1024, max_running_requests=1, context_len=122880, available_gpu_mem=3.18 GB
```

Derived rules of thumb for a 32GB card serving 27B@4bit + draft:

- mamba (state) cache: `ssm_state` ≈ **79MB per slot**, and each request takes ~5 slots → 8 slots = 1 request, 16 ≈ 2, 24 ≈ 3. Raising concurrency is a direct trade against KV tokens.
- KV pool ≈ 45k tokens here; a 122880 context window means one long conversation does not fit. If you need more effective context, raise `--mem-fraction-static`, drop `--kv-cache-dtype` to the default, or add SGLang's hierarchical cache (HiCache) so host RAM becomes a second-level prefix cache.
- `--cuda-graph-max-bs-decode` should be at least the concurrency you intend, or larger batches run without a captured graph.

## 5. Startup timeline and restart behaviour

- Cold start: weights ~30–40s, then **FlashInfer/`sgl_kernel` JIT compilation — the long pole**. With `MAX_JOBS=3` and a 60GB container a first start ran well past 20 minutes; a rebuild after changing compiler flags is faster but still minutes.
- Artifacts are cached in `~/.cache/sglang` (`jit/` and `flashinfer/`), plus flashinfer's own `~/.cache/sglang/.cache/flashinfer/<version>/…`. **Do not wipe them** — a restart with a warm cache reaches “The server is fired up and ready to roll!” in about 4 minutes.
- If you suspect a hung build, check progress cheaply: `ps -eo comm | grep -cE 'nvcc|cicc'` and `find ~/.cache/sglang -name '*.so' | wc -l`.
- The service writes only to `serve.log`; auditing a failed start is `grep -inE 'Killed|error:|Traceback|ninja:' serve.log | tail -20` — the reason is always *above* the last line.
