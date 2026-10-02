// attendance-view.js — "View Attendance" ka naya page + image download + DELETE button
// window.bsOpenAttendanceView({ title, date, fileDate, mode, present[], half[], absent[] })
(function () {
  var cur = null;
  function $(id) { return document.getElementById(id); }

  function maxRows(d) { return Math.max(d.present.length, d.half.length, d.absent.length); }

  // ---- Table render ----
  function renderTable(d) {
    var wrap = $("avTable");
    wrap.replaceChildren();
    var table = document.createElement("table");
    var head  = table.createTHead().insertRow();
    [["Present", d.present, "p"], ["Half Present", d.half, "h"], ["Absent", d.absent, "a"]].forEach(function (c) {
      var th = document.createElement("th");
      th.className   = c[2];
      th.textContent = c[0] + " (" + c[1].length + ")";
      head.appendChild(th);
    });
    var body = table.createTBody();
    for (var i = 0; i < maxRows(d); i++) {
      var tr = body.insertRow();
      [d.present, d.half, d.absent].forEach(function (list) {
        tr.insertCell().textContent = list[i] || "";
      });
    }
    if (maxRows(d) === 0) {
      var r    = body.insertRow();
      var cell = r.insertCell();
      cell.colSpan = 3; cell.textContent = "No students";
    }
    wrap.appendChild(table);
  }

  // ---- Image (canvas) ----
  function drawImage(d) {
    var W = 1080, pad = 40, colW = (W - pad * 2) / 3, hh = 84, rh = 52;
    var n = Math.max(maxRows(d), 1), top = 170, H = top + hh + n * rh + 110;
    var c = document.createElement("canvas");
    c.width = W; c.height = H;
    var x = c.getContext("2d"), F = "Segoe UI, Arial, sans-serif";

    x.fillStyle = "#fff";       x.fillRect(0, 0, W, H);
    x.fillStyle = "#6b1020";    x.fillRect(0, 0, W, 110);
    x.fillStyle = "#fff";       x.textBaseline = "middle"; x.textAlign = "left";
    x.font = "bold 46px " + F; x.fillText("Brushstrokes", pad, 56);

    x.fillStyle = "#2b2b2b"; x.font = "bold 40px " + F;
    var title = d.title || "Attendance";
    while (title.length > 3 && x.measureText(title).width > W * 0.55) title = title.slice(0, -2);
    x.fillText(title, pad, 142);

    x.font = "28px " + F; x.fillStyle = "#7a5a4a"; x.textAlign = "right";
    x.fillText(d.date, W - pad, 142);
    if (d.mode) {
      var dw = x.measureText(d.date).width;
      x.font = "bold 24px " + F;
      var tw = x.measureText(d.mode).width + 34, tx = W - pad - dw - 18 - tw, ty = 142 - 20, rr = 20;
      x.fillStyle = /^on/i.test(d.mode) ? "#2b78b8" : "#8e44ad";
      x.beginPath();
      x.moveTo(tx + rr, ty); x.lineTo(tx + tw - rr, ty); x.arc(tx + tw - rr, ty + rr, rr, -Math.PI / 2, Math.PI / 2);
      x.lineTo(tx + rr, ty + 2 * rr); x.arc(tx + rr, ty + rr, rr, Math.PI / 2, Math.PI * 1.5);
      x.closePath(); x.fill();
      x.fillStyle = "#fff"; x.textAlign = "center"; x.fillText(d.mode, tx + tw / 2, 142 + 1);
    }

    x.textAlign = "center";
    [["Present", d.present, "#2e7d32"], ["Half Present", d.half, "#1d6fd8"], ["Absent", d.absent, "#c0392b"]].forEach(function (col, i) {
      var cx = pad + i * colW;
      x.fillStyle = col[2]; x.fillRect(cx, top, colW, hh);
      x.fillStyle = "#fff"; x.font = "bold 30px " + F;
      x.fillText(col[0] + " (" + col[1].length + ")", cx + colW / 2, top + hh / 2);
      for (var r = 0; r < n; r++) {
        var y = top + hh + r * rh;
        x.fillStyle = r % 2 ? "#faf6f1" : "#fff"; x.fillRect(cx, y, colW, rh);
        x.fillStyle = "#2b2b2b"; x.font = "26px " + F;
        var te = col[1][r] || "";
        while (te.length > 1 && x.measureText(te).width > colW - 20) te = te.slice(0, -2);
        x.fillText(te, cx + colW / 2, y + rh / 2);
      }
      x.strokeStyle = "#ddd6c9"; x.lineWidth = 2; x.strokeRect(cx, top, colW, hh + n * rh);
    });
    x.fillStyle = "#7a5a4a"; x.font = "24px " + F;
    x.fillText("Brushstroke Society  ·  Ramanujan College, University of Delhi", W / 2, H - 45);
    return c;
  }

  function download() {
    if (!cur) return;
    drawImage(cur).toBlob(function (blob) {
      var slug = (cur.title || "attendance").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = slug + "-" + (cur.fileDate || cur.date.replace(/\//g, "-")) + ".png";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    });
  }

  // ---- Delete attendance event (brushstroke.js ka function call) ----
  function showDeletePopup(onConfirm) {
    var old = document.getElementById("avDelPopup");
    if (old) old.remove();

    var overlay = document.createElement("div");
    overlay.id = "avDelPopup";
    overlay.style.cssText = [
      "position:fixed;inset:0;z-index:300;display:flex;align-items:center;justify-content:center",
      "background:rgba(0,0,0,.55);padding:16px"
    ].join(";");

    var box = document.createElement("div");
    box.style.cssText = [
      "background:#fff;color:#222;border-radius:16px;padding:28px 24px 22px",
      "max-width:360px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,.25);text-align:center"
    ].join(";");

    var msg = document.createElement("p");
    msg.style.cssText = "font-size:16px;font-weight:600;margin:0 0 18px;line-height:1.45";
    msg.textContent   = "Are you sure you want to delete this event attendance?";

    var btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;gap:14px;justify-content:center";

    // NO — #002aff
    var noBtn = document.createElement("button");
    noBtn.textContent = "No";
    noBtn.style.cssText = [
      "flex:1;max-width:120px;padding:12px 0;border:none;border-radius:10px",
      "background:#002aff;color:#fff;font-size:15px;font-weight:700;cursor:pointer"
    ].join(";");
    noBtn.addEventListener("click", function () { overlay.remove(); });

    // YES — #00ff77
    var yesBtn = document.createElement("button");
    yesBtn.textContent = "Yes";
    yesBtn.style.cssText = [
      "flex:1;max-width:120px;padding:12px 0;border:none;border-radius:10px",
      "background:#00ff77;color:#111;font-size:15px;font-weight:700;cursor:pointer"
    ].join(";");
    yesBtn.addEventListener("click", function () {
      overlay.remove();
      onConfirm();
    });

    btnRow.appendChild(noBtn);
    btnRow.appendChild(yesBtn);
    box.appendChild(msg);
    box.appendChild(btnRow);
    overlay.appendChild(box);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  // Delete button click handler
  function handleDelete() {
    if (!cur) return;
    showDeletePopup(async function () {
      if (!cur._firestoreId) {
        // Draft attendance (unsaved event) — sirf Clear All se clear hoti hai
        alert("Yeh ek unsaved draft hai. Attendance clear karne ke liye 'Clear All' use karo.");
        return;
      }
      if (typeof window.bsDeleteAttendanceDoc === "function") {
        await window.bsDeleteAttendanceDoc(cur._firestoreId);
        window.bsShowApp("attendance");
      } else {
        alert("Delete function not available. Page reload karo.");
      }
    });
  }

  // ---- Open page ----
  window.bsOpenAttendanceView = function (d) {
    cur = d;
    $("avTitle").textContent = d.title || "Attendance";
    $("avDate").textContent  = d.date;
    var chip = $("avMode");
    if (d.mode) {
      chip.textContent = d.mode;
      chip.className   = "av-chip " + (/^on/i.test(d.mode) ? "online" : "offline");
      chip.hidden      = false;
    } else { chip.hidden = true; }
    renderTable(d);
    window.bsShowApp("attendancesummary");
  };

  $("avBack").addEventListener("click", function () { window.bsShowApp("attendance"); });
  $("avDownload").addEventListener("click", download);

  // ---- Delete button inject karo (top-right) ----
  (function injectDeleteBtn() {
    var section = document.querySelector(".av");
    if (!section) { setTimeout(injectDeleteBtn, 300); return; }

    // Agar pehle se hai to skip
    if (document.getElementById("avDeleteBtn")) return;

    var btn = document.createElement("button");
    btn.id   = "avDeleteBtn";
    btn.type = "button";
    btn.textContent = "🗑 Delete";
    btn.style.cssText = [
      "position:absolute;top:16px;right:16px",
      "background:#c0392b;color:#fff;border:none;border-radius:8px",
      "padding:8px 16px;font-size:13px;font-weight:700;cursor:pointer;z-index:10"
    ].join(";");
    btn.addEventListener("click", handleDelete);

    // section ko relative position de
    section.style.position = "relative";
    section.insertBefore(btn, section.firstChild);
  })();

})();