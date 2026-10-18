// ── core-members-view.js ──
import { getApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, deleteDoc, collection, getDocs }
  from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

const db = getFirestore(getApp());

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
let cmGreenDates = new Set();
let cmSelectedDate = null;
let cmAllSessions = [];
// Har date ke ticks browser me yaad rakhte hain (localStorage), taaki date badalne / refresh par na jayein
const CM_DRAFT_KEY = "bs-core-ticks-v1";
let cmDrafts = cmReadDrafts();   // { "yyyy-mm-dd": { state: {name: status|null}, t: ms } }
let cmLoading = false;           // date load ho rahi hai: us dauran tick ignore (galat date me na likhe)
let cmEditingDate = null;   // Edit mode me jis saved date ko edit kar rahe hain (null = normal)
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

  // Only inject HTML once
  if (!container.dataset.cmReady) {
    cmInjectHTML(container);
    container.dataset.cmReady = "1";
  }

  const now = new Date();
  cmCalYear = now.getFullYear();
  cmCalMonth = now.getMonth();
  CM_MEMBERS.forEach(m => cmState[m.name] = null);
  cmExtraMembers = [];
  cmEditingDate = null;
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
  cmLoadAllSessions();
  cmApplyDraft(cmDraftDate());   // refresh / page wapas aane par is date ke ticks wapas
  cmRenderMembers("");
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
      cmGreenDates.has(dk) ? "has-data" : "",
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
  cmLeaveEditIfOtherDate(dk);
  cmSelectedDate = dk;
  cmBuildCalendar();
  cmLoadDateData(dk);
}

// ── FIRESTORE ─────────────────────────────────────────────────────────────────
async function cmLoadAllSessions() {
  try {
    const snap = await getDocs(collection(db, "core-attendance"));
    cmAllSessions = [];
    cmGreenDates = new Set();
    snap.forEach(docSnap => {
      const d = docSnap.data();
      cmGreenDates.add(docSnap.id);
      cmAllSessions.push({ dateKey: docSnap.id, title: d.title || "", mode: d.mode || "online" });
    });
    cmAllSessions.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
    // rang purani date se naayi date ke order me baantte hain, taaki naya session aane par purane rang na badlein
    cmColorBook = {}; cmColorNext = 0;
    cmAllSessions.slice().reverse().forEach(x => cmColorFor(x.dateKey));
    cmBuildCalendar();
    cmRenderSessionList("");
  } catch (e) { console.error("CM load sessions:", e); }
}

async function cmLoadDateData(dk, ignoreDraft) {
  cmExtraMembers = [];   // pichli date ke extra members kabhi nayi date me na jayein
  cmLoading = true;
  try {
    const docSnap = await getDoc(doc(db, "core-attendance", dk));
    CM_MEMBERS.forEach(m => cmState[m.name] = null);
    if (docSnap.exists()) {
      const d = docSnap.data();
      cmMode = d.mode || "online";
      document.getElementById("cmEventInput").value = d.title || "";
      document.getElementById("cmOnlineBtn").classList.toggle("active", cmMode === "online");
      document.getElementById("cmOfflineBtn").classList.toggle("active", cmMode === "offline");
      (d.members || []).forEach(m => {
        if (!m || !m.name) return;
        const nm = cmCanon(m.name);
        if (Object.prototype.hasOwnProperty.call(cmState, nm)) cmState[nm] = m.status;
        else cmExtraMembers.push({ name: nm, status: m.status || "absent" });
      });
    } else {
      document.getElementById("cmEventInput").value = "";   // nayi date: purani date ka title na bache
    }
    // is date ke yaad rakhe (unsaved) ticks saved record par bhaari hain.
    // Saved Sessions ka view (ignoreDraft) hamesha saved record dikhata hai.
    if (!ignoreDraft) cmApplyDraft(dk);
    cmRenderMembers(document.getElementById("cmSearchBar").value);
    return true;
  } catch (e) { console.error("CM load date:", e); return false; }
  finally { cmLoading = false; }
}

async function cmSaveData() {
  const dk = cmSelectedDate || cmTodayKey();
  const title = document.getElementById("cmEventInput").value.trim();
  const members = CM_MEMBERS.map(m => ({ name: m.name, status: cmState[m.name] || "absent" }))
    .concat(cmExtraMembers.map(m => ({ name: m.name, status: m.status })));
  const payload = { date: dk, title, mode: cmMode, members, savedAt: new Date().toISOString() };

  try {
    await setDoc(doc(db, "core-attendance", dk), payload, { merge: true });   // same date doc update, doosre fields bache rehte hain
    cmGreenDates.add(dk);
    cmDraftDelete(dk);   // ab saved record hi latest hai
    cmSelectedDate = dk;
    cmBuildCalendar();
    const ex = cmAllSessions.find(s => s.dateKey === dk);
    if (ex) { ex.title = title; ex.mode = cmMode; }
    else cmAllSessions.unshift({ dateKey: dk, title, mode: cmMode });
    cmRenderSessionList(document.getElementById("cmSessionSearch").value);
    cmPushToSheets(payload);
    const wasEditing = !!cmEditingDate;
    cmEditingDate = null;
    cmApplyEditUI();
    alert(wasEditing ? "✅ Attendance updated!" : "✅ Attendance saved!");
  } catch (e) { console.error("CM save:", e); alert("❌ Save failed: " + e.message); }
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
      if (typeof window.bsOpenStudentProfile === "function") window.bsOpenStudentProfile(m.name, "coremembers");
    });
    list.appendChild(div);
  });
}

function cmTick(name, type) {
  if (cmLoading) return;
  cmState[name] = cmState[name] === type ? null : type;
  cmDraftSave(cmDraftDate());
  cmRenderMembers(document.getElementById("cmSearchBar").value);
}

function cmClearAll() {
  if (cmLoading) return;
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
  const lf = filter.toLowerCase();
  const list = cmAllSessions.filter(s =>
    s.dateKey.includes(lf) || (s.title||"").toLowerCase().includes(lf)
  );
  if (!list.length) {
    ul.innerHTML = `<div class="cm-no-sessions">No sessions yet</div>`;
    return;
  }
  list.forEach(s => {
    const div = document.createElement("div");
    div.className = "cm-session-item" + (cmSelectedDate === s.dateKey ? " active" : "");
    div.style.setProperty("--sc", cmColorFor(s.dateKey));   // har session ka apna, alag rang
    div.onclick = async () => {
      cmLeaveEditIfOtherDate(s.dateKey);
      cmSelectedDate = s.dateKey;
      const [y, mo] = s.dateKey.split("-").map(Number);
      cmCalYear = y; cmCalMonth = mo - 1;
      cmBuildCalendar();
      cmRenderSessionList(document.getElementById("cmSessionSearch").value);
      // saved doc load karke View Attendance format me dikhao (Download as Image neeche), Edit se main screen par
      if (await cmLoadDateData(s.dateKey, true)) cmOpenViewPage();
      else alert("❌ Couldn't load this session. Please try again.");
    };

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
  sub.textContent = (s.title || "(no title)") + " · " + s.dateKey;

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
async function cmDeleteSession(s) {
  try {
    await deleteDoc(doc(db, "core-attendance", s.dateKey));
  } catch (e) {
    console.error("CM delete:", e);
    alert("❌ Delete failed: " + e.message);
    return;
  }
  cmAllSessions = cmAllSessions.filter(x => x.dateKey !== s.dateKey);
  cmGreenDates.delete(s.dateKey);
  cmDraftDelete(s.dateKey);
  delete cmColorBook[s.dateKey];
  if (cmEditingDate === s.dateKey) { cmEditingDate = null; cmApplyEditUI(); }

  // agar yehi date main screen par khuli thi to uska data bhi saaf (warna Save se wapas ban jata)
  if (cmSelectedDate === s.dateKey) {
    CM_MEMBERS.forEach(m => cmState[m.name] = null);
    cmExtraMembers = [];
    document.getElementById("cmEventInput").value = "";
    cmRenderMembers(document.getElementById("cmSearchBar").value);
  }
  cmBuildCalendar();
  cmRenderSessionList(document.getElementById("cmSessionSearch").value);
}

// ── PER-DATE TICK DRAFTS ──────────────────────────────────────────────────────
function cmReadDrafts() {
  try {
    const raw = localStorage.getItem(CM_DRAFT_KEY);
    const o = raw ? JSON.parse(raw) : {};
    return (o && typeof o === "object") ? o : {};
  } catch (e) { return {}; }
}
function cmWriteDrafts() {
  try { localStorage.setItem(CM_DRAFT_KEY, JSON.stringify(cmDrafts)); }
  catch (e) { console.warn("CM drafts save failed:", e); }
}
function cmDraftDate() { return cmSelectedDate || cmTodayKey(); }

// Abhi ki ticks is date ke naam se yaad rakho (poora snapshot: tick hata diya = null bhi yaad rehta hai)
function cmDraftSave(dk) {
  const state = {};
  CM_MEMBERS.forEach(m => { state[m.name] = cmState[m.name] || null; });
  const empty = CM_MEMBERS.every(m => !state[m.name]);
  if (empty && !cmGreenDates.has(dk)) delete cmDrafts[dk];   // koi tick nahi + saved session bhi nahi: yaad rakhne ko kuch nahi
  else cmDrafts[dk] = { state, t: Date.now() };
  cmWriteDrafts();
}
function cmDraftDelete(dk) {
  if (cmDrafts[dk]) { delete cmDrafts[dk]; cmWriteDrafts(); }
}
// Is date ke yaad rakhe ticks main screen ke state me daalo. true = draft mila
function cmApplyDraft(dk) {
  const d = cmDrafts[dk];
  if (!d || !d.state) return false;
  CM_MEMBERS.forEach(m => {
    cmState[m.name] = d.state[m.name] || cmLegacyNames(m.name).map(k => d.state[k]).find(Boolean) || null;
  });
  return true;
}

// ── EDIT MODE (save title -> update) ──────────────────────────────────────────
function cmApplyEditUI() {
  const b = document.getElementById("cmSaveBtn");
  if (b) b.textContent = cmEditingDate ? "update" : "save title";
}
function cmLeaveEditIfOtherDate(dk) {
  if (cmEditingDate && cmEditingDate !== dk) { cmEditingDate = null; cmApplyEditUI(); }
}

// ── CONTROLS ──────────────────────────────────────────────────────────────────
function cmSetMode(mode) {
  cmMode = mode;
  document.getElementById("cmOnlineBtn").classList.toggle("active", mode === "online");
  document.getElementById("cmOfflineBtn").classList.toggle("active", mode === "offline");
}

function cmToggleAttPanel() {
  cmAttPanelVisible = !cmAttPanelVisible;
  const el = document.getElementById("cmAttBody");
  if (el) el.style.display = cmAttPanelVisible ? "flex" : "none";
}

// ── VIEW PAGE ─────────────────────────────────────────────────────────────────
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

  const dk    = cmSelectedDate || cmTodayKey();
  const title = (document.getElementById("cmEventInput").value.trim());

  document.getElementById("cmViewDate").textContent     = dk;
  document.getElementById("cmViewTitle").textContent    = title ? ` — ${title}` : "";
  document.getElementById("cmViewModeTag").textContent  = cmMode === "online" ? "Online" : "Offline";
  document.getElementById("cmViewPresentH").textContent = `✅ Present (${present.length})`;
  document.getElementById("cmViewHalfH").textContent    = `🟡 Half Present (${half.length})`;
  document.getElementById("cmViewAbsentH").textContent  = `❌ Absent (${absent.length})`;

  const renderCol = (id, arr) => {
    document.getElementById(id).innerHTML = arr.length
      ? arr.map(m => `<div class="cm-view-name" style="border-left:3px solid ${m.dark};padding-left:6px">${cmEsc(m.name)}</div>`).join("")
      : `<div class="cm-view-name" style="color:#bbb">—</div>`;
  };
  renderCol("cmViewPresent", present);
  renderCol("cmViewHalf",    half);
  renderCol("cmViewAbsent",  absent);

  document.getElementById("cm-main-view").style.display  = "none";
  document.getElementById("cm-view-page").style.display  = "block";
}

function cmBackToMain() {
  document.getElementById("cm-view-page").style.display  = "none";
  document.getElementById("cm-main-view").style.display  = "block";
  // view page saved record dikha rahi ho sakti hai; main screen par is date ke latest (yaad rakhe) ticks hi rahein
  if (cmApplyDraft(cmDraftDate())) cmRenderMembers(document.getElementById("cmSearchBar").value);
}

function cmEsc(t) {
  return String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Edit: is date ka saved data (naam, mode, saare statuses) main screen par khulta hai.
// Save dabane par wahi date-doc update hota hai (id = date), duplicate nahi banta.
function cmEditAttendance() {
  const dk = cmSelectedDate || cmTodayKey();
  const [y, mo] = dk.split("-").map(Number);
  cmCalYear = y; cmCalMonth = mo - 1;
  cmBuildCalendar();
  cmRenderMembers(document.getElementById("cmSearchBar").value);
  cmRenderSessionList(document.getElementById("cmSessionSearch").value);
  cmAttPanelVisible = true;
  const body = document.getElementById("cmAttBody");
  if (body) body.style.display = "flex";
  cmEditingDate = cmGreenDates.has(dk) ? dk : null;   // saved record hi "update" hota hai
  cmApplyEditUI();
  cmBackToMain();
  window.scrollTo(0, 0);
}

// ── DOWNLOAD ──────────────────────────────────────────────────────────────────
function cmDownloadAttendance() {
  const el = document.getElementById("cmViewCard");
  if (!el) return;
  if (typeof html2canvas !== "undefined") {
    html2canvas(el, { scale: 2, backgroundColor: "#f5f0eb" }).then(canvas => {
      const a = document.createElement("a");
      a.download = `core-members-${cmSelectedDate || cmTodayKey()}.png`;
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