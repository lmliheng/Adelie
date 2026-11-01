# Failure list — symptom → cause → fix

In the order they show up. Search this file by the error string before doing anything clever.

## 1. Checkpoint will not load: `assert param_data.shape == loaded_weight.shape`

**Cause:** the serving build does not know this quantization layout (here: an NVFP4/ModelOpt checkpoint on sglang 0.5.15).
**Fix:** upgrade (`sglang[all]==0.5.21` loaded it unchanged). If no version knows it, re-quantize or pick another checkpoint — do not patch the loader.

## 2. `AssertionError: extra_buffer_lazy unsupported with spec`

**Cause:** a lazy mamba radix-cache strategy under speculative decoding.
**Fix:** `--mamba-radix-cache-strategy extra_buffer`.

## 3. `unrecognized arguments: --mm-feature-transport`

**Cause:** the flag does not exist in the installed version.
**Fix:** upgrade, or drop it. Do not leave an unknown flag in `serve.sh` — the process exits before loading anything.

## 4. `ImportError: libnvrtc.so.13: cannot open shared object file`

**Cause:** the CUDA runtime inside the venv is not on the loader path.
**Fix:** `export LD_LIBRARY_PATH=<venv>/lib/python3.*/site-packages/nvidia/cu13/lib:$LD_LIBRARY_PATH`.

## 5. `deep_gemm: AssertionError: assert cuda_home is not None`

**Cause:** no toolkit for the JIT to call — a container has no system CUDA.
**Fix:** `export CUDA_HOME=$CS/nvidia/cu13`, `CUDA_PATH=$CUDA_HOME`, `PATH=$CUDA_HOME/bin:$PATH` **and** `LIBRARY_PATH=$CUDA_HOME/lib`.

## 6. `flashinfer-cubin 0.6.12 != flashinfer 0.6.18` (fatal version check)

**Cause:** the runtime and its prebuilt cubins are versioned separately, and the matching cubin often is not on PyPI yet.
**Fix:** `FLASHINFER_DISABLE_VERSION_CHECK=1`.

## 7. `#error "CUDA compiler and CUDA toolkit headers are incompatible, please check your include paths"`

**Cause:** CCCL inside the venv requires nvcc and `cuda_runtime.h` to be the *same* minor version (here nvcc 13.2 vs headers 13.0).
**Fix:** prepend `#define CCCL_DISABLE_CTK_COMPATIBILITY_CHECK 1` to every `cuda/std/__cccl/cuda_toolkit.h` in the venv. Verify with a full-line match — the file already contains `#ifndef CCCL_DISABLE_CTK_COMPATIBILITY_CHECK`, so a substring test always says "already fixed":

```bash
f=<venv>/…/nvidia/cu13/include/cccl/cuda/std/__cccl/cuda_toolkit.h
grep -q '^#define CCCL_DISABLE_CTK_COMPATIBILITY_CHECK 1' "$f" || sed -i '1i #define CCCL_DISABLE_CTK_COMPATIBILITY_CHECK 1' "$f"
```

## 8. `ptxas ... Unsupported .version 9.2` / `Unsupported .target sm_120`

**Cause:** you "fixed" #7 by downgrading nvcc to match the headers. The older toolchain cannot emit code for a newer card.
**Fix:** keep nvcc at the newest version and disable the check instead (#7). Never downgrade below the card's architecture support.

## 9. `ld: cannot find -lcudart`

**Cause:** pip ships versioned library names only (`libcudart.so.13`, never `libcudart.so`).
**Fix:** symlink `libcudart.so` (and `libcublas.so`, `libcublasLt.so` if the same error repeats) in the venv's `nvidia/cu13/lib`, and export `LIBRARY_PATH` to that directory.

## 10. Draft/auxiliary model directory crashes the loader

**Cause:** zero-byte leftovers — truncated shards, an empty `model.safetensors.index.json`, empty tokenizer files — a half-finished download that the loader trusts and then fails on.
**Fix:** move every zero-byte file out of the directory; keep only the files the manifest actually names (e.g. `config.json` + a single `model.safetensors` for a draft model). Check with `find <dir> -size 0`.

## 11. `Received sigquit from a child process. It usually means the child failed.`

**Cause:** this line is a symptom, never the reason. The scheduler dies because a compile or a child process died.
**Fix:** read upward: `grep -inE 'Killed|error:|Traceback|ninja:|CalledProcessError' serve.log | tail -20`. Expect #12 or #13.

## 12. The same CCCL error, after you already fixed it — from `sgl_kernel_jit_speculative_sampling_*`

**Cause:** there is more than one vendored CCCL in a venv. The flashinfer copy is patched by #7; SGLang's own JIT (speculative sampling, attention) compiles against `nvidia/cu13/include/cccl/…` and stops on the same check.
**Fix:** apply #7 to *every* copy found by `grep -rln "headers are incompatible" <venv>/lib/python3.*/site-packages`.

## 13. JIT build OOMs: `RuntimeError: Ninja build failed` with several `Killed` and exit status 137

**Cause:** ninja parallelises to `nproc+2` compilers; each CUTLASS/FP4 template can take gigabytes. A rented instance's memory is a cgroup cap (check `/sys/fs/cgroup/memory.max`), even though `free` inside the container prints the *host's* total and looks enormous.
**Fix:** `export MAX_JOBS=3` (flashinfer's `jit/cpp_ext.py` honours it) — or whatever keeps peak usage under the cap. Already-compiled kernels stay cached, so a restart continues from where it died.

## 14. Only one port is reachable from outside

**Cause:** the platform exposes a fixed container port (算家云: **8080**) and forwards it to a random public port; nothing else is reachable.
**Fix:** serve on the exposed port, and do not run anything else on it. A temporary `python3 -m http.server 8080` to read logs is a useful trick **only** while the model server is down — kill it before starting SGLang, and remember the public port can change on the next boot (`gpu-cloud-console.md`).

## Working habits that saved the most time

- **Read the log, not the terminal.** Long output through a web terminal is painful; `grep`/`tail` on the server first, and only then look at the screen. The reason for a crash is always above the last line.
- **Start detached** (`setsid nohup … &`) so a browser reload or a dropped SSH session cannot kill a 20-minute build.
- **Cache is an asset.** `~/.cache/sglang` holds every JIT artifact and autotune result; a warm restart is ~4 minutes instead of ~40.
- **Verify with the API, not the log.** "ready to roll" plus a green `/health` still does not prove tool calls, streaming or prefix caching work — see `verify.md`.
