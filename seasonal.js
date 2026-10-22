// seasonal.js — seasonal themes: Halloween / Diwali / Christmas. seasonal.css ke saath use karo.
//
// Lagana  : index.html me  <script src="seasonal.js" defer></script>  (seasonal.css ko <head> me sabse last link karo)
// Badalna : neeche  var SEASON = "halloween";  me naam badlo -> "halloween" | "diwali" | "christmas" | "" (khali = koi theme nahi)
// Hatana  : dono lines hata do — ya SEASON = "" kar do. Kisi data ko ye file chhooti nahi.
(function () {
  "use strict";

  var SEASON = "diwali";

  // Har theme ke particles. n = [desktop, phone]. kind: fly (udta), rise (neeche se upar), fall (upar se neeche),
  // bob (neeche jhoomta), twinkle (jagah par chamakta).
  var THEMES = {
    halloween: [
      { kind: "fly",     emojis: ["🦇"],               n: [7, 4],  size: [16, 28], op: [0.35, 0.6],  dur: [24, 44] },
      { kind: "rise",    emojis: ["👻"],               n: [4, 2],  size: [22, 34],                    dur: [30, 52] },
      { kind: "bob",     emojis: ["🎃"],               n: [5, 3],  size: [20, 30], op: [0.45, 0.7],  dur: [2.8, 5] }
    ],
    diwali: [
      { kind: "bob",     emojis: ["🪔"],               n: [6, 4],  size: [20, 30], op: [0.6, 0.85],  dur: [1.6, 3] },
      { kind: "rise",    emojis: ["🏮"],               n: [3, 2],  size: [24, 34],                    dur: [34, 56] },
      { kind: "twinkle", emojis: ["✨"],               n: [10, 6], size: [14, 24],                    dur: [2.5, 5] }
    ],
    christmas: [
      { kind: "fall",    emojis: ["❄️", "❅", "❆"],    n: [16, 9], size: [12, 26], op: [0.4, 0.75],  dur: [14, 30] },
      { kind: "bob",     emojis: ["🎄", "⛄", "🎁"],   n: [6, 4],  size: [22, 32], op: [0.5, 0.75],  dur: [3, 5.5] }
    ]
  };

  // Extra: lights = navbar ke neeche string lights (alag jagah leti hain, kuch dhakti nahi),
  //        fireworks = aasman me patakhe (peeche ki layer me).
  var EXTRAS = { diwali: { lights: true, fireworks: true } };

  var name = String(SEASON || "").toLowerCase();
  if (!name || !THEMES[name]) return;     // khali ya galat naam = kuch nahi hota, website waisi hi rehti hai

  try {
    document.documentElement.setAttribute("data-season", name);

    function rnd(a, b) { return a + Math.random() * (b - a); }
    function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

    // ---------- navbar ke just neeche string lights (non-sticky) ----------
    function addLights() {
      if (document.querySelector(".bs-lights")) return;
      var nav = document.querySelector(".app-nav");
      if (!nav || !nav.parentNode) return;
      var d = document.createElement("div");
      d.className = "bs-lights";
      d.setAttribute("aria-hidden", "true");
      nav.parentNode.insertBefore(d, nav.nextSibling);
    }

    // ---------- fireworks: canvas, sabse peeche, click nahi rokta ----------
    function startFireworks(layer) {
      if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      var cv = document.createElement("canvas");
      cv.className = "bs-fw";
      layer.appendChild(cv);
      var ctx = cv.getContext && cv.getContext("2d");
      if (!ctx) return;

      var W = 0, H = 0;
      function size() {
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        W = layer.clientWidth || window.innerWidth || 360;
        H = layer.clientHeight || window.innerHeight || 640;
        cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      size();
      window.addEventListener("resize", size);

      var small = W <= 600;
      var perBurst = small ? 30 : 46, maxSparks = perBurst * (small ? 2 : 3);
      var PALETTES = [["#ffb300", "#ff6a00"], ["#e0112b", "#ff8a00"], ["#d4145a", "#ffb300"], ["#ff9800", "#ffd34d"], ["#c2185b", "#ff7043"], ["#16a34a", "#ffc107"]];
      var rockets = [], sparks = [], nextLaunch = 0, last = 0, raf = 0;

      function launch(now) {
        var x0 = rnd(0.12, 0.88) * W;
        rockets.push({ x0: x0, x1: x0 + rnd(-0.06, 0.06) * W, y1: rnd(0.1, 0.45) * H, t: 0, dur: rnd(50, 80),
                       px: x0, py: H, pal: PALETTES[Math.floor(Math.random() * PALETTES.length)] });
        nextLaunch = now + rnd(900, 2200);
      }
      function explode(x, y, pal) {
        var n = perBurst, power = rnd(2.2, 3.6) * (small ? 0.8 : 1);
        for (var i = 0; i < n; i++) {
          var a = (i / n) * Math.PI * 2 + rnd(-0.08, 0.08), sp = power * rnd(0.55, 1.05);
          sparks.push({ x: x, y: y, px: x, py: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                        life: 1, decay: rnd(0.011, 0.018), c: pal[i % 2], w: rnd(1.4, 2.4) });
        }
      }

      function frame(t) {
        raf = window.requestAnimationFrame(frame);
        var dt = Math.min(3, (t - last) / 16.67) || 1; last = t;
        if (t >= nextLaunch && rockets.length < 2 && sparks.length < maxSparks - perBurst) launch(t);

        // pichla frame dheere dheere mitao (transparent canvas par, isliye light/dark dono me chalta hai)
        ctx.globalCompositeOperation = "destination-out";
        ctx.fillStyle = "rgba(0,0,0," + Math.min(0.5, 0.26 * dt) + ")";
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = "source-over";
        ctx.lineCap = "round";

        for (var i = rockets.length - 1; i >= 0; i--) {
          var r = rockets[i];
          r.t += dt;
          var p = Math.min(1, r.t / r.dur), e = 1 - Math.pow(1 - p, 3);
          var x = r.x0 + (r.x1 - r.x0) * e, y = H + (r.y1 - H) * e;
          ctx.strokeStyle = "#ffcf4a"; ctx.lineWidth = 2.2; ctx.globalAlpha = 0.9;
          ctx.beginPath(); ctx.moveTo(r.px, r.py); ctx.lineTo(x, y); ctx.stroke();
          r.px = x; r.py = y;
          if (p >= 1) { explode(x, y, r.pal); rockets.splice(i, 1); }
        }

        for (var j = sparks.length - 1; j >= 0; j--) {
          var s = sparks[j];
          s.vy += 0.045 * dt; s.vx *= 0.992; s.vy *= 0.992;
          s.px = s.x; s.py = s.y; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= s.decay * dt;
          if (s.life <= 0) { sparks.splice(j, 1); continue; }
          ctx.globalAlpha = Math.max(0, s.life);
          ctx.strokeStyle = s.c; ctx.lineWidth = s.w * (0.5 + s.life * 0.6);
          ctx.beginPath(); ctx.moveTo(s.px, s.py); ctx.lineTo(s.x, s.y); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        // kuch bhi baaki nahi to canvas poora saaf (halke bache hue nishaan hatane ke liye)
        if (!rockets.length && !sparks.length) ctx.clearRect(0, 0, W, H);
      }
      function start() { if (!raf) { last = (window.performance && window.performance.now) ? window.performance.now() : 0; nextLaunch = last + 500; raf = window.requestAnimationFrame(frame); } }
      function stop() { if (raf) { window.cancelAnimationFrame(raf); raf = 0; } }
      document.addEventListener("visibilitychange", function () { if (document.hidden) stop(); else start(); });
      start();
    }

    function build() {
      if (!document.body || document.querySelector(".bs-season-layer")) return;

      var layer = document.createElement("div");
      layer.className = "bs-season-layer";
      layer.setAttribute("aria-hidden", "true");
      ["bs-glow", "bs-moon", "bs-ground"].forEach(function (c) {
        var d = document.createElement("div");
        d.className = c;
        layer.appendChild(d);
      });

      var small = !!(window.matchMedia && window.matchMedia("(max-width: 600px)").matches);

      THEMES[name].forEach(function (spec) {
        var count = small ? spec.n[1] : spec.n[0];
        for (var i = 0; i < count; i++) {
          var s = document.createElement("span");
          s.className = "bs-p bs-" + spec.kind;
          s.textContent = pick(spec.emojis);
          s.style.fontSize = rnd(spec.size[0], spec.size[1]).toFixed(0) + "px";
          if (spec.op) s.style.opacity = rnd(spec.op[0], spec.op[1]).toFixed(2);
          s.style.setProperty("--dur", rnd(spec.dur[0], spec.dur[1]).toFixed(1) + "s");
          s.style.setProperty("--delay", "-" + rnd(0, spec.dur[1]).toFixed(1) + "s");

          if (spec.kind === "fly") {
            var ltr = Math.random() < 0.5;
            s.style.top = rnd(4, 70).toFixed(1) + "vh";
            s.style.setProperty("--x0", ltr ? "-12vw" : "108vw");
            s.style.setProperty("--x1", ltr ? "108vw" : "-12vw");
            s.style.setProperty("--dy", rnd(-60, 60).toFixed(0) + "px");
            s.style.setProperty("--flip", ltr ? "-1" : "1");
            s.style.setProperty("--sx", rnd(3, 90).toFixed(0) + "%");
          } else if (spec.kind === "rise") {
            s.style.left = rnd(4, 92).toFixed(1) + "%";
            s.style.top = "100%";
            s.style.setProperty("--sway", rnd(-40, 40).toFixed(0) + "px");
          } else if (spec.kind === "fall") {
            s.style.left = rnd(0, 98).toFixed(1) + "%";
            s.style.top = "0";
            s.style.setProperty("--sway", rnd(-60, 60).toFixed(0) + "px");
          } else if (spec.kind === "bob") {
            s.style.left = rnd(2, 94).toFixed(1) + "%";
            s.style.setProperty("--b", rnd(2, 14).toFixed(0) + "px");   // footer ke upar se itna oopar
          } else if (spec.kind === "twinkle") {
            s.style.left = rnd(2, 96).toFixed(1) + "%";
            s.style.top = rnd(14, 92).toFixed(1) + "%";
          }
          layer.appendChild(s);
        }
      });

      document.body.appendChild(layer);

      var extra = EXTRAS[name] || {};
      if (extra.lights) addLights();
      if (extra.fireworks) startFireworks(layer);

      // Footer ke upar rakhna: footer scroll karke aata hai to neeche ki decoration (zameen, kaddu, diye, glow)
      // uske saath upar uthti rehti hai, footer ke peeche chhupti nahi.
      var footer = null, queued = false;
      function updateFooter() {
        queued = false;
        if (!footer || !document.body.contains(footer)) footer = document.querySelector(".app-footer");
        var h = 0;
        if (footer && footer.offsetParent !== null) {
          var r = footer.getBoundingClientRect();
          h = Math.max(0, Math.min(r.height, window.innerHeight - r.top));
        }
        layer.style.setProperty("--bs-footer-h", Math.round(h) + "px");
      }
      function queue() {
        if (queued) return;
        queued = true;
        if (window.requestAnimationFrame) window.requestAnimationFrame(updateFooter); else setTimeout(updateFooter, 16);
      }
      window.addEventListener("scroll", queue, { passive: true });
      window.addEventListener("resize", queue);
      window.addEventListener("bs:enter", queue);
      if (window.ResizeObserver) new ResizeObserver(queue).observe(document.body);
      queue();

      // tab chhupa ho to animation ruk jaye (battery / CPU bachane ke liye)
      document.addEventListener("visibilitychange", function () {
        layer.classList.toggle("bs-paused", document.hidden);
      });
    }

    if (document.body) build();
    else document.addEventListener("DOMContentLoaded", build);
  } catch (err) {
    // theme kabhi website ko tootne nahi dega
    if (window.console) console.warn("seasonal.js skipped:", err);
  }
})();