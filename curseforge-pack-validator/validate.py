#!/usr/bin/env python3
"""Pre-release check for a CurseForge modpack manifest.

Reads a manifest.json (the CurseForge export format), asks the CurseForge Core
API about every referenced mod and file, and reports problems BEFORE you
publish: mods whose authors disabled third-party distribution, files that were
removed or never approved, files built for another Minecraft version or loader,
and required dependencies missing from the pack.

Design rules (they follow CurseForge's 3rd-party API terms, which forbid saving
or caching API data and hiding your location):
  * Lookups are live. Nothing is written to disk. Results go to stdout only.
  * Nothing is downloaded. This tool never fetches a mod file.
  * The API key is read from an environment variable and is never printed.
  * Requests go only to api.curseforge.com (or localhost for the self-test).
    No proxy and no VPN are configured by this tool.

Standard library only. Python 3.9+.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_BASE = "https://api.curseforge.com"
ALLOWED_HOSTS = {"api.curseforge.com", "127.0.0.1", "localhost"}
KEY_ENV = "CF_CORE_API_KEY"
BATCH = 50  # polite batch size; the docs cap page size at 50 for list endpoints

# From the Core API reference (docs.curseforge.com/rest-api):
REL_REQUIRED = 3      # FileRelationType.RequiredDependency
REL_INCOMPATIBLE = 5  # FileRelationType.Incompatible
OK_FILE_STATUS = {4, 10}           # Approved, Released
RELEASE_TYPE = {1: "release", 2: "beta", 3: "alpha"}
FORGE_LOADER = 1                   # ModLoaderType.Forge

BLOCK, WARN, INFO = "BLOCK", "WARN", "INFO"


class ApiError(Exception):
    pass


def load_key(env_file: str | None) -> str:
    """Return the API key without ever echoing it."""
    key = os.environ.get(KEY_ENV, "").strip()
    if not key and env_file:
        with open(env_file, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line.startswith(KEY_ENV + "="):
                    key = line.split("=", 1)[1].strip().strip("'\"")
                    break
    return key


def check_base(base: str) -> str:
    host = urllib.parse.urlparse(base).hostname or ""
    if host not in ALLOWED_HOSTS:
        raise SystemExit(
            f"refusing to send the API key to host '{host}'. "
            f"Allowed: {', '.join(sorted(ALLOWED_HOSTS))}."
        )
    return base.rstrip("/")


def post_json(base: str, path: str, key: str, body: dict, tries: int = 3) -> dict:
    req = urllib.request.Request(
        base + path,
        data=json.dumps(body).encode(),
        method="POST",
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
            "x-api-key": key,
            "User-Agent": "pack-validator/0.1 (private modpack authoring tool)",
        },
    )
    for attempt in range(1, tries + 1):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.load(resp)
        except urllib.error.HTTPError as exc:
            if exc.code in (429, 500, 502, 503) and attempt < tries:
                time.sleep(2 ** attempt)
                continue
            # Deliberately do not include the response body: some APIs echo
            # credentials back in error text.
            raise ApiError(f"HTTP {exc.code} from {path}") from None
        except urllib.error.URLError as exc:
            if attempt < tries:
                time.sleep(2 ** attempt)
                continue
            raise ApiError(f"network error calling {path}: {exc.reason}") from None
    raise ApiError(f"gave up calling {path}")


def chunks(seq, n):
    for i in range(0, len(seq), n):
        yield seq[i : i + n]


def read_manifest(path: str) -> dict:
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def structure_findings(m: dict) -> list[tuple]:
    out = []
    files = m.get("files", [])
    if not m.get("version"):
        out.append((WARN, None, "manifest", "version is empty; set it before exporting"))
    if not m.get("author"):
        out.append((WARN, None, "manifest", "author is empty; set it before exporting"))
    seen = {}
    for f in files:
        pid = f.get("projectID")
        if pid in seen:
            out.append((BLOCK, pid, str(pid), f"listed twice (files {seen[pid]} and {f.get('fileID')})"))
        seen[pid] = f.get("fileID")
        if not f.get("fileID"):
            out.append((BLOCK, pid, str(pid), "has no fileID"))
    return out


def mc_and_loader(m: dict) -> tuple[str, str]:
    mc = m.get("minecraft", {}).get("version", "")
    loader_id = ""
    for ml in m.get("minecraft", {}).get("modLoaders", []):
        if ml.get("primary") or not loader_id:
            loader_id = ml.get("id", "")
    loader = loader_id.split("-")[0].capitalize() if loader_id else ""
    return mc, loader


def api_findings(m: dict, base: str, key: str) -> tuple[list[tuple], dict]:
    mc, loader = mc_and_loader(m)
    entries = m.get("files", [])
    mod_ids = sorted({e["projectID"] for e in entries})
    file_ids = sorted({e["fileID"] for e in entries if e.get("fileID")})
    pinned = {e["projectID"]: e["fileID"] for e in entries}

    mods: dict[int, dict] = {}
    for part in chunks(mod_ids, BATCH):
        for mod in post_json(base, "/v1/mods", key, {"modIds": part}).get("data", []):
            mods[mod["id"]] = mod
    files: dict[int, dict] = {}
    for part in chunks(file_ids, BATCH):
        for fl in post_json(base, "/v1/mods/files", key, {"fileIds": part}).get("data", []):
            files[fl["id"]] = fl

    out = []
    in_pack = set(mod_ids)
    for pid in mod_ids:
        mod = mods.get(pid)
        label = (mod or {}).get("name") or str(pid)
        if mod is None:
            out.append((BLOCK, pid, label, "project not found by the API (deleted or never existed)"))
            continue
        if not mod.get("isAvailable", True):
            out.append((BLOCK, pid, label, "project is not available"))
        if mod.get("allowModDistribution") is False:
            out.append((BLOCK, pid, label,
                        "author has disabled third-party distribution; do not reference this mod"))
        fid = pinned.get(pid)
        fl = files.get(fid)
        if fl is None:
            out.append((BLOCK, pid, label, f"pinned file {fid} not found (removed or wrong project)"))
            continue
        if fl.get("modId") not in (None, pid):
            out.append((BLOCK, pid, label, f"file {fid} belongs to project {fl.get('modId')}, not {pid}"))
        if not fl.get("isAvailable", True):
            out.append((BLOCK, pid, label, f"file {fid} is not available"))
        if fl.get("fileStatus") not in OK_FILE_STATUS:
            out.append((WARN, pid, label, f"file {fid} has status {fl.get('fileStatus')} (expected approved/released)"))
        if fl.get("downloadUrl") in (None, "") and mod.get("allowModDistribution") is not False:
            out.append((WARN, pid, label,
                        "file has no download URL; this is commonly how distribution restrictions show up"))
        gv = fl.get("gameVersions", [])
        if mc and mc not in gv:
            versions = [g for g in gv if g[:1].isdigit()]
            out.append((BLOCK, pid, label, f"file targets {', '.join(versions) or 'unknown'}, not Minecraft {mc}"))
        loaders_present = {g for g in gv if g in {"Forge", "Fabric", "Quilt", "NeoForge"}}
        if loader and loaders_present and loader not in loaders_present:
            out.append((BLOCK, pid, label, f"file is for {', '.join(sorted(loaders_present))}, pack uses {loader}"))
        rel = RELEASE_TYPE.get(fl.get("releaseType"), "unknown")
        if rel in ("beta", "alpha"):
            out.append((INFO, pid, label, f"pinned file is a {rel} build"))
        for dep in fl.get("dependencies", []):
            dmod = dep.get("modId")
            if dep.get("relationType") == REL_REQUIRED and dmod not in in_pack:
                out.append((WARN, pid, label, f"requires project {dmod}, which is not in the pack"))
            if dep.get("relationType") == REL_INCOMPATIBLE and dmod in in_pack:
                out.append((BLOCK, pid, label, f"declared incompatible with project {dmod}, which IS in the pack"))
        newest = max(
            (ix["fileId"] for ix in mod.get("latestFilesIndexes", [])
             if ix.get("gameVersion") == mc and ix.get("modLoader") == FORGE_LOADER
             and ix.get("releaseType") == 1),
            default=None,
        )
        if newest and newest > fid:
            out.append((INFO, pid, label, f"newer release file {newest} exists for {mc} (pinned {fid})"))
    names = {pid: (mods.get(pid) or {}).get("name", str(pid)) for pid in mod_ids}
    return out, names


def render(findings: list[tuple], total: int) -> str:
    order = {BLOCK: 0, WARN: 1, INFO: 2}
    lines = []
    for sev in (BLOCK, WARN, INFO):
        group = [f for f in findings if f[0] == sev]
        if not group:
            continue
        lines.append(f"\n{sev} ({len(group)})")
        for _, pid, label, msg in sorted(group, key=lambda f: (order[f[0]], str(f[2]).lower())):
            lines.append(f"  - {label}" + (f" [{pid}]" if pid and str(pid) != label else "") + f": {msg}")
    counts = {s: sum(1 for f in findings if f[0] == s) for s in (BLOCK, WARN, INFO)}
    lines.append(
        f"\nChecked {total} entries: {counts[BLOCK]} blocking, {counts[WARN]} warnings, {counts[INFO]} notes."
    )
    return "\n".join(lines).lstrip("\n")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("manifest", help="path to manifest.json")
    ap.add_argument("--offline", action="store_true",
                    help="only check the manifest's own structure; make no network calls")
    ap.add_argument("--base-url", default=DEFAULT_BASE,
                    help="API base URL (only api.curseforge.com or localhost accepted)")
    ap.add_argument("--env-file", help=f"read only the {KEY_ENV} line from this file")
    ap.add_argument("--json", action="store_true", help="print findings as JSON to stdout")
    args = ap.parse_args(argv)

    m = read_manifest(args.manifest)
    findings = structure_findings(m)
    total = len(m.get("files", []))

    if not args.offline:
        base = check_base(args.base_url)
        key = load_key(args.env_file)
        if not key:
            print(f"no API key found. Set {KEY_ENV} (or pass --env-file). Use --offline for structure checks only.",
                  file=sys.stderr)
            return 2
        try:
            more, _ = api_findings(m, base, key)
        except ApiError as exc:
            print(f"API error: {exc}", file=sys.stderr)
            return 2
        findings += more

    if args.json:
        print(json.dumps([{"severity": s, "projectID": p, "name": n, "message": t}
                          for s, p, n, t in findings], indent=2))
    else:
        print(render(findings, total))
    return 1 if any(f[0] == BLOCK for f in findings) else 0


if __name__ == "__main__":
    sys.exit(main())
