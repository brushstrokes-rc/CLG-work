// seasonal.js — seasonal theme (abhi: Halloween). seasonal.css ke saath use karo.
//
// Lagana : index.html me  <script src="seasonal.js" defer></script>  (seasonal.css ko <head> me sabse last link karo)
// Hatana : wo dono lines hata do — ya sirf neeche SEASON = "" kar do. Kisi data ko ye file chhooti nahi.
(function () {
  "use strict";

  var SEASON = "halloween";          // "" (khali) = koi theme nahi

  if (!SEASON) return;
  try {
    var root = document.documentElement;
    root.setAttribute("data-season", SEASON);

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

      var small = window.matchMedia && window.matchMedia("(max-width: 600px)").matches;
      var count = small ? { bat: 4, ghost: 2, pumpkin: 3 } : { bat: 7, ghost: 4, pumpkin: 5 };

      function add(kind, emoji, style, vars) {
        var s = document.createElement("span");
        s.className = "bs-p bs-" + kind;
        s.textContent = emoji;
        Object.keys(style).forEach(function (k) { s.style[k] = style[k]; });
        Object.keys(vars).forEach(function (k) { s.style.setProperty(k, vars[k]); });
        layer.appendChild(s);
      }

      // chamgadad: ek side se doosri side udte hain
      for (var i = 0; i < count.bat; i++) {
        var ltr = Math.random() < 0.5;
        add("bat", "🦇",
          { top: rnd(4, 70).toFixed(1) + "vh", fontSize: rnd(16, 28).toFixed(0) + "px", opacity: rnd(0.35, 0.6).toFixed(2) },
          {
            "--x0": ltr ? "-12vw" : "108vw", "--x1": ltr ? "108vw" : "-12vw",
            "--dy": rnd(-60, 60).toFixed(0) + "px", "--flip": ltr ? "-1" : "1",
            "--dur": rnd(24, 44).toFixed(1) + "s", "--delay": "-" + rnd(0, 40).toFixed(1) + "s",
            "--sx": rnd(3, 90).toFixed(0) + "%"
          });
      }
      // bhoot: neeche se upar tairte hain
      for (var g = 0; g < count.ghost; g++) {
        add("ghost", "👻",
          { left: rnd(4, 92).toFixed(1) + "%", top: "100%", fontSize: rnd(22, 34).toFixed(0) + "px" },
          { "--sway": rnd(-40, 40).toFixed(0) + "px", "--dur": rnd(30, 52).toFixed(1) + "s", "--delay": "-" + rnd(0, 45).toFixed(1) + "s" });
      }
      // kaddu: neeche ke kinare halke halke jhoomte hain
      for (var p = 0; p < count.pumpkin; p++) {
        add("pumpkin", pick(["🎃", "🎃", "🎃"]),
          { left: rnd(2, 94).toFixed(1) + "%", bottom: rnd(2, 14).toFixed(0) + "px", fontSize: rnd(20, 30).toFixed(0) + "px", opacity: rnd(0.45, 0.7).toFixed(2) },
          { "--dur": rnd(2.8, 5).toFixed(1) + "s", "--delay": "-" + rnd(0, 4).toFixed(1) + "s" });
      }

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