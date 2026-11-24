---
title: Authentication: connecting an external app
description: Let another service ask Adelie whose a request is — the server-to-server endpoints, the two credentials, and the rules they are held to.
---

Adelie's identity layer is already there, and it is described in [Security](/security): passwords are stored as scrypt hashes, a session is a row on the server, every credential is revocable, and the four kinds of credential each have their own boundary. This page is about the **outward-facing layer**: letting a program that runs on a server (another backend, a script, a scheduled job) ask "whose is this key".

It answers **identity** only (who, nickname, avatar). It does not answer **capability** (read Sessions, run an Agent) — that is the [Agent API](/agent-api)'s job, and the two are orthogonal rather than alternatives.

> [!NOTE]
> This is the **server-side-only** channel: the external app is a program on a server, and nothing on Adelie's side gets a new page — a token is minted through the CLI or the admin API, an app is registered through the admin API, and everything else is HTTP. For "a person clicks *Sign in with Adelie* in a browser", that is the redirect-and-consent flow, which has its own OIDC design note in the repository and is not this page.

## Two credentials, three endpoints

```
        person                        external app (server-side)      Adelie
  ┌───────────────┐  ① hand it over  ┌────────────────┐  ③ introspect ┌───────────┐
  │ mint a PAT     │ ───────────────▶ │ store it as a   │ ────────────▶ │ /oauth/   │
  │ (CLI/admin API)│                  │ secret, act for │ ◀──────────── │introspect │
  └───────────────┘                  │ that person     │   {sub,…}    └───────────┘
                                      └────────────────┘
                                             │ ② the app's own identity
                                             └── client_id + client_secret (authenticating ③)
```

A **person's credential** is a program token (PAT): `adelie_pat_` plus 32 random bytes, with **only its sha256 stored**, carrying a purpose name, its scopes, an expiry, a last-used stamp and a revocation mark. It is not a cookie and does not sign anyone into the Web App.

An **app's credential** is `client_id` + `client_secret` (a server-side program can keep a secret). It exists because the introspection endpoint must not be naked: otherwise anyone holding a stolen token could ask "whose is this", and the endpoint would become a token prober. With it, an app can be cut off on its own and the audit can name who asked what, when, with whose token.

**Three endpoints** (all under `/oauth/*`, `application/x-www-form-urlencoded`):

| Endpoint | Who calls it | What it does |
| --- | --- | --- |
| `POST /oauth/introspect` | the external app (with its client credentials) | turn a PAT into an identity |
| `GET /oauth/userinfo` | the external app (`Authorization: Bearer <PAT>`) | the direct route when only a name and avatar are wanted |
| `POST /oauth/revoke` | the external app | end the PAT it was handed |

```bash
curl -s -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d "token=$PAT" https://your-domain/oauth/introspect
# {"active":true,"sub":"lmliheng","username":"lmliheng","name":"Li Heng","avatar":null,
#  "scope":"openid profile","client_id":"adelie_app_…","exp":"2027-02-22T00:00:00Z"}

# unknown / expired / revoked / account gone / outside what this app may read → all the same line:
# {"active":false}
```

The app's credentials go in HTTP Basic (`curl -u`), or as the `client_id` / `client_secret` form fields. **A wrong credential is 401**; anything about the token itself folds into the same `{"active":false}`.

The app has three things to do: store the token as a secret, **cache the introspection result for no more than 60 seconds**, and on `active:false` make that person sign in again.

## How the token is obtained

Three ways, none of them a page.

```bash
# 1. The CLI (on the machine that has the data root; no running server needed)
penguin auth pat --user-id lmliheng --name "requirements box" --scope openid,profile --ttl-days 90
# → adelie_pat_…  (printed once)
```

```text
2. The admin's HTTP surface (for someone without a terminal, or for scripting)
POST   /api/admin/tokens                    { userId, name, scope?, ttlDays? } → { token, entry }
GET    /api/admin/tokens?userId=<id>        the list (prefix / name / scope / expiry / last used / revoked only)
DELETE /api/admin/tokens/:tokenId           revoke

3. The person's own list and revoke
GET    /api/me/tokens
DELETE /api/me/tokens/:tokenId
```

(2) is admin-only and refused entirely in desktop mode (single-user). **Minting and revoking also require the operator's own sign-in**: the machine's local API token (`<root>/api-token`) is refused with 403 `human_required`, because that token is what the harness hands an Agent's subprocesses and must not be able to issue an outside credential on a person's behalf.

### Registering an app

An admin registers an app and receives its `client_id` and `client_secret` (the secret is shown once):

```text
POST   /api/admin/oauth-clients        { clientName, scopes? } → { clientId, clientSecret, entry }
GET    /api/admin/oauth-clients        the list (the secret's prefix only, never the secret)
POST   /api/admin/oauth-clients/:clientId/disable    disable it (its introspection then answers 401)
```

`scopes` is the most this app may ask for, `openid profile` by default. A token's scopes must fall inside what the app registered, or introspection answers `active:false`.

## The tables

Three tables, created by one database migration (`PRAGMA user_version` to 17):

- `user_tokens`: the PAT above. **Deliberately not folded into `auth_sessions`** — that is the browser cookie's session table, and a password change or "sign out everywhere" clears it whole, which must not take an external app's token with it. The two have different lifetimes and different people revoking them.
- `oauth_clients`: the app registry (client_id, the secret's sha256, scopes, a disabled flag).
- `oauth_audit`: one row per introspection, revoke and mint, **refusals included** — the refusals are the ones worth reading. It carries no foreign keys, so a row outlives the account or app it names.

## The rules it is held to

- **TLS is a hard prerequisite.** These endpoints receive other people's tokens; over plain http they cross the wire in the clear and the cookie cannot carry `Secure`. Behind a reverse proxy, Adelie itself must set `ADELIE_TRUST_PROXY=1` and the proxy must set `X-Forwarded-Proto` (see [Security](/security)). In development, a loopback address is enough.
- **Only the sha256 is stored**; the raw token appears once, at mint. The `adelie_pat_` / `adelie_app_` prefixes make a leaked key recognisable at a glance.
- **Every failure is `{"active":false}`** — unknown, expired, revoked, account gone, scope not allowed — so the endpoint cannot be used to discover which tokens exist.
- **Introspection is rate-limited per app** (the visible ceiling is 60 per minute; past that 429, and the refusal is audited). Repeated client-auth failures back off.
- **Scopes are `openid profile` only**; 90 days by default, a one-year cap, and `--ttl-days 0` is the only way to no expiry.
- **Revocation is immediate**: revoke a token, disable an app, delete an account, and the next introspection says `active:false`. The only delay is the app's own 60-second cache.
- **A PAT cannot reach `/api/*`.** It answers "who", not "what may be done" — a deliberate boundary. Giving it API capability would be a separate scope and a separate review.
- **No CORS**: server-to-server calls do not go through a browser, and this sends no `Access-Control-Allow-Origin`.
- **No password grant** (handing a person's Adelie password to the external app): that moves the password into every app that integrates. Browser sign-in belongs to the other design.

## Not built yet

| Item | Notes |
| --- | --- |
| Signed tokens (JWT) and a discovery document (`/.well-known/openid-configuration`, `/oauth/jwks.json`) | for callers that want to verify offline rather than depend on Adelie being up; it would share this table and this token |
| `client_credentials` (the app's own identity, `sub` like `app:adelie_app_…`) | for jobs with no person to represent |
| Redirect sign-in with a consent page, and device code | both need pages, so they belong to the OIDC design |

## How it divides work with the Agent API

The [Agent API](/agent-api) answers "may a program run one round as this Agent", with a per-Agent key (`penguin_…`). This page answers "who is this person", with a per-user PAT (`adelie_pat_…`). A real integration usually needs both: its own Agent key to do the work, and the person's PAT to know who asked for it.
