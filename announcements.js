// ================================================================
//  announcements.js  —  Simple Announcement Maker
//  Features: text editor (size, font, color, bg, align)
//            Upload → Firestore + preview card on announcements page
//            Edit → reopen same poster
//            Delete → remove from page
// ================================================================
import { getApp }  from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, setDoc,
  deleteDoc, onSnapshot, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import {
  getStorage, ref, uploadString, getDownloadURL, deleteObject, listAll
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-storage.js";

const auth    = getAuth(getApp());
const db      = getFirestore(getApp());
const storage = getStorage(getApp());

// ── DOM refs ──────────────────────────────────────────────────────
const editor     = () => document.getElementById("annEditor");
const canvas     = () => document.getElementById("annCanvas");
const textEl     = () => document.getElementById("annText");
const annGrid    = () => document.getElementById("annGrid");
const annEmpty   = () => document.getElementById("annEmpty");

// ── State ─────────────────────────────────────────────────────────
let editingId  = null;   // Firestore docId (null = new poster)
let annUnsub   = null;

// ── Open / Close editor ───────────────────────────────────────────
function openEditor(docId, savedData) {
  editingId = docId || null;

  // Reset to defaults
  const fs    = document.getElementById("annFontSize");
  const font  = document.getElementById("annFont");
  const tc    = document.getElementById("annTextColor");
  const bg    = document.getElementById("annBgColor");
  const title = document.getElementById("annTitle");

  if (savedData) {
    fs.value    = savedData.fontSize  || 32;
    font.value  = savedData.font      || "'Pacifico',cursive";
    tc.value    = savedData.textColor || "#1a1a1a";
    bg.value    = savedData.bgColor   || "#fffef8";
    title.value = savedData.title     || "";
    textEl().innerHTML = savedData.html || "Write your announcement here…";
    // Restore align active state
    document.querySelectorAll(".ann-align-btn").forEach(b => {
      b.classList.toggle("active", b.dataset.align === (savedData.align || "center"));
    });
    applyAlign(savedData.align || "center");
  } else {
    fs.value    = 32;
    font.value  = "'Pacifico',cursive";
    tc.value    = "#1a1a1a";
    bg.value    = "#fffef8";
    title.value = "";
    textEl().innerHTML = "Write your announcement here…";
    document.querySelectorAll(".ann-align-btn").forEach((b, i) => b.classList.toggle("active", i === 1));
    applyAlign("center");
  }

  applyStyles();
  editor().classList.remove("ann-editor-hidden");
  document.body.style.overflow = "hidden";
  textEl().focus();
}

function closeEditor() {
  editor().classList.add("ann-editor-hidden");
  document.body.style.overflow = "";
}

// ── Apply text styles to canvas ───────────────────────────────────
function applyStyles() {
  const t  = textEl();
  const cv = canvas();
  if (!t || !cv) return;

  const fontSize  = parseInt(document.getElementById("annFontSize").value) || 32;
  const font      = document.getElementById("annFont").value;
  const textColor = document.getElementById("annTextColor").value;
  const bgColor   = document.getElementById("annBgColor").value;

  t.style.fontSize   = fontSize + "px";
  t.style.fontFamily = font;
  t.style.color      = textColor;
  cv.style.background = bgColor;
}

function applyAlign(align) {
  const t = textEl();
  if (t) t.style.textAlign = align;
}

// ── Toolbar bindings ──────────────────────────────────────────────
function bindToolbar() {
  // Font size — use "input" so typing a number works live, not just on blur
  document.getElementById("annFontSize").addEventListener("input", applyStyles);
  document.getElementById("annFontSize").addEventListener("change", applyStyles);

  document.getElementById("annFont").addEventListener("change", applyStyles);
  document.getElementById("annTextColor").addEventListener("input", applyStyles);
  document.getElementById("annBgColor").addEventListener("input", applyStyles);

  // Align buttons
  document.querySelectorAll(".ann-align-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".ann-align-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      applyAlign(btn.dataset.align);
    });
  });

  // Close
  document.getElementById("annCloseBtn").addEventListener("click", () => {
    if (confirm("Close editor? Unsaved changes will be lost.")) closeEditor();
  });

  // Upload
  document.getElementById("annUploadBtn").addEventListener("click", uploadAnnouncement);

  // Add Announcement button on the page
  document.getElementById("annAddBtn").addEventListener("click", () => openEditor(null, null));
}

// ── Capture poster as PNG via html2canvas ─────────────────────────
async function capturePreview() {
  if (typeof html2canvas === "undefined") return null;
  try {
    const c = await html2canvas(canvas(), {
      scale: 1,
      useCORS: true,
      backgroundColor: document.getElementById("annBgColor").value || "#fffef8"
    });
    return c.toDataURL("image/png", 0.85);
  } catch (e) {
    console.error("Preview capture failed:", e);
    return null;
  }
}

// ── Upload (publish) announcement ─────────────────────────────────
async function uploadAnnouncement() {
  const user = auth.currentUser;
  if (!user) { alert("Not logged in."); return; }

  const title     = document.getElementById("annTitle").value.trim() || "Untitled";
  const fontSize  = parseInt(document.getElementById("annFontSize").value) || 32;
  const font      = document.getElementById("annFont").value;
  const textColor = document.getElementById("annTextColor").value;
  const bgColor   = document.getElementById("annBgColor").value;
  const html      = textEl().innerHTML;
  const align     = document.querySelector(".ann-align-btn.active")?.dataset.align || "center";

  const btn = document.getElementById("annUploadBtn");
  btn.disabled = true;
  btn.textContent = "Uploading…";

  try {
    // 1. Save or update Firestore doc
    let docId = editingId;
    const projectData = { title, fontSize, font, textColor, bgColor, html, align };

    if (!docId) {
      const ref_ = await addDoc(collection(db, "announcements"), {
        ...projectData,
        published: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: user.uid,
        previewUrl: ""
      });
      docId = ref_.id;
      editingId = docId;
    } else {
      await setDoc(doc(db, "announcements", docId), {
        ...projectData,
        published: true,
        updatedAt: serverTimestamp()
      }, { merge: true });
    }

    // 2. Generate preview PNG and upload to Storage
    const previewData = await capturePreview();
    if (previewData) {
      const pRef = ref(storage, `announcements/${docId}/preview.png`);
      await uploadString(pRef, previewData, "data_url");
      const previewUrl = await getDownloadURL(pRef);
      await setDoc(doc(db, "announcements", docId), { previewUrl }, { merge: true });
    }

    btn.textContent = "✅ Uploaded!";
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = "📤 Upload";
      closeEditor();
    }, 1000);

  } catch (e) {
    console.error("Upload failed:", e);
    alert("Upload failed. Check console.");
    btn.disabled = false;
    btn.textContent = "📤 Upload";
  }
}

// ── Delete announcement ───────────────────────────────────────────
function confirmDelete(ann) {
  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;z-index:700;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);padding:16px";

  const box = document.createElement("div");
  box.style.cssText = "background:#fff;color:#222;border-radius:16px;padding:28px 24px 22px;max-width:360px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,.25);text-align:center";
  box.innerHTML = `
    <p style="font-size:16px;font-weight:700;margin:0 0 6px">Delete this announcement?</p>
    <p style="font-size:13px;color:#666;margin:0 0 22px">"${ann.title || "Untitled"}"</p>
    <div style="display:flex;gap:12px;justify-content:center">
      <button id="annPopNo"  style="flex:1;max-width:120px;padding:11px 0;border:none;border-radius:10px;background:#002aff;color:#fff;font-size:15px;font-weight:700;cursor:pointer">No</button>
      <button id="annPopYes" style="flex:1;max-width:120px;padding:11px 0;border:none;border-radius:10px;background:#00ff77;color:#111;font-size:15px;font-weight:700;cursor:pointer">Yes, Delete</button>
    </div>`;

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  box.querySelector("#annPopNo").addEventListener("click", () => overlay.remove());
  box.querySelector("#annPopYes").addEventListener("click", async () => {
    overlay.remove();
    try {
      // Delete Storage files
      try {
        const folder = ref(storage, `announcements/${ann.id}`);
        const listed = await listAll(folder);
        await Promise.all(listed.items.map(r => deleteObject(r)));
      } catch (_) {}
      await deleteDoc(doc(db, "announcements", ann.id));
    } catch (e) {
      console.error("Delete failed:", e);
      alert("Delete failed. Check console.");
    }
  });

  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
}

// ── Render announcements grid ─────────────────────────────────────
function renderGrid(list) {
  const grid  = annGrid();
  const empty = annEmpty();
  if (!grid || !empty) return;

  grid.replaceChildren();
  const published = list.filter(a => a.published);

  if (!published.length) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  published.forEach(ann => {
    const card = document.createElement("div");
    card.className = "ann-card";

    // Thumbnail
    if (ann.previewUrl) {
      const img = document.createElement("img");
      img.className = "ann-card-thumb";
      img.src = ann.previewUrl;
      img.alt = ann.title || "Announcement";
      img.loading = "lazy";
      card.appendChild(img);
    } else {
      const ph = document.createElement("div");
      ph.className = "ann-card-thumb-ph";
      ph.textContent = "📢";
      card.appendChild(ph);
    }

    // Body
    const body = document.createElement("div");
    body.className = "ann-card-body";

    const title = document.createElement("div");
    title.className = "ann-card-title";
    title.textContent = ann.title || "Untitled";

    const date = document.createElement("div");
    date.className = "ann-card-date";
    date.textContent = ann.createdAt?.toDate
      ? ann.createdAt.toDate().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
      : "";

    body.appendChild(title);
    body.appendChild(date);
    card.appendChild(body);

    // Actions
    const actions = document.createElement("div");
    actions.className = "ann-card-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "ann-btn-edit";
    editBtn.textContent = "✏️ Edit";
    editBtn.addEventListener("click", () => openEditor(ann.id, ann));

    const delBtn = document.createElement("button");
    delBtn.className = "ann-btn-del";
    delBtn.textContent = "🗑️ Delete";
    delBtn.addEventListener("click", () => confirmDelete(ann));

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    card.appendChild(actions);

    grid.appendChild(card);
  });
}

// ── Firestore listener ────────────────────────────────────────────
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

// Run after DOM ready (module scripts run after parse, so this is fine)
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}