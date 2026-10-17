// seasonal.js — seasonal themes: Halloween / Diwali / Christmas. seasonal.css ke saath use karo.
//
// Lagana  : index.html me  <script src="seasonal.js" defer></script>  (seasonal.css ko <head> me sabse last link karo)
// Badalna : neeche  var SEASON = "halloween";  me naam badlo -> "halloween" | "diwali" | "christmas" | "" (khali = koi theme nahi)
// Hatana  : dono lines hata do — ya SEASON = "" kar do. Kisi data ko ye file chhooti nahi.
(function () {
  "use strict";

  var SEASON = "halloween";

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

  var name = String(SEASON || "").toLowerCase();
  if (!name || !THEMES[name]) return;     // khali ya galat naam = kuch nahi hota, website waisi hi rehti hai

  try {
    document.documentElement.setAttribute("data-season", name);

    function rnd(a, b) { return a + Math.random() * (b - a); }
    function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

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
            s.style.bottom = rnd(2, 14).toFixed(0) + "px";
          } else if (spec.kind === "twinkle") {
            s.style.left = rnd(2, 96).toFixed(1) + "%";
            s.style.top = rnd(14, 92).toFixed(1) + "%";
          }
          layer.appendChild(s);
        }
      });

      document.body.appendChild(layer);

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