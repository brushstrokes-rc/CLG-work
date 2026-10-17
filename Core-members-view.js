// ── core-members-view.js ──
// UPDATED: Multi-session support per date+mode. Each Save creates a NEW doc
// (id = yyyy-mm-dd_<mode>_cm_<stamp>). Old single-date docs (yyyy-mm-dd) are
// read as legacy sessions and displayed; they are never deleted automatically.
//
// Drafts are stored in localStorage keyed by a "draft session key" which is
// either the legacy doc id (for legacy docs being edited) or a pending draft key
// "yyyy-mm-dd|mode|draft". This ensures no two draft sessions double-count.
//
// window.cmGetMemberSessionsFor(name) is exposed so brushstroke.js can include
// Core Members sessions when computing combined attendance stats.

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
  { name: "Shaksham Katiyar",  color: "#d8e8ff", dark: "#2040a8" },
  { name: "Gauransh Rathore",  color: "#e8f5d0", dark: "#507a20" },
];

// ── STATE ──────────────────────────────────────────────────────────────────────
//
// cmAllSessions: array of ALL saved sessions loaded from Firestore.
//   Each entry: { id, dateKey, mode, title, members: [{name,status}], legacy }
//   "legacy" = true means old single-date doc (id === dateKey, e.g. "2026-09-15")
//
// cmDraftSessions: drafts not yet saved to Firestore (or unsaved edits to a
//   saved session). Stored in localStorage under CM_DRAFT_KEY.
//   Format: { [draftKey]: { dateKey, mode, title, state: {name: status|null}, t } }
//   draftKey is either:
//     - "yyyy-mm-dd|online|draft" / "yyyy-mm-dd|offline|draft"  (new unsaved session)
//     - the Firestore doc id                                     (unsaved edit to a saved session)
//
// cmActiveDraftKey: which draft is currently open on the main screen (null = none)
// cmActiveSessionId: if editing a saved session, its Firestore doc id (null = new draft)

let cmAllSessions = [];          // saved (Firestore) sessions
let cmDraftSessions = {};        // localStorage drafts
let cmActiveDraftKey = null;     // current draft key shown on main screen
let cmActiveSessionId = null;    // if editing a saved session, its id

let cmState = {};                // { name: "present"|"half"|null } — current screen state
let cmExtraMembers = [];         // members in a saved doc not in CM_MEMBERS
let cmMode = "online";
let cmAttPanelVisible = true;
let cmCalYear, cmCalMonth;
let cmGreenDates = new Set();    // dates that have ≥1 saved session
let cmSelectedDate = null;
let cmLoading = false;
let cmColorBook = {};
let cmColorNext = 0;

const CM_DRAFT_KEY = "bs-core-drafts-v2";

// ── DRAFT PERSISTENCE ──────────────────────────────────────────────────────────

function cmReadDrafts() {
  try {
    const raw = localStorage.getItem(CM_DRAFT_KEY);
    const o = raw ? JSON.parse(raw) : {};
    return (o && typeof o === "object") ? o : {};
  } catch (e) { return {}; }
}

function cmWriteDrafts() {
  try { localStorage.setItem(CM_DRAFT_KEY, JSON.stringify(cmDraftSessions)); }
  catch (e) { console.warn("CM drafts save failed:", e); }
}

// Save current screen state into the active draft slot
function cmDraftSaveCurrent() {
  if (!cmActiveDraftKey) return;
  const state = {};
  CM_MEMBERS.forEach(m => { state[m.name] = cmState[m.name] || null; });
  cmDraftSessions[cmActiveDraftKey] = {
    dateKey: cmSelectedDate || cmTodayKey(),
    mode: cmMode,
    title: (document.getElementById("cmEventInput") || {}).value || "",
    state,
    t: Date.now()
  };
  cmWriteDrafts();
}

function cmDraftDelete(key) {
  if (cmDraftSessions[key]) { delete cmDraftSessions[key]; cmWriteDrafts(); }
}

// ── ACTIVE DRAFT KEY HELPERS ───────────────────────────────────────────────────

// Key for a new (unsaved) draft on a given date+mode
function cmNewDraftKey(dateKey, mode) { return dateKey + "|" + mode + "|draft"; }

// Open a new blank draft for the given date+mode (or restore existing draft)
function cmOpenNewDraft(dateKey, mode) {
  cmActiveSessionId = null;
  cmActiveDraftKey = cmNewDraftKey(dateKey, mode);
  const draft = cmDraftSessions[cmActiveDraftKey];
  CM_MEMBERS.forEach(m => { cmState[m.name] = (draft && draft.state) ? (draft.state[m.name] || null) : null; });
  cmExtraMembers = [];
  if (document.getElementById("cmEventInput"))
    document.getElementById("cmEventInput").value = (draft && draft.title) ? draft.title : "";
}

// Open a saved session for editing (draft key = session id)
function cmOpenSavedForEdit(session) {
  cmActiveSessionId = session.id;
  cmActiveDraftKey = session.id;   // draft key = session id so edits are stored per-session
  // Restore any unsaved edits to this session, or fall back to saved data
  const draft = cmDraftSessions[session.id];
  if (draft) {
    CM_MEMBERS.forEach(m => { cmState[m.name] = draft.state ? (draft.state[m.name] || null) : null; });
    if (document.getElementById("cmEventInput"))
      document.getElementById("cmEventInput").value = draft.title || session.title || "";
  } else {
    cmLoadSessionIntoState(session);
  }
}

function cmLoadSessionIntoState(session) {
  CM_MEMBERS.forEach(m => { cmState[m.name] = null; });
  cmExtraMembers = [];
  (session.members || []).forEach(m => {
    if (!m || !m.name) return;
    if (Object.prototype.hasOwnProperty.call(cmState, m.name.replace ? m.name : ""))
      cmState[m.name] = m.status || null;
    else if (CM_MEMBERS.some(x => x.name === m.name))
      cmState[m.name] = m.status || null;
    else
      cmExtraMembers.push({ name: m.name, status: m.status || "absent" });
  });
  if (document.getElementById("cmEventInput"))
    document.getElementById("cmEventInput").value = session.title || "";
}

// ── HTML INJECTION ─────────────────────────────────────────────────────────────
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
          <input class="cm-event-input" id="cmEventInput" placeholder="title"
                 oninput="cmOnTitleInput()" />
          <span class="cm-if-any">(if any)</span>
        </div>

        <!-- Edit-mode banner (hidden by default) -->
        <div id="cmEditBanner" style="display:none;background:#fff3cd;color:#7a5000;padding:8px 14px;border-radius:8px;font-size:13px;margin:6px 0 0;text-align:center;">
          <span id="cmEditBannerText"></span>
          <button onclick="cmCancelEdit()" style="margin-left:12px;font-size:12px;padding:3px 10px;border:none;border-radius:6px;background:#e0a020;color:#fff;cursor:pointer;">Cancel</button>
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
        <button class="cm-bottom-btn" id="cmNewSessionBtn"
                onclick="cmStartNewSession()"
                style="display:none;background:#1565c0;">+ new session</button>
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

// ── INIT ───────────────────────────────────────────────────────────────────────
function initCoreMembers() {
  let container = document.getElementById("core-members-view");
  if (!container) { console.error('Core Members: id="core-members-view" not found'); return; }

  if (!container.dataset.cmReady) {
    cmInjectHTML(container);
    container.dataset.cmReady = "1";
  }

  cmDraftSessions = cmReadDrafts();

  const now = new Date();
  cmCalYear = now.getFullYear();
  cmCalMonth = now.getMonth();
  CM_MEMBERS.forEach(m => cmState[m.name] = null);
  cmExtraMembers = [];
  cmActiveDraftKey = null;
  cmActiveSessionId = null;
  cmMode = "online";
  cmAttPanelVisible = true;

  document.getElementById("cmOnlineBtn").classList.add("active");
  document.getElementById("cmOfflineBtn").classList.remove("active");
  document.getElementById("cmEventInput").value = "";
  document.getElementById("cmSearchBar").value = "";
  document.getElementById("cm-main-view").style.display = "block";
  document.getElementById("cm-view-page").style.display = "none";
  document.getElementById("cmAttBody").style.display = "flex";
  cmApplyEditUI();

  cmBuildCalendar();
  cmLoadAllSessions();
  cmRenderMembers("");
}

// ── CALENDAR ───────────────────────────────────────────────────────────────────
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

  for (let i = 0; i < firstDay; i++) html += `<div class="cm-cal-cell empty"></div>`;

  for (let d = 1; d <= daysInMonth; d++) {
    const dk = `${cmCalYear}-${String(cmCalMonth+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const isToday = d === today.getDate()
                 && cmCalMonth === today.getMonth()
                 && cmCalYear === today.getFullYear();
    // Green dot if saved session exists; yellow dot if only a draft exists
    const hasSaved = cmGreenDates.has(dk);
    const hasDraft = !hasSaved && (
      cmDraftSessions[cmNewDraftKey(dk, "online")] ||
      cmDraftSessions[cmNewDraftKey(dk, "offline")]
    );
    const cls = [
      "cm-cal-cell",
      isToday          ? "today"    : "",
      hasSaved         ? "has-data" : "",
      hasDraft         ? "has-draft": "",
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
  // Save any unsaved state from the current draft before switching
  if (cmActiveDraftKey) cmDraftSaveCurrent();

  cmSelectedDate = dk;
  cmBuildCalendar();

  // Update mode buttons to match existing draft or saved session for this date
  // Prefer online draft, then offline draft, then saved session mode
  const draftOn  = cmDraftSessions[cmNewDraftKey(dk, "online")];
  const draftOff = cmDraftSessions[cmNewDraftKey(dk, "offline")];
  if (draftOn) {
    cmMode = "online";
  } else if (draftOff) {
    cmMode = "offline";
  } else {
    // No draft: pick mode from first saved session on this date (if any)
    const saved = cmAllSessions.filter(s => s.dateKey === dk);
    if (saved.length) cmMode = saved[0].mode || "online";
    else cmMode = "online";
  }
  document.getElementById("cmOnlineBtn").classList.toggle("active", cmMode === "online");
  document.getElementById("cmOfflineBtn").classList.toggle("active", cmMode !== "online");

  // Open the draft for this date+mode (or blank if none)
  cmOpenNewDraft(dk, cmMode);
  cmApplyEditUI();
  cmRenderMembers(document.getElementById("cmSearchBar").value);
  cmRenderSessionList(document.getElementById("cmSessionSearch").value);
}

// ── FIRESTORE LOAD ─────────────────────────────────────────────────────────────
async function cmLoadAllSessions() {
  try {
    const snap = await getDocs(collection(db, "core-attendance"));
    cmAllSessions = [];
    cmGreenDates = new Set();

    snap.forEach(docSnap => {
      const id  = docSnap.id;
      const d   = docSnap.data();

      // Detect legacy docs: id is exactly "yyyy-mm-dd"
      const isLegacy = /^\d{4}-\d{2}-\d{2}$/.test(id);
      // New docs: id = "yyyy-mm-dd_<mode>_cm_<stamp>"
      const newMatch  = id.match(/^(\d{4}-\d{2}-\d{2})_(online|offline)_cm_[a-z0-9]+$/);

      let dateKey, mode;
      if (isLegacy) {
        dateKey = id;
        mode    = d.mode || "online";
      } else if (newMatch) {
        dateKey = newMatch[1];
        mode    = newMatch[2];
      } else {
        return;   // unknown format — skip
      }

      cmGreenDates.add(dateKey);
      cmAllSessions.push({
        id,
        dateKey,
        mode,
        title:   d.title   || "",
        members: d.members  || [],
        legacy:  isLegacy,
        savedAt: d.savedAt  || ""
      });
    });

    // Sort newest first
    cmAllSessions.sort((a, b) => {
      if (a.dateKey !== b.dateKey) return b.dateKey.localeCompare(a.dateKey);
      return (b.savedAt || "").localeCompare(a.savedAt || "");
    });

    // Assign stable colors (oldest first so adding new sessions doesn't shift colours)
    cmColorBook = {}; cmColorNext = 0;
    cmAllSessions.slice().reverse().forEach(x => cmColorFor(x.id));

    cmBuildCalendar();
    cmRenderSessionList("");
  } catch (e) { console.error("CM load sessions:", e); }
}

// ── SAVE / UPDATE ──────────────────────────────────────────────────────────────
async function cmSaveData() {
  const dk    = cmSelectedDate || cmTodayKey();
  const title = (document.getElementById("cmEventInput").value || "").trim();
  const members = CM_MEMBERS.map(m => ({ name: m.name, status: cmState[m.name] || "absent" }))
    .concat(cmExtraMembers.map(m => ({ name: m.name, status: m.status || "absent" })));
  const payload = { date: dk, title, mode: cmMode, members, savedAt: new Date().toISOString() };

  if (cmActiveSessionId) {
    // ── UPDATE existing saved session ──
    try {
      await setDoc(doc(db, "core-attendance", cmActiveSessionId), payload, { merge: true });
      // Update in-memory record
      const idx = cmAllSessions.findIndex(s => s.id === cmActiveSessionId);
      if (idx >= 0) Object.assign(cmAllSessions[idx], { title, mode: cmMode, members });
      // Remove draft for this session id (now matches saved)
      cmDraftDelete(cmActiveSessionId);
      cmActiveDraftKey = cmActiveSessionId;  // still in edit mode of same session
      cmApplyEditUI();
      cmRenderSessionList(document.getElementById("cmSessionSearch").value);
      cmPushToSheets(payload);
      alert("✅ Attendance updated!");
    } catch (e) { console.error("CM update:", e); alert("❌ Update failed: " + e.message); }
    return;
  }

  // ── SAVE as a NEW session doc ──
  const stamp = Date.now();
  const newId = dk + "_" + cmMode + "_cm_" + stamp.toString(36);
  try {
    await setDoc(doc(db, "core-attendance", newId), payload);
    // Remove the new-draft slot (data is now in Firestore)
    const draftKey = cmNewDraftKey(dk, cmMode);
    cmDraftDelete(draftKey);

    // If a legacy doc existed for this date, it is left untouched in Firestore.
    // We simply add the new session alongside it.
    cmGreenDates.add(dk);
    const existing = cmAllSessions.find(s => s.id === newId);
    if (!existing) cmAllSessions.unshift({ id: newId, dateKey: dk, mode: cmMode, title, members, savedAt: payload.savedAt });
    cmColorFor(newId);

    // Switch to editing THIS new saved session
    cmActiveSessionId = newId;
    cmActiveDraftKey  = newId;
    cmApplyEditUI();
    cmBuildCalendar();
    cmRenderSessionList(document.getElementById("cmSessionSearch").value);
    cmPushToSheets(payload);
    alert("✅ Attendance saved!");
  } catch (e) { console.error("CM save:", e); alert("❌ Save failed: " + e.message); }
}

// ── EDIT / CANCEL ──────────────────────────────────────────────────────────────
function cmApplyEditUI() {
  const saveBtn     = document.getElementById("cmSaveBtn");
  const banner      = document.getElementById("cmEditBanner");
  const bannerText  = document.getElementById("cmEditBannerText");
  const newSessBtn  = document.getElementById("cmNewSessionBtn");
  if (!saveBtn || !banner) return;

  const isEditing = !!cmActiveSessionId;
  saveBtn.textContent = isEditing ? "update" : "save title";
  if (isEditing) {
    const s = cmAllSessions.find(x => x.id === cmActiveSessionId);
    bannerText.textContent = "Editing: " + (s ? (s.title || "(no title)") + " · " + s.dateKey : cmActiveSessionId);
    banner.style.display = "block";
    if (newSessBtn) newSessBtn.style.display = "inline-block";
  } else {
    banner.style.display = "none";
    if (newSessBtn) newSessBtn.style.display = "none";
  }
}

// Cancel edit — go back to the draft for current date+mode
function cmCancelEdit() {
  cmActiveSessionId = null;
  cmActiveDraftKey  = cmNewDraftKey(cmSelectedDate || cmTodayKey(), cmMode);
  // Restore draft state if any
  const draft = cmDraftSessions[cmActiveDraftKey];
  CM_MEMBERS.forEach(m => { cmState[m.name] = (draft && draft.state) ? (draft.state[m.name] || null) : null; });
  cmExtraMembers = [];
  if (document.getElementById("cmEventInput"))
    document.getElementById("cmEventInput").value = (draft && draft.title) ? draft.title : "";
  cmApplyEditUI();
  cmRenderMembers(document.getElementById("cmSearchBar").value);
}

// Start a brand-new session on the current date (when already editing a saved one)
function cmStartNewSession() {
  if (cmActiveDraftKey) cmDraftSaveCurrent();  // save any edits to the session being edited
  cmActiveSessionId = null;
  const dk = cmSelectedDate || cmTodayKey();
  cmActiveDraftKey = cmNewDraftKey(dk, cmMode);
  const draft = cmDraftSessions[cmActiveDraftKey];
  CM_MEMBERS.forEach(m => { cmState[m.name] = (draft && draft.state) ? (draft.state[m.name] || null) : null; });
  cmExtraMembers = [];
  if (document.getElementById("cmEventInput"))
    document.getElementById("cmEventInput").value = (draft && draft.title) ? draft.title : "";
  cmApplyEditUI();
  cmRenderMembers(document.getElementById("cmSearchBar").value);
}

// ── CONTROLS ───────────────────────────────────────────────────────────────────
function cmSetMode(mode) {
  if (cmActiveSessionId) return;  // mode locked while editing a saved session
  // Save current draft before switching mode
  if (cmActiveDraftKey) cmDraftSaveCurrent();
  cmMode = mode;
  document.getElementById("cmOnlineBtn").classList.toggle("active", mode === "online");
  document.getElementById("cmOfflineBtn").classList.toggle("active", mode === "offline");
  // Open draft for new mode
  const dk = cmSelectedDate || cmTodayKey();
  cmOpenNewDraft(dk, mode);
  cmRenderMembers(document.getElementById("cmSearchBar").value);
}

function cmOnTitleInput() {
  if (cmActiveDraftKey) {
    const slot = cmDraftSessions[cmActiveDraftKey];
    if (slot) slot.title = (document.getElementById("cmEventInput").value || "");
    cmWriteDrafts();
  }
}

function cmToggleAttPanel() {
  cmAttPanelVisible = !cmAttPanelVisible;
  const el = document.getElementById("cmAttBody");
  if (el) el.style.display = cmAttPanelVisible ? "flex" : "none";
}

function cmTodayKey() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}-${String(n.getDate()).padStart(2,"0")}`;
}

// ── MEMBER RENDER ──────────────────────────────────────────────────────────────
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

    // Name — clickable for stats
    const nameDiv = document.createElement("div");
    nameDiv.className = "cm-member-name";
    nameDiv.textContent = m.name;
    nameDiv.style.cursor = "pointer";
    nameDiv.title = "Click to see attendance stats";
    nameDiv.addEventListener("click", function (e) {
      e.stopPropagation();
      if (typeof window.bsShowStudentStats === "function") window.bsShowStudentStats(m.name);
    });

    div.innerHTML = `
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
    div.insertBefore(nameDiv, div.firstChild);
    list.appendChild(div);
  });
}

function cmTick(name, type) {
  if (cmLoading) return;
  cmState[name] = cmState[name] === type ? null : type;
  // Ensure draft key exists before saving
  if (!cmActiveDraftKey) {
    cmActiveDraftKey = cmNewDraftKey(cmSelectedDate || cmTodayKey(), cmMode);
  }
  cmDraftSaveCurrent();
  cmBuildCalendar();   // refresh draft dot on calendar
  cmRenderMembers(document.getElementById("cmSearchBar").value);
}

function cmClearAll() {
  if (cmLoading) return;
  if (!confirm("Clear all attendance marks?")) return;
  CM_MEMBERS.forEach(m => cmState[m.name] = null);
  if (cmActiveDraftKey) cmDraftSaveCurrent();
  cmBuildCalendar();
  cmRenderMembers(document.getElementById("cmSearchBar").value);
}

// ── VIEW PAGE ──────────────────────────────────────────────────────────────────
function cmOpenViewPage() {
  const present = [], half = [], absent = [];
  CM_MEMBERS.forEach(m => {
    if      (cmState[m.name] === "present") present.push(m);
    else if (cmState[m.name] === "half")    half.push(m);
    else                                     absent.push(m);
  });
  cmExtraMembers.forEach(m => {
    const e = { name: m.name, dark: "#999" };
    if      (m.status === "present") present.push(e);
    else if (m.status === "half")    half.push(e);
    else                             absent.push(e);
  });

  const dk    = cmSelectedDate || cmTodayKey();
  const title = (document.getElementById("cmEventInput").value || "").trim();

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

// Edit button on view page: loads the session that view page is showing
function cmEditAttendance() {
  // If viewing a saved session (cmActiveSessionId is set), go back and keep edit mode
  // If viewing a draft, just go back (draft is already editable on main screen)
  cmBackToMain();
  window.scrollTo(0, 0);
}

// ── SESSION LIST (right panel) ─────────────────────────────────────────────────
function cmRenderSessionList(filter) {
  const ul = document.getElementById("cmSessionList");
  if (!ul) return;
  ul.innerHTML = "";
  const lf = filter.toLowerCase();

  // Combine saved sessions + draft sessions for display
  const items = [];

  // Saved sessions
  cmAllSessions.forEach(s => {
    if (s.dateKey.includes(lf) || (s.title||"").toLowerCase().includes(lf) || s.mode.includes(lf))
      items.push({ type: "saved", s });
  });

  // Draft sessions (only those NOT matching a saved session being edited)
  Object.keys(cmDraftSessions).forEach(dk => {
    const draft = cmDraftSessions[dk];
    if (!draft) return;
    // Skip if this draft key is the same as a saved session id (it's an unsaved edit)
    if (cmAllSessions.some(s => s.id === dk)) return;
    const label = (draft.title || "(draft)").toLowerCase();
    const dateKey = draft.dateKey || "";
    if (lf && !dateKey.includes(lf) && !label.includes(lf) && !(draft.mode||"").includes(lf)) return;
    items.push({ type: "draft", dk, draft });
  });

  if (!items.length) {
    ul.innerHTML = `<div class="cm-no-sessions">No sessions yet</div>`;
    return;
  }

  // Sort: saved newest first, then drafts
  items.sort((a, b) => {
    const aDate = a.type === "saved" ? a.s.dateKey : a.draft.dateKey || "";
    const bDate = b.type === "saved" ? b.s.dateKey : b.draft.dateKey || "";
    if (aDate !== bDate) return bDate.localeCompare(aDate);
    return 0;
  });

  items.forEach(item => {
    const div = document.createElement("div");

    if (item.type === "saved") {
      const s = item.s;
      const isActive = cmActiveSessionId === s.id;
      div.className = "cm-session-item" + (isActive ? " active" : "");
      div.style.setProperty("--sc", cmColorFor(s.id));
      div.onclick = async () => {
        // Save current draft first
        if (cmActiveDraftKey) cmDraftSaveCurrent();
        cmSelectedDate = s.dateKey;
        cmMode = s.mode;
        const [y, mo] = s.dateKey.split("-").map(Number);
        cmCalYear = y; cmCalMonth = mo - 1;
        cmBuildCalendar();
        document.getElementById("cmOnlineBtn").classList.toggle("active", cmMode === "online");
        document.getElementById("cmOfflineBtn").classList.toggle("active", cmMode !== "online");

        // Load into view page (ignoreDraft: show saved data)
        cmLoading = true;
        try {
          const docSnap = await getDoc(doc(db, "core-attendance", s.id));
          cmExtraMembers = [];
          CM_MEMBERS.forEach(m => cmState[m.name] = null);
          if (docSnap.exists()) {
            const d = docSnap.data();
            (d.members || []).forEach(m => {
              if (!m || !m.name) return;
              if (CM_MEMBERS.some(x => x.name === m.name)) cmState[m.name] = m.status || null;
              else cmExtraMembers.push({ name: m.name, status: m.status || "absent" });
            });
            if (document.getElementById("cmEventInput"))
              document.getElementById("cmEventInput").value = d.title || "";
          }
          cmActiveSessionId = s.id;
          cmActiveDraftKey  = s.id;
          cmApplyEditUI();
          cmRenderSessionList(document.getElementById("cmSessionSearch").value);
          cmOpenViewPage();
        } catch (e) { alert("❌ Couldn't load session."); }
        finally { cmLoading = false; }
      };

      const text = document.createElement("div");
      text.className = "cm-session-text";
      const name = document.createElement("span");
      name.className = "cm-session-name";
      name.textContent = s.title || "(no title)";
      const meta = document.createElement("span");
      meta.className = "cm-session-date";
      meta.textContent = `${s.dateKey} · ${s.mode}${s.legacy ? " · legacy" : ""}`;
      text.appendChild(name);
      text.appendChild(meta);

      const del = document.createElement("button");
      del.type = "button";
      del.className = "cm-session-del";
      del.title = "Delete";
      del.textContent = "🗑️";
      del.onclick = (e) => { e.stopPropagation(); cmConfirmDelete(s); };

      div.appendChild(text);
      div.appendChild(del);

    } else {
      // Draft session entry
      const { dk, draft } = item;
      const isActive = cmActiveDraftKey === dk && !cmActiveSessionId;
      div.className = "cm-session-item" + (isActive ? " active" : "");
      div.style.cssText = "border-left:3px solid #e0a020;opacity:.85;";

      div.onclick = () => {
        if (cmActiveDraftKey) cmDraftSaveCurrent();
        cmActiveSessionId = null;
        cmActiveDraftKey  = dk;
        cmSelectedDate    = draft.dateKey || cmTodayKey();
        cmMode            = draft.mode || "online";
        const [y, mo] = cmSelectedDate.split("-").map(Number);
        cmCalYear = y; cmCalMonth = mo - 1;
        cmBuildCalendar();
        document.getElementById("cmOnlineBtn").classList.toggle("active", cmMode === "online");
        document.getElementById("cmOfflineBtn").classList.toggle("active", cmMode !== "online");
        CM_MEMBERS.forEach(m => { cmState[m.name] = (draft.state ? (draft.state[m.name] || null) : null); });
        cmExtraMembers = [];
        if (document.getElementById("cmEventInput"))
          document.getElementById("cmEventInput").value = draft.title || "";
        cmApplyEditUI();
        cmRenderMembers(document.getElementById("cmSearchBar").value);
        cmRenderSessionList(document.getElementById("cmSessionSearch").value);
      };

      const text = document.createElement("div");
      text.className = "cm-session-text";
      const name = document.createElement("span");
      name.className = "cm-session-name";
      name.textContent = (draft.title || "(draft)") + " 📝";
      const meta = document.createElement("span");
      meta.className = "cm-session-date";
      meta.textContent = `${draft.dateKey || "?"} · ${draft.mode || "?"}`;
      text.appendChild(name);
      text.appendChild(meta);

      const del = document.createElement("button");
      del.type = "button";
      del.className = "cm-session-del";
      del.title = "Delete draft";
      del.textContent = "🗑️";
      del.onclick = (e) => {
        e.stopPropagation();
        if (!confirm("Delete this draft?")) return;
        cmDraftDelete(dk);
        if (cmActiveDraftKey === dk) {
          cmActiveDraftKey = null;
          cmActiveSessionId = null;
          CM_MEMBERS.forEach(m => cmState[m.name] = null);
          cmExtraMembers = [];
          if (document.getElementById("cmEventInput"))
            document.getElementById("cmEventInput").value = "";
          cmApplyEditUI();
          cmRenderMembers(document.getElementById("cmSearchBar").value);
        }
        cmBuildCalendar();
        cmRenderSessionList(document.getElementById("cmSessionSearch").value);
      };

      div.appendChild(text);
      div.appendChild(del);
    }

    ul.appendChild(div);
  });
}

// ── SESSION COLORS ─────────────────────────────────────────────────────────────
const CM_SESSION_COLORS = [
  "#c62828","#1565c0","#2e7d32","#d84315","#6a1b9a",
  "#00838f","#ad1457","#a67c00","#283593","#558b2f","#6d4c41"
];
function cmPaletteColor(i) {
  if (i < CM_SESSION_COLORS.length) return CM_SESSION_COLORS[i];
  const k = i - CM_SESSION_COLORS.length;
  const hue = Math.round(((k * 137.508) + 20) % 360 * 10) / 10;
  const light = [38, 30, 34][Math.floor(k / 12) % 3];
  return `hsl(${hue}, 72%, ${light}%)`;
}
function cmColorFor(id) {
  if (!cmColorBook[id]) cmColorBook[id] = cmPaletteColor(cmColorNext++);
  return cmColorBook[id];
}

// ── DELETE SESSION ─────────────────────────────────────────────────────────────
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

  const q  = document.createElement("p"); q.className = "cm-confirm-text";
  q.textContent = "Are you sure you want to delete this session?";
  const sub = document.createElement("p"); sub.className = "cm-confirm-sub";
  sub.textContent = (s.title || "(no title)") + " · " + s.dateKey;

  const btns = document.createElement("div"); btns.className = "cm-confirm-btns";
  const yes  = document.createElement("button"); yes.type = "button"; yes.className = "cm-confirm-yes"; yes.textContent = "Yes";
  const no   = document.createElement("button"); no.type  = "button"; no.className  = "cm-confirm-no";  no.textContent  = "No";
  btns.appendChild(yes); btns.appendChild(no);

  box.appendChild(q); box.appendChild(sub); box.appendChild(btns);
  overlay.appendChild(box);

  const onKey = (e) => { if (e.key === "Escape") close(); };
  function close() { document.removeEventListener("keydown", onKey); overlay.remove(); }
  no.onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  yes.onclick = async () => {
    yes.disabled = true; no.disabled = true;
    await cmDeleteSession(s);
    close();
  };
  document.addEventListener("keydown", onKey);
  document.body.appendChild(overlay);
  no.focus();
}

async function cmDeleteSession(s) {
  try {
    await deleteDoc(doc(db, "core-attendance", s.id));
  } catch (e) {
    console.error("CM delete:", e);
    alert("❌ Delete failed: " + e.message);
    return;
  }
  cmAllSessions = cmAllSessions.filter(x => x.id !== s.id);
  // Only clear green dot if no more sessions for this date
  if (!cmAllSessions.some(x => x.dateKey === s.dateKey)) cmGreenDates.delete(s.dateKey);
  delete cmColorBook[s.id];
  if (cmActiveSessionId === s.id) {
    cmActiveSessionId = null;
    cmActiveDraftKey  = cmNewDraftKey(s.dateKey, s.mode);
    CM_MEMBERS.forEach(m => cmState[m.name] = null);
    cmExtraMembers = [];
    if (document.getElementById("cmEventInput")) document.getElementById("cmEventInput").value = "";
    cmApplyEditUI();
    cmRenderMembers(document.getElementById("cmSearchBar").value);
  }
  cmBuildCalendar();
  cmRenderSessionList(document.getElementById("cmSessionSearch").value);
}

// ── DOWNLOAD ───────────────────────────────────────────────────────────────────
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

// ── GOOGLE SHEETS ──────────────────────────────────────────────────────────────
async function cmPushToSheets(payload) {
  if (!CM_SHEETS_URL || CM_SHEETS_URL.includes("YOUR_APPS")) return;
  try {
    await fetch(CM_SHEETS_URL, {
      method: "POST", mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "core-members", ...payload })
    });
  } catch (e) { console.warn("Sheets push failed:", e); }
}

// ── STATS INTEGRATION (called by brushstroke.js bsGetStudentStats) ─────────────
//
// Returns an array of status strings ("present"|"half"|"absent") — one per
// Core Members session (saved + draft) — for the given member name.
// brushstroke.js loops over this array to count the totals.
window.cmGetMemberSessionsFor = function (name) {
  const statuses = [];
  const counted  = new Set();   // avoid double-counting

  // 1. Saved sessions (Firestore)
  cmAllSessions.forEach(s => {
    counted.add(s.id);
    const member = (s.members || []).find(m => m.name === name);
    statuses.push(member ? (member.status || "absent") : "absent");
  });

  // 2. Draft sessions (localStorage) — skip if draft key matches a saved session id
  Object.keys(cmDraftSessions).forEach(dk => {
    if (counted.has(dk)) return;   // this is an unsaved edit to a saved session — skip
    const draft = cmDraftSessions[dk];
    if (!draft) return;
    const status = (draft.state && draft.state[name]) ? draft.state[name] : "absent";
    statuses.push(status);
  });

  return statuses;
};

// ── EXPOSE GLOBALS ─────────────────────────────────────────────────────────────
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
window.cmStartNewSession    = cmStartNewSession;
window.cmCancelEdit         = cmCancelEdit;
window.cmOnTitleInput       = cmOnTitleInput;