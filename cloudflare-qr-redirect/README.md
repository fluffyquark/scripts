# cloudflare-qr-redirect

A printed QR code can never be edited. This tiny Cloudflare Worker makes the *destination* editable anyway:
the code encodes a short, permanent link on a domain you own, and the Worker redirects it wherever you point it today.

- `https://qr.example.com/website` is what goes into the QR code, and it never changes.
- `LINKS` in `worker.js` decides where it lands. Edit, redeploy, and every code you ever printed follows.
- Also in this folder: `make_qr.py` generates styled codes (rounded, gradient, centre logo) with open-source libraries,
  and `verify_qr.py` checks that a decoder can still read them before you print.

Why and how it was built: [the write-up on the notebook](https://fluffyquark.github.io/tools/2026/11/03/printed-qr-codes-you-can-still-change.html).

## Files

- `worker.js`: the redirector. About 25 lines, no dependencies, no storage.
- `wrangler.jsonc`: deploy config (change the hostname to your own).
- `make_qr.py`, `verify_qr.py`, `requirements.txt`: the styling and verification scripts.
- `samples/`: example output for the placeholder link, and the demo logo.

## Deploy the redirector

```bash
export CLOUDFLARE_API_TOKEN=...   # Workers Scripts: Edit; Workers Routes + DNS: Edit on your zone. Never commit it.
export CLOUDFLARE_ACCOUNT_ID=...
npx wrangler deploy
```

## Make and check a code

```bash
pip install -r requirements.txt
python make_qr.py https://qr.example.com/website --out website --logo samples/logo.png
python verify_qr.py https://qr.example.com/website website-*.png
```

## Design notes

- **302, not 301.** Browsers and scanner apps cache a 301 indefinitely, so a destination change would not reach people who already scanned once.
- **Allowlist only.** The Worker looks slugs up in a fixed map with `Object.hasOwn`. It never takes a destination from the URL, so it cannot be used as an open redirect.
- **Forgiving slugs.** Case and trailing slashes are ignored (`/WiFi/` is `/wifi`).
- **No logging, no counters.** Scan analytics need storage; this version deliberately has none.

## Limits

- `verify_qr.py` uses OpenCV's two decoders. Passing means those decoders read it, not that every phone camera in poor light will. Print one and scan it with a real phone.
- Styling spends error-correction budget. See the write-up for measured limits on logo size and contrast.
