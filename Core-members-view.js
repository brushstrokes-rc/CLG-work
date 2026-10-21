// ── core-members-view.js ──
import { getApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, deleteDoc, deleteField, collection, onSnapshot }
  from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

const db = getFirestore(getApp());

// Shared "dates with attendance" registry (brushstroke.js bhi yahi banata hai; jo pehle load ho wahi bana deta hai)
if (!window.bsAttDates) {
  (function () {
    const src = { main: new Set(), core: new Set() };
    window.bsAttDates = {
      set: function (source, dates) {
        const next = new Set(dates), prev = src[source];
        let same = prev.size === next.size;
        if (same) next.forEach(function (d) { if (!prev.has(d)) same = false; });
        src[source] = next;
        if (!same) window.dispatchEvent(new Event("bs:attdates"));   // sirf tab jab dates sach me badli (har tick par calendar redraw nahi)
      },
      has: function (iso) { return src.main.has(iso) || src.core.has(iso); }
    };
  })();
}

// ── Core drafts: har date + mode ka sirf EK current draft slot ───────────────────────────
// (Core-members-view.js me bhi yahi function hai; jo pehle load ho wahi window par rakh deta hai.)
// localStorage "bs-core-ticks-v1": naya format "yyyy-mm-dd|online|offline" -> {state, dateKey, mode, t}.
// Purana format sirf "yyyy-mm-dd" (bina mode): wo us date ke apne mode (entry me mode ho to wahi, warna Offline)
// ke slot me jaata hai, lekin sirf tab jab us slot me naya draft na ho. Isse purane draft kabhi extra session nahi bante.
if (!window.bsNormalizeCoreDrafts) {
  window.bsNormalizeCoreDrafts = function (raw) {
    const slots = {};
    if (!raw || typeof raw !== "object") return slots;
    const RE_NEW = /^(\d{4}-\d{2}-\d{2})\|(online|offline)$/, RE_OLD = /^\d{4}-\d{2}-\d{2}$/;
    const ok = function (d) { return d && typeof d === "object" && d.state && typeof d.state === "object"; };
    Object.keys(raw).forEach(function (key) {
      const m = key.match(RE_NEW);
      if (m && ok(raw[key])) slots[key] = { state: raw[key].state, dateKey: m[1], mode: m[2], t: raw[key].t || 0, legacy: false };
    });
    Object.keys(raw).forEach(function (key) {
      if (!RE_OLD.test(key) || !ok(raw[key])) return;
      const mode = (raw[key].mode === "online" || raw[key].mode === "offline") ? raw[key].mode : "offline";
      const slot = key + "|" + mode;
      if (!slots[slot]) slots[slot] = { state: raw[key].state, dateKey: key, mode: mode, t: raw[key].t || 0, legacy: true };
    });
    return slots;
  };
}

const CM_SHEETS_URL = "https://script.google.com/macros/s/AKfycbyISnoSu8t4ESuLdamI8HkvXw7PuoDCZipUtA96XSsNn5Bc1VadVKfgQkiLt7Q7lsa-QA/exec";

const CM_MEMBERS = [
  { name: "Saurabh Bhandari",  color: "#d4edda", dark: "#4a7c59" },
  { name: "Manya Singla",      color: "#d0e8ff", dark: "#3a6ea8" },
  { name: "Poorva Gupta",      color: "#ffe4cc", dark: "#a05a1e" },
  { name: "Janhavi Sharma",    color: "#ffb6c1", dark: "#c2354f" },
  { name: "Anuradha",          color: "#e8d5f5", dark: "#7a3fa8" },
  { name: "Shahnaz Ahmad",     color: "#d5f0e8", dark: "#2e7a5a" },
  { name: "Kanishka Singh",    color: "#ffecd0", dark: "#b5621c" },
  { name: "Trisha",            color: "#d0f0ff", dark: "#2070a0" },
  { name: "Madhumita Maan",    color: "#f5d5e8", dark: "#a03070" },
  { name: "Shivani",           color: "#e0f5d0", dark: "#3a7a20" },
  { name: "Vaishali Sharma",   color: "#fff0cc", dark: "#a07a10" },
  { name: "Rupam Nama",        color: "#ffe0d0", dark: "#a04020" },
  { name: "Saksham Katiyar",  color: "#d8e8ff", dark: "#2040a8" },
  { name: "Gauransh Rathore",  color: "#e8f5d0", dark: "#507a20" },
];

// ── STATE ────────────────────────────────────────────────────────────────────
window.bsCoreMemberNames = CM_MEMBERS.map(m => m.name);   // Profile page ke liye (sirf padhne wali copy)

// Purani spelling ("Shaksham Katiyar") wale saved records ko naye naam se jodne ke liye; records badalte nahi.
const CM_ALIASES = { "Shaksham Katiyar": "Saksham Katiyar" };
function cmCanon(n) { return Object.prototype.hasOwnProperty.call(CM_ALIASES, n) ? CM_ALIASES[n] : n; }
function cmLegacyNames(n) { return Object.keys(CM_ALIASES).filter(function (k) { return CM_ALIASES[k] === n; }); }
let cmState = {};
let cmMode = "online";
let cmAttPanelVisible = true;
let cmCalYear, cmCalMonth;
let cmSelectedDate = null;
let cmAllSessions = [];
// Har date ke ticks browser me yaad rakhte hain (localStorage), taaki date badalne / refresh par na jayein
const CM_DRAFT_KEY = "bs-core-ticks-v1";
// Drafts har baar localStorage se taaza padhe jaate hain (cmDraftSlots) -- doosre tab ka badlaav bhi dikhe, aur
// likhte waqt doosre tab ya doosri date ka kuch overwrite na ho.
let cmLoading = false;           // date load ho rahi hai: us dauran tick ignore (galat date me na likhe)
let cmEditing = null;       // Edit mode: { id, date, mode, title, orig, prev } -- ek EXACT saved session (null = nayi session ka workspace)
let cmActiveId = null;      // Sessions panel me jo session abhi khula / edit ho raha hai
let cmViewId = null;        // view page par kaunsa saved session (null = workspace ki abhi ki ticks)
let cmViewDateKey = null;   // view page ki date (download file ke naam ke liye)
let cmSaving = false;       // Save/Update chal raha hai: dobara dabane par duplicate session na bane
let cmColorBook = {};       // dateKey -> session ka rang (is page-load me stable)
let cmColorNext = 0;        // agla unused rang-index; rang kabhi repeat nahi hote
let cmExtraMembers = [];   // saved doc ke wo members jo CM_MEMBERS me nahi hain: dikhte hain aur re-save par bache rehte hain

// ── HTML INJECTION ────────────────────────────────────────────────────────────
function cmInjectHTML(container) {
  container.innerHTML = `
    <!-- MAIN VIEW -->
    <div id="cm-main-view">

      <div class="cm-top">
        <div class="cm-title-heading">brushstrokes</div>

        <div class="cm-calendar-wrap">
          <div class="cm-calendar">
            <div class="cm-cal-header">
              <button class="cm-cal-nav" onclick="cmPrevMonth()">&#8249;</button>
              <span id="cmCalMonthLabel"></span>
              <button class="cm-cal-nav" onclick="cmNextMonth()">&#8250;</button>
            </div>
            <div class="cm-cal-grid" id="cmCalGrid"></div>
          </div>
        </div>

        <div class="cm-mode-row">
          <button class="cm-mode-btn active" id="cmOnlineBtn" onclick="cmSetMode('online')">online</button>
          <button class="cm-mode-btn" id="cmOfflineBtn" onclick="cmSetMode('offline')">offline</button>
        </div>

        <div class="cm-event-row">
          <input class="cm-event-input" id="cmEventInput" placeholder="title" />
          <span class="cm-if-any">(if any)</span>
        </div>

        <button class="cm-att-toggle-btn" onclick="cmToggleAttPanel()">attendance</button>
      </div>

      <div class="cm-body" id="cmAttBody">

        <!-- Left: attendance list -->
        <div class="cm-att-panel">
          <div class="cm-search-row">
            <input class="cm-search-bar" id="cmSearchBar"
                   placeholder="search ......."
                   oninput="cmRenderMembers(this.value)" />
            <button class="cm-clear-all-btn" onclick="cmClearAll()">clear all</button>
          </div>
          <div id="cmMemberList"></div>
        </div>

        <!-- Right: sessions panel -->
        <div class="cm-sessions-panel">
          <div class="cm-sessions-title">Sessions</div>
          <input class="cm-sessions-search" id="cmSessionSearch"
                 placeholder="search sessions..."
                 oninput="cmRenderSessionList(this.value)" />
          <div id="cmSessionList"></div>
        </div>

      </div>

      <div class="cm-bottom-btns">
        <button class="cm-bottom-btn" id="cmSaveBtn" onclick="cmSaveData()">save title</button>
        <button class="cm-bottom-btn" onclick="cmOpenViewPage()">view attendance</button>
      </div>

    </div>

    <!-- VIEW / REPORT PAGE -->
    <div id="cm-view-page" style="display:none;">
      <div class="cm-view-top">
        <button class="cm-view-back" onclick="cmBackToMain()">&#8592; Back</button>
        <button class="cm-edit-btn" onclick="cmEditAttendance()">&#9998; Edit</button>
      </div>

      <div id="cmViewCard">
        <div class="cm-view-meta">
          <h2>
            Core Members Attendance
            <span class="cm-view-tag" id="cmViewModeTag">Online</span>
          </h2>
          <p><span id="cmViewDate"></span><span id="cmViewTitle"></span></p>
        </div>

        <div class="cm-view-cols">
          <div class="cm-view-col present">
            <h3 id="cmViewPresentH">✅ Present</h3>
            <div id="cmViewPresent"></div>
          </div>
          <div class="cm-view-col half">
            <h3 id="cmViewHalfH">🟡 Half Present</h3>
            <div id="cmViewHalf"></div>
          </div>
          <div class="cm-view-col absent">
            <h3 id="cmViewAbsentH">❌ Absent</h3>
            <div id="cmViewAbsent"></div>
          </div>
        </div>
      </div>

      <button class="cm-download-btn" onclick="cmDownloadAttendance()">
        ⬇ Download as Image
      </button>
    </div>
  `;
}

// ── INIT ──────────────────────────────────────────────────────────────────────
function initCoreMembers() {
  // Find or create the container div that brushstroke.js uses for page content
  // Change "core-members-view" to whatever id your app uses for the content area
  let container = document.getElementById("core-members-view");
  if (!container) { console.error('Core Members: id="core-members-view" index.html me nahi mila'); return; }

  // Member stats page se Back: page jaisa chhoda tha waisa hi wapas (date, mode, title, search, ticks reset nahi)
  const restoring = !!window.bsCmRestore && container.dataset.cmReady === "1";
  window.bsCmRestore = false;

  // Only inject HTML once
  if (!container.dataset.cmReady) {
    cmInjectHTML(container);
    container.dataset.cmReady = "1";
  }
  if (restoring) { cmRestoreAfterStats(); return; }

  const now = new Date();
  cmCalYear = now.getFullYear();
  cmCalMonth = now.getMonth();
  CM_MEMBERS.forEach(m => cmState[m.name] = null);
  cmExtraMembers = [];
  cmEditing = null; cmActiveId = null; cmViewId = null;
  cmApplyEditUI();
  cmMode = "online";
  cmAttPanelVisible = true;

  document.getElementById("cmOnlineBtn").classList.add("active");
  document.getElementById("cmOfflineBtn").classList.remove("active");
  document.getElementById("cmEventInput").value = "";
  document.getElementById("cmSearchBar").value = "";

  document.getElementById("cm-main-view").style.display = "block";
  document.getElementById("cm-view-page").style.display = "none";
  document.getElementById("cmAttBody").style.display = "flex";

  cmBuildCalendar();
  cmStartSessionsListener();     // ek hi live listener (dobara nahi banta)
  cmRenderSessionList("");
  cmApplyDraft(cmDraftDate());   // refresh / page wapas aane par is date ke ticks wapas
  cmRenderMembers("");
}

function cmRestoreAfterStats() {
  cmStartSessionsListener();
  document.getElementById("cm-main-view").style.display = "block";
  document.getElementById("cm-view-page").style.display = "none";
  document.getElementById("cmAttBody").style.display = cmAttPanelVisible ? "flex" : "none";
  cmBuildCalendar();   // cmCalYear / cmCalMonth / cmSelectedDate jaise the waise
  cmRenderMembers(document.getElementById("cmSearchBar").value);
  cmRenderSessionList(document.getElementById("cmSessionSearch").value);
  window.scrollTo(0, 0);
}

// ── CALENDAR ──────────────────────────────────────────────────────────────────
function cmBuildCalendar() {
  const wrap = document.getElementById("cmCalGrid");
  const label = document.getElementById("cmCalMonthLabel");
  if (!wrap) return;

  const MONTHS = ["January","February","March","April","May","June",
                  "July","August","September","October","November","December"];
  label.textContent = `${MONTHS[cmCalMonth]} ${cmCalYear}`;

  const DAY_LABELS = ["Su","Mo","Tu","We","Th","Fr","Sa"];
  let html = DAY_LABELS.map(d => `<div class="cm-cal-day-label">${d}</div>`).join("");

  const firstDay = new Date(cmCalYear, cmCalMonth, 1).getDay();
  const daysInMonth = new Date(cmCalYear, cmCalMonth + 1, 0).getDate();
  const today = new Date();

  for (let i = 0; i < firstDay; i++) {
    html += `<div class="cm-cal-cell empty"></div>`;
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dk = `${cmCalYear}-${String(cmCalMonth+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const isToday = d === today.getDate()
                 && cmCalMonth === today.getMonth()
                 && cmCalYear === today.getFullYear();
    const cls = [
      "cm-cal-cell",
      isToday        ? "today"    : "",
      window.bsAttDates.has(dk) ? "has-data" : "",   // saved + draft, Attendance + Core Members dono
      dk === cmSelectedDate ? "selected" : "",
    ].filter(Boolean).join(" ");
    html += `<div class="${cls}" onclick="cmSelectDate('${dk}')">${d}</div>`;
  }
  wrap.innerHTML = html;
}

function cmPrevMonth() {
  if (--cmCalMonth < 0) { cmCalMonth = 11; cmCalYear--; }
  cmBuildCalendar();
}
function cmNextMonth() {
  if (++cmCalMonth > 11) { cmCalMonth = 0; cmCalYear++; }
  cmBuildCalendar();
}
function cmSelectDate(dk) {
  if (!cmGuardLeaveEdit()) return;   // edit chal raha ho aur badlaav unsaved ho to pehle poochho
  cmSelectedDate = dk;
  cmBuildCalendar();
  cmLoadDateData(dk);
}

// ── FIRESTORE ─────────────────────────────────────────────────────────────────
// Saved sessions ka EK live listener (pehle har page-open par getDocs tha, jisse naya/delete hua session
// tabhi dikhta jab page dobara khule). Ab add / save / delete turant calendar aur session list me aate hain.
let cmSessionsUnsub = null;
let cmSavedDays = new Set();   // saved sessions ki calendar-dates (calendar green ke liye)
function cmStartSessionsListener() {
  if (cmSessionsUnsub) return;
  cmSessionsUnsub = onSnapshot(collection(db, "core-attendance"), function (snap) {
    const list = [], days = new Set(), ids = new Set();
    const drafts = {};   // "yyyy-mm-dd|mode" -> { state, dateKey, mode, t }  (Firestore ke draft docs)
    snap.forEach(docSnap => {
      // Draft docs ("yyyy-mm-dd_mode_draft") sessions list me nahi aate; unhe alag cache me rakhte hain
      const dm = docSnap.id.match(CM_DRAFT_RE);
      if (dm) {
        const d = docSnap.data() || {};
        if (d.state && typeof d.state === "object") {
          drafts[dm[1] + "|" + dm[2]] = { state: d.state, dateKey: dm[1], mode: dm[2], t: d.t || 0 };
        }
        return;
      }
      const sv = cmMakeSaved(docSnap.id, docSnap.data());
      if (!sv) return;
      list.push(sv); days.add(sv.dateKey); ids.add(sv.id);
    });
    cmAllSessions = list;
    cmSortSessions();
    cmSavedDays = days;
    cmDraftCache = drafts;
    if (!cmDraftsReady) { cmDraftsReady = true; cmMigrateLocalDrafts(); }   // pehla snapshot aate hi ticks allow
    // rang session ke doc id par: purane se naye ke order me baante jaate hain; hataye gaye ka rang free, baaki ke nahi badalte
    Object.keys(cmColorBook).forEach(k => { if (!ids.has(k)) delete cmColorBook[k]; });
    cmAllSessions.slice().reverse().forEach(x => cmColorFor(x.id));
    if (cmActiveId && !ids.has(cmActiveId)) cmActiveId = null;
    cmSyncGreen();          // calendar (Core + Attendance) khud redraw hoga
    cmReapplyDraftFromRemote();   // doosre device ne ticks badle hon to yahan bhi dikhao
    const sb = document.getElementById("cmSessionSearch");
    cmRenderSessionList(sb ? sb.value : "");
  }, function (e) {
    console.error("CM sessions listener:", e);
    cmSessionsUnsub = null;
    cmDraftsReady = true;   // error me bhi page freeze na ho (write fail hone par console me dikhega)
  });
}

// core-attendance doc -> session. id "yyyy-mm-dd" (purana, date ke naam ka) ya "yyyy-mm-dd_mode_cm_xxxx" (naya).
// Stats (student-profile.js) bhi yahi dono id-format padhta hai.
function cmMakeSaved(id, d) {
  const m = id.match(/^(\d{4}-\d{2}-\d{2})(?:_(online|offline)_cm_[a-z0-9]+)?$/);
  if (!m) return null;
  d = d || {};
  const mode = (d.mode === "online" || d.mode === "offline") ? d.mode : (m[2] || "online");
  const ms = d.savedAt ? new Date(d.savedAt).getTime() : 0;
  return { id: id, dateKey: m[1], title: d.title || "", mode: mode, members: Array.isArray(d.members) ? d.members : [], savedMs: isNaN(ms) ? 0 : ms };
}
function cmSortSessions() {
  cmAllSessions.sort((a, b) => {
    if (a.dateKey !== b.dateKey) return a.dateKey < b.dateKey ? 1 : -1;
    if (a.savedMs !== b.savedMs) return b.savedMs - a.savedMs;
    return a.id < b.id ? 1 : -1;
  });
}
function cmSavedById(id) { return cmAllSessions.find(x => x.id === id) || null; }

function cmDraftHasTicks(d) {
  return !!(d && d.state && Object.keys(d.state).some(function (n) { return d.state[n] === "present" || d.state[n] === "half"; }));
}

// Green dates = saved sessions + wo dates jinke kisi bhi mode ke draft slot me kam se kam ek tick hai
function cmSyncGreen() {
  const dates = new Set(cmSavedDays);
  const slots = cmDraftSlots();
  Object.keys(slots).forEach(function (k) { if (cmDraftHasTicks(slots[k])) dates.add(slots[k].dateKey); });
  window.bsAttDates.set("core", dates);
}

// Login ke turant baad shuru: Core Members page kholne se pehle bhi Attendance calendar me Core dates green dikhein
window.addEventListener("bs:enter", function () { cmSyncGreen(); cmStartSessionsListener(); });
// Registry badalte hi (Attendance ya Core Members) is page ka calendar redraw
window.addEventListener("bs:attdates", function () { cmBuildCalendar(); });
// doosre tab me draft badle to is tab ka green bhi sahi rahe

// Date chunne par main screen us date + mode ka (ek) draft dikhati hai. Saved sessions yahan nahi khulte --
// wo Sessions panel se khulte hain (View / Edit), taaki koi saved session galti se na badal jaye.
function cmLoadDateData(dk) {
  cmExtraMembers = [];   // pichli date ke extra members kabhi nayi date me na jayein
  CM_MEMBERS.forEach(m => cmState[m.name] = null);
  document.getElementById("cmEventInput").value = "";
  // Draft sirf doosre mode me ho aur current mode me kuch na ho, to wahi mode kholo (warna draft screen par dikhta hi nahi)
  const slots = cmDraftSlots();
  const other = cmMode === "online" ? "offline" : "online";
  if (!cmDraftHasTicks(slots[cmDraftKey(dk, cmMode)]) && cmDraftHasTicks(slots[cmDraftKey(dk, other)])) {
    cmMode = other;
    document.getElementById("cmOnlineBtn").classList.toggle("active", cmMode === "online");
    document.getElementById("cmOfflineBtn").classList.toggle("active", cmMode === "offline");
  }
  cmApplyDraft(dk);
  cmRenderMembers(document.getElementById("cmSearchBar").value);
  return true;
}

// Save: HAR nayi session ka apna alag doc ("yyyy-mm-dd_mode_cm_xxxx"), kisi purane ko overwrite nahi karta.
// Edit mode me "update": usi exact doc (cmEditing.id) me merge, naya doc nahi banta.
async function cmSaveData() {
  if (cmSaving) return;
  const title = document.getElementById("cmEventInput").value.trim();
  const members = CM_MEMBERS.map(m => ({ name: m.name, status: cmState[m.name] || "absent" }))
    .concat(cmExtraMembers.map(m => ({ name: m.name, status: m.status })));
  const btn = document.getElementById("cmSaveBtn");
  cmSaving = true; if (btn) btn.disabled = true;

  try {
    if (cmEditing) {
      const ed = cmEditing;
      await setDoc(doc(db, "core-attendance", ed.id), { title, members, updatedAt: new Date().toISOString() }, { merge: true });
      const ex = cmSavedById(ed.id);
      if (ex) { ex.title = title; ex.members = members; }
      cmPushToSheets({ date: ed.date, title, mode: ed.mode, members, savedAt: new Date().toISOString() });
      cmExitEdit();   // workspace wapas jaisa tha waisa
      alert("✅ Attendance updated!");
    } else {
      const dk = cmSelectedDate || cmTodayKey();
      const mode = cmMode;
      const id = dk + "_" + mode + "_cm_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      const payload = { date: dk, title, mode, members, savedAt: new Date().toISOString() };
      await setDoc(doc(db, "core-attendance", id), payload);
      cmDraftDeleteSlot(dk, mode);   // sirf is date + mode ka draft; doosre mode ka draft jaisa tha waisa
      cmSelectedDate = dk;
      // Live listener Save ke turant (setDoc resolve hone se pehle) hi naya doc list me daal deta hai;
      // isliye yahan sirf tab jodo jab wo pehle se list me na ho (warna ek session do baar dikhta tha).
      if (!cmSavedById(id)) cmAllSessions.unshift({ id: id, dateKey: dk, title, mode, members, savedMs: Date.now() });
      cmSortSessions();
      cmSavedDays.add(dk);
      cmColorFor(id);
      // workspace khaali: agla session nayi ticks se shuru (Save ke baad ticks screen par rehne se duplicate ban jate the)
      CM_MEMBERS.forEach(m => cmState[m.name] = null);
      cmExtraMembers = [];
      document.getElementById("cmEventInput").value = "";
      cmRenderMembers(document.getElementById("cmSearchBar").value);
      cmSyncGreen();
      cmBuildCalendar();
      cmPushToSheets(payload);
      alert("✅ Attendance saved!");
    }
    cmRenderSessionList(document.getElementById("cmSessionSearch").value);
  } catch (e) { console.error("CM save:", e); alert("❌ Save failed: " + e.message); }
  finally { cmSaving = false; if (btn) btn.disabled = false; }
}

function cmTodayKey() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}-${String(n.getDate()).padStart(2,"0")}`;
}

// ── GOOGLE SHEETS ─────────────────────────────────────────────────────────────
async function cmPushToSheets(payload) {
  if (!CM_SHEETS_URL || CM_SHEETS_URL === "YOUR_APPS_SCRIPT_WEB_APP_URL_HERE") return;
  try {
    await fetch(CM_SHEETS_URL, {
      method: "POST", mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "core-members", ...payload })
    });
  } catch (e) { console.warn("Sheets push failed:", e); }
}

// ── MEMBERS RENDER ────────────────────────────────────────────────────────────
function cmRenderMembers(filter) {
  const list = document.getElementById("cmMemberList");
  if (!list) return;
  list.innerHTML = "";
  const lf = filter.toLowerCase();
  CM_MEMBERS.filter(m => m.name.toLowerCase().includes(lf)).forEach(m => {
    const s = cmState[m.name];
    const pBox = `border:2.5px solid ${m.dark};background:${s==="present"?m.dark:"transparent"};`;
    const hBox = `border:2.5px solid ${m.dark};background:${s==="half"?m.dark:"transparent"};`;
    const div = document.createElement("div");
    div.className = "cm-member-block";
    div.style.cssText = `background:${m.color};border-color:${m.dark};`;
    div.innerHTML = `
      <div class="cm-member-name" style="cursor:pointer;text-decoration:underline dotted;" title="Click to see attendance stats">${m.name}</div>
      <div class="cm-check-group">
        <label class="cm-check-label" onclick="cmTick('${m.name}','present')">
          Present
          <div class="cm-check-box" style="${pBox}">${s==="present"?"✓":""}</div>
        </label>
        <label class="cm-check-label" onclick="cmTick('${m.name}','half')">
          half Present
          <div class="cm-check-box" style="${hBox}">${s==="half"?"✓":""}</div>
        </label>
      </div>`;
    // Name click → same stats page as main Attendance navbar
    div.querySelector(".cm-member-name").addEventListener("click", function (e) {
      e.stopPropagation();
      if (typeof window.bsOpenStudentProfile === "function") {
        window.bsCmRestore = true;   // Back par Core Members jaisa chhoda tha waisa hi khule (reset nahi)
        window.bsOpenStudentProfile(m.name, "coremembers");   // 2nd argument: Back isi page par wapas aayega
      }
    });
    list.appendChild(div);
  });
}

function cmTick(name, type) {
  if (cmLoading || !cmDraftsReady) return;
  cmState[name] = cmState[name] === type ? null : type;
  cmDraftSave(cmDraftDate());
  cmRenderMembers(document.getElementById("cmSearchBar").value);
}

function cmClearAll() {
  if (cmLoading || !cmDraftsReady) return;
  if (!confirm("Clear all attendance marks?")) return;
  CM_MEMBERS.forEach(m => cmState[m.name] = null);
  cmDraftSave(cmDraftDate());
  cmRenderMembers(document.getElementById("cmSearchBar").value);
}

// ── SESSION LIST ──────────────────────────────────────────────────────────────
function cmRenderSessionList(filter) {
  const ul = document.getElementById("cmSessionList");
  if (!ul) return;
  ul.innerHTML = "";
  const lf = (filter || "").toLowerCase();
  const list = cmAllSessions.filter(s =>
    s.dateKey.includes(lf) || (s.title||"").toLowerCase().includes(lf)
  );
  if (!list.length) {
    ul.innerHTML = `<div class="cm-no-sessions">No sessions yet</div>`;
    return;
  }
  list.forEach(s => {
    const div = document.createElement("div");
    div.className = "cm-session-item" + (cmActiveId === s.id ? " active" : "");
    div.style.setProperty("--sc", cmColorFor(s.id));   // har session ka apna, alag rang
    div.onclick = () => cmOpenSavedSession(s.id);

    const text = document.createElement("div");
    text.className = "cm-session-text";
    const name = document.createElement("span");
    name.className = "cm-session-name";
    name.textContent = s.title || "(no title)";
    const meta = document.createElement("span");
    meta.className = "cm-session-date";
    meta.textContent = `${s.dateKey} · ${s.mode}`;
    text.appendChild(name);
    text.appendChild(meta);

    const del = document.createElement("button");
    del.type = "button";
    del.className = "cm-session-del";
    del.title = "Delete";
    del.setAttribute("aria-label", "Delete this title");
    del.textContent = "🗑️";
    del.onclick = (e) => { e.stopPropagation(); cmConfirmDelete(s); };

    div.appendChild(text);
    div.appendChild(del);
    ul.appendChild(div);
  });
}

// ── SESSION COLORS (har session ka alag, bold rang; kabhi repeat nahi) ───────────
const CM_SESSION_COLORS = [
  "#c62828", "#1565c0", "#2e7d32", "#d84315", "#6a1b9a",
  "#00838f", "#ad1457", "#a67c00", "#283593", "#558b2f", "#6d4c41"
];
function cmPaletteColor(i) {
  if (i < CM_SESSION_COLORS.length) return CM_SESSION_COLORS[i];
  // uske baad: golden-angle hue, har index ka alag hue (dark rakha hai taaki safed text padhne me aaye)
  const k = i - CM_SESSION_COLORS.length;
  const hue = Math.round(((k * 137.508) + 20) % 360 * 10) / 10;
  const light = [38, 30, 34][Math.floor(k / 12) % 3];
  return `hsl(${hue}, 72%, ${light}%)`;
}
function cmColorFor(dk) {
  if (!cmColorBook[dk]) cmColorBook[dk] = cmPaletteColor(cmColorNext++);
  return cmColorBook[dk];
}

// ── DELETE SESSION ────────────────────────────────────────────────────────────
function cmConfirmDelete(s) {
  const old = document.getElementById("cmConfirmOverlay");
  if (old) old.remove();

  const overlay = document.createElement("div");
  overlay.id = "cmConfirmOverlay";
  overlay.className = "cm-confirm-overlay";

  const box = document.createElement("div");
  box.className = "cm-confirm-box";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");

  const q = document.createElement("p");
  q.className = "cm-confirm-text";
  q.textContent = "Are you sure you want to delete this title?";
  const sub = document.createElement("p");
  sub.className = "cm-confirm-sub";
  sub.textContent = (s.title || "(no title)") + " · " + s.dateKey + " · " + s.mode;

  const btns = document.createElement("div");
  btns.className = "cm-confirm-btns";
  const yes = document.createElement("button");
  yes.type = "button"; yes.className = "cm-confirm-yes"; yes.textContent = "Yes";
  const no = document.createElement("button");
  no.type = "button"; no.className = "cm-confirm-no"; no.textContent = "No";
  btns.appendChild(yes);
  btns.appendChild(no);

  box.appendChild(q);
  box.appendChild(sub);
  box.appendChild(btns);
  overlay.appendChild(box);

  const onKey = (e) => { if (e.key === "Escape") close(); };
  function close() {
    document.removeEventListener("keydown", onKey);
    overlay.remove();
  }
  no.onclick = close;                                         // No: kuch delete nahi hota
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  yes.onclick = async () => {
    yes.disabled = true; no.disabled = true;
    await cmDeleteSession(s);
    close();
  };
  document.addEventListener("keydown", onKey);

  document.body.appendChild(overlay);
  no.focus();   // galti se Enter dabane par bhi delete na ho
}

// Is date ka saved session (core-attendance doc, id = date) delete karo
// Sirf yehi saved session (doc id) delete hota hai. Drafts aur doosre sessions ko haath nahi lagta.
async function cmDeleteSession(s) {
  try {
    await deleteDoc(doc(db, "core-attendance", s.id));
  } catch (e) {
    console.error("CM delete:", e);
    alert("❌ Delete failed: " + e.message);
    return;
  }
  cmAllSessions = cmAllSessions.filter(x => x.id !== s.id);
  cmSavedDays = new Set(cmAllSessions.map(x => x.dateKey));
  delete cmColorBook[s.id];
  if (cmEditing && cmEditing.id === s.id) cmExitEdit();
  if (cmViewId === s.id) { cmViewId = null; cmBackToMain(); }
  if (cmActiveId === s.id) cmActiveId = null;
  cmSyncGreen();
  cmBuildCalendar();
  cmRenderSessionList(document.getElementById("cmSessionSearch").value);
}

// ── PER-DATE TICK DRAFTS (Firestore: core-attendance/{date}_{mode}_draft) ─────────────────
// Ab drafts browser me nahi, Firestore me hain -- Main attendance ke drafts ki tarah har device par same.
// Har date + mode ka sirf EK draft doc. Same "core-attendance" collection hai, isliye Firestore rules me kuch nahi badalna.
// Saved sessions ke ids ("..._cm_xxxx") se ye alag hain, isliye sessions list / stats / edit par koi asar nahi.
const CM_DRAFT_RE = /^(\d{4}-\d{2}-\d{2})_(online|offline)_draft$/;
let cmDraftCache = {};      // "yyyy-mm-dd|mode" -> { state, dateKey, mode, t }  (live snapshot ki copy)
let cmDraftsReady = false;  // pehla snapshot aane tak ticks ruke rehte hain (warna doosre device ka draft overwrite ho sakta tha)
let cmMigrationDone = false;

function cmDraftDocId(dk, mode) { return dk + "_" + mode + "_draft"; }
function cmReadRaw() { return cmDraftCache; }
// date + mode ke "current" draft slots
function cmDraftSlots() { return window.bsNormalizeCoreDrafts(cmReadRaw()); }
function cmDraftDate() { return cmSelectedDate || cmTodayKey(); }
// Draft key includes mode so Online and Offline have separate slots
function cmDraftKey(dk, mode) { return dk + "|" + (mode || cmMode); }

function cmAfterDraftChange() {
  window.dispatchEvent(new Event("bs:core-drafts"));   // student-profile.js stats ke liye
  cmSyncGreen();
}

// Abhi ki ticks is date + mode ke EK doc me. Sirf badle hue members likhte hain (Main attendance ki tarah merge),
// isliye do device ek saath alag-alag member tick karein to dono bache rehte hain. Saari ticks hat jayein to doc hat jata hai.
// Edit mode me draft ko haath nahi lagta.
function cmDraftSave(dk) {
  if (cmLoading || cmEditing || !cmDraftsReady) return;
  const mode = cmMode, slot = cmDraftKey(dk, mode);
  const ref = doc(db, "core-attendance", cmDraftDocId(dk, mode));
  const prev = cmDraftSlots()[slot];
  const prevState = (prev && prev.state) || {};

  const next = {}, patch = {};
  let changed = false;
  CM_MEMBERS.forEach(function (m) {
    const nv = cmState[m.name] || null;
    if (nv) next[m.name] = nv;
    const legacy = cmLegacyNames(m.name);   // purani spelling ki key ho to wo bhi saaf ho jaye
    const old = prevState[m.name] || legacy.map(function (k) { return prevState[k]; }).find(Boolean) || null;
    const hasLegacyKey = legacy.some(function (k) { return k in prevState; });
    if (old !== nv || hasLegacyKey) {
      patch[m.name] = nv ? nv : deleteField();
      legacy.forEach(function (k) { if (k in prevState) patch[k] = deleteField(); });
      changed = true;
    }
  });
  if (!changed) return;   // kuch badla hi nahi (jaise sirf Online/Offline switch hua)

  const now = Date.now();
  if (!Object.keys(next).length) {
    delete cmDraftCache[slot];
    deleteDoc(ref).catch(function (e) { console.error("CM draft delete failed:", e); });
  } else {
    cmDraftCache[slot] = { state: next, dateKey: dk, mode: mode, t: now };
    setDoc(ref, { state: patch, dateKey: dk, mode: mode, t: now }, { merge: true })
      .catch(function (e) { console.error("CM draft save failed:", e); });
  }
  cmAfterDraftChange();
}

// Sirf is date + mode ka draft hatao (Save ke baad). Doosre mode ka draft aur baaki sab jaisa tha waisa.
function cmDraftDeleteSlot(dk, mode) {
  const slot = cmDraftKey(dk, mode);
  if (!cmDraftCache[slot]) { cmSyncGreen(); return; }
  delete cmDraftCache[slot];
  deleteDoc(doc(db, "core-attendance", cmDraftDocId(dk, mode)))
    .catch(function (e) { console.error("CM draft delete failed:", e); });
  cmAfterDraftChange();
}

// Doosre device / tab ne draft badla ho to is screen ki ticks bhi update karo.
// (cmState hamesha cache ke barabar rehta hai, isliye farak tabhi aata hai jab badlaav bahar se aaya ho.)
function cmReapplyDraftFromRemote() {
  if (cmEditing || cmLoading || !document.getElementById("cmMemberList")) return;
  const dk = cmDraftDate();
  const d = cmDraftSlots()[cmDraftKey(dk, cmMode)];
  const same = CM_MEMBERS.every(function (m) {
    const v = d && d.state ? (d.state[m.name] || cmLegacyNames(m.name).map(function (k) { return d.state[k]; }).find(Boolean) || null) : null;
    const want = (v === "present" || v === "half") ? v : null;
    return (cmState[m.name] || null) === want;
  });
  if (same) return;
  cmApplyDraft(dk);
  const sb = document.getElementById("cmSearchBar");
  cmRenderMembers(sb ? sb.value : "");
}

// Ek baar ka migration: is device ke purane localStorage drafts Firestore me chale jayen (jo slot Firestore me
// pehle se hai use nahi chhedte). Copy "bs-core-ticks-v1-backup" me bachi rehti hai.
function cmMigrateLocalDrafts() {
  if (cmMigrationDone) return;
  cmMigrationDone = true;
  let rawStr = null, raw = null;
  try { rawStr = localStorage.getItem(CM_DRAFT_KEY); raw = rawStr ? JSON.parse(rawStr) : null; } catch (e) { return; }
  if (!raw || typeof raw !== "object") return;
  const slots = window.bsNormalizeCoreDrafts(raw);
  const writes = [];
  Object.keys(slots).forEach(function (k) {
    const s = slots[k];
    if (!cmDraftHasTicks(s) || cmDraftCache[k]) return;
    const state = {};
    Object.keys(s.state).forEach(function (n) {
      if (s.state[n] === "present" || s.state[n] === "half") state[n] = s.state[n];
    });
    cmDraftCache[k] = { state: state, dateKey: s.dateKey, mode: s.mode, t: s.t || Date.now() };
    writes.push(setDoc(doc(db, "core-attendance", cmDraftDocId(s.dateKey, s.mode)),
      { state: state, dateKey: s.dateKey, mode: s.mode, t: s.t || Date.now() }));
  });
  Promise.all(writes).then(function () {
    try { localStorage.setItem(CM_DRAFT_KEY + "-backup", rawStr); localStorage.removeItem(CM_DRAFT_KEY); } catch (e) {}
  }).catch(function (e) { console.error("CM draft migration failed:", e); });
}

// Is date+mode ke slot ke ticks main screen ke state me daalo. true = draft mila
function cmApplyDraft(dk) {
  const d = cmDraftSlots()[cmDraftKey(dk, cmMode)];
  if (!d || !d.state) {
    // No draft for this mode — clear state so other mode's ticks don't show
    CM_MEMBERS.forEach(m => { cmState[m.name] = null; });
    return false;
  }
  CM_MEMBERS.forEach(m => {
    const v = d.state[m.name] || cmLegacyNames(m.name).map(k => d.state[k]).find(Boolean) || null;
    cmState[m.name] = (v === "present" || v === "half") ? v : null;
  });
  return true;
}

// ── EDIT MODE (save title -> update) ──────────────────────────────────────────
function cmApplyEditUI() {
  const b = document.getElementById("cmSaveBtn");
  if (b) b.textContent = cmEditing ? "update" : "save title";
}
// Working copy ki marks (present/half) ek stable string me -- "badlaav hua ya nahi" jaanne ke liye
function cmMarksKey() {
  const o = {};
  CM_MEMBERS.forEach(m => { if (cmState[m.name]) o[m.name] = cmState[m.name]; });
  cmExtraMembers.forEach(m => { if (m.status === "present" || m.status === "half") o[m.name] = m.status; });
  return Object.keys(o).sort().map(k => k + ":" + o[k]).join("|");
}
function cmEditDirty() {
  return !!cmEditing && (cmMarksKey() !== cmEditing.orig || document.getElementById("cmEventInput").value.trim() !== cmEditing.title);
}
// Edit chhodne se pehle (doosri date chunna / doosre session ka Edit): unsaved badlaav ho to poochho. false = ruko.
function cmGuardLeaveEdit() {
  if (!cmEditing) return true;
  if (cmEditDirty() && !confirm("Discard your changes to this session?")) return false;
  cmExitEdit();
  return true;
}
// Edit mode se bahar: nayi session ka workspace (date, mode, title, ticks) bilkul waisa jaisa edit se pehle tha
function cmExitEdit() {
  const ed = cmEditing;
  if (!ed) return;
  cmEditing = null;
  const p = ed.prev;
  CM_MEMBERS.forEach(m => { cmState[m.name] = p.state[m.name] || null; });
  cmExtraMembers = p.extras;
  cmMode = p.mode;
  cmSelectedDate = p.date;
  cmCalYear = p.calYear; cmCalMonth = p.calMonth;
  document.getElementById("cmEventInput").value = p.title;
  document.getElementById("cmOnlineBtn").classList.toggle("active", cmMode === "online");
  document.getElementById("cmOfflineBtn").classList.toggle("active", cmMode === "offline");
  cmApplyEditUI();
  cmBuildCalendar();
  cmRenderMembers(document.getElementById("cmSearchBar").value);
  cmRenderSessionList(document.getElementById("cmSessionSearch").value);
  cmReapplyDraftFromRemote();   // edit ke dauran doosre device se draft badla ho to taaza dikhao
}
// Is exact saved session ko edit karo (working copy main screen par; drafts ko haath nahi lagta)
function cmEnterEdit(sv) {
  if (cmEditing) {
    if (cmEditing.id === sv.id) { cmBackToMain(); return; }
    if (!cmGuardLeaveEdit()) return;
  }
  const prev = {
    date: cmSelectedDate, mode: cmMode, title: document.getElementById("cmEventInput").value,
    state: Object.assign({}, cmState), extras: cmExtraMembers.slice(), calYear: cmCalYear, calMonth: cmCalMonth
  };
  CM_MEMBERS.forEach(m => { cmState[m.name] = null; });
  cmExtraMembers = [];
  (sv.members || []).forEach(m => {
    if (!m || !m.name) return;
    const nm = cmCanon(m.name);
    if (Object.prototype.hasOwnProperty.call(cmState, nm)) cmState[nm] = (m.status === "present" || m.status === "half") ? m.status : null;
    else cmExtraMembers.push({ name: nm, status: m.status || "absent" });
  });
  cmMode = sv.mode;
  cmSelectedDate = sv.dateKey;
  const [y, mo] = sv.dateKey.split("-").map(Number);
  cmCalYear = y; cmCalMonth = mo - 1;
  document.getElementById("cmEventInput").value = sv.title || "";
  document.getElementById("cmOnlineBtn").classList.toggle("active", cmMode === "online");
  document.getElementById("cmOfflineBtn").classList.toggle("active", cmMode === "offline");
  cmEditing = { id: sv.id, date: sv.dateKey, mode: sv.mode, title: (sv.title || "").trim(), orig: cmMarksKey(), prev: prev };
  cmActiveId = sv.id;
  cmAttPanelVisible = true;
  const body = document.getElementById("cmAttBody");
  if (body) body.style.display = "flex";
  cmApplyEditUI();
  cmBuildCalendar();
  cmRenderMembers(document.getElementById("cmSearchBar").value);
  cmRenderSessionList(document.getElementById("cmSessionSearch").value);
  cmBackToMain();
  window.scrollTo(0, 0);
}

// ── CONTROLS ──────────────────────────────────────────────────────────────────
function cmSetMode(mode) {
  if (cmMode === mode) return;
  if (cmEditing) return;   // edit ke dauran mode locked (session ka mode nahi badalta)
  // Save current mode's draft before switching
  cmDraftSave(cmDraftDate());
  cmMode = mode;
  document.getElementById("cmOnlineBtn").classList.toggle("active", mode === "online");
  document.getElementById("cmOfflineBtn").classList.toggle("active", mode === "offline");
  // Restore new mode's draft (or clear if none)
  cmApplyDraft(cmDraftDate());
  cmRenderMembers(document.getElementById("cmSearchBar").value);
}

function cmToggleAttPanel() {
  cmAttPanelVisible = !cmAttPanelVisible;
  const el = document.getElementById("cmAttBody");
  if (el) el.style.display = cmAttPanelVisible ? "flex" : "none";
}

// ── VIEW PAGE ─────────────────────────────────────────────────────────────────
// View page ka common renderer. v = { date, mode, title, present:[{name,dark}], half:[...], absent:[...] }
function cmRenderViewPage(v) {
  cmViewDateKey = v.date;
  document.getElementById("cmViewDate").textContent     = v.date;
  document.getElementById("cmViewTitle").textContent    = v.title ? ` — ${v.title}` : "";
  document.getElementById("cmViewModeTag").textContent  = v.mode === "online" ? "Online" : "Offline";
  document.getElementById("cmViewPresentH").textContent = `✅ Present (${v.present.length})`;
  document.getElementById("cmViewHalfH").textContent    = `🟡 Half Present (${v.half.length})`;
  document.getElementById("cmViewAbsentH").textContent  = `❌ Absent (${v.absent.length})`;

  const renderCol = (id, arr) => {
    document.getElementById(id).innerHTML = arr.length
      ? arr.map(m => `<div class="cm-view-name" style="border-left:3px solid ${m.dark};padding-left:6px">${cmEsc(m.name)}</div>`).join("")
      : `<div class="cm-view-name" style="color:#bbb">—</div>`;
  };
  renderCol("cmViewPresent", v.present);
  renderCol("cmViewHalf",    v.half);
  renderCol("cmViewAbsent",  v.absent);

  document.getElementById("cm-main-view").style.display  = "none";
  document.getElementById("cm-view-page").style.display  = "block";
}

// "view attendance" button: main screen ki abhi ki ticks (draft ya edit ki working copy)
function cmOpenViewPage() {
  const present = [], half = [], absent = [];
  CM_MEMBERS.forEach(m => {
    if      (cmState[m.name] === "present") present.push(m);
    else if (cmState[m.name] === "half")    half.push(m);
    else                                     absent.push(m);
  });

  // saved doc ke members jo CM_MEMBERS me nahi hain wo bhi dikhao
  cmExtraMembers.forEach(m => {
    const e = { name: m.name, dark: "#999" };
    if      (m.status === "present") present.push(e);
    else if (m.status === "half")    half.push(e);
    else                             absent.push(e);
  });

  cmViewId = null;
  cmRenderViewPage({
    date: cmEditing ? cmEditing.date : (cmSelectedDate || cmTodayKey()),
    mode: cmMode,
    title: document.getElementById("cmEventInput").value.trim(),
    present, half, absent
  });
}

// Sessions panel me click: usi saved session (doc id) ko cache se dikhao. Main screen / drafts / date nahi badalte.
function cmOpenSavedSession(id) {
  const sv = cmSavedById(id);
  if (!sv) { alert("❌ Couldn't load this session. Please try again."); return; }
  cmActiveId = id;
  cmRenderSessionList(document.getElementById("cmSessionSearch").value);
  const status = {};
  (sv.members || []).forEach(m => { if (m && m.name) status[cmCanon(m.name)] = m.status; });
  const present = [], half = [], absent = [];
  CM_MEMBERS.forEach(m => {
    if      (status[m.name] === "present") present.push(m);
    else if (status[m.name] === "half")    half.push(m);
    else                                    absent.push(m);
  });
  const known = new Set(CM_MEMBERS.map(m => m.name));
  Object.keys(status).forEach(nm => {
    if (known.has(nm)) return;
    const e = { name: nm, dark: "#999" };
    if      (status[nm] === "present") present.push(e);
    else if (status[nm] === "half")    half.push(e);
    else                                absent.push(e);
  });
  cmRenderViewPage({ date: sv.dateKey, mode: sv.mode, title: sv.title, present, half, absent });
  cmViewId = id;
}

function cmBackToMain() {
  document.getElementById("cm-view-page").style.display  = "none";
  document.getElementById("cm-main-view").style.display  = "block";
}

function cmEsc(t) {
  return String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Edit (view page): agar yeh koi saved session dikha raha hai to EXACT wahi session edit mode me khulta hai (update usi doc ko);
// agar main screen ki abhi ki ticks dikha raha hai to bas wapas main screen par.
function cmEditAttendance() {
  if (!cmViewId) { cmBackToMain(); return; }
  const sv = cmSavedById(cmViewId);
  if (!sv) { alert("❌ This session could not be found. It may have been deleted."); cmBackToMain(); return; }
  cmEnterEdit(sv);
}

// ── DOWNLOAD ──────────────────────────────────────────────────────────────────
function cmDownloadAttendance() {
  const el = document.getElementById("cmViewCard");
  if (!el) return;
  if (typeof html2canvas !== "undefined") {
    html2canvas(el, { scale: 2, backgroundColor: "#f5f0eb" }).then(canvas => {
      const a = document.createElement("a");
      a.download = `core-members-${cmViewDateKey || cmSelectedDate || cmTodayKey()}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
    });
  } else {
    alert("html2canvas not loaded — add its <script> tag to index.html");
  }
}

// ── EXPOSE GLOBALS ────────────────────────────────────────────────────────────
window.initCoreMembers      = initCoreMembers;
window.cmPrevMonth          = cmPrevMonth;
window.cmNextMonth          = cmNextMonth;
window.cmSelectDate         = cmSelectDate;
window.cmSetMode            = cmSetMode;
window.cmToggleAttPanel     = cmToggleAttPanel;
window.cmTick               = cmTick;
window.cmClearAll           = cmClearAll;
window.cmSaveData           = cmSaveData;
window.cmOpenViewPage       = cmOpenViewPage;
window.cmBackToMain         = cmBackToMain;
window.cmEditAttendance     = cmEditAttendance;
window.cmDownloadAttendance = cmDownloadAttendance;
window.cmRenderMembers      = cmRenderMembers;
window.cmRenderSessionList  = cmRenderSessionList;