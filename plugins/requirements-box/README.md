# requirements-box

A **requirements box**: one page where the user writes down what they want done, a scheduled task that wakes
the agent to work through it, and a report by mail per round — so asking for something does not cost a
conversation, and nothing gets lost between them.

```
user files a request on the page
        │
        ├─ status=new … the page keeps it, the schedule waits
        ▼
every <period> the agent wakes, reads the list, marks each item doing, and works through up to three
        │
        ├─ done      → committed, gated, shipped; item archived, one mail per round
        ├─ blocked   → the question it could not answer, mailed to the user
        └─ rejected  → why not, in the same mail
```

## What's inside

| Piece | What it is |
| --- | --- |
| `kit/requirements.mjs` | The whole service: a JSON store with atomic writes, the keyed API (list/create/read/patch, the patrol cadence, and the do-it-now trigger), and it serves the page. Node standard library only — no build step, no dependency tree. |
| `kit/requirements.html` | The page: file a request, edit or withdraw one, select several and act in bulk, schedule an item, pause the patrol or change its cadence, and a "do it now" button. |
| `kit/serve.mjs` | A standalone server for the box alone, so it can run on its own port without touching anything else already on the machine. |
| `kit/patrol.md` | The protocol the scheduled round follows: take work, mark it doing before touching it, triage, gate, ship, mail, archive — and the red lines. |
| `kit/install.mjs` | Lays the files down, generates the key, writes `box.config.json`, writes the schedule, and prints the two commands left to run. |

## Why it exists

- **Asking is not a conversation.** The user's own words are on the page; the agent reads them when it wakes,
  not when it happens to be listening.
- **No dependency tree for a form.** One Node file, one JSON store — nothing to install, nothing to upgrade,
  and the whole state is a file you can read.
- **The schedule is a file, not a black box.** The round is a `.toml` the platform re-reads; the cadence, the
  on/off switch and the "do it now" button all write that one file.
- **Doing it now is one click.** Waiting for the next tick is the common complaint, so the page can start a
  session immediately, and can do it for just the items the user selected.

## Install

```bash
node <skill dir>/kit/install.mjs --dir ~/requirements-box --workspace ~/my-project --port 3007 --period 2h
```

Then start `node ~/requirements-box/serve.mjs` and open the printed URL (the key rides in `?key=` once and
the page remembers it). Everything machine-specific lives in the generated `box.config.json`; environment
variables override it.

## Notes

- The key is the ability to make the agent work. It lives in `key.txt` (0600) and must not reach a commit,
  a log or a mail body.
- The page is meant to be reachable by one person, not published: bind `127.0.0.1` unless the user asked for
  a wider listen, and never expose it without the key.
- The patrol protocol is deliberately in one markdown file the user can rewrite — the flow is theirs to change.
