// attendance-view.js — "View Attendance" ka naya page + image download
// Kaise use hota hai:  window.bsOpenAttendanceView({
//   title: "Attendance" ya event ka naam, date: "01/10/26", fileDate: "2026-10-01",
//   mode: "Online" | "Offline" | "", present: [...], half: [...], absent: [...] })
(function () {
  var cur = null;
  function $(id) { return document.getElementById(id); }

  function maxRows(d) { return Math.max(d.present.length, d.half.length, d.absent.length); }

  function renderTable(d) {
    var wrap = $("avTable");
    wrap.replaceChildren();
    var table = document.createElement("table");
    var head = table.createTHead().insertRow();
    [["Present", d.present, "p"], ["Half Present", d.half, "h"], ["Absent", d.absent, "a"]].forEach(function (c) {
      var th = document.createElement("th");
      th.className = c[2];
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
      var r = body.insertRow(), cell = r.insertCell();
      cell.colSpan = 3; cell.textContent = "No students";
    }
    wrap.appendChild(table);
  }

  // ---------- image banao (canvas) ----------
  function drawImage(d) {
    var W = 1080, pad = 40, colW = (W - pad * 2) / 3, hh = 84, rh = 52, n = Math.max(maxRows(d), 1);
    var top = 170, H = top + hh + n * rh + 110;
    var c = document.createElement("canvas");
    c.width = W; c.height = H;
    var x = c.getContext("2d");
    var F = "Segoe UI, Arial, sans-serif";

    x.fillStyle = "#fff"; x.fillRect(0, 0, W, H);
    x.fillStyle = "#6b1020"; x.fillRect(0, 0, W, 110);
    x.fillStyle = "#fff"; x.textBaseline = "middle"; x.textAlign = "left";
    x.font = "bold 46px " + F; x.fillText("Brushstrokes", pad, 56);

    x.fillStyle = "#2b2b2b"; x.font = "bold 40px " + F;
    var title = d.title || "Attendance";
    while (title.length > 3 && x.measureText(title).width > W * 0.55) title = title.slice(0, -2);
    x.fillText(title, pad, 142);

    // date (right) + online/offline tag (date ke left me)
    x.font = "28px " + F; x.fillStyle = "#7a5a4a"; x.textAlign = "right";
    x.fillText(d.date, W - pad, 142);
    if (d.mode) {
      var dw = x.measureText(d.date).width, tag = d.mode, tw;
      x.font = "bold 24px " + F; tw = x.measureText(tag).width + 34;
      var tx = W - pad - dw - 18 - tw;
      x.fillStyle = /^on/i.test(tag) ? "#2b78b8" : "#8e44ad";
      var ty = 142 - 20, rr = 20;   // gol kone wala tag (purane browsers me roundRect nahi hota, isliye arc se)
      x.beginPath();
      x.moveTo(tx + rr, ty); x.lineTo(tx + tw - rr, ty); x.arc(tx + tw - rr, ty + rr, rr, -Math.PI / 2, Math.PI / 2);
      x.lineTo(tx + rr, ty + 2 * rr); x.arc(tx + rr, ty + rr, rr, Math.PI / 2, Math.PI * 1.5);
      x.closePath(); x.fill();
      x.fillStyle = "#fff"; x.textAlign = "center"; x.fillText(tag, tx + tw / 2, 142 + 1);
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
        var t = col[1][r] || "";
        while (t.length > 1 && x.measureText(t).width > colW - 20) t = t.slice(0, -2);
        x.fillText(t, cx + colW / 2, y + rh / 2);
      }
      x.strokeStyle = "#ddd6c9"; x.lineWidth = 2; x.strokeRect(cx, top, colW, hh + n * rh);
    });

    x.fillStyle = "#7a5a4a"; x.font = "24px " + F;
    x.fillText("Brushstroke Society  \u00B7  Ramanujan College, University of Delhi", W / 2, H - 45);
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

  // ---------- page kholo ----------
  window.bsOpenAttendanceView = function (d) {
    cur = d;
    $("avTitle").textContent = d.title || "Attendance";
    $("avDate").textContent = d.date;
    var chip = $("avMode");
    if (d.mode) {
      chip.textContent = d.mode;
      chip.className = "av-chip " + (/^on/i.test(d.mode) ? "online" : "offline");
      chip.hidden = false;
    } else { chip.hidden = true; }
    renderTable(d);
    window.bsShowApp("attendancesummary");
  };

  $("avBack").addEventListener("click", function () { window.bsShowApp("attendance"); });
  $("avDownload").addEventListener("click", download);
})();