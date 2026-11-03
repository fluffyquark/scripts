// redirect-net: forwards short alias hostnames to the real tools on the canonical domain. Allowlist only (no open redirect).
const MAP = {
  "ip.example.net": "ip.example.network",
  "device.example.net": "device.example.network",
};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const target = MAP[url.hostname];
    if (!target) return new Response("Not found\n", { status: 404 });
    return new Response(null, {
      status: 302, // temporary: browsers won't cache the redirect while we iterate
      headers: { Location: "https://" + target + url.pathname + url.search, "Cache-Control": "no-store" },
    });
  },
};
