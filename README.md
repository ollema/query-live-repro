# query-live-repro

Minimal SvelteKit + `query.live` reproduction for a `live.connected` flip
that we hit on a production deploy behind **CapRover** (on a Hetzner VPS) with
**Cloudflare** in front.

The whole app is one page, one counter, one button, and one async generator.
If the live transport survives idle minutes through your edge stack, the
page stays green; if not, it flips to "disconnected" and the browser console
shows a `net::ERR_QUIC_PROTOCOL_ERROR` against
`/_app/remote/<hash>/watchCounter`.

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
# open http://localhost:5173 — click bump, counter ticks, "connected" stays green
```

Locally everything works fine — the bug only shows up once a real edge
stack (Cloudflare, in this case) is in front of the Node server.

## Deploy via CapRover

1. Push this repo to GitHub.
2. Create a new app in CapRover. Note the app name + generate an app token.
3. In the GitHub repo, add secrets:
   - `CAPROVER_SERVER` (e.g. `https://captain.your-domain.tld`)
   - `CAPROVER_APP_NAME`
   - `CAPROVER_APP_TOKEN`
4. Point a hostname at the CapRover app and put it behind Cloudflare
   (proxied / orange cloud).
5. Push to `main`. The workflow builds the image, pushes to ghcr.io, and
   tells CapRover to pull `sha-<commit>`.

## Reproduction

1. Open the deployed page in Chrome with devtools open.
2. Confirm "connected".
3. Leave the tab idle ~1–2 minutes.
4. The request to `/_app/remote/<hash>/watchCounter` fails with
   `net::ERR_QUIC_PROTOCOL_ERROR` and the page shows "disconnected".

## Things to toggle while investigating

Cloudflare:

- Network → HTTP/3 (with QUIC) → Off (most common quick fix)
- Configuration Rule on `/_app/remote/*`: HTTP/3 off, Cache off

CapRover / nginx:

- App → HTTP Settings → Edit Default Nginx Configurations:
  add `proxy_buffering off;` and `proxy_cache off;` inside `location /`.
- Or set an `X-Accel-Buffering: no` response header from a SvelteKit
  `handle` hook for `/_app/remote/*` (per-response opt-out).

SvelteKit-side experiments:

- Add a heartbeat yield in the generator (e.g. `yield` every 25s) to keep
  the connection from looking idle to upstream proxies.
