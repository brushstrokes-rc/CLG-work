// profile.js — Profile page (navbar ke top-right wale button se khulta hai)
// Loaded AFTER brushstroke.js, app-shell.js and student-profile.js (same Firebase app).
//
// Data:
//   • Profile  : window.bsProfile  (app-shell.js ka live users/{uid} listener; Home card bhi wahi use karta hai)
//   • Attendance: window.bsAttendanceData() (student-profile.js ke wahi sessions jo Student Profile page me dikhte hain)
// Username sirf dikhta hai (login usi se bana hai, isliye edit nahi hota). Course aur Roll edit hote hain.
// Password kabhi dikhaya / store nahi hota; sirf "Change password" (purana password daalkar naya) hai.
import { getApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth, EmailAuthProvider, reauthenticateWithCredential, updatePassword }
  from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

const auth = getAuth(getApp());
const db   = getFirestore(getApp());

const COLORS = { present: "#228B22", half: "#1677FF", absent: "#E53935" };
const LABELS = { present: "Present", half: "Half Present", absent: "Absent" };
const STATUSES = ["present", "half", "absent"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// <pure> — plain logic, no DOM / Firebase
function norm(s) { return String(s || "").toLowerCase().replace(/\s+/g, ""); }

// username ko list ke naam se milao (space / capital ka farq nahi, login jaisa)
function findName(list, username, canon) {
  const c = typeof canon === "function" ? canon : function (x) { return x; };
  const u = norm(c(username));
  if (!u || !Array.isArray(list)) return null;
  for (let i = 0; i < list.length; i++) {
    if (norm(c(list[i])) === u) return c(list[i]);
  }
  return null;
}

function firstToken(s) { return String(s || "").trim().split(/\s+/)[0] || ""; }
function tokenCount(s) { return String(s || "").trim().split(/\s+/).filter(Boolean).length; }

// Pura naam na mile to sirf pehla naam: "sagar" <-> "Sagar Sharma" (dono taraf, capital/space ka farq nahi).
// Sirf tab jab dono me se ek naam me ek hi shabd ho; do alag surname wale ("Sagar Verma" vs "Sagar Sharma") match nahi hote.
function fuzzyCandidates(list, username, canon) {
  const c = typeof canon === "function" ? canon : function (x) { return x; };
  const uName = c(username), uFirst = norm(firstToken(uName)), uSingle = tokenCount(uName) <= 1;
  const out = [];
  (list || []).forEach(function (n) {
    const cn = c(n);
    if (!uFirst || norm(firstToken(cn)) !== uFirst) return;
    if (!(uSingle || tokenCount(cn) <= 1)) return;
    if (out.indexOf(cn) === -1) out.push(cn);
  });
  return out;
}

// Pehle poora naam (har list me), na mile to pehla naam. Fuzzy sirf tab jab kisi bhi list me poora naam nahi mila
// (warna "Manya" Main ki Manya Singla (Core) ban jati). Do log same pehle naam ke ho to guess nahi karte.
function resolveNames(mainList, coreList, username, canon) {
  const exM = findName(mainList, username, canon), exC = findName(coreList, username, canon);
  if (exM || exC) return { main: exM, core: exC, fuzzy: false, ambiguous: [] };
  const fm = fuzzyCandidates(mainList, username, canon), fc = fuzzyCandidates(coreList, username, canon);
  const amb = [];
  if (fm.length > 1) fm.forEach(function (n) { amb.push(n); });
  if (fc.length > 1) fc.forEach(function (n) { if (amb.indexOf(n) === -1) amb.push(n); });
  return { main: fm.length === 1 ? fm[0] : null, core: fc.length === 1 ? fc[0] : null, fuzzy: fm.length === 1 || fc.length === 1, ambiguous: amb };
}

// Main sessions sirf Main list wale par, Core sessions sirf Core members par lagte hain.
// Jis session me us naam ki mark nahi = Absent.
function applicableRows(sessions, mainName, coreName) {
  const rows = [];
  (sessions || []).forEach(function (s) {
    const who = s.origin === "core" ? coreName : mainName;
    if (!who) return;
    const st = s.marks ? s.marks[who] : null;
    rows.push({ date: s.date, status: (st === "present" || st === "half") ? st : "absent", origin: s.origin === "core" ? "core" : "main" });
  });
  return rows;
}

function tally(rows) {
  const counts = { present: 0, half: 0, absent: 0 };
  rows.forEach(function (r) { counts[r.status]++; });
  return { counts: counts, total: counts.present + counts.half + counts.absent };
}
function pct(n, total) { return total ? Math.round((n * 100) / total) : 0; }
function pad2(n) { return (n < 10 ? "0" : "") + n; }
function ymdLocal(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }

// range: "days" (last 10 days) | "months" (last 12 months) | "years" (first year with data -> this year)
function bucketize(rows, range, now) {
  const keys = [], labels = [];
  if (range === "days") {
    for (let i = 9; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      keys.push(ymdLocal(d)); labels.push(d.getDate() + " " + MON[d.getMonth()]);
    }
  } else if (range === "months") {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      keys.push(d.getFullYear() + "-" + pad2(d.getMonth() + 1));
      labels.push(MON[d.getMonth()] + " " + String(d.getFullYear()).slice(-2));
    }
  } else {
    const cy = now.getFullYear();
    let min = cy, max = cy;
    rows.forEach(function (r) {
      const y = parseInt(String(r.date).slice(0, 4), 10);
      if (y && y >= cy - 30 && y < min) min = y;
      if (y && y <= cy + 1 && y > max) max = y;
    });
    for (let y = min; y <= max; y++) { keys.push(String(y)); labels.push(String(y)); }
  }
  const idx = {};
  keys.forEach(function (k, i) { idx[k] = i; });
  const series = { present: keys.map(function () { return 0; }), half: keys.map(function () { return 0; }), absent: keys.map(function () { return 0; }) };
  rows.forEach(function (r) {
    const d = String(r.date);
    const k = range === "days" ? d : range === "months" ? d.slice(0, 7) : d.slice(0, 4);
    if (Object.prototype.hasOwnProperty.call(idx, k)) series[r.status][idx[k]]++;
  });
  return { keys: keys, labels: labels, series: series };
}

function slicePath(cx, cy, r, a0, a1) {
  const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
  return "M" + cx + " " + cy + " L" + x0.toFixed(2) + " " + y0.toFixed(2) +
    " A" + r + " " + r + " 0 " + ((a1 - a0) > Math.PI ? 1 : 0) + " 1 " + x1.toFixed(2) + " " + y1.toFixed(2) + " Z";
}

const ROLL_RE = /^[A-Za-z0-9][A-Za-z0-9 \-_./]{0,19}$/;
function validateProfile(course, roll, courses, currentCourse) {
  if (!course) return "Please choose a course.";
  if (!((courses || []).indexOf(course) !== -1 || course === currentCourse)) return "Please choose a course from the list.";
  if (!roll) return "Roll number is required.";
  if (!ROLL_RE.test(roll)) return "Roll number can contain letters, numbers, spaces and - _ . / only (max 20 characters).";
  return "";
}
function validatePasswordChange(cur, nw, cf) {
  if (!cur) return "Enter your current password.";
  if (nw.length < 6) return "New password must be at least 6 characters.";
  if (nw === cur) return "New password must be different from the current password.";
  if (nw !== cf) return "New passwords do not match.";
  return "";
}
// </pure>

// ============================== UI ==============================
const $ = function (id) { return document.getElementById(id); };
function make(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
const SVGNS = "http://www.w3.org/2000/svg";
function sv(tag, attrs, text) {
  const e = document.createElementNS(SVGNS, tag);
  Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
  if (text != null) e.textContent = text;
  return e;
}

const PAGE_HTML = [
  '<section class="pf">',
  '  <h2 class="sec-title">My Profile</h2>',
  '  <div class="pf-card">',
  '    <h3 class="pf-h">Account details</h3>',
  '    <div class="pf-row"><span class="pf-label">Username</span><span class="pf-value" id="pfUser">—</span><span class="pf-lock" title="Username can\'t be changed" aria-label="Username can\'t be changed">🔒</span></div>',
  '    <p class="pf-note">Your username can\'t be changed because it is used to log in.</p>',
  '    <div class="pf-row"><span class="pf-label">Password</span>',
  '      <span class="pf-pass"><input id="pfPass" type="text" value="••••••••" readonly tabindex="-1" aria-label="Password (hidden)">',
  '      <button id="pfEye" type="button" class="pf-eye" aria-pressed="false" aria-label="About your password"></button></span></div>',
  '    <p class="pf-hint" id="pfPassHint" hidden>For your security, your password is stored by Firebase and can\'t be viewed by anyone, including this website. Use “Change password” to set a new one.</p>',
  '    <button id="pfChangeBtn" type="button" class="pf-btn pf-btn-alt">Change password</button>',
  '    <form id="pfPwForm" class="pf-pwform" hidden autocomplete="off">',
  '      <label for="pfCurPw">Current password</label><input id="pfCurPw" type="password" autocomplete="current-password">',
  '      <label for="pfNewPw">New password</label><input id="pfNewPw" type="password" autocomplete="new-password">',
  '      <label for="pfNewPw2">Confirm new password</label><input id="pfNewPw2" type="password" autocomplete="new-password">',
  '      <div class="pf-btnrow"><button type="button" id="pfPwCancel" class="pf-btn">Cancel</button><button type="submit" id="pfPwSave" class="pf-btn pf-btn-ok">Update password</button></div>',
  '      <div id="pfPwMsg" class="pf-msg" role="status" aria-live="polite"></div>',
  '    </form>',
  '    <div class="pf-row"><span class="pf-label">Course</span><span class="pf-value" id="pfCourse">—</span><select id="pfCourseSel" class="pf-input" hidden aria-label="Course"></select></div>',
  '    <div class="pf-row"><span class="pf-label">Roll number</span><span class="pf-value" id="pfRoll">—</span><input id="pfRollIn" class="pf-input" type="text" maxlength="20" hidden aria-label="Roll number" autocomplete="off"></div>',
  '    <div id="pfMsg" class="pf-msg" role="status" aria-live="polite"></div>',
  '  </div>',
  '  <div class="pf-card">',
  '    <h3 class="pf-h">Attendance</h3>',
  '    <div class="pf-stats">',
  '      <div class="pf-chart-menu">',
  '        <button id="pfChartBtn" type="button" class="pf-chartbtn" aria-haspopup="true" aria-expanded="false" aria-label="Charts"></button>',
  '        <div id="pfChartPop" class="pf-pop" role="menu" hidden>',
  '          <button type="button" role="menuitem" data-chart="pie">Overall Pie Chart</button>',
  '          <button type="button" role="menuitem" data-chart="line">Attendance Line Graph</button>',
  '        </div>',
  '      </div>',
  '      <div class="pf-bars" id="pfBars"></div>',
  '    </div>',
  '    <p class="pf-note" id="pfStatNote"></p>',
  '    <div id="pfChartPanel" class="pf-chartpanel" hidden>',
  '      <div class="pf-chart-head"><b id="pfChartTitle"></b><button type="button" id="pfChartClose" class="pf-x" aria-label="Close chart">✕</button></div>',
  '      <div id="pfRange" class="pf-range" hidden>',
  '        <button type="button" data-range="days">Last 10 days</button>',
  '        <button type="button" data-range="months">Month-wise</button>',
  '        <button type="button" data-range="years">Year-wise</button>',
  '      </div>',
  '      <div id="pfChartBody"></div>',
  '    </div>',
  '  </div>',
  '  <div class="pf-actions">',
  '    <button type="button" id="pfBack" class="pf-btn pf-back">← Back</button>',
  '    <span class="pf-right"><button type="button" id="pfCancel" class="pf-btn" hidden>Cancel</button><button type="button" id="pfEdit" class="pf-btn pf-edit">✎ Edit</button></span>',
  '  </div>',
  '</section>'
].join("\n");

const EYE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const CHART_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>';
const PERSON_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.2 4.2-6 8-6s7 1.8 8 6"/></svg>';

const page = $("viewProfile");
if (page) {
  page.innerHTML = PAGE_HTML;
  $("pfEye").innerHTML = EYE_SVG;
  $("pfChartBtn").innerHTML = CHART_SVG;
  const pb = $("profileBtn");
  if (pb) pb.innerHTML = PERSON_SVG;
  init();
}

function init() {
  let editing = false, chartMode = null, lineRange = "days", saving = false, pwBusy = false;

  // ---------- messages ----------
  function msg(id, text, ok) {
    const m = $(id);
    m.textContent = text || "";
    m.className = "pf-msg" + (text ? (ok ? " ok" : " err") : "");
  }

  // ---------- profile data ----------
  function profile() { return window.bsProfile || null; }
  function username() {
    const p = profile(), u = auth.currentUser;
    return (p && p.name) || (u && u.email ? u.email.split("@")[0] : "") || "";
  }
  function courseList() { return Array.isArray(window.bsCourses) ? window.bsCourses : []; }

  function renderDetails() {
    const p = profile();
    $("pfUser").textContent = username() || "—";
    if (!editing) {
      $("pfCourse").textContent = (p && p.course) || "—";
      $("pfRoll").textContent = (p && p.roll) || "—";
    }
  }

  function setEditing(on) {
    editing = on;
    const p = profile() || {};
    $("pfCourse").hidden = on; $("pfRoll").hidden = on;
    $("pfCourseSel").hidden = !on; $("pfRollIn").hidden = !on;
    $("pfCancel").hidden = !on;
    $("pfEdit").textContent = on ? "Save" : "✎ Edit";
    $("pfEdit").classList.toggle("pf-ok", on);
    if (on) {
      const sel = $("pfCourseSel");
      sel.replaceChildren();
      const cur = p.course || "";
      const list = courseList().slice();
      if (cur && list.indexOf(cur) === -1) list.unshift(cur);   // purana course list me na ho to bhi dikhe
      if (!cur) sel.appendChild(new Option("Select course", ""));
      list.forEach(function (c) { sel.appendChild(new Option(c, c)); });
      sel.value = cur;
      $("pfRollIn").value = p.roll || "";
      $("pfRollIn").focus();
    } else {
      renderDetails();
    }
  }

  async function saveProfile() {
    if (saving) return;
    const p = profile() || {};
    const user = auth.currentUser;
    if (!user) { msg("pfMsg", "You are not logged in. Please log in again.", false); return; }
    const course = $("pfCourseSel").value.trim();
    const roll = $("pfRollIn").value.trim();
    const problem = validateProfile(course, roll, courseList(), p.course || "");
    if (problem) { msg("pfMsg", problem, false); return; }
    if (course === (p.course || "") && roll === (p.roll || "")) {
      msg("pfMsg", "No changes to save.", true); setEditing(false); return;
    }
    // sirf course + roll; username ko haath nahi lagta. Doc na ho to wahi users/{uid} doc banta hai (username ke saath).
    const payload = { course: course, roll: roll };
    if (!profile() || profile().exists === false) payload.name = username();
    saving = true;
    const btn = $("pfEdit"); btn.disabled = true; btn.textContent = "Saving…";
    msg("pfMsg", "");
    try {
      await Promise.race([
        setDoc(doc(db, "users", user.uid), payload, { merge: true }),
        new Promise(function (_, rej) { setTimeout(function () { rej({ code: "timeout" }); }, 15000); })
      ]);
      msg("pfMsg", "Profile updated successfully.", true);
      setEditing(false);
    } catch (err) {
      const code = (err && err.code) || "";
      msg("pfMsg",
        code === "permission-denied" ? "You don't have permission to update this profile." :
        code === "timeout" || code === "unavailable" ? "Couldn't confirm the update. Check your internet connection and try again." :
        "Couldn't update your profile. Please try again.", false);
      console.error("Profile update failed:", code || err);
    } finally {
      saving = false; btn.disabled = false;
      btn.textContent = editing ? "Save" : "✎ Edit";
    }
  }

  // ---------- change password ----------
  function clearPwForm() { $("pfCurPw").value = ""; $("pfNewPw").value = ""; $("pfNewPw2").value = ""; }
  function openPw(on) {
    $("pfPwForm").hidden = !on;
    $("pfChangeBtn").hidden = on;
    msg("pfPwMsg", "");
    clearPwForm();
    if (on) $("pfCurPw").focus();
  }
  async function changePassword(e) {
    e.preventDefault();
    if (pwBusy) return;
    const cur = $("pfCurPw").value, nw = $("pfNewPw").value, cf = $("pfNewPw2").value;
    const user = auth.currentUser;
    if (!user || !user.email) { msg("pfPwMsg", "You are not logged in. Please log in again.", false); return; }
    const problem = validatePasswordChange(cur, nw, cf);
    if (problem) { msg("pfPwMsg", problem, false); return; }
    pwBusy = true;
    const btn = $("pfPwSave"); btn.disabled = true; btn.textContent = "Updating…";
    msg("pfPwMsg", "");
    try {
      // Firebase se verify: purana password galat ho to yahin ruk jata hai, kuch change nahi hota
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, cur));
      await updatePassword(user, nw);
      clearPwForm();
      $("pfPwForm").hidden = true; $("pfChangeBtn").hidden = false;
      msg("pfPwMsg", "");
      msg("pfMsg", "Password changed successfully.", true);
    } catch (err) {
      const code = (err && err.code) || "";
      msg("pfPwMsg",
        (code === "auth/wrong-password" || code === "auth/invalid-credential" || code === "auth/invalid-login-credentials") ? "Current password is incorrect." :
        code === "auth/weak-password" ? "New password is too weak. Use at least 6 characters." :
        code === "auth/too-many-requests" ? "Too many attempts. Please wait a while and try again." :
        code === "auth/network-request-failed" ? "Network error. Check your internet connection and try again." :
        code === "auth/requires-recent-login" ? "For security, please log in again and then retry." :
        "Couldn't change the password. Please try again.", false);
      console.error("Password change failed:", code);   // password kabhi log nahi hota
      $("pfCurPw").value = "";
    } finally {
      pwBusy = false; btn.disabled = false; btn.textContent = "Update password";
    }
  }

  // ---------- attendance stats ----------
  function model() {
    const api = typeof window.bsAttendanceData === "function" ? window.bsAttendanceData() : null;
    if (!api || !username()) return { state: "loading" };
    if (api.error) return { state: "error" };
    if (!api.ready) return { state: "loading" };
    const canon = api.canonName;
    const r = resolveNames(window.bsStudentNames, window.bsCoreMemberNames, username(), canon);
    if (!r.main && !r.core) return { state: r.ambiguous.length ? "ambiguous" : "nolink", names: r.ambiguous };
    const rows = applicableRows(api.sessions, r.main, r.core);
    const t = tally(rows);
    return { state: "ok", rows: rows, counts: t.counts, total: t.total, matchedAs: r.fuzzy ? (r.main || r.core) : "" };
  }

  function renderStats() {
    const m = model();
    const counts = m.counts || { present: 0, half: 0, absent: 0 };
    const total = m.total || 0;
    const bars = $("pfBars");
    bars.replaceChildren();
    STATUSES.forEach(function (s) {
      const p = pct(counts[s], total);
      const row = make("div", "pf-bar-row");
      const top = make("div", "pf-bar-top");
      const lab = make("span", "pf-bar-label", LABELS[s]); lab.style.color = COLORS[s];
      const n = make("span", "pf-bar-n", counts[s] + (counts[s] === 1 ? " session" : " sessions"));
      const pc = make("span", "pf-bar-pct", p + "%"); pc.style.color = COLORS[s];
      top.appendChild(lab); top.appendChild(n); top.appendChild(pc);
      const track = make("div", "pf-track");
      track.setAttribute("role", "progressbar");
      track.setAttribute("aria-label", LABELS[s]);
      track.setAttribute("aria-valuemin", "0"); track.setAttribute("aria-valuemax", "100"); track.setAttribute("aria-valuenow", String(p));
      const fill = make("div", "pf-fill"); fill.style.width = p + "%"; fill.style.background = COLORS[s];
      track.appendChild(fill);
      row.appendChild(top); row.appendChild(track);
      bars.appendChild(row);
    });
    $("pfStatNote").textContent =
      m.state === "loading" ? "Loading attendance…" :
      m.state === "error" ? "Couldn't load attendance. Check your internet connection and try again." :
      m.state === "ambiguous" ? "Your username matches more than one name on the attendance lists (" + m.names.join(", ") + "), so your attendance can't be linked automatically." :
      m.state === "nolink" ? "No attendance records are linked to this username, because it doesn't match a name on the attendance lists." :
      total === 0 ? "No attendance sessions have been recorded for you yet." :
      "Based on " + total + (total === 1 ? " session" : " sessions") + (m.matchedAs ? ", matched to “" + m.matchedAs + "” from your username." : ".");
    if (chartMode) renderChart();
  }

  // ---------- charts ----------
  function legendRow(parent, s, count, total) {
    const li = make("div", "pf-leg");
    const dot = make("span", "pf-dot"); dot.style.background = COLORS[s];
    li.appendChild(dot);
    li.appendChild(make("span", "", LABELS[s] + " — " + count + (count === 1 ? " session" : " sessions") + " (" + pct(count, total) + "%)"));
    parent.appendChild(li);
  }

  function renderPie(body, m) {
    const wrap = make("div", "pf-pie");
    const svg = sv("svg", { viewBox: "0 0 200 200", class: "pf-pie-svg", role: "img", "aria-label": "Overall attendance pie chart" });
    const cx = 100, cy = 100, r = 90;
    const nonZero = STATUSES.filter(function (s) { return m.counts[s] > 0; });
    if (nonZero.length === 1) {
      const s = nonZero[0];
      const c = sv("circle", { cx: cx, cy: cy, r: r, fill: COLORS[s] });
      c.appendChild(sv("title", {}, LABELS[s] + ": " + m.counts[s] + " (100%)"));
      svg.appendChild(c);
      svg.appendChild(sv("text", { x: cx, y: cy + 5, "text-anchor": "middle", class: "pf-pie-txt" }, "100%"));
    } else {
      let a = -Math.PI / 2;
      nonZero.forEach(function (s) {
        const frac = m.counts[s] / m.total, a1 = a + frac * 2 * Math.PI;
        const p = sv("path", { d: slicePath(cx, cy, r, a, a1), fill: COLORS[s] });
        p.appendChild(sv("title", {}, LABELS[s] + ": " + m.counts[s] + " (" + pct(m.counts[s], m.total) + "%)"));
        svg.appendChild(p);
        if (frac >= 0.08) {
          const mid = (a + a1) / 2;
          svg.appendChild(sv("text", { x: (cx + r * 0.62 * Math.cos(mid)).toFixed(1), y: (cy + r * 0.62 * Math.sin(mid) + 5).toFixed(1), "text-anchor": "middle", class: "pf-pie-txt" }, pct(m.counts[s], m.total) + "%"));
        }
        a = a1;
      });
    }
    wrap.appendChild(svg);
    const leg = make("div", "pf-legend");
    STATUSES.forEach(function (s) { legendRow(leg, s, m.counts[s], m.total); });
    wrap.appendChild(leg);
    body.appendChild(wrap);
  }

  function renderLine(body, m) {
    const b = bucketize(m.rows, lineRange, new Date());
    const n = b.keys.length;
    const W = 420, H = 270, L = 34, R = 12, T = 14, B = 52;
    let max = 1;
    STATUSES.forEach(function (s) { b.series[s].forEach(function (v) { if (v > max) max = v; }); });
    const step = max <= 5 ? 1 : Math.ceil(max / 5);
    const top = Math.ceil(max / step) * step;
    const iw = W - L - R, ih = H - T - B;
    const X = function (i) { return n === 1 ? L + iw / 2 : L + (iw * i) / (n - 1); };
    const Y = function (v) { return T + ih - (ih * v) / top; };

    const svg = sv("svg", { viewBox: "0 0 " + W + " " + H, class: "pf-line-svg", role: "img", "aria-label": "Attendance trend line graph" });
    for (let v = 0; v <= top; v += step) {
      svg.appendChild(sv("line", { x1: L, x2: W - R, y1: Y(v), y2: Y(v), class: "pf-grid" }));
      svg.appendChild(sv("text", { x: L - 6, y: Y(v) + 4, "text-anchor": "end", class: "pf-axis" }, String(v)));
    }
    svg.appendChild(sv("line", { x1: L, x2: L, y1: T, y2: T + ih, class: "pf-axisline" }));
    svg.appendChild(sv("line", { x1: L, x2: W - R, y1: T + ih, y2: T + ih, class: "pf-axisline" }));
    const rotate = n > 7;
    b.labels.forEach(function (lab, i) {
      const x = X(i), y = T + ih + 14;
      const t = sv("text", { x: x, y: y, class: "pf-axis", "text-anchor": rotate ? "end" : "middle" }, lab);
      if (rotate) t.setAttribute("transform", "rotate(-35 " + x + " " + y + ")");
      svg.appendChild(t);
    });
    STATUSES.forEach(function (s) {
      const pts = b.series[s].map(function (v, i) { return X(i).toFixed(1) + "," + Y(v).toFixed(1); }).join(" ");
      if (n > 1) svg.appendChild(sv("polyline", { points: pts, fill: "none", stroke: COLORS[s], "stroke-width": 2.5, "stroke-linejoin": "round", "stroke-linecap": "round" }));
      b.series[s].forEach(function (v, i) {
        const c = sv("circle", { cx: X(i), cy: Y(v), r: 3.5, fill: COLORS[s] });
        c.appendChild(sv("title", {}, LABELS[s] + " · " + b.labels[i] + ": " + v + (v === 1 ? " session" : " sessions")));
        svg.appendChild(c);
      });
    });
    const scroll = make("div", "pf-line-wrap");
    scroll.appendChild(svg);
    body.appendChild(scroll);
    const leg = make("div", "pf-legend pf-legend-row");
    STATUSES.forEach(function (s) {
      const li = make("div", "pf-leg");
      const dot = make("span", "pf-dot"); dot.style.background = COLORS[s];
      li.appendChild(dot); li.appendChild(make("span", "", LABELS[s]));
      leg.appendChild(li);
    });
    body.appendChild(leg);
    body.appendChild(make("p", "pf-note", "Number of sessions per " + (lineRange === "days" ? "day" : lineRange === "months" ? "month" : "year") + "."));
  }

  function renderChart() {
    const panel = $("pfChartPanel");
    if (!chartMode) { panel.hidden = true; return; }
    panel.hidden = false;
    $("pfChartTitle").textContent = chartMode === "pie" ? "Overall Pie Chart" : "Attendance Line Graph";
    $("pfRange").hidden = chartMode !== "line";
    $("pfRange").querySelectorAll("button").forEach(function (b) {
      const on = b.dataset.range === lineRange;
      b.classList.toggle("on", on); b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    const body = $("pfChartBody");
    body.replaceChildren();
    const m = model();
    if (m.state !== "ok" || m.total === 0) {
      body.appendChild(make("p", "pf-note", "No attendance data to chart yet."));
      return;
    }
    if (chartMode === "pie") renderPie(body, m); else renderLine(body, m);
  }

  function closeMenu() { $("pfChartPop").hidden = true; $("pfChartBtn").setAttribute("aria-expanded", "false"); }

  // ---------- wiring ----------
  $("pfEye").addEventListener("click", function () {
    const h = $("pfPassHint"), on = h.hidden;
    h.hidden = !on;
    this.setAttribute("aria-pressed", on ? "true" : "false");
    this.classList.toggle("on", on);
  });
  $("pfChangeBtn").addEventListener("click", function () { openPw(true); });
  $("pfPwCancel").addEventListener("click", function () { openPw(false); });
  $("pfPwForm").addEventListener("submit", changePassword);

  $("pfEdit").addEventListener("click", function () {
    msg("pfMsg", "");
    if (!editing) setEditing(true); else saveProfile();
  });
  $("pfCancel").addEventListener("click", function () { msg("pfMsg", ""); setEditing(false); });
  $("pfBack").addEventListener("click", function () {
    if (editing) setEditing(false);
    openPw(false); closeMenu(); chartMode = null; renderChart();
    window.bsShowApp(window.bsLastView || "home");
  });

  $("pfChartBtn").addEventListener("click", function (e) {
    e.stopPropagation();
    const pop = $("pfChartPop");
    pop.hidden = !pop.hidden;
    this.setAttribute("aria-expanded", pop.hidden ? "false" : "true");
  });
  $("pfChartPop").querySelectorAll("button").forEach(function (b) {
    b.addEventListener("click", function () { chartMode = b.dataset.chart; closeMenu(); renderChart(); });
  });
  $("pfChartClose").addEventListener("click", function () { chartMode = null; renderChart(); });
  $("pfRange").querySelectorAll("button").forEach(function (b) {
    b.addEventListener("click", function () { lineRange = b.dataset.range; renderChart(); });
  });
  document.addEventListener("click", function (e) { if (!e.target.closest(".pf-chart-menu")) closeMenu(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeMenu(); });

  const pbtn = $("profileBtn");
  if (pbtn) pbtn.addEventListener("click", function () {
    ["viewStudentProfile", "viewStudentRecords"].forEach(function (id) { const el = $(id); if (el) el.hidden = true; });
    window.bsShowApp("profile");
    msg("pfMsg", ""); renderDetails(); renderStats();
  });

  // naya data aaya (profile ya attendance): sab live update
  window.addEventListener("bs:profile", function () { if (!editing) renderDetails(); else $("pfUser").textContent = username() || "—"; renderStats(); });
  window.addEventListener("bs:attendance-data", renderStats);
  window.addEventListener("bs:enter", function () { setEditing(false); openPw(false); chartMode = null; renderChart(); renderDetails(); renderStats(); });

  renderDetails();
  renderStats();
}