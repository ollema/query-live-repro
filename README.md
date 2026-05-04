# query-live-repro

Minimal SvelteKit + `query.live` reproduction showing that the
`application/x-ndjson` response from a live remote function silently
breaks behind any reverse proxy that buffers responses by default
(nginx being the obvious one) — and the one-line `hooks.server.ts`
workaround that fixes it.

A live demo is up at: <https://query-live-repro.server.ollema.xyz>

## TL;DR

`query.live` returns `application/x-ndjson`, an open response that yields
newline-delimited JSON frames as the server-side async generator yields.
**nginx's default `proxy_pass` config buffers upstream responses**, so
the frames never reach the client; the connection just hangs. After
nginx hits `proxy_read_timeout` (default 60s) it closes the upstream and
flushes whatever (typically nothing) it had buffered, at which point
Chrome reports `net::ERR_HTTP2_PROTOCOL_ERROR 200 (OK)` and SvelteKit
flips `live.connected` to `false`.

The fix from the framework side is one header: `X-Accel-Buffering: no`,
which nginx interprets as "do not buffer this response."

## What's in here

Two pages, sharing the same `watchCounter` + `bump` remote functions and
the same in-memory counter:

- **`/broken`** — no proxy hint, hangs forever behind nginx.
- **`/fixed`** — `X-Accel-Buffering: no` set in `hooks.server.ts` for
  this route, works as expected.

Open both in two tabs side-by-side: `/fixed` ticks live; `/broken`
doesn't, even when the bump comes from the other tab.

## Local

```sh
pnpm install
pnpm dev
# both /broken and /fixed work — vite dev does not buffer responses
```

The bug only shows up once nginx (or any other default-buffering
reverse proxy) is in front of the Node server.

## Observed behavior behind nginx

Setup for the live demo: `@sveltejs/adapter-node` running in Docker,
exposed via nginx's default `proxy_pass` config. No special
configuration applied at the proxy.

### `/broken`

1. Page renders, but `live.connected === false` from the start.
2. Request to `/_app/remote/<hash>/watchCounter` sits **pending for ~60s**
   (matches nginx's default `proxy_read_timeout`).
3. Then it "completes" with the response below — and Chrome immediately
   logs `net::ERR_HTTP2_PROTOCOL_ERROR 200 (OK)`.

```
Status Code:    200 OK
cache-control:  private, no-store
content-type:   application/x-ndjson
server:         nginx
```

Pressing "bump" or "retry" reproduces the hang for the next request.

### `/fixed`

1. `live.connected === true` immediately.
2. `bump` ticks the counter live.
3. Two `/fixed` tabs stay in sync.
4. With one `/fixed` and one `/broken` open, `/fixed` still ticks on
   every bump — the workaround is per-response, scoped to that page.

The `/fixed` response carries the same `Cache-Control: private, no-store`
and `Content-Type: application/x-ndjson` as `/broken`, plus the hook
adds `X-Accel-Buffering: no`. nginx honors the header (and strips it
from the response sent to the client, so you won't see it in devtools —
its absence on `/fixed` responses is the expected sign that nginx acted
on it).

## Why nginx eats the stream

`query.live` correctly sets `Cache-Control: private, no-store` on the
response, which Cloudflare and some other proxies respect for both
caching *and* buffering decisions. **nginx ignores `Cache-Control` for
proxy buffering** ([docs](http://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_buffering)).
Its only opt-outs from the upstream side are:

- `proxy_buffering off;` in the nginx config, **or**
- an `X-Accel-Buffering: no` response header from the upstream.

The hook in this repo uses the latter — it requires no changes on the
proxy host.

## What might be worth fixing in SvelteKit

nginx-fronted Node deploys are very common — every CapRover, Coolify,
Dokku, and hand-rolled nginx-in-front-of-Node setup ships with response
buffering on by default. Today, `query.live` is silently broken on all
of them out of the box.

A one-line change in the framework — emit `X-Accel-Buffering: no` on
the streaming remote-function response by default — would unbreak every
such deploy with no user action required. The header is harmless on
proxies that don't recognize it, and it's the standard signal for
"this is a streaming response, don't buffer me."

Until that lands, the `hooks.server.ts` workaround in `/fixed` works.

## Reproducing the deploy

The included `Dockerfile` and `.github/workflows/build.yml` deploy via
[CapRover](https://caprover.com/) (which fronts apps with nginx using
its default config — convenient for reproducing this bug), but any
nginx-in-front-of-Node setup will reproduce identically.

For the included CapRover flow:

1. Fork / push this repo to your own GitHub account.
2. Create a new app in CapRover. Note the app name + generate an app token.
3. Add GitHub repo secrets:
   - `CAPROVER_SERVER` (e.g. `https://captain.your-domain.tld`)
   - `CAPROVER_APP_NAME`
   - `CAPROVER_APP_TOKEN`
4. Push to `main`. The workflow builds the image, pushes to ghcr.io, and
   tells CapRover to pull `sha-<commit>`.
5. Open `/broken` and `/fixed` and compare.

## Versions

- `@sveltejs/kit ^2.59.0`
- `@sveltejs/adapter-node ^5.5.4`
- `svelte ^5.55.5`
- node `22`
- nginx (default config)
