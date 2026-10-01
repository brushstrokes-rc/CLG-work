import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, addDoc, collection, query, where, getDocs, onSnapshot, deleteDoc, deleteField }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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
// Firestore ki wahi purani "attendance" collection (isliye rules me kuch badalna nahi padega):
//   "2026-09-29_offline" / "2026-09-29_online" -> { "Rupam Nama": "present" | "half", _title: "Event name" }
//   "2026-09-24" (purana format, bina mode ke)  -> Offline maana jata hai
let rawDocs = {};            // docId -> Firestore data
let sessions = {};           // "yyyy-mm-dd|offline" -> { id, date, mode, title, marks }
let currentMode = "offline"; // left wale Offline / Online button se badalta hai
let selectedEventKey = null; // right panel me kaun sa event khula hai
let unsubscribeAttendance = null;

function sessionKey(dateStr, mode) { return dateStr + "|" + mode; }
function modeLabel(mode) { return mode === "online" ? "Online" : "Offline"; }

function makeSession(id, date, mode) {
  const d = rawDocs[id] || {};
  const marks = {};
  Object.keys(d).forEach(function (k) {
    if (k === "_title") return;
    if (d[k] === "present" || d[k] === "half") marks[k] = d[k];
  });
  return { id: id, date: date, mode: mode, title: d._title || "", marks: marks };
}

function buildSessions() {
  sessions = {};
  const legacy = [];
  Object.keys(rawDocs).forEach(function (id) {
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

// write karte waqt kaunsa doc use hoga (purana doc ho to wahi, warna naya "date_mode")
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
const atDetail = document.getElementById("atDetail");
const atDetailTitle = document.getElementById("atDetailTitle");
const atDetailSum = document.getElementById("atDetailSum");
const atDetailSub = document.getElementById("atDetailSub");
const atTableBody = document.getElementById("atTableBody");

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
    message.textContent = "Login successful!";
    message.className = "success";
    loginSection.classList.add("hidden");
    startAttendanceListener();
    // app-shell.js ye event sunke Home page (header + navbar) khol deta hai
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


function buildAttendanceSnapshot() {
  const sess = currentSession();
  const marks = sess ? sess.marks : {};

  const present = [];
  const half = [];
  const absent = [];

  students.forEach(function (name) {
    if (marks[name] === "present") {
      present.push(name);
    } else if (marks[name] === "half") {
      half.push(name);
    } else {
      absent.push(name);
    }
  });

  return {
    title: sess && sess.title ? sess.title : "Attendance",
    date: toDisplay(selectedDate),
    fileDate: toISO(selectedDate),
    mode: modeLabel(currentMode),
    present: present,
    half: half,
    absent: absent
  };
}
viewBtn.addEventListener("click", function () {
  window.bsOpenAttendanceView(buildAttendanceSnapshot());
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
const HINT = "Attendance autosaves. Add a name to show it in Events.";

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

saveTitleBtn.addEventListener("click", async function () {
  const value = titleIn.value.trim();
  if (!value) { setNote("Enter an event name first.", true); return; }

  const dateStr = toISO(selectedDate);
  const id = docIdFor(dateStr, currentMode);

  if (!rawDocs[id]) rawDocs[id] = {};
  rawDocs[id]._title = value;
  buildSessions();
  selectedEventKey = sessionKey(dateStr, currentMode);
  renderEventsPanel();
  setNote("Saved. It now shows in Events.");

  try {
    await setDoc(doc(db, "attendance", id), { _title: value }, { merge: true });
  } catch (err) {
    console.error("Event name save failed:", err);
    setNote("Couldn't save the event name. Try again.", true);
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

// sirf wahi sessions jinka event name save hua hai (nayi date upar)
function eventList() {
  return Object.keys(sessions)
    .map(function (k) { return sessions[k]; })
    .filter(function (s) { return s.title; })
    .sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return a.mode < b.mode ? -1 : 1;
    });
}

function renderEventsPanel() {
  const list = eventList();
  atCount.textContent = list.length + (list.length === 1 ? " event" : " events");
  atList.replaceChildren();
  atEmpty.hidden = list.length > 0;
  atDetail.hidden = list.length === 0;
  if (!list.length) return;

  const exists = list.some(function (s) { return sessionKey(s.date, s.mode) === selectedEventKey; });
  if (!exists) selectedEventKey = sessionKey(list[0].date, list[0].mode);

  list.forEach(function (s) {
    const key = sessionKey(s.date, s.mode);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "at-ev" + (key === selectedEventKey ? " on" : "");

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
    
btn.addEventListener("click", function () {
  selectedEventKey = key;

  const sess = sessions[key];
  if (!sess) return;

  const present = [];
  const half = [];
  const absent = [];

  students.forEach(function (name) {
    const status = sess.marks[name];

    if (status === "present") present.push(name);
    else if (status === "half") half.push(name);
    else absent.push(name);
  });

  window.bsOpenAttendanceView({
    title: sess.title || "Attendance",
    date: isoToDisplay(sess.date),
    fileDate: sess.date,
    mode: modeLabel(sess.mode),
    present: present,
    half: half,
    absent: absent
  });
});
  });

  renderEventDetail(sessions[selectedEventKey]);
}

// Selected event ki attendance table (sirf dekhne ke liye)
function renderEventDetail(s) {
  atDetailTitle.textContent = s.title;
  atDetailSub.textContent = sessionTag(s) + ", " + isoToDisplay(s.date);

  let presentCount = 0, halfCount = 0;
  atTableBody.replaceChildren();

  students.forEach(function (name) {
    const status = s.marks[name];
    if (status === "present") presentCount++;
    else if (status === "half") halfCount++;

    const tr = document.createElement("tr");
    const nameCell = document.createElement("td");
    nameCell.className = "nm";
    nameCell.textContent = name;
    const presentCell = document.createElement("td");
    if (status === "present") presentCell.className = "p";
    const halfCell = document.createElement("td");
    if (status === "half") halfCell.className = "h";

    tr.appendChild(nameCell);
    tr.appendChild(presentCell);
    tr.appendChild(halfCell);
    atTableBody.appendChild(tr);
  });

  atDetailSum.textContent = presentCount + " present, " + halfCount + " half present";
}

// Event search (suggestions)
atSearch.addEventListener("input", function () {
  const q = atSearch.value.trim().toLowerCase();
  atSuggest.replaceChildren();

  if (!q) { atSuggest.style.display = "none"; return; }

  const matches = eventList().filter(function (s) {
    const hay = (s.title + " attendance " + s.mode + " " + isoToDisplay(s.date) + " " + s.date).toLowerCase();
    return hay.includes(q);
  });

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
        selectedEventKey = sessionKey(s.date, s.mode);
        atSearch.value = s.title;
        atSuggest.style.display = "none";
        renderEventsPanel();
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

  signupSection.classList.add("hidden");
  loginSection.classList.remove("hidden");
});

// Decide which screen to show first when page loads
// (pehle jaisa: hamesha login ya signup dikhao, app direct nahi kholna)
onAuthStateChanged(auth, function (user) {
  if (user) {
    signupSection.classList.add("hidden");
    loginSection.classList.remove("hidden");
    startAttendanceListener();
  } else {
    signupSection.classList.remove("hidden");
    loginSection.classList.add("hidden");
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