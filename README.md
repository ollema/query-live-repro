# query-live-repro

Minimal SvelteKit + `query.live` reproduction showing that a streaming
remote function silently breaks when the app is fronted by a reverse proxy
with default response buffering (e.g. nginx as configured by CapRover) —
and the one-line workaround that makes it work.

A live demo is up at: <https://query-live-repro.server.ollema.xyz>

## TL;DR

`query.live` returns `application/x-ndjson`, an open response that yields
newline-delimited JSON frames as the server-side async generator yields.
Default nginx `proxy_pass` config **buffers the upstream response**, so
the frames never reach the client; the connection just hangs. After
nginx hits `proxy_read_timeout` (default 60s) it closes the upstream and
flushes whatever (typically nothing) it had buffered, at which point
Chrome reports `net::ERR_HTTP2_PROTOCOL_ERROR 200 (OK)` and SvelteKit
flips `live.connected` to `false`.

The fix is one line: respond with the `X-Accel-Buffering: no` header,
which nginx interprets as "do not buffer this response."

## What's in here

- Two pages, each rendering the same `watchCounter` + `bump` remote
  functions against the same in-memory counter:
  - **`/broken`** — no proxy hint, hangs forever behind nginx.
  - **`/fixed`** — `X-Accel-Buffering: no` set in `hooks.server.ts` for
    this route, works as expected.
- `src/lib/api/counter.remote.ts` — `watchCounter` (`query.live`) +
  `bump` (`command`).
- `src/lib/server/events.ts` — in-process `EventEmitter` bus.
- `src/hooks.server.ts` — adds `X-Accel-Buffering: no` for `/fixed`.
- `Dockerfile` and `.github/workflows/build.yml` — build to ghcr.io and
  deploy via `caprover/deploy-from-github`.

Open `/broken` and `/fixed` in two tabs side-by-side: `/fixed` ticks
live; `/broken` doesn't, even when the bump comes from the other tab.

## Local

```sh
pnpm install
pnpm dev
# open http://localhost:5173 — both /broken and /fixed work fine, because
# vite dev does not buffer responses
```

Both routes work locally. The bug only shows up once a reverse proxy
that buffers by default (nginx, in this case) is in front of the Node
server.

## Observed behavior on a deployed CapRover instance

Setup: CapRover on a Hetzner VPS, app exposed via CapRover's default
nginx config, **DNS-only** through Cloudflare (so Cloudflare is not in
the request path; the browser connects directly to the Hetzner box on
HTTP/2). No special configuration applied at the proxy.

### `/broken`

1. The page renders, but `live.connected === false` from the start.
2. The request to `/_app/remote/<hash>/watchCounter` sits **pending for
   ~60s** (matches nginx's default `proxy_read_timeout`).
3. Then it "completes" with the response below — and Chrome immediately
   logs `net::ERR_HTTP2_PROTOCOL_ERROR 200 (OK)`.

```
Status Code:    200 OK
cache-control:  private, no-store
content-type:   application/x-ndjson
server:         nginx
```

Pressing "bump" or "retry" reproduces the same hang for the next request.

### `/fixed`

1. `live.connected === true` immediately.
2. `bump` ticks the counter live.
3. With two `/fixed` tabs open, both stay in sync.
4. With one `/fixed` and one `/broken` open, the `/fixed` tab still ticks
   on every bump — it's the per-response header that matters.

The response carries the same `Cache-Control: private, no-store` and
`Content-Type: application/x-ndjson` as `/broken`, plus the hook adds
`X-Accel-Buffering: no`. nginx honors the header (and strips it from
the response sent to the client, so you won't see it in devtools — its
absence on `/fixed` responses is the expected sign that nginx acted on
it).

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

## Two findings worth surfacing

### 1. `query.live` ndjson responses break behind any default-buffering proxy

This is the headline bug. nginx is the most common default-buffering
proxy in production deploys; CapRover, Coolify, Dokku, hand-rolled
nginx-fronted Node, and many others ship a config that buffers
`proxy_pass` responses by default. SvelteKit currently emits no header
that nginx honors, so every such deploy is silently broken for
`query.live`.

A one-line framework fix — emit `X-Accel-Buffering: no` on streaming
remote-function responses by default — would unbreak all of these
without any user action. (Until that lands, the `hooks.server.ts`
workaround in this repo works.)

### 2. `event.url.pathname` in `handle` is the originating page path for remote requests, not `/_app/remote/...`

For a request like `GET /_app/remote/<hash>/watchCounter`, the
`event.url.pathname` seen by `handle` is `/fixed` (the page that called
the remote function), not `/_app/remote/<hash>/watchCounter`. SvelteKit
reads this from the `x-sveltekit-pathname` request header.

This is presumably intentional — it lets hooks reason in page context —
but the obvious userland filter `pathname.startsWith('/_app/remote/')`
will silently never match, and a worked example in the docs would have
saved an hour here. (Compare `event.url.pathname` on a homepage `GET /`
vs. on its remote function call: identical — completely opaque from
the hook's perspective.)

## Reproducing the deploy

1. Fork / push this repo to your own GitHub account.
2. Create a new app in CapRover. Note the app name + generate an app token.
3. In the GitHub repo, add secrets:
   - `CAPROVER_SERVER` (e.g. `https://captain.your-domain.tld`)
   - `CAPROVER_APP_NAME`
   - `CAPROVER_APP_TOKEN`
4. Point a hostname at the CapRover app. Cloudflare proxy is **not**
   required; DNS-only is sufficient to reproduce.
5. Push to `main`. The workflow builds the image, pushes to ghcr.io, and
   tells CapRover to pull `sha-<commit>`.
6. Open `/broken` and `/fixed` and compare.

## Versions

- `@sveltejs/kit ^2.59.0`
- `@sveltejs/adapter-node ^5.5.4`
- `svelte ^5.55.5`
- node `22`
- nginx via CapRover (default config)
