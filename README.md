# query-live-repro

Minimal SvelteKit + `query.live` reproduction showing that a streaming
remote function silently breaks when the app is fronted by a reverse proxy
with default response buffering (e.g. nginx as configured by CapRover).

Local `pnpm dev` works fine. Built and deployed behind nginx, the live
stream never reaches the client and the page sits in `live.connected ===
false`.

A live demo is up at: <https://query-live-repro.server.ollema.xyz>

## What's in here

- `src/lib/api/counter.remote.ts` — `watchCounter` (`query.live`) +
  `bump` (`command`).
- `src/lib/server/events.ts` — in-process `EventEmitter` bus.
- `src/routes/+page.svelte` — uses the
  `let live = $derived(watchCounter({})); let data = $derived(await live)`
  pattern so `live.connected` / `live.reconnect()` work alongside the
  awaited payload.
- `Dockerfile` and `.github/workflows/build.yml` — build to ghcr.io and
  deploy via `caprover/deploy-from-github`.

## Local

```sh
pnpm install
pnpm dev
# open http://localhost:5173 — counter is "0", "connected" is green,
# clicking "bump" ticks the counter immediately.
```

Everything works as expected locally.

## Observed behavior on a deployed CapRover instance

Setup: CapRover on a Hetzner VPS, app exposed via CapRover's default
nginx config, **DNS-only** through Cloudflare (so Cloudflare is not in
the request path; the browser connects directly to the Hetzner box on
HTTP/2). No special configuration applied.

On opening the page:

1. The page renders, but `live.connected === false` from the start.
2. In the network panel, the request to
   `/_app/remote/<hash>/watchCounter` sits **pending for ~60–120s**.
3. After that, the request "completes" with the response below — but
   Chrome immediately logs `net::ERR_HTTP2_PROTOCOL_ERROR 200 (OK)`
   in the console and the framework treats it as a disconnect.

```
Request URL:    https://.../_app/remote/<hash>/watchCounter?payload=...
Status Code:    200 OK
Remote Address: <Hetzner IP>:443  (no Cloudflare in the path)

cache-control:  private, no-store
content-type:   application/x-ndjson
server:         nginx
```

Pressing "bump" or "retry" reproduces the same hang for the new request.

A small bonus signal: with two tabs open, the *first* tab can flip from
"disconnected" to "connected" the moment a *second* tab is opened — and
flips back to "disconnected" the moment "bump" triggers a `reconnect()`.
Counters between tabs do not stay in sync. This points at some cross-tab
coordination (BroadcastChannel?) sharing whatever single connection
manages to come through, masking the underlying problem on a per-tab
basis.

## Why this almost certainly is the proxy buffering the stream

`query.live` returns `application/x-ndjson` — a long-lived response that
yields newline-delimited JSON frames over time. Default nginx
`proxy_pass` config **buffers the upstream response** (see
[`proxy_buffering`](http://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_buffering)),
so frames are not flushed to the client as the generator yields them.
Nothing reaches the browser, the framework times out, and after nginx
hits its own `proxy_read_timeout` (default 60s), the upstream connection
is closed and the partial/empty buffer is flushed — at which point Chrome
reports the protocol error.

SvelteKit does set `Cache-Control: private, no-store` on the response
(visible in the headers above), which Cloudflare and some other proxies
respect to disable caching/buffering, but **nginx ignores
`Cache-Control` for proxy buffering decisions** — it requires either:

- `proxy_buffering off;` in the nginx config, **or**
- an `X-Accel-Buffering: no` response header from the upstream
  ([nginx docs](http://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_buffering)),
  which CapRover's default nginx honors.

A subsequent commit in this repo will demonstrate that adding
`X-Accel-Buffering: no` from `hooks.server.ts` for `/_app/remote/*`
responses is enough to make the demo work behind unmodified CapRover.

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
6. Open the deployed page — see "What you'll see on a deployed CapRover
   instance" above.

## Versions

- `@sveltejs/kit ^2.59.0`
- `@sveltejs/adapter-node ^5.5.4`
- `svelte ^5.55.5`
- node `22`
- nginx via CapRover (default config)
