# Verification

A model server is done when five things answer correctly. Run them in this order; stop at the first failure and read `serve.log`.

Set `BASE=http://<host>:<public-port>`.

## 1. The process is alive and listening

```bash
curl -s -o /dev/null -w '%{http_code}\n' $BASE/health          # 200
# from inside the container, if the public address looks dead:
curl -s -o /dev/null -w 'local=%{http_code}\n' http://127.0.0.1:8080/health
```

Local 200 but a dead public address means the **port mapping**, not the server.

## 2. The model is registered

```bash
curl -s $BASE/v1/models
# {"object":"list","data":[{"id":"<served-model-name>",…,"max_model_len":122880}]}
```

## 3. Tool calling works

```bash
cat > req.json <<'JSON'
{"model":"<served-model-name>",
 "messages":[{"role":"system","content":"Use the provided tools when needed."},
             {"role":"user","content":"北京今天天气怎么样？请调用工具查询。"}],
 "tools":[{"type":"function","function":{"name":"get_weather","description":"查询指定城市的当前天气",
           "parameters":{"type":"object","properties":{"city":{"type":"string"}},"required":["city"]}}}],
 "tool_choice":"auto","temperature":0,"max_tokens":256}
JSON
curl -s -H 'Content-Type: application/json' -d @req.json $BASE/v1/chat/completions
```

Expect `"finish_reason":"tool_calls"` and a parsed call:

```json
"tool_calls":[{"id":"call_…","type":"function",
  "function":{"name":"get_weather","arguments":"{\"city\": \"北京\"}"}}]
```

With a reasoning parser the chain of thought sits in `reasoning_content` and the visible answer in `content`; a model that only emits think-tags means `--reasoning-parser` is missing or wrong for this family.

## 4. Streaming works

```bash
curl -sN -H 'Content-Type: application/json' -d @req.json $BASE/v1/chat/completions | head -c 800
```

Expect `data: {...}` chunks whose deltas accumulate, then a final chunk with `usage`, then `data: [DONE]`.

## 5. Prefix caching works

Send the same request a second time (any long, identical prefix) and read the server log — no client change is needed:

```bash
grep -oE '#cached-token: [0-9]+' serve.log | tail -4
```

A cached-token count close to the prompt length (`#cached-token: 320` out of 347) proves the radix cache is hitting. Zero on a genuine repeat means the strategy or the prompt identity is wrong.

## 6. Know your real limits

```bash
grep -nE 'capped|KV Cache is allocated|max_total_num_tokens' serve.log | tail -6
```

Report these to the user verbatim: the effective `max_running_requests`, the KV token pool, and the reason for any cap. A single-GPU hybrid model commonly caps concurrency at 1 because of the state cache — say so instead of letting requests pile up silently.

## Wiring a client

Any OpenAI-compatible client works:

```python
from openai import OpenAI
client = OpenAI(base_url=f"{BASE}/v1", api_key="sk-local")   # placeholder: the server has no --api-key
client.chat.completions.create(model="<served-model-name>",
                               messages=[{"role": "user", "content": "hi"}])
```

If the runtime is Adelie itself, register the endpoint so it appears in the model picker — the placeholder key is fine:

```bash
penguin config model add --root <data root> \
  --provider custom --model-id <served-model-name> \
  --base-url $BASE/v1 --client-type openai \
  --context-window <context-length> --no-vision --api-key sk-local
```

Re-run the same command with a new `--base-url` to move the entry when the public port changes.

## Restart checklist

1. Power the instance on; reopen the exposed port and read the (possibly new) public address.
2. `cd /root/sj-tmp; setsid nohup ./serve.sh > serve.log 2>&1 < /dev/null &`
3. Wait until the log says `The server is fired up and ready to roll!` (minutes with a warm JIT cache).
4. Repeat steps 1–5 above, then update every client with the new address.
