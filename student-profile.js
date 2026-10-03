// student-profile.js — Student Profile page + Present / Half Present / Absent record pages
// Loaded AFTER brushstroke.js and app-shell.js (uses the same Firebase app).
//
// Data source: the same Firestore "attendance" collection brushstroke.js already uses.
// Formats understood (identical to buildSessions() in brushstroke.js):
//   "2026-09-29_online_ev_xxxx"  -> saved event      { "Student": "present"|"half", _title, _createdAt }
//   "2026-09-29_offline"/"_online" -> draft (autosaved table; may carry a _title)
//   "2026-09-24"                  -> legacy doc (no mode) -> treated as Offline, only if that date
//                                    has no "_offline" doc (same rule as the app)
// A student with no mark in a session that was taken = Absent (same as View Attendance).
import { getApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getFirestore, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

const auth = getAuth(getApp());
const db   = getFirestore(getApp());

// <pure> — plain logic, no DOM / Firebase (kept separate so it can be tested on its own)
// A session only counts if at least one student is marked Present/Half in it.
// (Absence is inferred from "no mark", so a record with zero marks is
//  indistinguishable from "attendance not taken". Set true to count them.)
const COUNT_EMPTY_SESSIONS = false;

const STATUSES = ["present", "half", "absent"];
const STATUS_META = {
  present: { label: "Present",      color: "#7bfc03" },
  half:    { label: "Half Present", color: "#00aeff" },
  absent:  { label: "Absent",       color: "#fc0303" }
};

const RE_EVENT  = /^(\d{4}-\d{2}-\d{2})_(offline|online)_ev_[a-z0-9]+$/;
const RE_DRAFT  = /^(\d{4}-\d{2}-\d{2})_(offline|online)$/;
const RE_LEGACY = /^(\d{4}-\d{2}-\d{2})$/;

function normStatus(v) {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (s === "present") return "present";
  if (s === "half" || s === "halfpresent") return "half";
  return null;
}

function makeSession(id, date, mode, data) {
  data = data || {};
  const marks = Object.create(null);
  let n = 0;
  Object.keys(data).forEach(function (k) {
    if (k.charAt(0) === "_") return;               // _title, _createdAt
    const st = normStatus(data[k]);
    if (st) { marks[k] = st; n++; }
  });
  return {
    id: id, date: date, mode: mode,
    title: typeof data._title === "string" ? data._title.trim() : "",
    marks: marks, markCount: n,
    createdAt: typeof data._createdAt === "number" ? data._createdAt : 0
  };
}

// docs: { docId: firestoreData }  ->  counted sessions, newest first, duplicates removed
function buildSessions(docs) {
  const all = [], legacy = [], haveDraft = {};
  Object.keys(docs).forEach(function (id) {
    let m = id.match(RE_EVENT);
    if (m) { all.push(makeSession(id, m[1], m[2], docs[id])); return; }
    m = id.match(RE_DRAFT);
    if (m) { haveDraft[m[1] + "|" + m[2]] = true; all.push(makeSession(id, m[1], m[2], docs[id])); return; }
    if (RE_LEGACY.test(id)) legacy.push(id);
  });
  legacy.forEach(function (id) {
    if (!haveDraft[id + "|offline"]) all.push(makeSession(id, id, "offline", docs[id]));
  });

  all.sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt;
    return a.id < b.id ? 1 : -1;
  });

  const seen = {}, out = [];
  all.forEach(function (s) {
    if (!COUNT_EMPTY_SESSIONS && s.markCount === 0) return;       // attendance not actually taken
    const sig = [s.date, s.mode, s.title.toLowerCase(),
      Object.keys(s.marks).sort().map(function (k) { return k + "=" + s.marks[k]; }).join(",")].join("|");
    if (seen[sig]) return;                                        // exact duplicate record
    seen[sig] = true;
    out.push(s);
  });
  return out;
}

function statusOf(session, name) { return session.marks[name] || "absent"; }

function recordsFor(sessions, name) {
  const r = { present: [], half: [], absent: [] };
  sessions.forEach(function (s) { r[statusOf(s, name)].push(s); });
  return r;
}

function fmtPct(n, total) { return (total ? (n / total) * 100 : 0).toFixed(2) + "%"; }

const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];
const DAYS   = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];

function isoToDisplay(iso) {                    // 2026-10-03 -> 03/10/26 (same as the app)
  const p = iso.split("-");
  return p[2] + "/" + p[1] + "/" + p[0].slice(-2);
}
function displayTitle(s) { return s.title || "Attendance"; }
function modeLabel(mode) { return mode === "online" ? "Online" : "Offline"; }

// everything a person might type to find a record: name, mode, and the date in many styles
function searchText(s) {
  const p = s.date.split("-"), y = p[0], m = p[1], d = p[2], yy = y.slice(-2);
  const di = String(+d), mon = MONTHS[+m - 1] || "", short = mon.slice(0, 3);
  const wd = DAYS[new Date(+y, +m - 1, +d).getDay()] || "";
  return [
    displayTitle(s), modeLabel(s.mode), wd,
    d + "/" + m + "/" + yy, d + "-" + m + "-" + yy, d + "." + m + "." + yy,
    d + "/" + m + "/" + y,  d + "-" + m + "-" + y,
    y + "-" + m + "-" + d,  y + "/" + m + "/" + d,
    di + " " + short + " " + y, di + " " + mon + " " + y,
    di + " " + short, di + " " + mon, mon + " " + di + " " + y, short + " " + di, mon, y
  ].join(" | ").toLowerCase();
}

// every word typed must match -> "hello 3 oct", "03/10/26", "workshop", "online sep" all work
function matchesQuery(s, q) {
  const tokens = q.toLowerCase().replace(/,/g, " ").split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const hay = searchText(s);
  return tokens.every(function (t) { return hay.indexOf(t) !== -1; });
}
// </pure>

// ============================== UI ==============================
const $ = function (id) { return document.getElementById(id); };
const APP_VIEWS = ["viewHome", "viewAttendance", "viewAttendanceSummary", "viewEvents"];
const MY_VIEWS  = ["viewStudentProfile", "viewStudentRecords"];

let sessions  = [];
let loaded    = false;
let loadError = false;
let unsub     = null;
const cur = { name: "", status: "present", origin: "attendance" };

function make(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function visible(id) { const el = $(id); return !!el && !el.hidden; }

// ---------- navigation ----------
function hideMine() { MY_VIEWS.forEach(function (id) { const el = $(id); if (el) el.hidden = true; }); }

function showMine(id) {
  APP_VIEWS.forEach(function (v) { const el = $(v); if (el) el.hidden = true; });
  MY_VIEWS.forEach(function (v) { $(v).hidden = v !== id; });
  document.querySelectorAll("#appNav a").forEach(function (a) {
    a.classList.toggle("active", a.dataset.view === "attendance");
  });
  window.scrollTo(0, 0);
}

function leaveToOrigin() {
  hideMine();
  window.bsShowApp(cur.origin);                 // app-shell.js: shows Attendance / View Attendance again
}

// navbar clicks: app-shell.js shows the chosen page, we just hide ours
document.querySelectorAll("#appNav a").forEach(function (a) { a.addEventListener("click", hideMine); });
window.addEventListener("bs:enter", hideMine);

// ---------- data ----------
function startListener() {
  if (unsub) return;
  unsub = onSnapshot(collection(db, "attendance"), function (snap) {
    const docs = {};
    snap.forEach(function (d) { docs[d.id] = d.data(); });
    sessions  = buildSessions(docs);
    loaded    = true;
    loadError = false;
    refresh();
  }, function (err) {
    console.error("Student profile: attendance read failed:", err.code || err);
    unsub = null; loadError = true; refresh();
  });
}
onAuthStateChanged(auth, function (user) {
  if (user) startListener();
  else { if (unsub) { unsub(); unsub = null; } loaded = false; sessions = []; }
});

function refresh() {
  if (visible("viewStudentProfile")) renderProfile();
  if (visible("viewStudentRecords")) renderRecords();
}

// ---------- open pages ----------
function openProfile(name, origin) {
  if (!name) return;
  cur.name = name; cur.origin = origin;
  showMine("viewStudentProfile");
  renderProfile();
}
function openRecords(status) {
  cur.status = status;
  $("srSearch").value = "";
  closeSuggest();
  showMine("viewStudentRecords");
  renderRecords();
}

// names in the attendance table + names in the View Attendance table
document.addEventListener("click", function (e) {
  const cell = e.target.closest("#attendanceBody td.student-name");
  if (cell) { openProfile(cell.textContent.trim(), "attendance"); return; }
  const av = e.target.closest("#avTable tbody td");
  if (av && !av.hasAttribute("colspan")) openProfile(av.textContent.trim(), "attendancesummary");
});
document.querySelectorAll("#attendanceBody td.student-name").forEach(function (td) {
  td.setAttribute("role", "link");
  td.tabIndex = 0;
  td.title = "View attendance profile";
});
document.addEventListener("keydown", function (e) {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("#attendanceBody td.student-name")) {
    e.preventDefault();
    openProfile(e.target.textContent.trim(), "attendance");
  }
});

$("spBack").addEventListener("click", leaveToOrigin);
$("srBack").addEventListener("click", function () { showMine("viewStudentProfile"); renderProfile(); });
document.querySelectorAll("#spBoxes .sp-box").forEach(function (b) {
  b.addEventListener("click", function () { openRecords(b.dataset.status); });
});

// ---------- profile page ----------
function initials(name) {
  const p = name.split(/\s+/).filter(Boolean);
  return (p.length > 1 ? p[0][0] + p[p.length - 1][0] : (p[0] || "?").slice(0, 2)).toUpperCase();
}

function pieSVG(counts, total, name) {
  const R = 100, C = 110, NS = "http://www.w3.org/2000/svg";
  const stroke = "stroke:var(--s-card,#fff);stroke-width:2";
  let html = "", label;
  if (!total) {
    html = '<circle cx="' + C + '" cy="' + C + '" r="' + R + '" fill="#d9d4cc"/>' +
           '<text x="' + C + '" y="' + (C + 5) + '" text-anchor="middle" font-size="15" font-weight="700" fill="#555">No data</text>';
    label = "No attendance recorded yet";
  } else {
    const active = STATUSES.filter(function (k) { return counts[k] > 0; });
    const parts = [];
    if (active.length === 1) {
      const k = active[0];
      html = '<circle cx="' + C + '" cy="' + C + '" r="' + R + '" fill="' + STATUS_META[k].color + '" style="' + stroke + '"><title>' +
             STATUS_META[k].label + ' ' + fmtPct(counts[k], total) + '</title></circle>' +
             '<text x="' + C + '" y="' + (C + 6) + '" text-anchor="middle" font-size="20" font-weight="800" fill="#111">' + fmtPct(counts[k], total) + '</text>';
    } else {
      let a = -Math.PI / 2;
      active.forEach(function (k) {
        const share = counts[k] / total, b = a + share * 2 * Math.PI;
        const x1 = C + R * Math.cos(a), y1 = C + R * Math.sin(a);
        const x2 = C + R * Math.cos(b), y2 = C + R * Math.sin(b);
        html += '<path d="M' + C + ' ' + C + ' L' + x1.toFixed(3) + ' ' + y1.toFixed(3) +
                ' A' + R + ' ' + R + ' 0 ' + (share > 0.5 ? 1 : 0) + ' 1 ' + x2.toFixed(3) + ' ' + y2.toFixed(3) +
                ' Z" fill="' + STATUS_META[k].color + '" style="' + stroke + '"><title>' +
                STATUS_META[k].label + ': ' + counts[k] + ' (' + fmtPct(counts[k], total) + ')</title></path>';
        if (share >= 0.07) {
          const mid = (a + b) / 2;
          html += '<text x="' + (C + R * 0.62 * Math.cos(mid)).toFixed(2) + '" y="' + (C + R * 0.62 * Math.sin(mid) + 5).toFixed(2) +
                  '" text-anchor="middle" font-size="14" font-weight="800" fill="#111">' + fmtPct(counts[k], total) + '</text>';
        }
        a = b;
      });
    }
    STATUSES.forEach(function (k) { parts.push(STATUS_META[k].label + " " + fmtPct(counts[k], total)); });
    label = "Attendance pie chart for " + name + ": " + parts.join(", ");
  }
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 220 220");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", label);
  svg.innerHTML = html;
  return svg;
}

function renderProfile() {
  const name = cur.name;
  $("spName").textContent   = name;
  $("spAvatar").textContent = initials(name);
  const chart = $("spChart"), sub = $("spSub"), note = $("spNote");
  chart.replaceChildren();

  if (loadError) { sub.textContent = "Couldn't load attendance."; note.textContent = "Check your connection and try again."; setBoxes(null, 0); return; }
  if (!loaded)   { sub.textContent = "Loading attendance…"; note.textContent = ""; setBoxes(null, 0); return; }

  const rec = recordsFor(sessions, name);
  const counts = { present: rec.present.length, half: rec.half.length, absent: rec.absent.length };
  const total = sessions.length;

  sub.textContent  = total ? "Based on " + total + " attendance session" + (total === 1 ? "" : "s")
                           : "No attendance has been taken yet";
  note.textContent = total ? "Dates with no attendance are not counted." : "";
  chart.appendChild(pieSVG(counts, total, name));
  setBoxes(counts, total);
}

function setBoxes(counts, total) {
  document.querySelectorAll("#spBoxes .sp-box").forEach(function (b) {
    const k = b.dataset.status;
    b.querySelector(".sp-box-count").textContent = counts ? counts[k] : "–";
    b.querySelector(".sp-box-pct").textContent   = counts ? fmtPct(counts[k], total) : "";
    b.setAttribute("aria-label", STATUS_META[k].label + (counts ? ": " + counts[k] + " of " + total + " sessions, " + fmtPct(counts[k], total) : "") + ". Open list.");
  });
}

// ---------- records page (Present / Half Present / Absent) ----------
let sgItems = [], sgIdx = -1;

function currentList() {
  return loaded ? recordsFor(sessions, cur.name)[cur.status] : [];
}

function renderRecords() {
  const meta = STATUS_META[cur.status];
  const all  = currentList();
  const q    = $("srSearch").value.trim();
  const list = q ? all.filter(function (s) { return matchesQuery(s, q); }) : all;

  $("srName").textContent = cur.name;
  const pill = $("srPill");
  pill.textContent = meta.label;
  pill.style.background = meta.color;
  $("srClear").hidden = !$("srSearch").value;

  const count = $("srCount"), box = $("srList"), empty = $("srEmpty");
  box.replaceChildren();
  empty.replaceChildren();
  empty.hidden = true;

  if (loadError) { count.textContent = ""; showEmpty("Couldn't load attendance. Check your connection and try again."); return; }
  if (!loaded)   { count.textContent = ""; showEmpty("Loading…"); return; }

  count.textContent = q
    ? "Showing " + list.length + " of " + all.length + " record" + (all.length === 1 ? "" : "s")
    : all.length + " record" + (all.length === 1 ? "" : "s");

  if (!all.length) { showEmpty("No " + meta.label.toLowerCase() + " records for " + cur.name + " yet."); return; }
  if (!list.length) {
    showEmpty("No results found for \u201C" + q + "\u201D.");
    const b = make("button", "sr-clear-link", "Clear search");
    b.type = "button";
    b.addEventListener("click", clearSearch);
    empty.appendChild(b);
    return;
  }

  list.forEach(function (s) {
    const row = make("article", "sr-item");
    row.style.setProperty("--c", meta.color);
    const main = make("div", "sr-main");
    main.appendChild(make("span", "sr-title", displayTitle(s)));
    main.appendChild(make("span", "av-chip " + s.mode, modeLabel(s.mode)));
    const date = make("div", "sr-date", isoToDisplay(s.date));
    const wd = DAYS[new Date(+s.date.slice(0, 4), +s.date.slice(5, 7) - 1, +s.date.slice(8, 10)).getDay()];
    date.appendChild(make("small", "", wd.charAt(0).toUpperCase() + wd.slice(1, 3)));
    row.appendChild(main);
    row.appendChild(date);
    box.appendChild(row);
  });
}

function showEmpty(text) {
  const empty = $("srEmpty");
  empty.hidden = false;
  empty.appendChild(make("p", "", text));
}

// ---------- search + live suggestions ----------
const srSearch = $("srSearch"), srSuggest = $("srSuggest");

function closeSuggest() {
  srSuggest.hidden = true; srSuggest.replaceChildren();
  sgItems = []; sgIdx = -1;
  srSearch.setAttribute("aria-expanded", "false");
}

function pick(s) {
  srSearch.value = displayTitle(s) + " " + isoToDisplay(s.date) + " " + modeLabel(s.mode);
  closeSuggest();
  renderRecords();
}

function setActive(i) {
  sgIdx = i;
  Array.prototype.forEach.call(srSuggest.children, function (el, k) {
    el.classList.toggle("on", k === i);
    el.setAttribute("aria-selected", k === i ? "true" : "false");
  });
}

function renderSuggest() {
  const q = srSearch.value.trim();
  srSuggest.replaceChildren();
  sgItems = []; sgIdx = -1;
  if (!q || !loaded) { closeSuggest(); return; }

  const matches = currentList().filter(function (s) { return matchesQuery(s, q); }).slice(0, 6);
  if (!matches.length) {
    srSuggest.appendChild(make("div", "sr-sg none", "No results found"));
  } else {
    matches.forEach(function (s) {
      const item = make("div", "sr-sg");
      item.setAttribute("role", "option");
      const left = make("span", "sr-sg-main");
      left.appendChild(make("span", "sr-sg-title", displayTitle(s)));
      left.appendChild(make("span", "sr-sg-mode", modeLabel(s.mode)));
      item.appendChild(left);
      item.appendChild(make("span", "sr-sg-date", isoToDisplay(s.date)));
      item.addEventListener("click", function () { pick(s); });
      srSuggest.appendChild(item);
      sgItems.push(s);
    });
  }
  srSuggest.hidden = false;
  srSearch.setAttribute("aria-expanded", "true");
}

function clearSearch() {
  srSearch.value = "";
  closeSuggest();
  renderRecords();
  srSearch.focus();
}

srSearch.addEventListener("input", function () { renderRecords(); renderSuggest(); });
srSearch.addEventListener("keydown", function (e) {
  if (e.key === "ArrowDown" && sgItems.length) { e.preventDefault(); setActive((sgIdx + 1) % sgItems.length); }
  else if (e.key === "ArrowUp" && sgItems.length) { e.preventDefault(); setActive((sgIdx - 1 + sgItems.length) % sgItems.length); }
  else if (e.key === "Enter") { e.preventDefault(); if (sgIdx >= 0 && sgItems[sgIdx]) pick(sgItems[sgIdx]); else closeSuggest(); }
  else if (e.key === "Escape") closeSuggest();
});
$("srClear").addEventListener("click", clearSearch);
document.addEventListener("click", function (e) {
  if (!e.target.closest(".sr-search")) closeSuggest();
});