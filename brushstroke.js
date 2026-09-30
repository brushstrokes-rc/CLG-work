import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, addDoc, collection, query, where, getDocs, onSnapshot, deleteDoc }
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

// Attendance data stored per date: { "2026-09-24": { "Rupam Nama": "present", ... }, ... }
// Persisted in the browser's localStorage so it survives reloads / closing the tab
let attendanceData = {};
let unsubscribeAttendance = null;

function startAttendanceListener() {
  if (unsubscribeAttendance) return;
  unsubscribeAttendance = onSnapshot(collection(db, "attendance"), function (snap) {
    attendanceData = {};
    snap.forEach(function (d) { attendanceData[d.id] = d.data(); });
    refreshTableForDate();
  });
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
    dashboardSection.classList.remove("hidden");
    startAttendanceListener();
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
  refreshTableForDate();
  saveDataBox.classList.add("hidden");
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

// Click on a "Present" / "Absent" cell -> save it under the selected date
attendanceBody.addEventListener("click", async function (e) {
  const target = e.target;
  const dateStr = toISO(selectedDate);
  let name = null, status = null;

if (target.classList.contains("present-cell")) { name = target.dataset.student; status = "present"; }
else if (target.classList.contains("half-cell")) { name = target.dataset.student; status = "half"; }
  if (!name) return;

  if (!attendanceData[dateStr]) attendanceData[dateStr] = {};
  attendanceData[dateStr][name] = status;
  markRow(name, dateStr);
if (!saveDataBox.classList.contains("hidden")) renderSummary();

  try {
    await setDoc(doc(db, "attendance", dateStr), { [name]: status }, { merge: true });
  } catch (err) {
    console.error("Save failed:", err);
  }
});

// Update the visual state (green/red) of a student's row for a given date
function markRow(name, dateStr) {
  const dayData = attendanceData[dateStr] || {};
  const status = dayData[name];

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

// Re-paint the whole table to match whichever date is currently selected
// (so switching dates shows/edits that day's attendance)
function refreshTableForDate() {
  const dateStr = toISO(selectedDate);
  students.forEach(function (name) {
    markRow(name, dateStr);
  });
  if (!saveDataBox.classList.contains("hidden")) renderSummary();
}


// Save button -> show present/absent list for the currently selected date
// Selected date ki present / half present list bharo
function renderSummary() {
  const dateStr = toISO(selectedDate);
  const dayData = attendanceData[dateStr] || {};

  const present = [];
  const half = [];

  students.forEach(function (name) {
    if (dayData[name] === "present") present.push(name);
    else if (dayData[name] === "half") half.push(name);
  });

  saveDataTitle.textContent = "Attendance (" + toDisplay(selectedDate) + ")";
  presentListEl.textContent = present.length ? present.join(", ") : "-";
  halfListEl.textContent = half.length ? half.join(", ") : "-";
}

// View Attendance -> box khol/band karo
viewBtn.addEventListener("click", function () {
  if (saveDataBox.classList.contains("hidden")) {
    renderSummary();
    saveDataBox.classList.remove("hidden");
  } else {
    saveDataBox.classList.add("hidden");
  }
});
// Clear All -> selected date ki poori attendance delete
clearAllBtn.addEventListener("click", async function () {
  const dateStr = toISO(selectedDate);

  // pehle screen se turant hatao
  delete attendanceData[dateStr];
  refreshTableForDate();
  saveDataBox.classList.add("hidden");

  // phir Firebase se bhi delete
  try {
    await deleteDoc(doc(db, "attendance", dateStr));
  } catch (err) {
    console.error("Clear failed:", err);
  }
});
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

try {
  await createUserWithEmailAndPassword(auth, toEmail(username), password);
} catch (err) {
  signupMessage.textContent = err.message;
  signupMessage.className = "error";
  return;
}

  signupMessage.textContent = "Account created!";
  signupMessage.className = "success";

  signupSection.classList.add("hidden");
  loginSection.classList.remove("hidden");
});

// Decide which screen to show first when page loads
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