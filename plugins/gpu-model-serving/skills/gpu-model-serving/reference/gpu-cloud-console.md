# Rented GPU clouds — console, ports, terminal, billing

The concrete case is **算家云 (suanjiayun.com)**, but the shape repeats on most Chinese GPU-rental consoles: a web console for the instance, a container you reach through a browser terminal, one exposed port, a persistent data disk, and prepaid billing.

## The instance

- Console: `https://suanjiayun.com/container/#/instanceMine` — the instance list; each row carries 立即关机/开机, WebShell, SSH/SFTP, 文件管理, 开放端口, 更多.
- Storage layout inside the container:
  - `/` — small system disk (~30GB), wiped on a system reset. Never put weights here.
  - `/root/sj-tmp` — the data disk (~50GB), **survives stop/restart and reset**. Keep models, the venv and `serve.sh` here.
- Memory is a cgroup cap of the rented size (`cat /sys/fs/cgroup/memory.max`, e.g. 60GiB) while `free` reports the **host's** memory. Never size `MAX_JOBS` or a cache from `free`.
- SSH: `ssh <account>@<region>.suanjiayun.com -p 2020` — **password-only**; a pubkey is refused, so a scripted shell must go through the web terminal (below) or an interactive login.

## Ports — read this twice

- The container must listen on **8080**; the platform forwards that one port.
- The forwarding is configured per instance under **开放端口 → 对外开放端口** (a switch, saved immediately), and the public address is revealed by **获取地址 / 新页面访问**, e.g. `http://<region>.suanjiayun.com:51197` → your OpenAI base URL is `http://<region>.suanjiayun.com:51197/v1`.
- **The public port is randomly assigned and can change on every boot** (observed: 51197 → 51476 across one stop/start), and **stopping the instance turns the port switch off**. So after every power-on: reopen the switch, read the new address, and update anything that hard-codes it (client configs, model registries, bookmarks).

## The web terminal (WebShell)

The WebShell tab is an xterm in an iframe. To drive it from a script:

1. `document.querySelector('iframe').contentDocument`, then the terminal's hidden input is `.xterm-helper-textarea`.
2. `focus()` it and dispatch a synthetic `ClipboardEvent('paste')` carrying the command as `text/plain` — synthetic `keydown` alone does not insert text.
3. To run it, dispatch synthetic `keydown`/`keyup` for `Enter` (keyCode 13).
4. Read output from `.xterm-rows` `innerText` after setting `.xterm-viewport.scrollTop = scrollHeight` — only the visible ~60 lines exist, so `grep`/`tail` inside the container first.
5. If the terminal freezes, reload the iframe (`iframe.contentWindow.location.reload()`); anything started with `setsid nohup` keeps running.

Long commands can lose characters or fail to submit on the first Enter — send a second bare Enter script rather than retyping.

## Billing

- Hourly, prepaid: an RTX 5090 ×1 instance billed **¥2.92/hour**.
- When the balance reaches zero the platform **stops the instance automatically** ("已关机 / 已暂停计费") and the public address dies with it. A negative balance blocks starting again until it is topped up.
- Consequences for an agent: check the balance before promising an always-on service, tell the user the hourly rate and roughly how long the remaining balance lasts, and remember that a stop also disables the port switch.
- Because a stopped instance loses nothing on the data disk, the restart ritual is short:
  1. top up and power on;
  2. **开放端口 → 对外开放端口**: switch on, read the new address;
  3. in WebShell: `cd /root/sj-tmp; setsid nohup ./serve.sh > serve.log 2>&1 < /dev/null &`;
  4. wait ~4 minutes (warm JIT cache) and re-verify;
  5. update every client that held the old address.
