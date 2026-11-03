# cloudflare-ip-tool

A tiny, stateless "what does the internet see of me?" tool that runs as a Cloudflare Worker.
No server, no database, no logging. One source file, deployed twice in two flavours.

- **`ip.example.com`**: connectivity view. Network details, IP-based location, and an approximate map.
- **`device.example.com`**: the full picture. Everything above, plus what your browser reveals about the device (client-side only).
- **`curl`** gets a plain one-liner (just the IP). `/json` returns the server-side data as JSON.

Why it exists and how it was built: see the write-up on the blog (linked at the bottom).

## Files

- `worker.js`: the whole tool. Mode (`ip` or `device`) comes from the `MODE` variable.
- `wrangler.jsonc`: deploys the `ip` flavour.
- `wrangler.device.jsonc`: deploys the `device` flavour from the same `worker.js`.
- `redirect.js` + `wrangler.redirect.jsonc`: optional. A tiny allowlisted redirector so short alias hostnames forward to the real ones.

## Where the data comes from

Cloudflare attaches a `request.cf` object to every request a Worker handles: country, region, city, timezone,
ASN, network operator, coordinates, TLS and HTTP details. The client's address arrives in the `CF-Connecting-IP` header.
No lookup API or database is involved. Client-side readings (screen, GPU, languages, timezone, battery, connection type,
WebRTC) are collected by JavaScript in the visitor's own browser and are never sent back.

## Deploy

You need a Cloudflare account, a domain on Cloudflare DNS, and Node.

```bash
# 1. Edit the hostnames in wrangler*.jsonc to your own domain
# 2. Create an API token with: Workers Scripts: Edit (account), Workers Routes: Edit + DNS: Edit (your zone)
export CLOUDFLARE_API_TOKEN=...      # set it in your shell, never commit it
export CLOUDFLARE_ACCOUNT_ID=...

npx wrangler deploy                          # ip flavour
npx wrangler deploy -c wrangler.device.jsonc # device flavour
npx wrangler deploy -c wrangler.redirect.jsonc  # optional alias redirector
```

Custom Domains create the DNS record and TLS certificate for you. `workers_dev` and preview URLs are disabled in the configs,
so the Worker has no public address until you attach a hostname.

## Privacy and hardening choices

- Nothing is stored or logged; observability is off and the code has no storage bindings.
- Server-side fields are limited to what is useful: IP, ASN, operator, country, region, city, timezone, coordinates
  rounded to 2 decimals (about 1 km), edge location, HTTP and TLS version. No postcode, no User-Agent echo.
- Strict Content-Security-Policy with a fresh nonce on every request; no inline handlers or inline style attributes.
- `Cache-Control: no-store`, `nosniff`, `Referrer-Policy: no-referrer`, a locked-down Permissions-Policy.
- The WebRTC leak test is opt-in (button), so the page makes no STUN request until you ask.
- The map loads tiles from OpenStreetMap in the visitor's browser, so OSM sees that request. Only the map images send a
  referrer, and only the bare origin, because OSM blocks tile requests with none.

## Limits

- IP geolocation is approximate. Treat the city as "somewhere near the ISP's exit point"; ASN and operator are far more reliable.
- Device details are whatever the browser volunteers. Safari and Firefox hide a lot; battery, memory and connection info are Chromium-only.
- `curl` against the redirector needs `-L`, because a redirect cannot carry the answer. Serve the real Worker on the alias if you want one-word `curl`.
- It is public by design. The free Workers plan caps requests per day, and past that the tool simply stops answering.
