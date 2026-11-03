// qr-redirect: a printed QR code points at https://qr.example.com/<slug>.
// The slug never changes; the destination does. Edit LINKS, redeploy, and every printed code follows.
const LINKS = {
  website: "https://www.example.org/",
  wifi: "https://www.example.org/guest-wifi",
  donate: "https://www.example.org/donate",
  video: "https://www.youtube.com/@example",
};

// Where the bare hostname (no slug) goes. Set to null to return 404 instead.
const DEFAULT_LINK = LINKS.website;

export default {
  async fetch(request) {
    const slug = new URL(request.url).pathname
      .replace(/^\/+|\/+$/g, "") // trim leading/trailing slashes: /Wifi/ and /wifi are the same link
      .toLowerCase();              // QR codes get retyped and re-cased; be forgiving

    const target = slug === "" ? DEFAULT_LINK : Object.hasOwn(LINKS, slug) ? LINKS[slug] : null;
    if (!target) return new Response("Not found\n", { status: 404, headers: { "Cache-Control": "no-store" } });

    // 302 on purpose: a 301 gets cached by browsers and scanner apps, so a destination change would not reach
    // everyone who has already scanned once. The redirect itself is cheap to repeat.
    return new Response(null, { status: 302, headers: { Location: target, "Cache-Control": "no-store" } });
  },
};
