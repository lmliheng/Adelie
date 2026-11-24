---
title: "Authentication: connecting an external app"
description: Letting another service use Adelie accounts to tell who a user is — the server-to-server channel, its credentials and endpoints, and what works today instead.
---

> [!WARNING]
> This page is the design as of **2026-11-24 and is not implemented**: the endpoints, table names and commands below are not in the code yet, so nothing can be wired up against them today. To make an external service work now, use one of the three ways in the next section. Once the feature lands, this page becomes usage documentation.

Adelie's identity layer already exists — see [the security model](/security): passwords are stored as scrypt hashes, a session is one server-side row and can be revoked, and its four kinds of credential have their own boundaries. What is missing is only the **outward-facing half**: a way for an external program running on a server (another backend, a script, a cron job) to ask "whose key is this?".

That half answers **identity** (who, display name, avatar) and never **capability** (read Sessions, run an agent turn). The latter has always been the job of the [Agent API](/agent-api); the two are orthogonal and neither replaces the other.

## Three ways that work today

| Approach | What the app is given | Why it is not enough |
| --- | --- | --- |
| Share one Agent API key | the app calls `POST /api/amsp/v1/agents/:projectId/:agentId/runs` with `penguin_…` | the key belongs to **an Agent**, not to a user: it cannot answer "who is this person" |
| Reuse a browser session | hand the signed-in cookie to the app (or let it read `cli-session.json` on the same box) | that is handing over the whole session; a leak is that person's leak, and revoking means revoking them |
| The local API token | the app reads `<root>/api-token` on the **same machine** | there is one, it is always `admin`, and it does not distinguish users; it only fits "can read the data root = owns the machine" |

None of the three separates one user from another, which is what the layer below adds.

## The design: two credentials, three endpoints

```
        user                          external app (server-side)        Adelie
  ┌───────────────┐  ① the token is pasted  ┌────────────────┐  ③ introspect  ┌───────────┐
  │ mint a PAT    │ ──────────────────────▶ │ store it in its │ ─────────────▶ │ /oauth/   │
  │ (CLI/admin)   │                         │ own config      │ ◀───────────── │introspect │
  └───────────────┘                         └────────────────┘    {sub,…}     └───────────┘
                                                  │ ② the app's own identity
                                                  └── client_id + client_secret (authenticates ③)
```

**The user's credential** is a personal access token (PAT): `adelie_pat_` plus 32 random bytes, of which **only the sha256 is stored**, together with a name, its scope, an expiry, a last-used time and a revocation flag. It is not a cookie and it never signs anyone into the Web App.

**The app's credential** is a `client_id` + `client_secret` (a server-side program can keep a secret). It exists because the introspection endpoint cannot be open: otherwise anyone holding a stolen token could ask who it belongs to, and the endpoint would become a token oracle. With it, revocation can be per app and the audit trail can say which app asked about whose token, and when.

**Three endpoints**, all under `/oauth/*`, all `application/x-www-form-urlencoded`:

| Endpoint | Called by | Purpose |
| --- | --- | --- |
| `POST /oauth/introspect` | the app, with its own client credentials | turn a PAT into an identity |
| `GET /oauth/userinfo` | the app, with `Authorization: Bearer <PAT>` | the short path when it only wants the name and avatar |
| `POST /oauth/revoke` | the app or the user | revoke a PAT |

```bash
curl -s -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d "token=$PAT" https://your-host/oauth/introspect
# {"active":true,"sub":"lmliheng","name":"Li Heng","avatar":null,
#  "scope":"openid profile","client_id":"adelie_app_…","exp":"2027-02-22T00:00:00Z"}

# Unknown / expired / revoked / outside what this app may ask about — all the same answer:
# {"active":false}
```

An app needs three things: store the token like a secret, **cache the introspection for at most 60 seconds**, and send the user back to sign in when it reads `active:false`.

### Where a token comes from (no page involved)

```bash
penguin auth token --user lmliheng --name "requirements box" --scope openid,profile --ttl-days 90
# → adelie_pat_…  (printed once)

# an admin minting for someone else (needs a human sign-in; the local API token is refused)
POST   /api/admin/users/:userId/tokens
# the user listing and revoking their own
GET    /api/me/tokens
DELETE /api/me/tokens/:tokenId
```

The token's shape follows the existing session minting (32 random bytes, base64url, sha256 only — see [the security model](/security)), but it lives in a table of its own, `user_tokens`, rather than in `auth_sessions`: that one is the browser cookie's session table, and changing a password or signing a user out everywhere deletes all of it — an external app's tokens should not be taken along. The other two tables are `oauth_clients` for app registrations and `oauth_audit` for the trail.

### Security posture

- **TLS is a hard prerequisite.** These endpoints receive other people's tokens; over plain HTTP they cross the wire in the clear and the session cookie cannot carry `Secure`. Behind a reverse proxy, Adelie itself must be given `ADELIE_TRUST_PROXY=1` and the proxy must set `X-Forwarded-Proto` (see [the security model](/security)). By the spec these endpoints want `https`; only a loopback address is exempt.
- **Every failure answers `{"active":false}`**, with no distinction between unknown, expired, revoked and not-yours, so the endpoint cannot be used to probe.
- **Rate-limit introspection** per client, and back off on repeated client-credential failures.
- **Only `openid profile` is allowed** as a scope; tokens default to 90 days and cap at one year.
- **Revocation is immediate**: revoking a token, disabling an account or deleting an app makes the next introspection answer `active:false`; the only delay is the app's own 60-second cache.
- **No password grant** (never hand a user's Adelie password to an external app). Signing in with Adelie inside a browser belongs to the other piece of work — the redirect-and-consent flow in the repository's OIDC design.
- **A PAT cannot open `/api/*`**: it answers *who*, never *what they may do*. That boundary is deliberate.

### Phases

| Phase | Contents |
| --- | --- |
| P0 | the three tables (with a database migration) + token minting (three CLI flags and the admin API) + `/oauth/introspect` + the audit trail |
| P1 | app registration and its admin API, `/oauth/userinfo`, `/oauth/revoke`, rate limiting |
| P2 | signed tokens (JWT) with a discovery document for offline verification; `client_credentials` (the app's own identity) |

## How it divides work with the Agent API

The [Agent API](/agent-api) answers whether a program may run a turn as a given Agent, and its credential is that Agent's key; this page's layer answers who a person is, and its credential is that person's token. An external app usually needs both: its own Agent key to do the work, and the user's PAT to know who asked for it.
