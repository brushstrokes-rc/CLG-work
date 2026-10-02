// app-shell.js — login ke baad Home, navbar pages, profile card, events
// brushstroke.js ke BAAD load hota hai (wahi Firebase app use karta hai)
import { getApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, collection,
  addDoc, onSnapshot, deleteDoc, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

const auth = getAuth(getApp());
const db   = getFirestore(getApp());

const appShell = document.getElementById("appShell");
const navLinks = document.querySelectorAll("#appNav a");

// ---------- Pages ----------
function showApp(view, clicked) {
  const pages = {
    home: "viewHome",
    attendance: "viewAttendance",
    attendancesummary: "viewAttendanceSummary",
    events: "viewEvents"
  };
  Object.entries(pages).forEach(function ([key, id]) {
    const page = document.getElementById(id);
    if (page) page.hidden = key !== view;
  });
  const active = clicked || document.querySelector('#appNav a[data-view="' + view + '"]');
  navLinks.forEach(function (a) { a.classList.toggle("active", a === active); });
  window.scrollTo(0, 0);
}
window.bsShowApp = function (view) { showApp(view); };
navLinks.forEach(function (a) {
  a.addEventListener("click", function (e) {
    e.preventDefault();
    showApp(a.dataset.view || "home", a);
  });
});

// ---------- Profile card ----------
function renderProfileCard(u) {
  const name  = ((u && u.name) || "").trim() || "—";
  const parts = name.split(/\s+/).filter(Boolean);
  document.getElementById("pcName").textContent   = name;
  document.getElementById("pcRoll").textContent   = (u && u.roll)   || "—";
  document.getElementById("pcCourse").textContent = (u && u.course) || "—";
  document.getElementById("pcAvatar").textContent = parts.length > 1
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : (parts[0] || "?").slice(0, 2).toUpperCase();
  document.getElementById("dashHi").textContent = "Welcome, " + (parts[0] || "");
}
async function loadProfile() {
  const user = auth.currentUser;
  if (!user) return;
  let p = { name: (user.email || "").split("@")[0], roll: "", course: "" };
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists()) p = snap.data();
  } catch (e) { console.error("Profile load failed:", e); }
  renderProfileCard(p);
}

// ---------- bs:enter ----------
window.addEventListener("bs:enter", function () {
  document.getElementById("signupSection").classList.add("hidden");
  document.getElementById("loginSection").classList.add("hidden");
  document.documentElement.classList.add("app-mode");
  document.body.classList.add("app-mode");
  appShell.classList.remove("hidden");
  loadProfile();
  showApp("home");
  startEventsListener();   // ← Firebase se events load karo
});

// ---------- Dark canvas toggle ----------
(function () {
  const root = document.documentElement, btn = document.getElementById("themeBtn");
  function icon() { btn.textContent = root.dataset.theme === "dark" ? "☀️" : "🌙"; }
  btn.addEventListener("click", function () {
    root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
    try { localStorage.setItem("bs-theme", root.dataset.theme); } catch (e) {}
    icon();
  });
  icon();
})();

// ---------- Quotes + scroll reveal ----------
(function () {
  var Q = [
    ["Every child is an artist. The problem is how to remain an artist once we grow up.", "Pablo Picasso"],
    ["Art washes away from the soul the dust of everyday life.", "Pablo Picasso"],
    ["I dream my painting and then I paint my dream.", "Vincent van Gogh"],
    ["Creativity takes courage.", "Henri Matisse"],
    ["Colour is a power which directly influences the soul.", "Wassily Kandinsky"],
    ["Painting is silent poetry, and poetry is painting that speaks.", "Simonides"]
  ];
  var i = 0;
  var box = document.getElementById("qBox");
  var t   = document.getElementById("qText");
  var b   = document.getElementById("qBy");
  var d   = document.getElementById("qDots");
  Q.forEach(function () { d.appendChild(document.createElement("i")); });
  function show() {
    t.textContent = Q[i][0];
    b.textContent = "— " + Q[i][1];
    [].forEach.call(d.children, function (x, k) { x.className = k === i ? "on" : ""; });
  }
  function next() {
    box.classList.add("fade");
    setTimeout(function () { i = (i + 1) % Q.length; show(); box.classList.remove("fade"); }, 600);
  }
  show();
  setInterval(next, 5500);
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("show"); io.unobserve(e.target); } });
  }, { threshold: 0.15 });
  document.querySelectorAll(".reveal").forEach(function (el) { io.observe(el); });
})();

// ============================================================
//  EVENTS — Firestore se real-time sync (localStorage nahi)
// ============================================================
var evList      = [];          // in-memory cache
var evUnsub     = null;        // onSnapshot unsubscribe
var lb          = document.getElementById("lightbox");

// Firestore collection: "home_events"
// Document shape: { name, desc, photos: [url,...], date: "yyyy-mm-dd", at: serverTimestamp }

function startEventsListener() {
  if (evUnsub) return;   // already listening
  var col = collection(db, "home_events");
  var q   = query(col, orderBy("at", "desc"));
  evUnsub = onSnapshot(q, function (snap) {
    evList = [];
    snap.forEach(function (d) {
      evList.push(Object.assign({ id: d.id }, d.data()));
    });
    renderHomeEvents();
    renderCal();
  }, function (err) {
    console.error("Events listener error:", err);
  });
}

// ---- helpers ----
function pad(n) { return (n < 10 ? "0" : "") + n; }
function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function parseDateStr(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
function fmtDate(s) {
  return parseDateStr(s).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
function make(tag, cls, text) {
  var e = document.createElement(tag);
  if (cls)  e.className   = cls;
  if (text != null) e.textContent = text;
  return e;
}

// ---- Delete event ----
async function deleteEvent(ev) {
  // Delete doc from Firestore
  try { await deleteDoc(doc(db, "home_events", ev.id)); }
  catch (e) { console.error("Delete failed:", e); alert("Delete failed. Check console."); }
  // Photos ko bhi storage se hatana ho to yahan add karo (if using Firebase Storage)
}

// ---- Confirmation popup ----
function showDeletePopup(ev) {
  // Pehle koi purana popup hata do
  var old = document.getElementById("evDelPopup");
  if (old) old.remove();

  var overlay = document.createElement("div");
  overlay.id = "evDelPopup";
  overlay.style.cssText = [
    "position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center",
    "background:rgba(0,0,0,.55);padding:16px"
  ].join(";");

  var box = document.createElement("div");
  box.style.cssText = [
    "background:#fff;color:#222;border-radius:16px;padding:28px 24px 22px",
    "max-width:360px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,.25);text-align:center"
  ].join(";");

  var msg = document.createElement("p");
  msg.style.cssText = "font-size:16px;font-weight:600;margin:0 0 6px";
  msg.textContent   = "Are you sure you want to delete this event attendance?";

  var name = document.createElement("p");
  name.style.cssText = "font-size:14px;color:#666;margin:0 0 22px;font-style:italic";
  name.textContent   = "\"" + ev.name + "\"";

  var btnRow = document.createElement("div");
  btnRow.style.cssText = "display:flex;gap:12px;justify-content:center";

  // NO button — #002aff (blue)
  var noBtn = document.createElement("button");
  noBtn.textContent = "No";
  noBtn.style.cssText = [
    "flex:1;max-width:120px;padding:11px 0;border:none;border-radius:10px",
    "background:#002aff;color:#fff;font-size:15px;font-weight:700;cursor:pointer"
  ].join(";");
  noBtn.addEventListener("click", function () { overlay.remove(); });

  // YES button — #00ff77 (green)
  var yesBtn = document.createElement("button");
  yesBtn.textContent = "Yes";
  yesBtn.style.cssText = [
    "flex:1;max-width:120px;padding:11px 0;border:none;border-radius:10px",
    "background:#00ff77;color:#111;font-size:15px;font-weight:700;cursor:pointer"
  ].join(";");
  yesBtn.addEventListener("click", async function () {
    overlay.remove();
    await deleteEvent(ev);
  });

  btnRow.appendChild(noBtn);
  btnRow.appendChild(yesBtn);
  box.appendChild(msg);
  box.appendChild(name);
  box.appendChild(btnRow);
  overlay.appendChild(box);

  // Bahar click = close
  overlay.addEventListener("click", function (e) { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

// ---- Home Events list ----
function renderHomeEvents() {
  var box = document.getElementById("evList");
  box.replaceChildren();

  var sorted = evList.slice().sort(function (a, b) {
    var da = a.date || "", db_ = b.date || "";
    return da < db_ ? 1 : da > db_ ? -1 : 0;
  });

  sorted.forEach(function (ev) {
    var card = make("article", "ev-card");
    var head = make("div", "ev-head");
    var ti   = make("div");
    ti.appendChild(make("h3", "ev-name", ev.name));
    ti.appendChild(make("span", "ev-date", ev.date ? fmtDate(ev.date) : ""));

    // Delete button (top-right)
    var del = make("button", "ev-del");
    del.type = "button";
    del.setAttribute("aria-label", "Delete event");
    del.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>';
    del.addEventListener("click", function (e) {
      e.stopPropagation();
      showDeletePopup(ev);
    });

    head.appendChild(ti);
    head.appendChild(del);
    card.appendChild(head);

    if (ev.desc) card.appendChild(make("div", "ev-desc", ev.desc));

    if (ev.photos && ev.photos.length) {
      var g = make("div", "ev-photos" + (ev.photos.length === 1 ? " one" : ""));
      ev.photos.forEach(function (src) {
        var im = document.createElement("img");
        im.src = src; im.alt = ev.name + " photo"; im.loading = "lazy";
        im.addEventListener("click", function () {
          lb.querySelector("img").src = src;
          lb.classList.add("on");
        });
        g.appendChild(im);
      });
      card.appendChild(g);
    }
    box.appendChild(card);
  });
}

// ---- Calendar ----
var now = new Date(), vy = now.getFullYear(), vm = now.getMonth(), sel = ymd(now);

function renderCal() {
  var calTitle = document.getElementById("calTitle");
  var calGrid  = document.getElementById("calGrid");
  var evPicked = document.getElementById("evPicked");
  if (!calTitle || !calGrid) return;

  calTitle.textContent = new Date(vy, vm, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  evPicked.textContent = fmtDate(sel);

  var first = new Date(vy, vm, 1).getDay();
  var days  = new Date(vy, vm + 1, 0).getDate();
  var has   = {};
  evList.forEach(function (e) { if (e.date) has[e.date] = 1; });

  calGrid.replaceChildren();
  for (var i = 0; i < first; i++) calGrid.appendChild(document.createElement("span"));
  for (var dd = 1; dd <= days; dd++) {
    var key = vy + "-" + pad(vm + 1) + "-" + pad(dd);
    var btn = document.createElement("button");
    btn.type = "button"; btn.textContent = dd;
    if (key === ymd(now)) btn.classList.add("today");
    if (key === sel)      btn.classList.add("sel");
    if (has[key])         btn.classList.add("has");
    btn.setAttribute("aria-label", fmtDate(key));
    (function (k) { btn.addEventListener("click", function () { sel = k; renderCal(); }); })(key);
    calGrid.appendChild(btn);
  }
}

document.getElementById("calPrev").addEventListener("click", function () {
  vm--; if (vm < 0) { vm = 11; vy--; } renderCal();
});
document.getElementById("calNext").addEventListener("click", function () {
  vm++; if (vm > 11) { vm = 0; vy++; } renderCal();
});

// ---- Photo compress ----
function compress(file) {
  return new Promise(function (res) {
    var url = URL.createObjectURL(file), im = new Image();
    im.onload = function () {
      var m = 900, k = Math.min(1, m / Math.max(im.width, im.height));
      var c = document.createElement("canvas");
      c.width  = Math.round(im.width  * k);
      c.height = Math.round(im.height * k);
      c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res(c.toDataURL("image/jpeg", 0.75));
    };
    im.onerror = function () { URL.revokeObjectURL(url); res(null); };
    im.src = url;
  });
}

// ---- Event form submit — Firestore me save ----
var HINT = "Up to 6 photos. They are resized automatically.";

document.getElementById("evPhotos").addEventListener("change", function () {
  var n = Math.min(this.files.length, 6);
  document.getElementById("evHint").textContent = n
    ? n + " photo" + (n > 1 ? "s" : "") + " selected" + (this.files.length > 6 ? " (only first 6 will be used)" : "")
    : HINT;
});

document.getElementById("evForm").addEventListener("submit", async function (e) {
  e.preventDefault();
  var name = document.getElementById("evName").value.trim();
  if (!name) return;

  var files = [].slice.call(document.getElementById("evPhotos").files, 0, 6);
  var btn   = this.querySelector("[type=submit]");
  btn.disabled = true; btn.textContent = "Saving…";
  document.getElementById("evDone").hidden = true;

  // Photos: base64 as strings (Firestore me store — for larger apps use Storage)
  var photos = (await Promise.all(files.map(compress))).filter(Boolean);

  try {
    await addDoc(collection(db, "home_events"), {
      name:    name,
      desc:    document.getElementById("evDesc").value.trim(),
      photos:  photos,
      date:    sel,
      at:      serverTimestamp()
    });
    this.reset();
    document.getElementById("evHint").textContent = HINT;
    document.getElementById("evDone").hidden = false;
  } catch (err) {
    console.error("Event save failed:", err);
    alert("Could not save event. Check Firestore rules.");
  }

  btn.disabled = false; btn.textContent = "Save Event";
});

// ---- Lightbox ----
lb.addEventListener("click", function () { lb.classList.remove("on"); });
document.addEventListener("keydown", function (e) { if (e.key === "Escape") lb.classList.remove("on"); });

// Initial render (before login, agar koi data pehle se nahi)
renderCal();