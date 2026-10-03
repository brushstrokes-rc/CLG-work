import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut }
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
const auth = getAuth(app);
const db = getFirestore(app);

// Page load/reload/reopen pe hamesha session clear karo — login page dikhao
//signOut(auth).catch(function(){});
// Yeh line HATAO:
signOut(auth).catch(function(){});

// Aur LOGIN form submit pe signOut ki jagah — page reload pe logout ho:
window.addEventListener("beforeunload", function() {
  signOut(auth).catch(function(){});
});
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
  "Shahnaz",
  "Kanishka Singh",
  "Ayush Shekhar",
  "Afsha Hussain",
  "Ananta Agrawal",
  "Vaishali Sharma",
  "Amarjeet Kumar",
  "Rheenyi",
  "Shivani",
  "Saurabh Bhandari",
  "Deepak Sharma",
  "Manya",
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

// ---------- Attendance data ----------
// Firestore ki wahi "attendance" collection (isliye rules me kuch badalna nahi padega):
//   "2026-09-29_offline" / "2026-09-29_online"  -> table me abhi jo attendance mark ho rahi hai (draft, autosave)
//   "2026-09-29_online_ev_xxxx"                 -> Save dabane par bana EK event (ek din me jitne chaho):
//                                                  { "Rupam Nama": "present" | "half", _title, _createdAt }
//   "2026-09-24" (purana format, bina mode ke)  -> Offline draft maana jata hai
let rawDocs = {};            // docId -> Firestore data
let sessions = {};           // drafts: "yyyy-mm-dd|offline" -> { id, date, mode, title, marks, createdAt }
let eventDocs = [];          // Save se bane events: { id, date, mode, title, marks, createdAt }
let currentMode = "offline"; // left wale Offline / Online button se badalta hai
let unsubscribeAttendance = null;

function sessionKey(dateStr, mode) { return dateStr + "|" + mode; }
function modeLabel(mode) { return mode === "online" ? "Online" : "Offline"; }

function makeSession(id, date, mode) {
  const d = rawDocs[id] || {};
  const marks = {};
  Object.keys(d).forEach(function (k) {
    if (d[k] === "present" || d[k] === "half") marks[k] = d[k];
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

// ---------- Date picker ----------

// Set initial button text + hidden input value to today's date
dateInput.value = toISO(selectedDate);
dateBtn.textContent = toDisplay(selectedDate);

// Clicking the visible button opens the native calendar on the hidden input
dateBtn.addEventListener("click", function () {
  if (typeof dateInput.showPicker === "function") {
    dateInput.showPicker();
  } else {
    dateInput.focus();
    dateInput.click();
  }
});

// When a date is picked from the calendar, switch the table to that date
dateInput.addEventListener("change", function () {
  if (!dateInput.value) return;

  const parts = dateInput.value.split("-"); // [yyyy, mm, dd]
  selectedDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));

  dateBtn.textContent = toDisplay(selectedDate);
  syncTitleInput(true);
  setNote(HINT);
  refreshTableForDate();
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

  const dateStr = toISO(selectedDate);
  const id = docIdFor(dateStr, currentMode);
  const sess = currentSession();

  // same status par dobara click -> undo (pehle jaisa khaali)
  const isUndo = !!sess && sess.marks[name] === status;

  if (!rawDocs[id]) rawDocs[id] = {};
  if (isUndo) delete rawDocs[id][name];
  else rawDocs[id][name] = status;

  buildSessions();
  renderAll();

  try {
    await setDoc(
      doc(db, "attendance", id),
      { [name]: isUndo ? deleteField() : status },
      { merge: true }
    );
  } catch (err) {
    console.error("Save failed:", err);
  }
});

// Ek student ki row ka color (green / blue) selected date + mode ke hisaab se
function markRow(name) {
  const s = currentSession();
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
}


// View Attendance: selected date + mode ki present / half present list
function renderSummary() {
  const sess = currentSession();
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
  const sess = currentSession();
  return snapshotFor(
    sess && sess.title ? sess.title : "Attendance",
    toDisplay(selectedDate), toISO(selectedDate), currentMode,
    sess ? sess.marks : {}
  );
}

viewBtn.addEventListener("click", function () {
  openAttendancePage(buildAttendanceSnapshot());
});

// Clear All -> selected date + mode (Offline ya Online) ki attendance hatao.
// Event name (agar diya hai) bacha rehta hai.
clearAllBtn.addEventListener("click", async function () {
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
  if (!force && document.activeElement === titleIn) return;
  const sess = currentSession();
  titleIn.value = sess ? sess.title : "";
}

function setMode(mode) {
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
  titleRow.classList.toggle("hidden");
  if (!titleRow.classList.contains("hidden")) titleIn.focus();
});

titleIn.addEventListener("input", function () { setNote(HINT); });
titleIn.addEventListener("keydown", function (e) {
  if (e.key === "Enter") { e.preventDefault(); saveTitleBtn.click(); }
});

// Save -> table ki abhi ki attendance se EK NAYA event banta hai (Events list me judta hai),
// phir table khaali ho jati hai taaki agla event nayi attendance se shuru ho.
saveTitleBtn.addEventListener("click", async function () {
  const value = titleIn.value.trim();
  if (!value) { setNote("Enter an event name first.", true); return; }

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
  renderAll();
  setNote("Saved. It now shows in Events.");

  // phir Firebase me
  try {
    await setDoc(doc(db, "attendance", id), data);
    if (draftId) await deleteDoc(doc(db, "attendance", draftId));
  } catch (err) {
    console.error("Event save failed:", err);
    setNote("Couldn't save the event. Try again.", true);
  }
});

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

  signupSection.classList.add("hidden");
  loginSection.classList.remove("hidden");
});

// Page load pe dono hide rakho — Firebase respond karne tak kuch mat dikhao
signupSection.classList.add("hidden");
loginSection.classList.add("hidden");

// Flow:
//   Active session (reload/reopen)  → seedha app kholo
//   No session + pehle account tha  → login page
//   No session + naya device        → signup page
let appLaunched = false;

onAuthStateChanged(auth, function (user) {
  if (appLaunched) return;

  if (user) {
    // Session active — seedha app
    appLaunched = true;
    try { localStorage.setItem("bs-had-account", "1"); } catch(e) {}
    startAttendanceListener();
    window.dispatchEvent(new Event("bs:enter"));
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
// ============ AI CHATBOT ============
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=AQ.Ab8RN6IqzaaM52NQUmLTDKX31kJweTUb-lAl0UtXVISJLQaFPg";

window.toggleChat = function () {
  const box = document.getElementById("chatBox");
  const isOpen = box.style.display === "flex";
  box.style.display = isOpen ? "none" : "flex";
  if (!isOpen) document.getElementById("chatInput").focus();
};

function addBubble(text, sender, thinking) {
  const div = document.createElement("div");
  div.textContent = text;
  if (thinking) div.classList.add("thinking");
  Object.assign(div.style, {
    padding: "8px 12px", borderRadius: "12px", maxWidth: "85%",
    background: sender === "user" ? "#800020" : "#f0f0f0",
    color: sender === "user" ? "white" : "#222",
    alignSelf: sender === "user" ? "flex-end" : "flex-start",
    lineHeight: "1.45", fontSize: "13px"
  });
  const msgs = document.getElementById("chatMessages");
  msgs.appendChild(div);
  msgs.scrollTop = 9999;
}

window.sendMessage = async function () {
  const input = document.getElementById("chatInput");
  const msg = input.value.trim();
  if (!msg) return;
  addBubble(msg, "user");
  input.value = "";
  addBubble("Soch raha hoon...", "bot", true);
  try {
    const res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text:
          `Tum Brushstrokes Society (Ramanujan College, Delhi) ke AI assistant ho.
Art, events, attendance aur society ke baare mein help karo. Hindi/English dono chalega.
User: ${msg}` }] }]
      })
    });
    const data = await res.json();
    document.querySelector(".thinking")?.remove();
    addBubble(data.candidates[0].content.parts[0].text, "bot");
  } catch (err) {
    document.querySelector(".thinking")?.remove();
    addBubble("Error aa gaya, dobara try karo 🙏", "bot");
  }
};

document.addEventListener("keydown", function (e) {
  if (e.key === "Enter" && document.activeElement?.id === "chatInput") {
    window.sendMessage();
  }
});

window.addEventListener("bs:enter", function () {
  const btn = document.getElementById("chatBtn");
  if (btn) btn.style.display = "flex";
});
// ============ /AI CHATBOT ============