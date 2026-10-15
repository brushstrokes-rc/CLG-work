// ================================================================
//  announcements.js  —  Announcement Maker (Complete Rewrite)
//  - Multiple draggable text boxes on canvas
//  - Toolbar: font size, font, text color, bg color, align
//  - Undo / Redo / Clear All
//  - Upload → Firestore + Storage preview PNG → card on page
//  - Edit (reopen) / Delete
// ================================================================
import { getApp }  from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, setDoc,
  deleteDoc, onSnapshot, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import {
  getStorage, ref as sRef, uploadString,
  getDownloadURL, deleteObject, listAll
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-storage.js";

const auth    = getAuth(getApp());
const db      = getFirestore(getApp());
const storage = getStorage(getApp());

// ── State ─────────────────────────────────────────────────────────
let editingId   = null;
let annUnsub    = null;
let boxes       = [];          // array of box objects
let selectedId  = null;
let undoStack   = [];
let redoStack   = [];
let idCounter   = 0;

function newId() { return "b" + (++idCounter); }

// Default box template
function defaultBox(id) {
  return {
    id,
    text:       "Write your text here…",
    x:          60,
    y:          60,
    fontSize:   36,
    fontFamily: "'Pacifico',cursive",
    color:      "#1a1a1a",
    align:      "center",
    width:      460,   // px
  };
}

// ── Undo / Redo helpers ───────────────────────────────────────────
function snapshot() {
  return JSON.stringify(boxes.map(b => ({ ...b })));
}
function pushUndo() {
  undoStack.push(snapshot());
  if (undoStack.length > 40) undoStack.shift();
  redoStack = [];
}
function undo() {
  if (!undoStack.length) return;
  redoStack.push(snapshot());
  boxes = JSON.parse(undoStack.pop());
  selectedId = null;
  renderCanvas();
}
function redo() {
  if (!redoStack.length) return;
  undoStack.push(snapshot());
  boxes = JSON.parse(redoStack.pop());
  selectedId = null;
  renderCanvas();
}

// ── Canvas render ─────────────────────────────────────────────────
function getCanvas()  { return document.getElementById("annCanvas"); }
function getToolbar() { return document.getElementById("annToolbarWrap"); }

function renderCanvas() {
  const cv = getCanvas();
  if (!cv) return;
  // Keep only non-box children (nothing extra here, but safe)
  cv.querySelectorAll(".ann-box").forEach(el => el.remove());

  boxes.forEach(box => {
    const wrap = document.createElement("div");
    wrap.className = "ann-box" + (box.id === selectedId ? " ann-box-selected" : "");
    wrap.dataset.id = box.id;
    wrap.style.cssText = `
      position:absolute;
      left:${box.x}px;
      top:${box.y}px;
      width:${box.width}px;
      cursor:move;
      padding:6px 8px;
      box-sizing:border-box;
      border-radius:3px;
      user-select:none;
    `;

    // The editable text inside
    const txt = document.createElement("div");
    txt.className      = "ann-box-text";
    txt.contentEditable = "true";
    txt.spellcheck      = false;
    txt.style.cssText  = `
      font-size:${box.fontSize}px;
      font-family:${box.fontFamily};
      color:${box.color};
      text-align:${box.align};
      outline:none;
      word-break:break-word;
      white-space:pre-wrap;
      line-height:1.35;
      min-height:1em;
      cursor:text;
    `;
    txt.innerHTML = box.text;

    // Sync text back on edit
    txt.addEventListener("input", () => {
      box.text = txt.innerHTML;
    });
    // Select this box when clicking text
    txt.addEventListener("mousedown", e => {
      e.stopPropagation();
      selectBox(box.id);
    });
    txt.addEventListener("focus", () => selectBox(box.id));

    wrap.appendChild(txt);

    // ── Drag logic on the wrap (not the text) ──
    wrap.addEventListener("mousedown", e => {
      // Only drag if NOT clicking directly on the text (text area handles its own clicks)
      if (e.target === txt || txt.contains(e.target)) return;
      e.preventDefault();
      selectBox(box.id);
      startDrag(e, box, wrap);
    });

    // Also allow dragging by clicking the border area (2px around)
    // We add a thin invisible drag-handle strip at top
    const handle = document.createElement("div");
    handle.className = "ann-drag-handle";
    handle.title = "Drag to move";
    handle.style.cssText = `
      position:absolute;
      top:0; left:0; right:0;
      height:14px;
      cursor:move;
      background:${box.id === selectedId ? "rgba(43,120,184,.15)" : "transparent"};
      border-radius:3px 3px 0 0;
      display:flex;
      align-items:center;
      justify-content:center;
      font-size:9px;
      color:rgba(43,120,184,.6);
      letter-spacing:2px;
    `;
    handle.textContent = box.id === selectedId ? "✦ drag ✦" : "";
    handle.addEventListener("mousedown", e => {
      e.preventDefault();
      selectBox(box.id);
      startDrag(e, box, wrap);
    });
    wrap.insertBefore(handle, txt);

    // Add padding-top so text doesn't sit under handle
    txt.style.paddingTop = "14px";

    // Delete button (visible on select)
    if (box.id === selectedId) {
      const delBtn = document.createElement("button");
      delBtn.className = "ann-box-del";
      delBtn.title = "Delete this text";
      delBtn.textContent = "✕";
      delBtn.style.cssText = `
        position:absolute;
        top:-10px; right:-10px;
        width:22px; height:22px;
        border-radius:50%;
        border:none;
        background:#c0392b;
        color:#fff;
        font-size:11px;
        font-weight:700;
        cursor:pointer;
        display:flex;
        align-items:center;
        justify-content:center;
        z-index:10;
        line-height:1;
      `;
      delBtn.addEventListener("mousedown", e => {
        e.preventDefault();
        e.stopPropagation();
        pushUndo();
        boxes = boxes.filter(b => b.id !== box.id);
        selectedId = null;
        renderCanvas();
      });
      wrap.appendChild(delBtn);
    }

    cv.appendChild(wrap);
  });
}

// ── Drag ─────────────────────────────────────────────────────────
function startDrag(e, box, wrap) {
  const startX = e.clientX;
  const startY = e.clientY;
  const origX  = box.x;
  const origY  = box.y;
  let moved    = false;

  function onMove(mv) {
    const dx = mv.clientX - startX;
    const dy = mv.clientY - startY;
    if (!moved && Math.abs(dx) + Math.abs(dy) > 3) {
      pushUndo();
      moved = true;
    }
    box.x = Math.max(0, origX + dx);
    box.y = Math.max(0, origY + dy);
    wrap.style.left = box.x + "px";
    wrap.style.top  = box.y + "px";
  }
  function onUp() {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup",   onUp);
  }
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup",   onUp);
}

// ── Select box + sync toolbar ─────────────────────────────────────
function selectBox(id) {
  if (selectedId === id) return;
  selectedId = id;
  renderCanvas();
  syncToolbarToBox(id);
  // Focus the text inside
  requestAnimationFrame(() => {
    const el = document.querySelector(`.ann-box[data-id="${id}"] .ann-box-text`);
    if (el) el.focus();
  });
}

function syncToolbarToBox(id) {
  const box = boxes.find(b => b.id === id);
  if (!box) return;
  const fs = document.getElementById("annFontSize");
  const fn = document.getElementById("annFont");
  const tc = document.getElementById("annTextColor");
  if (fs) fs.value = box.fontSize;
  if (fn) fn.value = box.fontFamily;
  if (tc) tc.value = box.color.startsWith("#") ? box.color : "#1a1a1a";
  document.querySelectorAll(".ann-align-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.align === box.align);
  });
}

// ── Apply toolbar change to selected box ─────────────────────────
function applyToSelected(fn) {
  const box = boxes.find(b => b.id === selectedId);
  if (!box) return;
  fn(box);
  // Update just the style of the text element (no full re-render = no focus loss)
  const el = document.querySelector(`.ann-box[data-id="${box.id}"] .ann-box-text`);
  if (!el) return;
  el.style.fontSize   = box.fontSize   + "px";
  el.style.fontFamily = box.fontFamily;
  el.style.color      = box.color;
  el.style.textAlign  = box.align;
}

// ── Toolbar bindings ──────────────────────────────────────────────
function bindToolbar() {
  // Font size — live as user types
  const fsInput = document.getElementById("annFontSize");
  fsInput.addEventListener("input", () => {
    const val = parseInt(fsInput.value);
    if (!val || val < 6) return;   // skip if empty / too small while typing
    applyToSelected(b => { b.fontSize = val; });
  });

  // Font family
  document.getElementById("annFont").addEventListener("change", e => {
    applyToSelected(b => { b.fontFamily = e.target.value; });
  });

  // Text color
  document.getElementById("annTextColor").addEventListener("input", e => {
    applyToSelected(b => { b.color = e.target.value; });
  });

  // BG color
  document.getElementById("annBgColor").addEventListener("input", e => {
    const cv = getCanvas();
    if (cv) cv.style.background = e.target.value;
  });

  // Align
  document.querySelectorAll(".ann-align-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".ann-align-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      applyToSelected(b => { b.align = btn.dataset.align; });
    });
  });

  // Add Text button
  document.getElementById("annAddTextBtn").addEventListener("click", () => {
    pushUndo();
    const box = defaultBox(newId());
    // Stagger new boxes so they don't overlap exactly
    box.x = 60 + (boxes.length * 10) % 100;
    box.y = 60 + (boxes.length * 10) % 100;
    boxes.push(box);
    selectedId = box.id;
    renderCanvas();
    syncToolbarToBox(box.id);
    requestAnimationFrame(() => {
      const el = document.querySelector(`.ann-box[data-id="${box.id}"] .ann-box-text`);
      if (el) { el.focus(); el.select && el.select(); }
    });
  });

  // Undo / Redo
  document.getElementById("annUndoBtn").addEventListener("click", undo);
  document.getElementById("annRedoBtn").addEventListener("click", redo);

  // Clear All
  document.getElementById("annClearBtn").addEventListener("click", () => {
    if (!boxes.length) return;
    if (!confirm("Clear all text boxes?")) return;
    pushUndo();
    boxes = [];
    selectedId = null;
    renderCanvas();
  });

  // Keyboard shortcuts
  document.addEventListener("keydown", e => {
    const ed = document.getElementById("annEditor");
    if (!ed || ed.classList.contains("ann-editor-hidden")) return;
    if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); undo(); }
    if ((e.ctrlKey || e.metaKey) && e.key === "y") { e.preventDefault(); redo(); }
    if ((e.key === "Delete" || e.key === "Backspace") && e.target === document.body && selectedId) {
      e.preventDefault();
      pushUndo();
      boxes = boxes.filter(b => b.id !== selectedId);
      selectedId = null;
      renderCanvas();
    }
  });

  // Close editor
  document.getElementById("annCloseBtn").addEventListener("click", () => {
    if (confirm("Close editor? Unsaved changes will be lost.")) closeEditor();
  });

  // Upload button
  document.getElementById("annUploadBtn").addEventListener("click", uploadAnnouncement);

  // Add Announcement button on listing page
  document.getElementById("annAddBtn").addEventListener("click", () => openEditor(null, null));

  // Deselect when clicking canvas background
  getCanvas().addEventListener("mousedown", e => {
    if (e.target === getCanvas()) {
      selectedId = null;
      renderCanvas();
    }
  });
}

// ── Open / Close editor ───────────────────────────────────────────
function openEditor(docId, savedData) {
  editingId  = docId || null;
  boxes      = [];
  selectedId = null;
  undoStack  = [];
  redoStack  = [];

  const cv = getCanvas();

  if (savedData && savedData.boxes) {
    // Restore saved boxes
    boxes = savedData.boxes.map(b => ({ ...b }));
    idCounter = boxes.reduce((m, b) => Math.max(m, parseInt(b.id.slice(1)) || 0), 0);
    // Restore bg
    if (cv && savedData.bgColor) cv.style.background = savedData.bgColor;
    document.getElementById("annBgColor").value = savedData.bgColor || "#fffef8";
    document.getElementById("annTitle").value   = savedData.title   || "";
  } else {
    // Fresh: one default text box
    if (cv) cv.style.background = "#fffef8";
    document.getElementById("annBgColor").value = "#fffef8";
    document.getElementById("annTitle").value   = "";
    const b = defaultBox(newId());
    b.x = 40; b.y = 80;
    boxes.push(b);
    selectedId = b.id;
  }

  renderCanvas();
  if (selectedId) syncToolbarToBox(selectedId);

  document.getElementById("annEditor").classList.remove("ann-editor-hidden");
  document.body.style.overflow = "hidden";
}

function closeEditor() {
  document.getElementById("annEditor").classList.add("ann-editor-hidden");
  document.body.style.overflow = "";
}

// ── Capture poster preview PNG (pure Canvas API — no html2canvas needed) ──
async function capturePreview() {
  const cv     = getCanvas();
  const bgColor = document.getElementById("annBgColor").value || "#fffef8";

  // Sync latest text from DOM into boxes first
  boxes.forEach(box => {
    const el = cv.querySelector(`.ann-box[data-id="${box.id}"] .ann-box-text`);
    if (el) box.text = el.innerText || el.textContent || "";
  });

  // Canvas dimensions matching the poster div
  const W = cv.offsetWidth  || 560;
  const H = cv.offsetHeight || 792;

  const c   = document.createElement("canvas");
  c.width   = W;
  c.height  = H;
  const ctx = c.getContext("2d");

  // Background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, W, H);

  // Draw each text box
  boxes.forEach(box => {
    const fontSize   = box.fontSize   || 36;
    const fontFamily = (box.fontFamily || "'Pacifico',cursive").replace(/'/g, "");
    const color      = box.color      || "#1a1a1a";
    const align      = box.align      || "center";
    const x          = box.x          || 0;
    const y          = box.y          || 0;
    const width      = box.width      || W - 80;
    const text       = (box.text      || "").replace(/<[^>]*>/g, ""); // strip any HTML tags

    ctx.font      = `${fontSize}px ${fontFamily}, sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = align;

    // x origin for textAlign
    const drawX = align === "center" ? x + width / 2
                : align === "right"  ? x + width
                : x + 8;

    // Word-wrap
    const words    = text.split(" ");
    const maxW     = width - 16;
    let   line     = "";
    let   lineY    = y + fontSize + 14; // top padding
    const lineH    = fontSize * 1.4;

    words.forEach(word => {
      const test = line ? line + " " + word : word;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, drawX, lineY);
        line  = word;
        lineY += lineH;
      } else {
        line = test;
      }
    });
    if (line) ctx.fillText(line, drawX, lineY);
  });

  return c.toDataURL("image/png", 0.92);
}

// ── Upload (publish) announcement ─────────────────────────────────
async function uploadAnnouncement() {
  const user = auth.currentUser;
  if (!user) { alert("Not logged in."); return; }
  if (!boxes.length) { alert("Add at least one text box first."); return; }

  const title   = (document.getElementById("annTitle").value || "").trim() || "Untitled";
  const bgColor = document.getElementById("annBgColor").value || "#fffef8";
  const btn     = document.getElementById("annUploadBtn");

  btn.disabled    = true;
  btn.textContent = "Saving…";

  // 1. Sync text from DOM into boxes
  boxes.forEach(box => {
    const el = document.querySelector(`.ann-box[data-id="${box.id}"] .ann-box-text`);
    if (el) box.text = el.innerText || el.textContent || "";
  });

  // 2. Generate preview PNG FIRST (before any async Firestore call)
  btn.textContent = "Generating preview…";
  let previewData = null;
  try {
    previewData = await capturePreview();
  } catch (e) {
    console.error("Preview generation failed:", e);
  }

  const projectData = {
    title,
    bgColor,
    boxes: boxes.map(b => ({ ...b }))
  };

  btn.textContent = "Uploading…";

  try {
    let docId = editingId;

    // 3. Save/update Firestore doc
    if (!docId) {
      const r = await addDoc(collection(db, "announcements"), {
        ...projectData,
        published:  true,
        previewUrl: "",
        createdAt:  serverTimestamp(),
        updatedAt:  serverTimestamp(),
        createdBy:  user.uid
      });
      docId     = r.id;
      editingId = docId;
    } else {
      await setDoc(doc(db, "announcements", docId), {
        ...projectData,
        published: true,
        updatedAt: serverTimestamp()
      }, { merge: true });
    }

    // 4. Upload preview PNG to Firebase Storage
    if (previewData) {
      btn.textContent = "Uploading preview…";
      const pRef = sRef(storage, `announcements/${docId}/preview.png`);
      await uploadString(pRef, previewData, "data_url");
      const previewUrl = await getDownloadURL(pRef);
      await setDoc(doc(db, "announcements", docId),
        { previewUrl }, { merge: true });
    }

    // 5. Done
    btn.textContent = "✅ Done!";
    setTimeout(() => {
      btn.disabled    = false;
      btn.textContent = "📤 Upload";
      closeEditor();
    }, 800);

  } catch (e) {
    console.error("Upload failed:", e);
    alert("Upload failed — error: " + e.message);
    btn.disabled    = false;
    btn.textContent = "📤 Upload";
  }
}

// ── Delete confirmation ───────────────────────────────────────────
function confirmDelete(ann) {
  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;z-index:700;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);padding:16px;";
  overlay.innerHTML = `
    <div style="background:#fff;color:#222;border-radius:16px;padding:28px 24px 22px;max-width:360px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,.25);text-align:center;">
      <p style="font-size:16px;font-weight:700;margin:0 0 6px;">Delete this announcement?</p>
      <p style="font-size:13px;color:#666;margin:0 0 22px;">"${(ann.title || "Untitled").replace(/</g,"&lt;")}"</p>
      <div style="display:flex;gap:12px;justify-content:center;">
        <button data-no style="flex:1;max-width:120px;padding:11px 0;border:none;border-radius:10px;background:#002aff;color:#fff;font-size:15px;font-weight:700;cursor:pointer;">No</button>
        <button data-yes style="flex:1;max-width:120px;padding:11px 0;border:none;border-radius:10px;background:#00ff77;color:#111;font-size:15px;font-weight:700;cursor:pointer;">Yes, Delete</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  overlay.querySelector("[data-no]").addEventListener("click",  () => overlay.remove());
  overlay.querySelector("[data-yes]").addEventListener("click", async () => {
    overlay.remove();
    try {
      try {
        const folder = sRef(storage, `announcements/${ann.id}`);
        const listed = await listAll(folder);
        await Promise.all(listed.items.map(r => deleteObject(r)));
      } catch (_) {}
      await deleteDoc(doc(db, "announcements", ann.id));
    } catch (e) {
      console.error("Delete failed:", e);
      alert("Delete failed — check console.");
    }
  });
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
}

// ── Render announcements listing page ────────────────────────────
function renderGrid(list) {
  const grid  = document.getElementById("annGrid");
  const empty = document.getElementById("annEmpty");
  if (!grid || !empty) return;

  grid.replaceChildren();
  const published = list.filter(a => a.published);

  if (!published.length) { empty.hidden = false; return; }
  empty.hidden = true;

  published.forEach(ann => {
    const card = document.createElement("div");
    card.className = "ann-card";

    if (ann.previewUrl) {
      const img = document.createElement("img");
      img.className = "ann-card-thumb";
      img.src       = ann.previewUrl;
      img.alt       = ann.title || "Announcement";
      img.loading   = "lazy";
      card.appendChild(img);
    } else {
      const ph = document.createElement("div");
      ph.className   = "ann-card-thumb-ph";
      ph.textContent = "📢";
      card.appendChild(ph);
    }

    const body  = document.createElement("div");
    body.className = "ann-card-body";
    const ttl   = document.createElement("div");
    ttl.className   = "ann-card-title";
    ttl.textContent = ann.title || "Untitled";
    const dt    = document.createElement("div");
    dt.className    = "ann-card-date";
    dt.textContent  = ann.createdAt?.toDate
      ? ann.createdAt.toDate().toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" })
      : "";
    body.append(ttl, dt);
    card.appendChild(body);

    const actions = document.createElement("div");
    actions.className = "ann-card-actions";

    const editBtn = document.createElement("button");
    editBtn.className   = "ann-btn-edit";
    editBtn.textContent = "✏️ Edit";
    editBtn.addEventListener("click", () => openEditor(ann.id, ann));

    const delBtn = document.createElement("button");
    delBtn.className   = "ann-btn-del";
    delBtn.textContent = "🗑️ Delete";
    delBtn.addEventListener("click", () => confirmDelete(ann));

    actions.append(editBtn, delBtn);
    card.appendChild(actions);
    grid.appendChild(card);
  });
}

// ── Firestore real-time listener ──────────────────────────────────
function startListener() {
  if (annUnsub) return;
  const q = query(collection(db, "announcements"), orderBy("createdAt", "desc"));
  annUnsub = onSnapshot(q, snap => {
    const list = [];
    snap.forEach(d => list.push({ id: d.id, ...d.data() }));
    renderGrid(list);
  }, err => console.error("Ann listener:", err));
}

// ── Init ──────────────────────────────────────────────────────────
function init() {
  bindToolbar();
  startListener();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}