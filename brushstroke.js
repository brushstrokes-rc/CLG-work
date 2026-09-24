const VALID_USERNAME = "brushstrokes";
const VALID_PASSWORD = "art4ever";

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
const STORAGE_KEY = "brushstrokes_attendance_data";

function loadAttendanceData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    return {};
  }
}

function saveAttendanceData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(attendanceData));
  } catch (err) {
    // storage unavailable/full — attendance still works for this session
  }
}

const attendanceData = loadAttendanceData();

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
const saveBtn = document.getElementById("saveBtn");
const saveDataBox = document.getElementById("saveDataBox");
const saveDataTitle = document.getElementById("saveDataTitle");
const presentListEl = document.getElementById("presentList");
const absentListEl = document.getElementById("absentList");

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
loginForm.addEventListener("submit", function (e) {
  e.preventDefault();

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  if (username === VALID_USERNAME && password === VALID_PASSWORD) {
    message.textContent = "Login successful!";
    message.className = "success";

    // Hide login, reveal the attendance dashboard
    loginSection.classList.add("hidden");
    dashboardSection.classList.remove("hidden");
  } else {
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

    const absentCell = document.createElement("td");
    absentCell.className = "status-cell absent-cell";
    absentCell.dataset.student = name;

    row.appendChild(nameCell);
    row.appendChild(presentCell);
    row.appendChild(absentCell);
    attendanceBody.appendChild(row);
  });
}

buildTable();
refreshTableForDate();

// Click on a "Present" / "Absent" cell -> save it under the selected date
attendanceBody.addEventListener("click", function (e) {
  const target = e.target;
  const dateStr = toISO(selectedDate);

  if (!attendanceData[dateStr]) attendanceData[dateStr] = {};

  if (target.classList.contains("present-cell")) {
    const name = target.dataset.student;
    attendanceData[dateStr][name] = "present";
    markRow(name, dateStr);
    saveAttendanceData();
  }

  if (target.classList.contains("absent-cell")) {
    const name = target.dataset.student;
    attendanceData[dateStr][name] = "absent";
    markRow(name, dateStr);
    saveAttendanceData();
  }
});

// Update the visual state (green/red) of a student's row for a given date
function markRow(name, dateStr) {
  const dayData = attendanceData[dateStr] || {};
  const status = dayData[name];

  const presentCell = attendanceBody.querySelector(
    '.present-cell[data-student="' + name + '"]'
  );
  const absentCell = attendanceBody.querySelector(
    '.absent-cell[data-student="' + name + '"]'
  );

  presentCell.classList.remove("present-active");
  absentCell.classList.remove("absent-active");

  if (status === "present") {
    presentCell.classList.add("present-active");
  } else if (status === "absent") {
    absentCell.classList.add("absent-active");
  }
}

// Re-paint the whole table to match whichever date is currently selected
// (so switching dates shows/edits that day's attendance)
function refreshTableForDate() {
  const dateStr = toISO(selectedDate);
  students.forEach(function (name) {
    markRow(name, dateStr);
  });
}

// Save button -> show present/absent list for the currently selected date
saveBtn.addEventListener("click", function () {
  const dateStr = toISO(selectedDate);
  const dayData = attendanceData[dateStr] || {};

  const present = [];
  const absent = [];

  students.forEach(function (name) {
    if (dayData[name] === "present") present.push(name);
    else if (dayData[name] === "absent") absent.push(name);
  });

  saveDataTitle.textContent = "Save Data (" + toDisplay(selectedDate) + ")";
  presentListEl.textContent = present.length ? present.join(", ") : "-";
  absentListEl.textContent = absent.length ? absent.join(", ") : "-";

  saveDataBox.classList.remove("hidden");
});