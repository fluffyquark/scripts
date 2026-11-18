"""Self-test against a LOCAL mock server shaped like the documented Core API.

This proves the tool's logic and its safety rails. It does NOT prove the real
API behaves identically: the mock is built from the published schema, not from
live responses. Run the tool against the real API once a key exists.
"""
import io
import json
import os
import sys
import tempfile
import threading
import unittest
from contextlib import redirect_stderr, redirect_stdout
from http.server import BaseHTTPRequestHandler, HTTPServer

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import validate  # noqa: E402

SECRET = "TESTKEY-do-not-print-0123456789"
SEEN = {"keys": [], "paths": []}

# project ids: 1 ok, 2 distribution disabled, 3 file wrong MC version, 4 needs dep 99,
# 5 pinned file missing, 6 wrong loader, 7 declared incompatible with 1, 8 project missing,
# 9 newer file available, 10 beta build, 11 duplicate entry in manifest
MODS = {
    1: dict(id=1, name="Good Mod", isAvailable=True, allowModDistribution=True, latestFilesIndexes=[]),
    2: dict(id=2, name="No Distribution Mod", isAvailable=True, allowModDistribution=False, latestFilesIndexes=[]),
    3: dict(id=3, name="Old Version Mod", isAvailable=True, allowModDistribution=True, latestFilesIndexes=[]),
    4: dict(id=4, name="Needs A Library", isAvailable=True, allowModDistribution=True, latestFilesIndexes=[]),
    5: dict(id=5, name="Removed File Mod", isAvailable=True, allowModDistribution=True, latestFilesIndexes=[]),
    6: dict(id=6, name="Fabric Only Mod", isAvailable=True, allowModDistribution=True, latestFilesIndexes=[]),
    7: dict(id=7, name="Clashing Mod", isAvailable=True, allowModDistribution=True, latestFilesIndexes=[]),
    9: dict(id=9, name="Has Newer Mod", isAvailable=True, allowModDistribution=True,
            latestFilesIndexes=[dict(gameVersion="1.20.1", fileId=950, modLoader=1, releaseType=1)]),
    10: dict(id=10, name="Beta Pinned Mod", isAvailable=True, allowModDistribution=True, latestFilesIndexes=[]),
}


def mkfile(fid, mod, gv=("1.20.1", "Forge"), status=4, rel=1, deps=(), url="https://example.invalid/f.jar"):
    return dict(id=fid, modId=mod, isAvailable=True, fileStatus=status, releaseType=rel,
                gameVersions=list(gv), downloadUrl=url,
                dependencies=[dict(modId=d, relationType=r) for d, r in deps])


FILES = {
    101: mkfile(101, 1),
    102: mkfile(102, 2, url=None),
    103: mkfile(103, 3, gv=("1.19.2", "Forge")),
    104: mkfile(104, 4, deps=[(99, 3)]),
    106: mkfile(106, 6, gv=("1.20.1", "Fabric")),
    107: mkfile(107, 7, deps=[(1, 5)]),
    109: mkfile(109, 9),
    110: mkfile(110, 10, rel=2),
}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_POST(self):
        SEEN["keys"].append(self.headers.get("x-api-key"))
        SEEN["paths"].append(self.path)
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        if self.path == "/v1/mods":
            data = [MODS[i] for i in body["modIds"] if i in MODS]
        elif self.path == "/v1/mods/files":
            data = [FILES[i] for i in body["fileIds"] if i in FILES]
        else:
            self.send_response(404); self.end_headers(); return
        out = json.dumps({"data": data}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(out)


def run(argv):
    out, err = io.StringIO(), io.StringIO()
    with redirect_stdout(out), redirect_stderr(err):
        code = validate.main(argv)
    return code, out.getvalue(), err.getvalue()


class Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = HTTPServer(("127.0.0.1", 0), Handler)
        cls.port = cls.srv.server_address[1]
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.base = f"http://127.0.0.1:{cls.port}"
        manifest = {
            "minecraft": {"version": "1.20.1", "modLoaders": [{"id": "forge-47.4.28", "primary": True}]},
            "name": "t", "version": "", "author": "",
            "files": [dict(projectID=p, fileID=f, required=True) for p, f in
                      [(1, 101), (2, 102), (3, 103), (4, 104), (5, 105), (6, 106), (7, 107),
                       (8, 108), (9, 109), (10, 110), (1, 101)]],
        }
        cls.tmp = tempfile.mkdtemp()
        cls.mpath = os.path.join(cls.tmp, "manifest.json")
        json.dump(manifest, open(cls.mpath, "w"))

    def test_findings_and_exit_code(self):
        os.environ[validate.KEY_ENV] = SECRET
        code, out, err = run([self.mpath, "--base-url", self.base])
        self.assertEqual(code, 1, out + err)
        for expect in [
            "No Distribution Mod",                       # distribution disabled
            "disabled third-party distribution",
            "targets 1.19.2, not Minecraft 1.20.1",      # wrong MC version
            "requires project 99",                       # missing required dep
            "pinned file 105 not found",                 # removed file
            "is for Fabric, pack uses Forge",            # wrong loader
            "incompatible with project 1",               # incompatibility with a pack mod
            "project not found by the API",              # missing project (id 8)
            "newer release file 950 exists",             # newer file note
            "pinned file is a beta build",               # beta note
            "listed twice",                              # duplicate in manifest
            "version is empty",                          # manifest metadata
        ]:
            self.assertIn(expect, out, f"missing: {expect}\n{out}")
        self.assertNotIn("Good Mod:", out)               # clean mod gets no finding

    def test_key_never_printed_and_only_sent_to_mock(self):
        os.environ[validate.KEY_ENV] = SECRET
        code, out, err = run([self.mpath, "--base-url", self.base, "--json"])
        self.assertNotIn(SECRET, out + err)
        self.assertTrue(SEEN["keys"] and all(k == SECRET for k in SEEN["keys"]))

    def test_refuses_foreign_host(self):
        os.environ[validate.KEY_ENV] = SECRET
        with self.assertRaises(SystemExit) as cm:
            run([self.mpath, "--base-url", "https://example.com"])
        self.assertIn("refusing to send the API key", str(cm.exception))
        self.assertNotIn(SECRET, str(cm.exception))

    def test_no_key_is_a_clean_error(self):
        os.environ.pop(validate.KEY_ENV, None)
        code, out, err = run([self.mpath, "--base-url", self.base])
        self.assertEqual(code, 2)
        self.assertIn("no API key", err)

    def test_offline_makes_no_requests(self):
        before = len(SEEN["paths"])
        os.environ.pop(validate.KEY_ENV, None)
        code, out, err = run([self.mpath, "--offline"])
        self.assertEqual(len(SEEN["paths"]), before)
        self.assertIn("listed twice", out)

    def test_nothing_written_to_disk(self):
        os.environ[validate.KEY_ENV] = SECRET
        before = set(os.listdir(self.tmp))
        run([self.mpath, "--base-url", self.base])
        self.assertEqual(before, set(os.listdir(self.tmp)))


if __name__ == "__main__":
    unittest.main(verbosity=2)
