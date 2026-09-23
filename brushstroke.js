const VALID_USERNAME = "brushstrokes";
const VALID_PASSWORD = "art4ever";

document.getElementById("loginForm").addEventListener("submit", function (e) {
  e.preventDefault();

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  const message = document.getElementById("message");

  if (username === VALID_USERNAME && password === VALID_PASSWORD) {
    message.textContent = "Login successful!";
    message.className = "success";
  } else {
    message.textContent = "Invalid username or password.";
    message.className = "error";
  }
});

