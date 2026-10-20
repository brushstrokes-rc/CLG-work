import { initializeApp,getApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth, initializeAuth, inMemoryPersistence, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, addDoc, collection, query, where, getDocs, onSnapshot, deleteDoc, deleteField }
  from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDXdAA-gK43ZC6BlspWYrB9_Yk3nO0tLnY",
  authDomain: "brushstrokes-cc86c.firebaseapp.com",
  projectId: "brushstrokes-cc86c",
  storageBucket: "brushstrokes-cc86c.firebasestorage.app",
  messagingSenderId: "684392264786",
  appId: "1:684392264786:web:155f9a259161c036995b8b"
};  
const app = initializeApp(firebaseConfig);
// Login session sirf memory me rehta hai (browser storage me save nahi hota), isliye
// har reload / dobara open par login page aata hai. Kuch bhi Firestore ya Auth me delete nahi hota.
const auth = initializeAuth(app, { persistence: inMemoryPersistence });
const db = getFirestore(getApp());
const toEmail = u => `${u.trim().toLowerCase().replace(/\s+/g, "")}@brushstrokes.app`;
// ---------- Account storage (one account per device) ----------


const courses = [
  "B.A. (Hons.) Applied Psychology",
  "B.A. (Hons.) Economics",
  "B.A. (Hons.) English",
  "B.A. (Hons.) Hindi",
  "B.A. (Hons.) Philosophy",
  "B.A. (Hons.) Political Science",
  "B.A. Programme (Commerce + Economics)",
  "B.A. Programme (Commerce + Mathematics)",
  "B.A. Programme (Economics + Psychology)",
  "B.A. Programme (Hindi + History)",
  "B.A. Programme (Hindi + Political Science)",
  "B.A. Programme (History + Philosophy)",
  "B.A. Programme (History + Political Science)",
  "B.A. Programme (Philosophy + Political Science)",
  "B.A. Programme (Political Science + Psychology)",
  "B.Com.",
  "B.Com. (Hons.)",
  "B.Sc. (Hons.) Computer Science",
  "B.Sc. (Hons.) Environmental Sciences",
  "B.Sc. (Hons.) Mathematics",
  "B.Sc. (Hons.) Statistics",
  "B.Voc. Banking, Financial Services and Insurance",
  "B.Voc. Software Development",
  "Bachelor of Management Studies (BMS)"
];

// Student list — edit this array to add/remove students
const students = [
  "Rupam Nama",
  "Riddhi Agarwal",
  "Prakriti Kumari",
  "Asmi Goel",
  "Prajjaval Kumar",
  "Ankita",
  "Jiya",
  "Srishti Kukreti",
  "Harshita Aalok",
  "Priya Bharti",
  "Anuradha",
  "Arzoo",
  "Palak Sharma",
  "Nandni",
  "Sagar Sharma",
  "Lisha Kumari",
  "Pragya Mishra",
  "Nandini Singh",
  "Gaurika Bhatia",
  "Parinita Agarwal",
  "Saksham Katiyar",
  "Bhumika Adhikari",
  "Aditti",
  "Mohua Chawdhary",
  "Karmveer",
  "Manya Agrawal",
  "Ipshita Chowdhury",
  "Bhawna Katariya",
  "Divya Rawat",
  "Janhavi Sharma",
  "Madhumita Maan",
  "Trisha",
  "Rudransh Tilwankar",
  "Maitree Nirwal",
  "Arsh",
  "Shahnaz Ahmad",
  "Kanishka Singh",
  "Ayush Shekhar",
  "Poorva Gupta",
  "Afsha Hussain",
  "Ananta Agrawal",
  "Vaishali Sharma",
  "Amarjeet Kumar",
  "Rheenyi",
  "Shivani",
  "Saurabh Bhandari",
  "Deepak Sharma",
  "Manya Singla",
  "Vandana",
  "Hiten Singh",
  "Manvi Singh",
  "Gauransh Rathore",
  "Sanjana",
  "Sumit Kumar",
  "Nayab",
  "Asrah Ansari",
  "Raj Kuldeep",
  "Ayushman Singh"
];

// Profile page ke liye (sirf padhne wali copy): course list aur Main attendance ke naam
window.bsCourses = courses.slice();
window.bsStudentNames = students.slice();

// ---------- Attendance data ----------
// Firestore ki wahi "attendance" collection (isliye rules me kuch badalna nahi padega):
//   "2026-09-29_offline" / "2026-09-29_online"  -> table me abhi jo attendance mark ho rahi hai (draft, autosave)
//   "2026-09-29_online_ev_xxxx"                 -> Save dabane par bana EK event (ek din me jitne chaho):
//                                                  { "Rupam Nama": "present" | "half", _title, _createdAt }
//   "2026-09-24" (purana format, bina mode ke)  -> Offline draft maana jata hai
// Naam ek jaisa rakhne ke liye: purani spelling jo Firestore ke purane records me hai -> sahi naam.
// Purane records delete/badle nahi jaate; padhte waqt naya naam maana jata hai.
const NAME_ALIASES = { "Shahnaz": "Shahnaz Ahmad", "Shaksham Katiyar": "Saksham Katiyar", "Manya": "Manya Singla", "Manya singla": "Manya Singla" };
const NAME_ALIASES_NORM = {};   // capital / space ka farq nahi: "manya", "Manya  Singla" bhi pehchane jaate hain
Object.keys(NAME_ALIASES).forEach(function (k) { NAME_ALIASES_NORM[k.toLowerCase().replace(/\s+/g, "")] = NAME_ALIASES[k]; });
function canonName(n) {
  if (Object.prototype.hasOwnProperty.call(NAME_ALIASES, n)) return NAME_ALIASES[n];
  const k = String(n == null ? "" : n).toLowerCase().replace(/\s+/g, "");
  return Object.prototype.hasOwnProperty.call(NAME_ALIASES_NORM, k) ? NAME_ALIASES_NORM[k] : n;
}
function legacyKeysFor(n) { return Object.keys(NAME_ALIASES).filter(function (k) { return NAME_ALIASES[k] === n; }); }
let rawDocs = {};            // docId -> Firestore data
let sessions = {};           // drafts: "yyyy-mm-dd|offline" -> { id, date, mode, title, marks, createdAt }
let eventDocs = [];          // Save se bane events: { id, date, mode, title, marks, createdAt }
let currentMode = "offline"; // left wale Offline / Online button se badalta hai
let unsubscribeAttendance = null;
let titleDrafts = {};        // user ka type kiya (abhi unsaved) event naam: "yyyy-mm-dd|mode" -> text. Tap se ya snapshot se nahi hatta
let editing = null;          // Edit mode ka working copy: { id, date, mode, title, createdAt, orig, marks } (null = normal mode)

function sessionKey(dateStr, mode) { return dateStr + "|" + mode; }
function modeLabel(mode) { return mode === "online" ? "Online" : "Offline"; }

function makeSession(id, date, mode) {
  const d = rawDocs[id] || {};
  const marks = {};
  Object.keys(d).forEach(function (k) {
    if (d[k] === "present" || d[k] === "half") {
      const nk = canonName(k);   // purani spelling ho to naya naam; naya naam doc me ho to wahi jeetta hai
      if (nk === k || !(nk in d)) marks[nk] = d[k];
    }
  });
  return {
    id: id, date: date, mode: mode,
    title: typeof d._title === "string" ? d._title : "",
    marks: marks,
    createdAt: typeof d._createdAt === "number" ? d._createdAt : 0
  };
}

function buildSessions() {
  sessions = {};
  eventDocs = [];
  const legacy = [];
  Object.keys(rawDocs).forEach(function (id) {
    const ev = id.match(/^(\d{4}-\d{2}-\d{2})_(offline|online)_ev_[a-z0-9]+$/);
    if (ev) { eventDocs.push(makeSession(id, ev[1], ev[2])); return; }
    const m = id.match(/^(\d{4}-\d{2}-\d{2})(?:_(offline|online))?$/);
    if (!m) return;
    if (!m[2]) { legacy.push(id); return; }
    sessions[sessionKey(m[1], m[2])] = makeSession(id, m[1], m[2]);
  });
  // purane docs (bina mode): Offline maano, agar us date ka naya offline doc nahi hai
  legacy.forEach(function (id) {
    const k = sessionKey(id, "offline");
    if (!sessions[k]) sessions[k] = makeSession(id, id, "offline");
  });
}

// write karte waqt kaunsa draft doc use hoga (purana doc ho to wahi, warna naya "date_mode")
function docIdFor(dateStr, mode) {
  const s = sessions[sessionKey(dateStr, mode)];
  return s ? s.id : dateStr + "_" + mode;
}

function currentSession() {
  return sessions[sessionKey(toISO(selectedDate), currentMode)];
}

// Table jis session ko dikha raha hai: Edit mode me event ka working copy, warna draft
function activeSession() {
  if (editing) {
    return { id: editing.id, date: editing.date, mode: editing.mode, title: editing.title, marks: editing.marks, createdAt: editing.createdAt };
  }
  return currentSession();
}

function startAttendanceListener() {
  if (unsubscribeAttendance) return;
  unsubscribeAttendance = onSnapshot(
    collection(db, "attendance"),
    function (snap) {
      rawDocs = {};
      snap.forEach(function (d) { rawDocs[d.id] = d.data(); });
      buildSessions();
      refreshTableForDate();
      renderEventsPanel();
      syncTitleInput(false);
      if (typeof window.bsRenderCalendar === "function") window.bsRenderCalendar();
    },
    function (err) {
      // permission-denied: ye user "admins" collection me nahi hai
      console.error("Attendance access denied:", err.code);
      unsubscribeAttendance = null;
    }
  );
}
// Currently selected date (defaults to today)
let selectedDate = new Date();

// ---------- Element references ----------
const loginSection = document.getElementById("loginSection");
const dashboardSection = document.getElementById("dashboardSection");
const loginForm = document.getElementById("loginForm");
const message = document.getElementById("message");

const dateBtn = document.getElementById("dateBtn");
const dateInput = document.getElementById("dateInput");

const attendanceBtn = document.getElementById("attendanceBtn");
const attendanceSection = document.getElementById("attendanceSection");
const attendanceBody = document.getElementById("attendanceBody");
const viewBtn = document.getElementById("viewBtn");
const saveDataBox = document.getElementById("saveDataBox");
const saveDataTitle = document.getElementById("saveDataTitle");
const presentListEl = document.getElementById("presentList");
const halfListEl = document.getElementById("halfList");
const clearAllBtn = document.getElementById("clearAllBtn");

// Offline / Online + event name
const modeOffBtn = document.getElementById("modeOffBtn");
const modeOnBtn = document.getElementById("modeOnBtn");
const editTitleBtn = document.getElementById("editTitleBtn");
const titleRow = document.getElementById("titleRow");
const titleIn = document.getElementById("titleIn");
const saveTitleBtn = document.getElementById("saveTitleBtn");
const titleNote = document.getElementById("titleNote");

// Events panel (right side)
const atCount = document.getElementById("atCount");
const atSearch = document.getElementById("atSearch");
const atSuggest = document.getElementById("atSuggest");
const atList = document.getElementById("atList");
const atEmpty = document.getElementById("atEmpty");

// ---------- Date helpers ----------
function pad(n) {
  return n.toString().padStart(2, "0");
}

// yyyy-mm-dd — required format for the native <input type="date">
function toISO(date) {
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
}

// dd/mm/yy — what the button shows
function toDisplay(date) {
  const yy = date.getFullYear().toString().slice(-2);
  return pad(date.getDate()) + "/" + pad(date.getMonth() + 1) + "/" + yy;
}

// ---------- Login: only the login card shows on page load ----------
loginForm.addEventListener("submit", async function (e) {
  e.preventDefault();
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  try {
    await signInWithEmailAndPassword(auth, toEmail(username), password);
    appLaunched = true;
    try { localStorage.setItem("bs-had-account", "1"); } catch(e) {}
    message.textContent = "Login successful!";
    message.className = "success";
    loginSection.classList.add("hidden");
    startAttendanceListener();
    window.dispatchEvent(new Event("bs:enter"));
  } catch (err) {
    message.textContent = "Invalid username or password.";
    message.className = "error";
  }
});

// ---------- Date picker (calendar grid) ----------

const MONTHS_CAL = ["January","February","March","April","May","June",
                    "July","August","September","October","November","December"];
const DAYS_CAL   = ["Su","Mo","Tu","We","Th","Fr","Sa"];

let calYear  = selectedDate.getFullYear();
let calMonth = selectedDate.getMonth();
let calOpen  = false;

// Set initial button text
dateInput.value = toISO(selectedDate);
dateBtn.textContent = toDisplay(selectedDate);

// Build calendar DOM once, inject after dateBtn's row, hidden by default
const calWrap = document.createElement("div");
calWrap.id = "bsCalWrap";
calWrap.style.cssText = [
  "display:none;background:#fff8f2;border:1.5px solid #d9c9b8",
  "border-radius:14px;padding:12px 10px 10px;margin-top:6px",
  "max-width:320px;width:100%;box-shadow:0 2px 10px rgba(0,0,0,.10)",
  "font-family:Segoe UI,Arial,sans-serif;box-sizing:border-box"
].join(";");
calWrap.innerHTML = [
  '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">',
    '<button id="bsCalPrev" type="button" style="background:none;border:none;font-size:22px;',
      'cursor:pointer;color:#6b1020;padding:0 6px;line-height:1;">&#8249;</button>',
    '<span id="bsCalLabel" style="font-weight:700;font-size:14px;color:#6b1020;"></span>',
    '<button id="bsCalNext" type="button" style="background:none;border:none;font-size:22px;',
      'cursor:pointer;color:#6b1020;padding:0 6px;line-height:1;">&#8250;</button>',
  '</div>',
  '<div id="bsCalGrid" style="display:grid;grid-template-columns:repeat(7,1fr);',
    'gap:3px;text-align:center;"></div>'
].join("");

// Insert after the dateBtn's closest parent row
const dateRow = dateBtn.closest(".date-row") || dateBtn.parentElement;
dateRow.insertAdjacentElement("afterend", calWrap);

function datesWithData() {
  const set = new Set();
  Object.values(sessions).forEach(function (s) { if (s && s.date) set.add(s.date); });
  eventDocs.forEach(function (s) { if (s && s.date) set.add(s.date); });
  return set;
}

function bsRenderCalendarGrid() {
  const label = document.getElementById("bsCalLabel");
  const grid  = document.getElementById("bsCalGrid");
  if (!label || !grid) return;
  label.textContent = MONTHS_CAL[calMonth] + " " + calYear;

  const today   = new Date();
  const dataSet = datesWithData();
  const selISO  = toISO(selectedDate);

  let html = DAYS_CAL.map(function (d) {
    return '<div style="font-size:11px;font-weight:600;color:#8a7060;padding:2px 0;">' + d + '</div>';
  }).join("");

  const firstDay    = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

  for (var i = 0; i < firstDay; i++) html += '<div></div>';

  for (var d = 1; d <= daysInMonth; d++) {
    var iso     = calYear + "-" + pad(calMonth + 1) + "-" + pad(d);
    var isToday = (d === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear());
    var isSel   = (iso === selISO);
    var hasData = dataSet.has(iso);

    var bg = "transparent", color = "#3a2a1a", border = "none", fw = "500";
    if (isSel && hasData) {
      bg = "#2e7d32"; color = "#fff"; fw = "700";        // green filled — selected + data
    } else if (isSel) {
      bg = "#6b1020"; color = "#fff"; fw = "700";        // maroon filled — selected, no data
    } else if (hasData) {
      bg = "#2e7d32"; color = "#fff"; fw = "600";        // green filled — has data
    } else if (isToday) {
      border = "2px solid #6b1020"; color = "#6b1020"; fw = "700";  // today outline
    }

    html += '<div style="display:flex;justify-content:center;">' +
      '<div style="font-size:13px;cursor:pointer;border-radius:50%;width:28px;height:28px;' +
        'display:inline-flex;align-items:center;justify-content:center;' +
        'background:' + bg + ';color:' + color + ';border:' + border + ';' +
        'font-weight:' + fw + ';box-sizing:border-box;" data-iso="' + iso + '">' +
        d +
      '</div></div>';
  }

  grid.innerHTML = html;

  grid.querySelectorAll("[data-iso]").forEach(function (el) {
    el.addEventListener("click", function () {
      if (editing) return;
      var iso = this.getAttribute("data-iso");
      var parts = iso.split("-");
      selectedDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      dateInput.value = iso;
      dateBtn.textContent = toDisplay(selectedDate);
      syncTitleInput(true);
      setNote(HINT);
      refreshTableForDate();
      bsRenderCalendarGrid();   // refresh selection highlight
    });
  });
}

// Toggle calendar on button click
dateBtn.addEventListener("click", function () {
  if (editing) return;
  calOpen = !calOpen;
  calWrap.style.display = calOpen ? "block" : "none";
  if (calOpen) {
    calYear  = selectedDate.getFullYear();
    calMonth = selectedDate.getMonth();
    bsRenderCalendarGrid();
  }
});

// Prev / Next month
document.getElementById("bsCalPrev").addEventListener("click", function () {
  if (--calMonth < 0) { calMonth = 11; calYear--; }
  bsRenderCalendarGrid();
});
document.getElementById("bsCalNext").addEventListener("click", function () {
  if (++calMonth > 11) { calMonth = 0; calYear++; }
  bsRenderCalendarGrid();
});

// Expose for refresh from anywhere (Firestore update, tick, save, delete)
window.bsRenderCalendar = function () {
  if (calOpen) bsRenderCalendarGrid();
};

// dateInput change is now only a fallback (hidden input, not used by click)
dateInput.addEventListener("change", function () {
  if (editing) { dateInput.value = toISO(selectedDate); return; }
  if (!dateInput.value) return;
  const parts = dateInput.value.split("-");
  selectedDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  dateBtn.textContent = toDisplay(selectedDate);
  syncTitleInput(true);
  setNote(HINT);
  refreshTableForDate();
  if (calOpen) bsRenderCalendarGrid();
});

// ---------- Attendance dashboard ----------

// Toggle the attendance table when the blue "Attendance" box is clicked
attendanceBtn.addEventListener("click", function () {
  attendanceSection.classList.toggle("hidden");
});

// Build table rows for each student (once)
function buildTable() {
  students.forEach(function (name) {
    const row = document.createElement("tr");

    const nameCell = document.createElement("td");
    nameCell.textContent = name;
    nameCell.className = "student-name";
    nameCell.style.cursor = "pointer";
    nameCell.title = "Click to see attendance stats";
    nameCell.addEventListener("click", function () {
      if (typeof window.bsOpenStudentProfile === "function") window.bsOpenStudentProfile(name);
    });

    const presentCell = document.createElement("td");
    presentCell.className = "status-cell present-cell";
    presentCell.dataset.student = name;

    const halfCell = document.createElement("td");
    halfCell.className = "status-cell half-cell";
    halfCell.dataset.student = name;

    row.appendChild(nameCell);
    row.appendChild(presentCell);
    row.appendChild(halfCell);
    attendanceBody.appendChild(row);
  });
}

buildTable();
refreshTableForDate();

// "Present" / "Half present" cell par click -> selected date + mode me autosave
attendanceBody.addEventListener("click", async function (e) {
  const target = e.target;
  let name = null, status = null;

  if (target.classList.contains("present-cell")) { name = target.dataset.student; status = "present"; }
  else if (target.classList.contains("half-cell")) { name = target.dataset.student; status = "half"; }
  if (!name) return;

  // Edit mode: sirf working copy badlo (Firestore Update dabane par hi badlega, drafts ko haath nahi lagta)
  if (editing) {
    if (editing.marks[name] === status) delete editing.marks[name];
    else editing.marks[name] = status;
    renderAll();
    return;
  }

  const dateStr = toISO(selectedDate);
  const id = docIdFor(dateStr, currentMode);
  const sess = currentSession();

  // same status par dobara click -> undo (pehle jaisa khaali)
  const isUndo = !!sess && sess.marks[name] === status;

  if (!rawDocs[id]) rawDocs[id] = {};
  if (isUndo) delete rawDocs[id][name];
  else rawDocs[id][name] = status;
  legacyKeysFor(name).forEach(function (k) { delete rawDocs[id][k]; });   // purani spelling ki mark ab naye naam me chali gayi

  buildSessions();
  renderAll();

  try {
    const markPayload = { [name]: isUndo ? deleteField() : status };
    legacyKeysFor(name).forEach(function (k) { markPayload[k] = deleteField(); });
    await setDoc(
      doc(db, "attendance", id),
      markPayload,
      { merge: true }
    );
  } catch (err) {
    console.error("Save failed:", err);
  }
});

// Ek student ki row ka color (green / blue) selected date + mode ke hisaab se
function markRow(name) {
  const s = activeSession();
  const status = s ? s.marks[name] : undefined;

  const presentCell = attendanceBody.querySelector('.present-cell[data-student="' + name + '"]');
  const halfCell = attendanceBody.querySelector('.half-cell[data-student="' + name + '"]');

  presentCell.classList.remove("present-active");
  halfCell.classList.remove("half-active");

  if (status === "present") {
    presentCell.classList.add("present-active");
  } else if (status === "half") {
    halfCell.classList.add("half-active");
  }
}

// Poori table dobara paint karo (date ya mode badalne par us ki attendance dikhe)
function refreshTableForDate() {
  students.forEach(function (name) { markRow(name); });
  if (!saveDataBox.classList.contains("hidden")) renderSummary();
}

// Left table + right Events panel dono update
function renderAll() {
  refreshTableForDate();
  renderEventsPanel();
  if (typeof window.bsRenderCalendar === "function") window.bsRenderCalendar();
}


// View Attendance: selected date + mode ki present / half present list
function renderSummary() {
  const sess = activeSession();
  const marks = sess ? sess.marks : {};

  const present = [];
  const half = [];

  students.forEach(function (name) {
    if (marks[name] === "present") present.push(name);
    else if (marks[name] === "half") half.push(name);
  });

  saveDataTitle.textContent = toDisplay(selectedDate) + " (" + modeLabel(currentMode) + ")";
  presentListEl.textContent = present.length ? present.join(", ") : "-";
  halfListEl.textContent = half.length ? half.join(", ") : "-";
}

// View Attendance -> box khol/band karo


// Marks se Present / Half present / Absent lists banao
// (jis student pe koi click nahi hua wo Absent me jata hai)
function snapshotFor(title, dateText, fileDate, mode, marks, firestoreId) {
  const present = [];
  const half = [];
  const absent = [];

  students.forEach(function (name) {
    if (marks[name] === "present") present.push(name);
    else if (marks[name] === "half") half.push(name);
    else absent.push(name);
  });

  return {
    title: title || "Attendance",
    date: dateText,
    fileDate: fileDate,
    mode: modeLabel(mode),
    present: present,
    half: half,
    absent: absent,
    _firestoreId: firestoreId || null
  };
}

function openAttendancePage(data) {
  if (typeof window.bsOpenAttendanceView !== "function") {
    console.error("attendance-view.js load nahi hua");
    return;
  }
  window.bsOpenAttendanceView(data);
}

// Left card ki abhi ki (unsaved) attendance
function buildAttendanceSnapshot() {
  const sess = activeSession();
  // Edit mode me abhi ka (unsaved) copy + event ka id dikhao, taaki Edit wapas isi edit par laaye
  const title = editing
    ? (titleIn.value.trim() || editing.title || "Attendance")
    : (sess && sess.title ? sess.title : "Attendance");
  return snapshotFor(
    title,
    toDisplay(selectedDate), toISO(selectedDate), currentMode,
    sess ? sess.marks : {},
    editing ? editing.id : null
  );
}

viewBtn.addEventListener("click", function () {
  openAttendancePage(buildAttendanceSnapshot());
});

// Clear All -> selected date + mode (Offline ya Online) ki attendance hatao.
// Event name (agar diya hai) bacha rehta hai.
clearAllBtn.addEventListener("click", async function () {
  // Edit mode: sirf working copy khaali karo (Cancel se wapas aa jata hai)
  if (editing) { editing.marks = {}; renderAll(); return; }
  const sess = currentSession();
  if (!sess) return;
  const id = sess.id;
  const title = sess.title;

  // pehle screen se turant hatao
  if (title) rawDocs[id] = { _title: title };
  else delete rawDocs[id];
  buildSessions();
  renderAll();

  // phir Firebase se
  try {
    if (title) await setDoc(doc(db, "attendance", id), { _title: title });
    else await deleteDoc(doc(db, "attendance", id));
  } catch (err) {
    console.error("Clear failed:", err);
  }
});

// ---------- Offline / Online buttons ----------
const HINT = "Attendance autosaves. Add a name and press Save to create an event.";

function setNote(text, isErr) {
  titleNote.textContent = text;
  titleNote.classList.toggle("err", !!isErr);
}

function updateModeButtons() {
  const off = currentMode === "offline";
  modeOffBtn.classList.toggle("active", off);
  modeOnBtn.classList.toggle("active", !off);
  modeOffBtn.setAttribute("aria-pressed", String(off));
  modeOnBtn.setAttribute("aria-pressed", String(!off));
}

// Event name wala box us date + mode ke title se bhar do
// (force=false: agar user abhi type kar raha hai to uska text na badlo)
function syncTitleInput(force) {
  if (editing) return;   // edit ke dauran naam box user ke control me hai
  if (!force && document.activeElement === titleIn) return;
  // Pehle user ka type kiya naam (table par tap karne par input blur hota hai aur Firestore snapshot
  // aata hai -- pehle yahin naam "" se badal jata tha). Naam tabhi hatta hai jab user khud badle/mita de,
  // ya Save ho jaye.
  const key = sessionKey(toISO(selectedDate), currentMode);
  if (Object.prototype.hasOwnProperty.call(titleDrafts, key)) { titleIn.value = titleDrafts[key]; return; }
  const sess = currentSession();
  titleIn.value = sess ? sess.title : "";
}

function setMode(mode) {
  if (editing) return;   // edit ke dauran mode locked
  currentMode = mode;
  updateModeButtons();
  syncTitleInput(true);
  setNote(HINT);
  refreshTableForDate();
  attendanceSection.classList.remove("hidden"); // mode dabate hi table khul jaye
}

modeOffBtn.addEventListener("click", function () { setMode("offline"); });
modeOnBtn.addEventListener("click", function () { setMode("online"); });

// ---------- Event name (pencil + Save) ----------
editTitleBtn.addEventListener("click", function () {
  if (editing) return;   // edit me naam + Update wali row khuli rehti hai
  titleRow.classList.toggle("hidden");
  if (!titleRow.classList.contains("hidden")) titleIn.focus();
});

titleIn.addEventListener("input", function () {
  setNote(HINT);
  if (!editing) titleDrafts[sessionKey(toISO(selectedDate), currentMode)] = titleIn.value;   // khaali bhi yaad rakho (user ne khud mitaya)
});
titleIn.addEventListener("keydown", function (e) {
  if (e.key === "Enter") { e.preventDefault(); saveTitleBtn.click(); }
});

// Save -> table ki abhi ki attendance se EK NAYA event banta hai (Events list me judta hai),
// phir table khaali ho jati hai taaki agla event nayi attendance se shuru ho.
saveTitleBtn.addEventListener("click", async function () {
  titleRow.classList.remove("hidden");   // Save ab View Attendance ke upar hai; message dikhane ke liye naam wali row khol do
  if (editing) { await updateEditedEvent(); return; }
  const value = titleIn.value.trim();
  if (!value) { setNote("Enter an event name first.", true); titleIn.focus(); return; }

  const dateStr = toISO(selectedDate);
  const draft = currentSession();
  const draftId = draft ? draft.id : null;
  const stamp = Date.now();
  const id = dateStr + "_" + currentMode + "_ev_" + stamp.toString(36);

  const data = {};
  if (draft) Object.keys(draft.marks).forEach(function (n) { data[n] = draft.marks[n]; });
  data._title = value;
  data._createdAt = stamp;

  // pehle screen par: naya event judo, table + naam khaali
  rawDocs[id] = data;
  if (draftId) delete rawDocs[draftId];
  buildSessions();
  titleIn.value = "";
  delete titleDrafts[sessionKey(dateStr, currentMode)];   // naam ab event ban gaya
  renderAll();
  setNote("Saved. It now shows in Events.");

  // phir Firebase me
  try {
    await setDoc(doc(db, "attendance", id), data);
    if (draftId) await deleteDoc(doc(db, "attendance", draftId));
    // Google Sheets backup
    var bMarks = data || {};
    var bPresent = [], bHalf = [], bAbsent = [];
    students.forEach(function(s) {
      if (bMarks[s] === "present") bPresent.push(s);
      else if (bMarks[s] === "half") bHalf.push(s);
      else bAbsent.push(s);
    });
    backupToSheet("Attendance", [
      new Date().toLocaleString("en-IN"),
      data._title || "Attendance",
      id,
      bPresent.join(", "),
      bHalf.join(", "),
      bAbsent.join(", ")
    ]);
  } catch (err) {
    console.error("Event save failed:", err);
    setNote("Couldn't save the event. Try again.", true);
  }
});

// ---------- Edit a saved event ----------
// Edit dabane par event ka COPY table me khulta hai (naam + saari Present/Half/Absent marks).
// Table me tap karne par sirf copy badalti hai. Update dabane par wahi ORIGINAL Firestore doc
// (same id) merge se update hota hai: _createdAt aur baaki fields bache rehte hain, aur drafts
// ko haath nahi lagta. Cancel = copy phenk do, Firestore ko kuch nahi hota.
const editBanner = document.createElement("div");
editBanner.className = "edit-banner";
editBanner.hidden = true;
const editBannerText = document.createElement("span");
const editCancelBtn = document.createElement("button");
editCancelBtn.type = "button";
editCancelBtn.className = "edit-cancel";
editCancelBtn.textContent = "Cancel";
editBanner.appendChild(editBannerText);
editBanner.appendChild(editCancelBtn);
(function () {
  const head = dashboardSection.querySelector(".mode-head");
  if (head && head.parentNode) head.parentNode.insertBefore(editBanner, head.nextSibling);
  else dashboardSection.insertBefore(editBanner, dashboardSection.firstChild);
})();

function findSessionById(id) {
  for (let i = 0; i < eventDocs.length; i++) if (eventDocs[i].id === id) return eventDocs[i];
  const keys = Object.keys(sessions);
  for (let j = 0; j < keys.length; j++) if (sessions[keys[j]].id === id) return sessions[keys[j]];
  return null;
}

function sameMarks(a, b) {
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(function (k) { return b[k] === a[k]; });
}

function isEditDirty() {
  return !!editing && (!sameMarks(editing.marks, editing.orig) || titleIn.value.trim() !== editing.title);
}

// Edit mode ke hisaab se banner, Save/Update label aur date/mode lock set karo
function applyEditUI() {
  const on = !!editing;
  editBanner.hidden = !on;
  if (on) editBannerText.textContent = "Editing: " + editing.title + " (" + isoToDisplay(editing.date) + ", " + modeLabel(editing.mode) + ")";
  dateBtn.disabled = on;
  modeOffBtn.disabled = on;
  modeOnBtn.disabled = on;
  saveTitleBtn.textContent = on ? "Update" : "Save";
}

function startEdit(id) {
  const s = findSessionById(id);
  if (!s) { alert("This event could not be found. It may have been deleted."); return; }

  editing = {
    id: s.id, date: s.date, mode: s.mode, title: s.title || "", createdAt: s.createdAt,
    orig: Object.assign({}, s.marks),     // original marks (sirf diff ke liye)
    marks: Object.assign({}, s.marks)     // working copy
  };

  const p = s.date.split("-");
  selectedDate = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  currentMode = s.mode;
  dateInput.value = toISO(selectedDate);
  dateBtn.textContent = toDisplay(selectedDate);
  updateModeButtons();

  titleRow.classList.remove("hidden");
  titleIn.value = editing.title;
  applyEditUI();
  setNote("Change the statuses or the name, then press Update.");
  attendanceSection.classList.remove("hidden");
  refreshTableForDate();
  window.bsShowApp("attendance");
}

function cancelEdit() {
  editing = null;
  applyEditUI();
  syncTitleInput(true);
  setNote(HINT);
  refreshTableForDate();
}

async function updateEditedEvent() {
  if (!editing) return;
  const ed = editing;
  const value = titleIn.value.trim();
  if (!value) { setNote("Enter an event name first.", true); return; }

  // ORIGINAL doc me merge: marks + naam likho, hataye gaye marks deleteField se hatao.
  // _createdAt (aur koi bhi aur field) ko haath nahi lagta.
  const payload = {};
  Object.keys(ed.marks).forEach(function (n) { payload[n] = ed.marks[n]; });
  Object.keys(ed.orig).forEach(function (n) { if (!(n in ed.marks)) payload[n] = deleteField(); });
  payload._title = value;
  // purani spelling wali key (jaise "Shahnaz") hatao; uski mark naye naam ke saath payload me already hai
  Object.keys(NAME_ALIASES).forEach(function (k) { if (rawDocs[ed.id] && k in rawDocs[ed.id]) payload[k] = deleteField(); });

  saveTitleBtn.disabled = true;
  try {
    await setDoc(doc(db, "attendance", ed.id), payload, { merge: true });
  } catch (err) {
    console.error("Event update failed:", err);
    setNote("Couldn't update the event. Try again.", true);
    saveTitleBtn.disabled = false;
    return;
  }
  saveTitleBtn.disabled = false;

  // screen par turant dikhao
  const raw = rawDocs[ed.id] || (rawDocs[ed.id] = {});
  Object.keys(NAME_ALIASES).forEach(function (k) { delete raw[k]; });
  Object.keys(ed.orig).forEach(function (n) { if (!(n in ed.marks)) delete raw[n]; });
  Object.keys(ed.marks).forEach(function (n) { raw[n] = ed.marks[n]; });
  raw._title = value;

  editing = null;
  applyEditUI();
  buildSessions();
  syncTitleInput(true);
  renderAll();
  setNote("Event updated.");

  // Google Sheets backup: nayi row, "(edited)" ke saath, same document id
  const bPresent = [], bHalf = [], bAbsent = [];
  students.forEach(function (n) {
    if (ed.marks[n] === "present") bPresent.push(n);
    else if (ed.marks[n] === "half") bHalf.push(n);
    else bAbsent.push(n);
  });
  backupToSheet("Attendance", [
    new Date().toLocaleString("en-IN"),
    value + " (edited)",
    ed.id,
    bPresent.join(", "),
    bHalf.join(", "),
    bAbsent.join(", ")
  ]);
}

editCancelBtn.addEventListener("click", function () {
  if (isEditDirty() && !confirm("Discard your changes to this event?")) return;
  cancelEdit();
});

// attendance-view.js ka Edit button isse bulata hai (d = View Attendance page ka data)
window.bsEditAttendance = function (d) {
  if (!d) return;
  if (d._firestoreId) {
    // isi event ka edit pehle se chal raha hai -> bas table par wapas
    if (editing && editing.id === d._firestoreId) { window.bsShowApp("attendance"); return; }
    if (editing && isEditDirty() && !confirm("Discard unsaved changes to the event you were editing?")) return;
    startEdit(d._firestoreId);
    return;
  }
  // Left card ki unsaved (draft) attendance: us date + mode ke saath table par wapas
  if (!editing && /^\d{4}-\d{2}-\d{2}$/.test(d.fileDate || "")) {
    const p = d.fileDate.split("-");
    selectedDate = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    currentMode = /^on/i.test(d.mode || "") ? "online" : "offline";
    dateInput.value = toISO(selectedDate);
    dateBtn.textContent = toDisplay(selectedDate);
    updateModeButtons();
    syncTitleInput(true);
    refreshTableForDate();
  }
  attendanceSection.classList.remove("hidden");
  window.bsShowApp("attendance");
};

// ---------- Events panel (right side) ----------
function isoToDisplay(iso) {
  const p = iso.split("-");
  return p[2] + "/" + p[1] + "/" + p[0].slice(-2);
}

function sessionTag(s) {
  return "Attendance (" + modeLabel(s.mode) + ")";
}

// Saare events: Save se bane + purane naam wale drafts (nayi date upar)
function eventList() {
  const out = eventDocs.slice();
  Object.keys(sessions).forEach(function (k) {
    if (sessions[k].title) out.push(sessions[k]);
  });
  return out.sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt;
    return a.id < b.id ? 1 : -1;
  });
}

function eventMatches(s, q) {
  const hay = (s.title + " attendance " + s.mode + " " + isoToDisplay(s.date) + " " + s.date).toLowerCase();
  return hay.includes(q);
}

// Event ka page kholo (View Attendance jaisa, Present / Half present / Absent table)
function openEvent(s) {
  openAttendancePage(snapshotFor(s.title, isoToDisplay(s.date), s.date, s.mode, s.marks, s.id));
}

function renderEventsPanel() {
  const all = eventList();
  const q = atSearch.value.trim().toLowerCase();
  const list = q ? all.filter(function (s) { return eventMatches(s, q); }) : all;

  // har event ka rang uske banne ke order se (naya event judne par purane rang nahi badalte)
  const order = all.slice().sort(function (a, b) {
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
    return a.id < b.id ? -1 : 1;
  });
  const hueOf = {};
  order.forEach(function (s, i) { hueOf[s.id] = Math.round((i * 137.508) % 360); });

  atCount.textContent = all.length + (all.length === 1 ? " event" : " events");
  atList.replaceChildren();
  atEmpty.hidden = all.length > 0;

  if (all.length && !list.length) {
    const none = document.createElement("p");
    none.className = "at-empty";
    none.textContent = "No event found.";
    atList.appendChild(none);
    return;
  }

  list.forEach(function (s) {
    const wrap = document.createElement("div");
    wrap.className = "at-ev-wrap";
    wrap.style.display = "flex";
    wrap.style.alignItems = "center";
    wrap.style.gap = "6px";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "at-ev";
    btn.style.setProperty("--h", hueOf[s.id]);
    btn.style.flex = "1";

    const main = document.createElement("span");
    main.className = "at-ev-main";
    const title = document.createElement("span");
    title.className = "at-ev-title";
    title.textContent = s.title;
    const tag = document.createElement("span");
    tag.className = "at-ev-tag " + (s.mode === "online" ? "tag-on" : "tag-off");
    tag.textContent = sessionTag(s);
    main.appendChild(title);
    main.appendChild(tag);

    const date = document.createElement("span");
    date.className = "at-ev-date";
    date.textContent = isoToDisplay(s.date);

    btn.appendChild(main);
    btn.appendChild(date);
    btn.addEventListener("click", function () { openEvent(s); });

    // Delete button
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.title = "Delete this event";
    delBtn.innerHTML = "🗑";
    delBtn.style.cssText = [
      "flex-shrink:0;background:#c0392b;color:#fff;border:none",
      "border-radius:8px;padding:6px 10px;font-size:15px;cursor:pointer"
    ].join(";");
    delBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      showAtDeletePopup(s);
    });

    wrap.appendChild(btn);
    wrap.appendChild(delBtn);
    atList.appendChild(wrap);
  });
}

// Event search: suggestions + neeche ki list bhi filter hoti hai
atSearch.addEventListener("input", function () {
  const q = atSearch.value.trim().toLowerCase();
  atSuggest.replaceChildren();
  renderEventsPanel();

  if (!q) { atSuggest.style.display = "none"; return; }

  const matches = eventList().filter(function (s) { return eventMatches(s, q); });

  if (matches.length === 0) {
    const none = document.createElement("div");
    none.className = "at-sg none";
    none.textContent = "No event found";
    atSuggest.appendChild(none);
  } else {
    matches.slice(0, 6).forEach(function (s) {
      const item = document.createElement("div");
      item.className = "at-sg";
      const label = document.createElement("span");
      label.textContent = s.title + " (" + modeLabel(s.mode) + ")";
      const date = document.createElement("span");
      date.className = "at-sg-date";
      date.textContent = isoToDisplay(s.date);
      item.appendChild(label);
      item.appendChild(date);
      item.addEventListener("click", function () {
        atSuggest.style.display = "none";
        openEvent(s);
      });
      atSuggest.appendChild(item);
    });
  }
  atSuggest.style.display = "block";
});

document.addEventListener("click", function (e) {
  if (!e.target.closest(".at-search")) atSuggest.style.display = "none";
});

// Pehli baar screen set karo
updateModeButtons();
setNote(HINT);
renderEventsPanel();

// ---------- Signup / Course dropdown / decide first screen ----------
const signupSection = document.getElementById("signupSection");
const signupForm = document.getElementById("signupForm");
const signupMessage = document.getElementById("signupMessage");
const suCourseSearch = document.getElementById("suCourseSearch");
const courseList = document.getElementById("courseList");

let selectedCourse = "";

// Show matching courses as user types
suCourseSearch.addEventListener("input", function () {
  const query = suCourseSearch.value.trim().toLowerCase();
  selectedCourse = "";
  courseList.innerHTML = "";

  if (!query) {
    courseList.classList.add("hidden");
    return;
  }

  const matches = courses.filter((c) => c.toLowerCase().includes(query));

  if (matches.length === 0) {
    courseList.classList.add("hidden");
    return;
  }

  matches.forEach((course) => {
    const item = document.createElement("div");
    item.textContent = course;
    item.addEventListener("click", function () {
      suCourseSearch.value = course;
      selectedCourse = course;
      courseList.classList.add("hidden");
    });
    courseList.appendChild(item);
  });

  courseList.classList.remove("hidden");
});

// Hide dropdown if clicked outside
document.addEventListener("click", function (e) {
  if (!e.target.closest(".course-dropdown-wrap")) {
    courseList.classList.add("hidden");
  }
});

// Handle account creation
signupForm.addEventListener("submit", async function (e) {
  e.preventDefault();

  const username = document.getElementById("suUsername").value.trim();
  const password = document.getElementById("suPassword").value;
  const rollNo = document.getElementById("suRoll").value.trim();

  if (!selectedCourse) {
    signupMessage.textContent = "Please select a course from the list.";
    signupMessage.className = "error";
    return;
  }

  let cred;
  try {
    cred = await createUserWithEmailAndPassword(auth, toEmail(username), password);
  } catch (err) {
    signupMessage.textContent = err.message;
    signupMessage.className = "error";
    return;
  }
  try {
    await setDoc(doc(db, "users", cred.user.uid), {
      name: username, roll: rollNo, course: selectedCourse
    });
  } catch (err) { console.error("Profile save failed:", err); }

  signupMessage.textContent = "Account created!";
  signupMessage.className = "success";
  try { localStorage.setItem("bs-had-account", "1"); } catch(e) {}

  // createUser ke baad Firebase user ko apne aap sign-in kar deta hai; app seedha na khule,
  // isliye profile save hone ke baad sign-out karke login page par bhejte hain.
  try { await signOut(auth); } catch (err) { console.error("Sign out after signup failed:", err); }

  signupSection.classList.add("hidden");
  loginSection.classList.remove("hidden");
});

// Page load pe dono hide rakho — Firebase respond karne tak kuch mat dikhao
signupSection.classList.add("hidden");
loginSection.classList.add("hidden");

// Flow:
//   Reload/reopen par session nahi hota (in-memory)  → app sirf login form ke baad khulta hai
//   No session + pehle account tha  → login page
//   No session + naya device        → signup page
let appLaunched = false;

onAuthStateChanged(auth, function (user) {
  if (appLaunched) return;

  if (user) {
    // App yahan se kabhi nahi khulta. Sirf login form (sahi password ke baad) hi app kholta hai.
    return;
  } else {
    // Session nahi
    var hadAccount = false;
    try { hadAccount = !!localStorage.getItem("bs-had-account"); } catch(e) {}
    if (hadAccount) {
      loginSection.classList.remove("hidden");
    } else {
      signupSection.classList.remove("hidden");
    }
  }
});
// Browser ka back/forward cache purana khula hua app wapas dikha sakta hai; usse bachne ke liye reload
window.addEventListener("pageshow", function (e) { if (e.persisted) location.reload(); });
// ---------- Splash screen ----------
window.addEventListener("load", function () {
  setTimeout(function () {
    const splash = document.getElementById("splashScreen");
    if (!splash) return;
    splash.classList.add("fade-out");
    setTimeout(function () {
      splash.style.display = "none";
    }, 500);
  }, 2000);
});
(function () {
  const attrs = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';

  // khuli eye (password dikh raha hai)
  const EYE_OPEN =
    '<svg ' + attrs + '><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';

  // slash wali eye (password dots me hai)
  const EYE_OFF =
    '<svg ' + attrs + '><path d="M2 12s3.6-7 10-7c2 0 3.7.6 5.2 1.5M22 12s-3.6 7-10 7c-2 0-3.7-.6-5.2-1.5"/><circle cx="12" cy="12" r="3"/><line x1="3" y1="3" x2="21" y2="21"/></svg>';

  document.querySelectorAll('input[type="password"]').forEach(function (input) {
    if (input.parentNode.classList.contains('pw-wrap')) return;  // dobara na lage

    const wrap = document.createElement('div');
    wrap.className = 'pw-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pw-eye';
    btn.setAttribute('aria-label', 'Show password');
    btn.innerHTML = EYE_OFF;
    wrap.appendChild(btn);

    btn.addEventListener('click', function () {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.innerHTML = show ? EYE_OPEN : EYE_OFF;
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
  });
})();
// brushstroke.js mein add karo

let studentList = []; // global array

// App load hote hi students fetch karo
// ---------- Search Bar ----------
// ---- Attendance event delete popup ----
function showAtDeletePopup(s) {
  var old = document.getElementById("atDelPopup");
  if (old) old.remove();

  var overlay = document.createElement("div");
  overlay.id = "atDelPopup";
  overlay.style.cssText = "position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);padding:16px";

  var box = document.createElement("div");
  box.style.cssText = "background:#fff;color:#222;border-radius:16px;padding:28px 24px 22px;max-width:360px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,.25);text-align:center";

  var msg = document.createElement("p");
  msg.style.cssText = "font-size:16px;font-weight:600;margin:0 0 6px";
  msg.textContent = "Are you sure you want to delete this event attendance?";

  var name = document.createElement("p");
  name.style.cssText = "font-size:14px;color:#666;margin:0 0 22px;font-style:italic";
  name.textContent = "\"" + (s.title || s.id) + "\"";

  var btnRow = document.createElement("div");
  btnRow.style.cssText = "display:flex;gap:12px;justify-content:center";

  var noBtn = document.createElement("button");
  noBtn.textContent = "No";
  noBtn.style.cssText = "flex:1;max-width:120px;padding:11px 0;border:none;border-radius:10px;background:#002aff;color:#fff;font-size:15px;font-weight:700;cursor:pointer";
  noBtn.addEventListener("click", function() { overlay.remove(); });

  var yesBtn = document.createElement("button");
  yesBtn.textContent = "Yes";
  yesBtn.style.cssText = "flex:1;max-width:120px;padding:11px 0;border:none;border-radius:10px;background:#00ff77;color:#111;font-size:15px;font-weight:700;cursor:pointer";
  yesBtn.addEventListener("click", async function() {
    overlay.remove();
    if (editing && editing.id === s.id) { editing = null; applyEditUI(); setNote(HINT); }
    delete rawDocs[s.id];
    buildSessions();
    renderAll();
    try { await deleteDoc(doc(db, "attendance", s.id)); }
    catch(e) { console.error("Delete failed:", e); }
  });

  btnRow.appendChild(noBtn);
  btnRow.appendChild(yesBtn);
  box.appendChild(msg);
  box.appendChild(name);
  box.appendChild(btnRow);
  overlay.appendChild(box);
  overlay.addEventListener("click", function(e) { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

function initSearchBar() {
  const searchInput = document.getElementById('studentSearch');
  const suggestionsBox = document.getElementById('searchSuggestions');
  if (!searchInput || !suggestionsBox) return;

  searchInput.addEventListener('input', function () {
    const query = this.value.trim().toLowerCase();
    suggestionsBox.innerHTML = '';

    if (!query) {
      suggestionsBox.style.display = 'none';
      return;
    }

    const matches = students.filter(name =>
      name.toLowerCase().includes(query)
    );

    if (matches.length === 0) {
      suggestionsBox.innerHTML = '<div class="suggestion-no-result">No student found</div>';
      suggestionsBox.style.display = 'block';
      return;
    }

    matches.slice(0, 8).forEach(name => {
      const item = document.createElement('div');
      item.className = 'suggestion-item';

      // Matched text highlight karo
      const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      item.innerHTML = name.replace(regex, '<span class="suggestion-highlight">$1</span>');

      item.addEventListener('click', function () {
        searchInput.value = name;
        suggestionsBox.style.display = 'none';
        scrollToStudent(name);
      });

      suggestionsBox.appendChild(item);
    });

    suggestionsBox.style.display = 'block';
  });

  // Bahar click karne pe suggestions band
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.search-wrapper')) {
      suggestionsBox.style.display = 'none';
    }
  });
}

// Student row pe scroll karo + blue dot dikhao
function scrollToStudent(name) {
  // Attendance section visible karo
  if (attendanceSection.classList.contains('hidden')) {
    attendanceSection.classList.remove('hidden');
  }

  // Row dhundo
  const rows = attendanceBody.querySelectorAll('tr');
  let targetRow = null;

  rows.forEach(row => {
    const nameCell = row.querySelector('.student-name');
    if (nameCell && nameCell.textContent.trim() === name) {
      targetRow = row;
    }
  });

  if (!targetRow) return;

  // Scroll to row
  targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Blue dot add karo
  const nameCell = targetRow.querySelector('.student-name');

  // Pehle se koi dot ho toh hatao
  const existingDot = nameCell.querySelector('.blue-dot');
  if (existingDot) existingDot.remove();

  const dot = document.createElement('span');
  dot.className = 'blue-dot';
  nameCell.insertBefore(dot, nameCell.firstChild);

  // 3 sec baad hatao
  setTimeout(() => {
    dot.remove();
  }, 3000);
}

// Init call
initSearchBar();

// NOTE: Home page / navbar / profile card ka saara code app-shell.js me hai.
// (pehle yahan enterApp / loadProfile / showApp the — wo hata diye, kyunki app-shell.js unhe handle karta hai)

// ---- attendance-view.js ke liye: delete attendance doc globally expose karo ----
window.bsDeleteAttendanceDoc = async function (docId) {
  if (!docId) return;
  delete rawDocs[docId];
  buildSessions();
  renderAll();
  try {
    await deleteDoc(doc(db, "attendance", docId));
  } catch (err) {
    console.error("Attendance delete failed:", err);
  }
};
// ===== Google Sheets Backup =====
var SHEETS_URL = "https://script.google.com/macros/s/AKfycbyISnoSu8t4ESuLdamI8HkvXw7PuoDCZipUtA96XSsNn5Bc1VadVKfgQkiLt7Q7lsa-QA/exec";
var SHEETS_KEY = "brushstrokes2024secret";
function backupToSheet(sheetName, row) {
  var params = "?key=" + encodeURIComponent(SHEETS_KEY)
    + "&sheet=" + encodeURIComponent(sheetName)
    + "&row=" + encodeURIComponent(JSON.stringify(row));
  fetch(SHEETS_URL + params)
    .then(function(r){ return r.text(); })
    .then(function(t){ console.log("Sheet backup:", t); })
    .catch(function(e){ console.log("Sheet backup failed:", e); });
}
function initCoreMembers() {
  // Attendance section band karo
  const attendanceSection = document.getElementById("attendanceSection");
  if (attendanceSection) attendanceSection.classList.add("hidden");}
  
  // ... baaki existing code same rahega
// ---- Core Members navbar wiring ----
window.addEventListener("bs:enter", function () {
  // app-shell.js ka navbar already handle karta hai,
  // bas Core Members ke liye extra listener chahiye
  const cmNavBtn = document.getElementById("coreNavBtn");
  // ↑ ye id app-shell.js me jo bhi Core Members navbar button ki hai wahi dalo
  if (cmNavBtn) {
    cmNavBtn.addEventListener("click", function () {
      // baaki sections hide karo — ye function app-shell.js me hoga
      if (typeof window.bsHideAll === "function") window.bsHideAll();
      const cmDiv = document.getElementById("core-members-view");
      if (cmDiv) {
        cmDiv.style.display = "block";
        initCoreMembers();
      }
    });
  }
});