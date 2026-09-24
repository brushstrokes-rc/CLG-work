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

// Tracks status for each student: "present" | "absent" | undefined
const statusMap = {};

// ---------- Element references ----------
const loginSection = document.getElementById("loginSection");
const dashboardSection = document.getElementById("dashboardSection");
const loginForm = document.getElementById("loginForm");
const message = document.getElementById("message");

const attendanceBtn = document.getElementById("attendanceBtn");
const attendanceSection = document.getElementById("attendanceSection");
const attendanceBody = document.getElementById("attendanceBody");
const saveBtn = document.getElementById("saveBtn");
const saveDataBox = document.getElementById("saveDataBox");
const presentListEl = document.getElementById("presentList");
const absentListEl = document.getElementById("absentList");

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

// ---------- Attendance dashboard ----------

// Toggle the attendance table when the blue "Attendance" box is clicked
attendanceBtn.addEventListener("click", function () {
  attendanceSection.classList.toggle("hidden");
});

// Build table rows for each student
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

// Click on a "Present" cell -> mark present (green), clear absent
attendanceBody.addEventListener("click", function (e) {
  const target = e.target;

  if (target.classList.contains("present-cell")) {
    const name = target.dataset.student;
    statusMap[name] = "present";
    markRow(name);
  }

  if (target.classList.contains("absent-cell")) {
    const name = target.dataset.student;
    statusMap[name] = "absent";
    markRow(name);
  }
});

// Update the visual state of a student's row based on statusMap
function markRow(name) {
  const presentCell = attendanceBody.querySelector(
    '.present-cell[data-student="' + name + '"]'
  );
  const absentCell = attendanceBody.querySelector(
    '.absent-cell[data-student="' + name + '"]'
  );

  presentCell.classList.remove("present-active");
  absentCell.classList.remove("absent-active");

  if (statusMap[name] === "present") {
    presentCell.classList.add("present-active");
  } else if (statusMap[name] === "absent") {
    absentCell.classList.add("absent-active");
  }
}

// Save button -> collect present/absent names and show them in the Save Data box
saveBtn.addEventListener("click", function () {
  const present = [];
  const absent = [];

  students.forEach(function (name) {
    if (statusMap[name] === "present") present.push(name);
    else if (statusMap[name] === "absent") absent.push(name);
  });

  presentListEl.textContent = present.length ? present.join(", ") : "-";
  absentListEl.textContent = absent.length ? absent.join(", ") : "-";

  saveDataBox.classList.remove("hidden");
});