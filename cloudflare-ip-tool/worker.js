// ip-tool: Cloudflare Worker. curl -> one-liner, /json -> JSON, browser -> glitch UI.
export default {
  async fetch(request, env) {
    const mode = env && env.MODE === "device" ? "device" : "ip";
    const url = new URL(request.url);
    const cf = request.cf || {};
    const h = request.headers;
    const ip = h.get("CF-Connecting-IP") || "unknown";

    const data = {
      ip,
      ip_version: ip.includes(":") ? 6 : 4,
      country: cf.country,
      region: cf.region,
      city: cf.city,
      latitude: coarse(cf.latitude),
      longitude: coarse(cf.longitude),
      timezone: cf.timezone,
      asn: cf.asn,
      provider: cf.asOrganization,
      cloudflare_colo: cf.colo,
      http_protocol: cf.httpProtocol,
      tls_version: cf.tlsVersion,
    };

    const noStore = { "Cache-Control": "no-store" };

    if (url.pathname === "/json") {
      return Response.json(data, { headers: noStore });
    }
    if (url.pathname === "/ip") {
      return new Response(ip + "\n", { headers: { ...noStore, "Content-Type": "text/plain" } });
    }

    const wantsHtml = (h.get("Accept") || "").includes("text/html");
    if (!wantsHtml) {
      return new Response(ip + "\n", { headers: { ...noStore, "Content-Type": "text/plain" } });
    }

    // "<" escaped so the JSON can't break out of the <script> tag
    const serverJson = JSON.stringify(data).replace(/</g, "\\u003c");
    const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
    const html = PAGE.replaceAll("__NONCE__", nonce).replaceAll("__MODE__", mode).replace("__SERVER_DATA__", () => serverJson);
    return new Response(html, {
      headers: {
        ...noStore,
        "Content-Type": "text/html;charset=utf-8",
        "Content-Security-Policy":
          "default-src 'none'; script-src 'nonce-" + nonce + "'; style-src 'nonce-" + nonce + "'; " +
          "img-src data: https://tile.openstreetmap.org; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
        "Cross-Origin-Opener-Policy": "same-origin",
      },
    });
  },
};

// IP geolocation is city-level at best: round to 2 decimals (~1 km), no more precision than that
const coarse = (v) => (v === undefined || v === null || isNaN(parseFloat(v)) ? undefined : Math.round(parseFloat(v) * 100) / 100);

const PAGE = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>// __MODE__</title>
<style nonce="__NONCE__">
:root{--bg:#06080f;--panel:#0b1020;--line:#17304a;--cy:#00e5ff;--mg:#ff2e88;--am:#ffb000;--tx:#b8c7d9;--dim:#5b6f86}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--tx);font:14px/1.5 ui-monospace,"JetBrains Mono",Menlo,Consolas,monospace}
body{min-height:100vh;background:
  linear-gradient(rgba(0,229,255,.04) 1px,transparent 1px) 0 0/100% 40px,
  linear-gradient(90deg,rgba(0,229,255,.04) 1px,transparent 1px) 0 0/40px 100%,
  radial-gradient(ellipse at 50% -10%,#0d2540 0%,var(--bg) 60%)}
body::after{content:"";position:fixed;inset:0;pointer-events:none;
  background:repeating-linear-gradient(transparent 0 2px,rgba(0,0,0,.25) 2px 3px);mix-blend-mode:multiply}
main{max-width:1000px;margin:0 auto;padding:32px 20px 64px;text-align:center}
.tag{color:var(--dim);letter-spacing:.2em;font-size:12px;text-transform:uppercase}
.tag b{color:var(--mg);font-weight:400}
.glitch{position:relative;display:inline-block;font-size:clamp(28px,7vw,64px);font-weight:700;
  color:#fff;margin:6px 0 4px;letter-spacing:.02em;cursor:pointer;word-break:break-all}
.glitch::before,.glitch::after{content:attr(data-t);position:absolute;inset:0;overflow:hidden}
.glitch::before{color:var(--cy);transform:translate(-2px,0);clip-path:inset(0 0 60% 0);animation:g1 3s infinite steps(1)}
.glitch::after{color:var(--mg);transform:translate(2px,0);clip-path:inset(55% 0 0 0);animation:g2 2.4s infinite steps(1)}
@keyframes g1{0%,90%{clip-path:inset(0 0 100% 0)}91%{clip-path:inset(10% 0 55% 0)}94%{clip-path:inset(60% 0 10% 0)}97%{clip-path:inset(30% 0 40% 0)}100%{clip-path:inset(0 0 100% 0)}}
@keyframes g2{0%,86%{clip-path:inset(100% 0 0 0)}88%{clip-path:inset(40% 0 30% 0)}92%{clip-path:inset(5% 0 80% 0)}95%{clip-path:inset(70% 0 5% 0)}100%{clip-path:inset(100% 0 0 0)}}
.sub{color:var(--dim)}
.sub span{color:var(--cy)}
.flag{display:none;margin:16px auto;max-width:760px;padding:10px 14px;border:1px solid var(--am);color:var(--am);background:rgba(255,176,0,.06)}
.grid{display:flex;flex-wrap:wrap;justify-content:center;gap:16px;margin-top:24px}
.card{flex:1 1 300px;max-width:480px;text-align:left;background:var(--panel);border:1px solid var(--line);position:relative;padding:14px 16px 10px;
  clip-path:polygon(0 0,calc(100% - 14px) 0,100% 14px,100% 100%,14px 100%,0 calc(100% - 14px))}
.card::before{content:"";position:absolute;left:0;top:0;width:3px;height:100%;background:var(--cy);box-shadow:0 0 10px var(--cy)}
.card h2{text-align:center;margin:0 0 8px;font-size:12px;letter-spacing:.25em;text-transform:uppercase;color:var(--cy);font-weight:400}
.card h2::before{content:"> ";color:var(--mg)}
.row{display:flex;justify-content:space-between;gap:12px;padding:3px 0;border-bottom:1px dashed #12233a}
.row:last-child{border:0}
.k{color:var(--dim);white-space:nowrap}
.v{color:#e6f3ff;text-align:right;word-break:break-word}
.v.na{color:#3a4a5e}
.btns{margin-top:20px;display:flex;gap:10px;flex-wrap:wrap;justify-content:center}
button{background:transparent;color:var(--cy);border:1px solid var(--cy);padding:8px 14px;font:inherit;cursor:pointer;letter-spacing:.1em;text-transform:uppercase}
button:hover{background:var(--cy);color:#001018;box-shadow:0 0 14px var(--cy)}
footer{margin:16px auto 0;max-width:720px;color:var(--dim);font-size:12px}
.lnk{color:var(--cy)}
.m-ip .dev{display:none}
.grp{display:flex;flex-wrap:wrap;justify-content:center;gap:16px;width:100%;max-width:976px}
.card.wide{flex:1 1 100%;max-width:none}
.map{position:relative;width:100%;aspect-ratio:5/3;overflow:hidden;background:#0a1424;margin-top:4px}
.map img{position:absolute;width:20%;height:33.3334%;filter:invert(1) hue-rotate(180deg) brightness(.85) contrast(1.1) saturate(.6)}
.pin{position:absolute;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;background:var(--mg);box-shadow:0 0 12px var(--mg)}
.ring{position:absolute;aspect-ratio:1;border:1px dashed var(--mg);border-radius:50%;background:rgba(255,46,136,.10);transform:translate(-50%,-50%)}
.credit{color:var(--dim);font-size:11px;text-align:center;padding:4px 0}
.cur::after{content:"_";animation:b 1s steps(1) infinite}@keyframes b{50%{opacity:0}}
</style></head>
<body class="m-__MODE__"><main>
<div class="tag" id="tag"></div>
<div class="glitch" id="ip" data-t="...">...</div>
<div class="sub" id="sub">resolving<span class="cur"></span></div>
<div class="btns">
  <button id="copy">copy ip</button>
  <button id="dl">export json</button>
  <button id="rtc" class="dev">webrtc leak test</button>
  <button id="again">re-scan</button>
</div>
<footer>Nothing is stored or logged by this tool.
<span class="dev">Client-side readings are computed in your browser and never sent back.
The optional WebRTC test (button above) contacts a public STUN server, stun.cloudflare.com, only when you click it.</span>
The map loads tiles from OpenStreetMap, which will see your browser's request and the map area shown.
<a class="lnk" href="/json">/json</a> &middot; <a class="lnk" href="/ip">/ip</a></footer>
<div class="flag" id="flag"></div>
<div class="grid" id="grid"></div>

</main>
<script nonce="__NONCE__">
const SERVER = __SERVER_DATA__;
const MODE = "__MODE__";
const TAGS = { ip: ["connectivity", "what the internet sees of you"], device: ["device", "what your browser tells every site"] };
const $ = (id) => document.getElementById(id);
let REPORT = {};
let RTC = { supported: undefined, public: [], local: [], skipped: true };

const na = (v) => v === undefined || v === null || v === "";
function card(title, rows){
  const el = document.createElement("section"); el.className = "card";
  el.innerHTML = "<h2></h2>"; el.firstChild.textContent = title;
  for (const [k, v] of rows){
    const r = document.createElement("div"); r.className = "row";
    const a = document.createElement("span"); a.className = "k"; a.textContent = k;
    const b = document.createElement("span"); b.className = "v";
    if (na(v)){ b.textContent = "n/a"; b.classList.add("na"); } else b.textContent = String(v);
    r.append(a, b); el.append(r);
  }
  return el;
}

function glGpu(){
  try{
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl") || c.getContext("experimental-webgl");
    if(!gl) return null;
    const e = gl.getExtension("WEBGL_debug_renderer_info");
    return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : "hidden by browser";
  }catch{ return null; }
}

async function hints(){
  const u = navigator.userAgentData;
  if(!u) return {};
  try{
    const h = await u.getHighEntropyValues(["platform","platformVersion","architecture","model","bitness","fullVersionList"]);
    return { ...h, mobile: u.mobile };
  }catch{ return { platform: u.platform, mobile: u.mobile }; }
}

function webrtc(){
  return new Promise((resolve) => {
    if(!window.RTCPeerConnection) return resolve({ supported:false });
    const found = new Set(); const local = new Set();
    let pc;
    try{ pc = new RTCPeerConnection({ iceServers:[{ urls:"stun:stun.cloudflare.com:3478" }] }); }
    catch{ return resolve({ supported:false }); }
    const done = () => { try{pc.close()}catch{}; resolve({ supported:true, public:[...found], local:[...local] }); };
    const t = setTimeout(done, 4000);
    pc.createDataChannel("x");
    pc.onicecandidate = (e) => {
      if(!e.candidate){ clearTimeout(t); return done(); }
      const p = e.candidate.candidate.split(" ");
      const addr = p[4], typ = p[7];
      if(typ === "srflx") found.add(addr); else if(typ === "host") local.add(addr);
    };
    pc.createOffer().then(o => pc.setLocalDescription(o)).catch(done);
  });
}

async function battery(){
  try{ if(!navigator.getBattery) return null; const b = await navigator.getBattery();
    return Math.round(b.level*100) + "%" + (b.charging ? " (charging)" : ""); }catch{ return null; }
}

function serverCards(){
  const g = document.createElement("div"); g.className = "grp";
  g.append(
    card("network (server-side)", [
      ["ip", SERVER.ip], ["version", "IPv" + SERVER.ip_version],
      ["provider", SERVER.provider], ["asn", SERVER.asn ? "AS" + SERVER.asn : null],
      ["http", SERVER.http_protocol], ["tls", SERVER.tls_version],
      ["cf edge", SERVER.cloudflare_colo],
    ]),
    card("location (ip-based, approx)", [
      ["country", SERVER.country], ["region", SERVER.region], ["city", SERVER.city],
      ["ip timezone", SERVER.timezone],
      ["coordinates (approx)", typeof SERVER.latitude === "number" ? SERVER.latitude + ", " + SERVER.longitude : null],
    ]),
    mapCard(),
  );
  return [g];
}

function mapCard(){
  const el = card("approx. location", []); el.classList.add("wide");
  const lat = SERVER.latitude, lon = SERVER.longitude;
  if(typeof lat !== "number" || typeof lon !== "number"){
    el.append(card("", [["map", null]]).lastChild); return el;
  }
  const Z = 9, n = 2 ** Z, r = Math.PI / 180;
  const fx = (lon + 180) / 360 * n;
  const fy = (1 - Math.log(Math.tan(lat * r) + 1 / Math.cos(lat * r)) / Math.PI) / 2 * n;
  const tx = Math.floor(fx), ty = Math.floor(fy);
  const box = document.createElement("div"); box.className = "map";
  for(let dy = -1; dy <= 1; dy++) for(let dx = -2; dx <= 2; dx++){
    const y = ty + dy; if(y < 0 || y >= n) continue;
    const x = ((tx + dx) % n + n) % n;
    const im = document.createElement("img");
    im.referrerPolicy = "origin"; im.alt = ""; im.loading = "lazy";
    im.src = "https://tile.openstreetmap.org/" + Z + "/" + x + "/" + y + ".png";
    im.style.left = ((dx + 2) * 20) + "%"; im.style.top = ((dy + 1) * 33.3333) + "%";
    box.append(im);
  }
  const px = (2 + fx - tx) / 5 * 100, py = (1 + fy - ty) / 3 * 100;
  const mpp = 156543.03 * Math.cos(lat * r) / n;            // metres per 256px-tile pixel at this zoom/latitude
  const dia = (2 * 25000 / mpp) / 1280 * 100;                // ~25 km radius ring, as % of the 1280px-wide grid
  const ring = document.createElement("div"); ring.className = "ring";
  ring.style.left = px + "%"; ring.style.top = py + "%"; ring.style.width = dia + "%";
  const pin = document.createElement("div"); pin.className = "pin";
  pin.style.left = px + "%"; pin.style.top = py + "%";
  box.append(ring, pin);
  const credit = document.createElement("div"); credit.className = "credit";
  credit.textContent = "ring ~25 km: IP location is city-level \u00b7 \u00a9 OpenStreetMap contributors";
  el.append(box, credit);
  return el;
}

async function scan(){
  const grid = $("grid"); grid.textContent = "";
  $("flag").style.display = "none";
  $("ip").textContent = SERVER.ip; $("ip").dataset.t = SERVER.ip;
  $("sub").innerHTML = ""; $("sub").append(
    SERVER.provider ? document.createTextNode(SERVER.provider + " \\u00b7 ") : "",
    Object.assign(document.createElement("span"), { textContent: "AS" + (SERVER.asn ?? "?") }),
    document.createTextNode(" \\u00b7 " + [SERVER.city, SERVER.region, SERVER.country].filter(Boolean).join(", ")));

  if(MODE === "ip"){ grid.append(...serverCards()); REPORT = { server: SERVER }; return; }

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const hi = await hints();
  const conn = navigator.connection || {};
  const batt = await battery();
  const rtc = RTC;

  const clientCards = [
    card("device", [
      ["platform", hi.platform || navigator.platform],
      ["os version", hi.platformVersion], ["arch", hi.architecture ? hi.architecture + (hi.bitness ? "/" + hi.bitness : "") : null],
      ["model", hi.model], ["mobile", hi.mobile ?? /Mobi/i.test(navigator.userAgent)],
      ["cpu threads", navigator.hardwareConcurrency],
      ["memory (approx)", navigator.deviceMemory ? ">= " + navigator.deviceMemory + " GB" : null],
      ["gpu", glGpu()], ["touch points", navigator.maxTouchPoints], ["battery", batt],
    ]),
    card("browser", [
      ["user agent", navigator.userAgent],
      ["languages", (navigator.languages || []).join(", ")],
      ["cookies", navigator.cookieEnabled], ["do not track", navigator.doNotTrack],
      ["color scheme", matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"],
      ["reduced motion", matchMedia("(prefers-reduced-motion: reduce)").matches],
    ]),
    card("display", [
      ["screen", screen.width + " x " + screen.height],
      ["viewport", innerWidth + " x " + innerHeight],
      ["pixel ratio", devicePixelRatio], ["color depth", screen.colorDepth + "-bit"],
    ]),
    card("time & link", [
      ["browser timezone", tz], ["utc offset", -new Date().getTimezoneOffset() / 60],
      ["local time", new Date().toString().replace(/ \\(.*/, "")],
      ["link type", conn.effectiveType], ["downlink", conn.downlink ? conn.downlink + " Mbps" : null],
      ["rtt", conn.rtt ? conn.rtt + " ms" : null], ["data saver", conn.saveData],
    ]),
    card("webrtc leak test", [
      ["status", rtc.skipped ? "not run (click the button)" : rtc.supported ? "done" : "unsupported"],
      ["public (stun)", rtc.skipped ? null : (rtc.public.join(", ") || "none seen")],
      ["local candidates", rtc.skipped ? null : (rtc.local.length ? rtc.local.join(", ") : "none / obfuscated")],
    ]),
  ];
  grid.append(...clientCards, ...serverCards());

  // Consistency checks: classic VPN / proxy tells
  const notes = [];
  if(SERVER.timezone && tz && SERVER.timezone !== tz)
    notes.push("Timezone mismatch: IP says " + SERVER.timezone + ", browser says " + tz + " (VPN/proxy, or IP geo is off).");
  if(!rtc.skipped && rtc.public.length && !rtc.public.includes(SERVER.ip))
    notes.push("WebRTC public address (" + rtc.public.join(", ") + ") differs from HTTP address (" + SERVER.ip + "). Possible leak or dual-stack.");
  if(notes.length){ const f = $("flag"); f.textContent = "[!] " + notes.join("  [!] "); f.style.display = "block"; }

  REPORT = { server: SERVER, client: {
    timezone: tz, userAgent: navigator.userAgent, hints: hi,
    screen: [screen.width, screen.height], dpr: devicePixelRatio,
    languages: navigator.languages, cores: navigator.hardwareConcurrency,
    gpu: glGpu(), webrtc: rtc }, flags: notes };
}

$("copy").onclick = async () => { await navigator.clipboard.writeText(SERVER.ip); $("copy").textContent = "copied"; setTimeout(()=>$("copy").textContent="copy ip",1200); };
$("ip").onclick = () => $("copy").click();
$("again").onclick = () => { RTC = { supported: undefined, public: [], local: [], skipped: true }; scan(); };
$("rtc").onclick = async () => { $("rtc").textContent = "testing..."; RTC = await webrtc(); RTC.skipped = false; await scan(); $("rtc").textContent = "webrtc leak test"; };
$("dl").onclick = () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(REPORT,null,2)],{type:"application/json"}));
  a.download = "trace-" + SERVER.ip.replace(/[^0-9a-f.:]/gi,"_") + ".json"; a.click();
};
$("tag").innerHTML = "";
$("tag").append("// ", Object.assign(document.createElement("b"), { textContent: TAGS[MODE][0] }), " :: " + TAGS[MODE][1]);
scan();
</script></body></html>`;
