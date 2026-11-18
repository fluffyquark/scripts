# pack-validator

A small, private-use tool that checks a CurseForge modpack's `manifest.json` against the CurseForge Core API **before** you publish.

## Why it exists

A modpack manifest is a list of project IDs and file IDs. Nothing stops it going stale: a mod's author can remove a file, turn off third-party distribution, or the file may target a different Minecraft version than the pack. Players find out when an install fails. This tool finds out first.

CurseForge reviews API applications on three things: author earnings, load on their servers and CDN, and author consent for third-party distribution. This tool is built around those.

## What it checks

- Project missing, unavailable, or the pinned file is gone.
- **Author has disabled third-party distribution** (`allowModDistribution: false`).
- File built for a different Minecraft version or mod loader than the pack.
- A required dependency that is not in the pack, or an incompatibility with a mod that is.
- A pinned file that is a beta/alpha build, or a newer release exists (notes only).
- Manifest hygiene: duplicate entries, empty `version` or `author`.

Exit code: `0` clean, `1` at least one blocking finding, `2` could not run (no key, API error).

## What it will not do

These are deliberate, and follow CurseForge's 3rd Party API Terms:

- **No caching or storing of API data.** Lookups are live; findings go to stdout only; nothing is written to disk.
- **No downloading.** It never fetches a mod file or rehosts anything.
- **No hiding your location.** It sets no proxy and uses no VPN.
- **The API key never leaves your machine** except in the `x-api-key` header to `api.curseforge.com`. The tool refuses any other host and never prints the key or API response bodies on error.

## Use

```
export CF_CORE_API_KEY=...          # your own key; never commit it
python3 validate.py path/to/manifest.json
python3 validate.py path/to/manifest.json --json
python3 validate.py path/to/manifest.json --offline   # structure checks only, no network
```

Python 3.9+, standard library only.

## Status: read this

- **Tested against a local mock server only.** `tests/test_validate.py` runs the logic and safety rules against a mock shaped like the documented Core API schema. It has **not** been run against the real API, because the key is still pending approval. Treat the first real run as the real test, and expect field-level surprises.
- Endpoints used (from the public API reference): `POST /v1/mods` and `POST /v1/mods/files`.
- The "no download URL" warning is a heuristic. It is a flag to look at, not proof of a restriction.
- It reads `allowModDistribution`, `isAvailable`, `fileStatus`, `gameVersions`, `dependencies` and `latestFilesIndexes` as documented. If the live API differs, the findings will be wrong until the tool is adjusted.

```
python3 tests/test_validate.py
```

## Licence

MIT. See `LICENSE`. This covers the tool only; it does not license CurseForge's API, its data, or any mod.
