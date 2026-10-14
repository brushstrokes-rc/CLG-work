// ── core-members-view.js ──
import { getApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, getDocs }
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
  { name: "Shaksham Katiyar",  color: "#d8e8ff", dark: "#2040a8" },
  { name: "Gauransh Rathore",  color: "#e8f5d0", dark: "#507a20" },
];

// ── STATE ────────────────────────────────────────────────────────────────────
let cmState = {};
let cmMode = "online";
let cmAttPanelVisible = true;
let cmCalYear, cmCalMonth;
let cmGreenDates = new Set();
let cmSelectedDate = null;
let cmAllSessions = [];
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
        <button class="cm-bottom-btn" onclick="cmSaveData()">save title</button>
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
    cmBuildCalendar();
    cmRenderSessionList("");
  } catch (e) { console.error("CM load sessions:", e); }
}

async function cmLoadDateData(dk) {
  cmExtraMembers = [];   // pichli date ke extra members kabhi nayi date me na jayein
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
        if (Object.prototype.hasOwnProperty.call(cmState, m.name)) cmState[m.name] = m.status;
        else cmExtraMembers.push({ name: m.name, status: m.status || "absent" });
      });
    } else {
      document.getElementById("cmEventInput").value = "";   // nayi date: purani date ka title na bache
    }
    cmRenderMembers(document.getElementById("cmSearchBar").value);
    return true;
  } catch (e) { console.error("CM load date:", e); return false; }
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
    cmSelectedDate = dk;
    cmBuildCalendar();
    const ex = cmAllSessions.find(s => s.dateKey === dk);
    if (ex) { ex.title = title; ex.mode = cmMode; }
    else cmAllSessions.unshift({ dateKey: dk, title, mode: cmMode });
    cmRenderSessionList(document.getElementById("cmSessionSearch").value);
    cmPushToSheets(payload);
    alert("✅ Attendance saved!");
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
      <div class="cm-member-name">${m.name}</div>
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
    list.appendChild(div);
  });
}

function cmTick(name, type) {
  cmState[name] = cmState[name] === type ? null : type;
  cmRenderMembers(document.getElementById("cmSearchBar").value);
}

function cmClearAll() {
  if (!confirm("Clear all attendance marks?")) return;
  CM_MEMBERS.forEach(m => cmState[m.name] = null);
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
    div.onclick = async () => {
      cmSelectedDate = s.dateKey;
      const [y, mo] = s.dateKey.split("-").map(Number);
      cmCalYear = y; cmCalMonth = mo - 1;
      cmBuildCalendar();
      cmRenderSessionList(document.getElementById("cmSessionSearch").value);
      // saved doc load karke View Attendance format me dikhao (Download as Image neeche), Edit se main screen par
      if (await cmLoadDateData(s.dateKey)) cmOpenViewPage();
      else alert("❌ Couldn't load this session. Please try again.");
    };
    div.innerHTML = `${s.title||"(no title)"}<span class="cm-session-date">${s.dateKey} · ${s.mode}</span>`;
    ul.appendChild(div);
  });
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