// ================================================================
//  announcements.js — Poster Editor + Announcements Page
//  Load AFTER app-shell.js  (uses Firebase app already initialised)
// ================================================================
import { getApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, setDoc, getDoc,
  deleteDoc, onSnapshot, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import {
  getStorage, ref, uploadString, uploadBytes,
  getDownloadURL, deleteObject, listAll
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-storage.js";

const auth    = getAuth(getApp());
const db      = getFirestore(getApp());
const storage = getStorage(getApp());

// ── Data ─────────────────────────────────────────────────────────
let annList     = [];     // live list from Firestore
let annUnsub    = null;
let editingId   = null;   // Firestore docId currently editing (null = new)
let elements    = [];     // canvas element descriptors
let selectedEl  = null;
let undoStack   = [];
let redoStack   = [];
let drawHistory = [];     // drawn strokes per layer
let zoom        = 1;
let activeTool  = "select"; // select | pencil | brush | marker | eraser
let drawColor   = "#222222";
let drawSize    = 4;
let isDrawing   = false;
let lastX = 0, lastY = 0;
let canvasW = 794, canvasH = 1123; // A4 default (px @ 96dpi)
let canvasBg    = "#fffef8";
let drawingCtx  = null;    // 2d context of the draw canvas
let drawCanvas  = null;    // <canvas> element

// ── Sticker library ──────────────────────────────────────────────
const STICKERS = [
  { emoji: "🎨", name: "Palette" },     { emoji: "🖌️", name: "Paintbrush" },
  { emoji: "✏️", name: "Pencil" },      { emoji: "🖍️", name: "Crayon" },
  { emoji: "🖊️", name: "Pen" },         { emoji: "📐", name: "Set Square" },
  { emoji: "📏", name: "Ruler" },        { emoji: "🎭", name: "Masks" },
  { emoji: "🌸", name: "Cherry Blossom"}, { emoji: "🌺", name: "Flower" },
  { emoji: "🌻", name: "Sunflower" },   { emoji: "🌹", name: "Rose" },
  { emoji: "🍃", name: "Leaf" },        { emoji: "🌿", name: "Herb" },
  { emoji: "🍀", name: "Clover" },      { emoji: "🌴", name: "Palm Tree" },
  { emoji: "⭐", name: "Star" },        { emoji: "🌟", name: "Glowing Star" },
  { emoji: "✨", name: "Sparkles" },    { emoji: "💫", name: "Dizzy Star" },
  { emoji: "🎉", name: "Party Popper" },{ emoji: "🎊", name: "Confetti Ball" },
  { emoji: "🎈", name: "Balloon" },     { emoji: "🎀", name: "Ribbon" },
  { emoji: "🎁", name: "Gift" },        { emoji: "🏆", name: "Trophy" },
  { emoji: "🥇", name: "Gold Medal" },  { emoji: "🎖️", name: "Medal" },
  { emoji: "💐", name: "Bouquet" },     { emoji: "🌈", name: "Rainbow" },
  { emoji: "☀️", name: "Sun" },         { emoji: "🌙", name: "Moon" },
  { emoji: "⛅", name: "Cloud Sun" },   { emoji: "💧", name: "Droplet" },
  { emoji: "🌊", name: "Wave" },        { emoji: "❄️", name: "Snowflake" },
  { emoji: "🔥", name: "Fire" },        { emoji: "🌀", name: "Cyclone" },
  { emoji: "🎵", name: "Music Note" },  { emoji: "🎶", name: "Music Notes" },
  { emoji: "🎨", name: "Art" },         { emoji: "🖼️", name: "Frame" },
  { emoji: "📚", name: "Books" },       { emoji: "✂️", name: "Scissors" },
  { emoji: "📌", name: "Pin" },         { emoji: "🗂️", name: "Files" },
  { emoji: "💡", name: "Light Bulb" },  { emoji: "🔮", name: "Crystal Ball" },
  { emoji: "🦋", name: "Butterfly" },   { emoji: "🐝", name: "Bee" },
  { emoji: "🦚", name: "Peacock" },     { emoji: "🕊️", name: "Dove" },
  { emoji: "🌺", name: "Hibiscus" },    { emoji: "🎯", name: "Target" },
  { emoji: "🧵", name: "Thread" },      { emoji: "🪡", name: "Sewing Needle" },
  { emoji: "🧶", name: "Yarn" },        { emoji: "🪢", name: "Knot" },
];

// ── Templates ────────────────────────────────────────────────────
const TEMPLATES = [
  { label: "ANNOUNCEMENT", bg: "#c0392b", color: "#fff", font: "Pacifico", size: 28, cat: "announcement" },
  { label: "OPENINGS", bg: "#ffd700", color: "#222", font: "Caveat Brush", size: 30, cat: "announcement" },
  { label: "IMPORTANT NEWS", bg: "#e74c3c", color: "#fff", font: "Dancing Script", size: 24, cat: "news" },
  { label: "TIMING", bg: "#16a085", color: "#fff", font: "Caveat", size: 28, cat: "timing" },
  { label: "DATE", bg: "#2c3e50", color: "#f1c40f", font: "Pacifico", size: 32, cat: "timing" },
  { label: "EVENT", bg: "#8e44ad", color: "#fff", font: "Dancing Script", size: 32, cat: "event" },
  { label: "Join Us", bg: "linear-gradient(135deg,#f093fb,#f5576c)", color: "#fff", font: "Pacifico", size: 26, cat: "event" },
  { label: "Reminder", bg: "#f39c12", color: "#fff", font: "Caveat Brush", size: 28, cat: "reminder" },
  { label: "Notice", bg: "#fff", color: "#2c3e50", font: "Playfair Display", size: 26, border: "2px solid #2c3e50", cat: "announcement" },
  { label: "Welcome", bg: "linear-gradient(135deg,#43e97b,#38f9d7)", color: "#fff", font: "Pacifico", size: 28, cat: "event" },
  { label: "Good Luck", bg: "#2ecc71", color: "#fff", font: "Dancing Script", size: 30, cat: "event" },
  { label: "Attention Please", bg: "#e74c3c", color: "#fff", font: "Caveat Brush", size: 22, cat: "news" },
  { label: "Congratulations", bg: "linear-gradient(135deg,#f6d365,#fda085)", color: "#fff", font: "Pacifico", size: 20, cat: "event" },
  { label: "Save the Date", bg: "#9b59b6", color: "#fff", font: "Dancing Script", size: 26, cat: "timing" },
  { label: "Don't Miss", bg: "#e67e22", color: "#fff", font: "Caveat Brush", size: 28, cat: "reminder" },
  { label: "Meeting", bg: "#2980b9", color: "#fff", font: "Pacifico", size: 28, cat: "event" },
  { label: "Workshop", bg: "#27ae60", color: "#fff", font: "Dancing Script", size: 30, cat: "event" },
  { label: "Competition", bg: "#c0392b", color: "#fff", font: "Caveat Brush", size: 26, cat: "event" },
  { label: "Volunteers Needed", bg: "#f39c12", color: "#fff", font: "Pacifico", size: 18, cat: "announcement" },
  { label: "Fest", bg: "linear-gradient(135deg,#667eea,#764ba2)", color: "#fff", font: "Caveat Brush", size: 34, cat: "event" },
  { label: "Orientation", bg: "#1abc9c", color: "#fff", font: "Pacifico", size: 24, cat: "event" },
  { label: "Exhibition", bg: "#8e44ad", color: "#fff", font: "Dancing Script", size: 26, cat: "event" },
  { label: "Seminar", bg: "#2c3e50", color: "#ecf0f1", font: "Playfair Display", size: 26, cat: "event" },
  { label: "Auditions", bg: "#e74c3c", color: "#fff", font: "Caveat Brush", size: 28, cat: "event" },
];

// ── Border SVG patterns ───────────────────────────────────────────
function makeBorderSVG(type) {
  const borders = {
    floral1:   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 280" preserveAspectRatio="none"><rect x="4" y="4" width="192" height="272" fill="none" stroke="#c0392b" stroke-width="3" rx="2"/><text x="10" y="20" font-size="12">🌸🌺🌸🌺🌸🌺🌸🌺🌸🌺🌸🌺🌸🌺🌸</text><text x="10" y="270" font-size="12">🌸🌺🌸🌺🌸🌺🌸🌺🌸🌺🌸🌺🌸🌺🌸</text></svg>`,
    leaves1:   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 280"><rect x="4" y="4" width="192" height="272" fill="none" stroke="#27ae60" stroke-width="4" stroke-dasharray="8 4" rx="4"/><text x="6" y="22" font-size="14">🍃🌿🍃🌿🍃🌿🍃🌿🍃🌿🍃🌿🍃</text><text x="6" y="270" font-size="14">🍃🌿🍃🌿🍃🌿🍃🌿🍃🌿🍃🌿🍃</text></svg>`,
    rainbow1:  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 280"><rect x="2" y="2" width="196" height="276" fill="none" stroke="url(#rb)" stroke-width="6" rx="6"/><defs><linearGradient id="rb" x1="0" y1="0" x2="200" y2="280" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ff3b30"/><stop offset=".25" stop-color="#ffd60a"/><stop offset=".5" stop-color="#34c759"/><stop offset=".75" stop-color="#2f9bff"/><stop offset="1" stop-color="#a55eea"/></linearGradient></defs></svg>`,
    fire1:     `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 280"><rect x="4" y="4" width="192" height="272" fill="none" stroke="#e74c3c" stroke-width="3" rx="2"/><text x="4" y="22" font-size="14">🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥</text><text x="4" y="270" font-size="14">🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥</text></svg>`,
    water1:    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 280"><rect x="4" y="4" width="192" height="272" fill="none" stroke="#2980b9" stroke-width="3" stroke-dasharray="6 3" rx="4"/><text x="4" y="22" font-size="14">🌊💧🌊💧🌊💧🌊💧🌊💧🌊💧</text><text x="4" y="270" font-size="14">🌊💧🌊💧🌊💧🌊💧🌊💧🌊💧</text></svg>`,
    celebration1: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 280"><rect x="4" y="4" width="192" height="272" fill="none" stroke="#f39c12" stroke-width="4" rx="6"/><text x="4" y="22" font-size="12">🎉🎊🎈🎉🎊🎈🎉🎊🎈🎉🎊🎈🎉🎊</text><text x="4" y="270" font-size="12">🎉🎊🎈🎉🎊🎈🎉🎊🎈🎉🎊🎈🎉🎊</text></svg>`,
    stars1:    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 280"><rect x="4" y="4" width="192" height="272" fill="none" stroke="#f1c40f" stroke-width="3" rx="4"/><text x="4" y="22" font-size="14">⭐✨🌟⭐✨🌟⭐✨🌟⭐✨🌟⭐✨🌟</text><text x="4" y="270" font-size="14">⭐✨🌟⭐✨🌟⭐✨🌟⭐✨🌟⭐✨🌟</text></svg>`,
    art1:      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 280"><rect x="4" y="4" width="192" height="272" fill="none" stroke="#8e44ad" stroke-width="4" rx="8"/><text x="4" y="22" font-size="14">🎨🖌️🖍️🎨🖌️🖍️🎨🖌️🖍️🎨🖌️🖍️🎨</text><text x="4" y="270" font-size="14">🎨🖌️🖍️🎨🖌️🖍️🎨🖌️🖍️🎨🖌️🖍️🎨</text></svg>`,
    double1:   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 280"><rect x="2" y="2" width="196" height="276" fill="none" stroke="#2c3e50" stroke-width="2"/><rect x="8" y="8" width="184" height="264" fill="none" stroke="#2c3e50" stroke-width="1"/></svg>`,
    dots1:     `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 280"><rect x="4" y="4" width="192" height="272" fill="none" stroke="#e74c3c" stroke-width="3" stroke-dasharray="2 6" rx="6"/></svg>`,
    geometric1:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 280"><rect x="4" y="4" width="192" height="272" fill="none" stroke="#2980b9" stroke-width="3" rx="2"/><rect x="12" y="12" width="176" height="256" fill="none" stroke="#2980b9" stroke-width="1" stroke-dasharray="4 4"/></svg>`,
    paint1:    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 280"><rect x="4" y="4" width="192" height="272" fill="none" stroke="#e67e22" stroke-width="5" rx="4"/><text x="2" y="22" font-size="12">🎨🖌️💦🎨🖌️💦🎨🖌️💦🎨🖌️💦🎨🖌️</text><text x="2" y="270" font-size="12">🎨🖌️💦🎨🖌️💦🎨🖌️💦🎨🖌️💦🎨🖌️</text></svg>`,
  };
  return borders[type] || borders["double1"];
}

// ── Canvas sizes ──────────────────────────────────────────────────
const SIZES = {
  "A4 Portrait (210×297mm)":  [794, 1123],
  "A4 Landscape (297×210mm)": [1123, 794],
  "A3 Portrait (297×420mm)":  [1123, 1587],
  "Square (800×800px)":       [800, 800],
  "Portrait (600×900px)":     [600, 900],
  "Landscape (900×600px)":    [900, 600],
  "Custom":                   null,
};

// ── Random layouts ────────────────────────────────────────────────
const RANDOM_LAYOUTS = [
  { bg: "#fdf6e3", borderType: "floral1",  stickerEmojis: ["🌸","🌺","✨"] },
  { bg: "#e8f5e9", borderType: "leaves1",  stickerEmojis: ["🍃","🌿","🌱"] },
  { bg: "#fff3e0", borderType: "fire1",    stickerEmojis: ["🔥","⭐","💫"] },
  { bg: "#e3f2fd", borderType: "water1",   stickerEmojis: ["🌊","💧","❄️"] },
  { bg: "#f3e5f5", borderType: "rainbow1", stickerEmojis: ["🌈","✨","🦋"] },
  { bg: "#fffde7", borderType: "stars1",   stickerEmojis: ["⭐","🌟","🎉"] },
  { bg: "#fce4ec", borderType: "celebration1", stickerEmojis: ["🎉","🎊","🎈"] },
  { bg: "#e8eaf6", borderType: "art1",     stickerEmojis: ["🎨","🖌️","🖍️"] },
  { bg: "#f1f8e9", borderType: "geometric1", stickerEmojis: ["💡","🌿","⭐"] },
  { bg: "#fff8e1", borderType: "paint1",   stickerEmojis: ["🎨","✨","🌸"] },
];

// ── Google Fonts list ─────────────────────────────────────────────
const FONTS = [
  "Pacifico", "Caveat", "Caveat Brush", "Dancing Script",
  "Playfair Display", "Poppins", "Lobster", "Righteous",
  "Satisfy", "Fredoka One", "Nunito", "Quicksand", "Raleway"
];

// ── Utility ───────────────────────────────────────────────────────
let _elId = 1;
function uid() { return "el_" + (Date.now()) + "_" + (_elId++); }
function showStatus(msg, ms = 2500) {
  const s = document.getElementById("edStatus");
  if (!s) return;
  s.textContent = msg;
  s.classList.add("show");
  clearTimeout(s._t);
  s._t = setTimeout(() => s.classList.remove("show"), ms);
}
function compressImage(file) {
  return new Promise(res => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      const m = 1200, k = Math.min(1, m / Math.max(im.width, im.height));
      const c = document.createElement("canvas");
      c.width  = Math.round(im.width  * k);
      c.height = Math.round(im.height * k);
      c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res(c.toDataURL("image/png", 0.9));
    };
    im.onerror = () => { URL.revokeObjectURL(url); res(null); };
    im.src = url;
  });
}

// ── DOM refs (set after DOMContentLoaded) ────────────────────────
let annGrid, annEmpty, annEditor, canvasWrap, canvasBgEl,
    layersList, zoomInput, zoomLabel;

// ── Initialise ───────────────────────────────────────────────────
function initAnnouncements() {
  annGrid  = document.getElementById("annGrid");
  annEmpty = document.getElementById("annEmpty");
  annEditor = document.getElementById("annEditor");
  canvasWrap = document.getElementById("edCanvasWrap");
  canvasBgEl = document.getElementById("edCanvasBg");
  layersList = document.getElementById("edLayersList");
  zoomInput  = document.getElementById("edZoom");
  zoomLabel  = document.getElementById("edZoomLabel");

  // Populate font selector
  const fontSel = document.getElementById("edFontSel");
  FONTS.forEach(f => {
    const opt = document.createElement("option");
    opt.value = f;
    opt.textContent = f;
    fontSel.appendChild(opt);
  });

  // Populate stickers
  renderStickerGrid(STICKERS);

  // Populate templates
  renderTemplates("all");

  // Populate borders
  renderBorders();

  // Draw canvas
  drawCanvas  = document.getElementById("edDrawCanvas");
  drawingCtx  = drawCanvas.getContext("2d");
  bindDrawEvents();
  bindToolbar();
  bindSidebar();
  bindCanvasSettings();
  bindZoom();
  bindEditorButtons();

  // Firestore listener
  startAnnListener();
}

function startAnnListener() {
  if (annUnsub) return;
  const q = query(collection(db, "announcements"), orderBy("createdAt", "desc"));
  annUnsub = onSnapshot(q, snap => {
    annList = [];
    snap.forEach(d => annList.push({ id: d.id, ...d.data() }));
    renderAnnGrid();
  }, err => console.error("Ann listener:", err));
}

// ── Announcements grid ────────────────────────────────────────────
function renderAnnGrid() {
  annGrid.replaceChildren();
  const published = annList.filter(a => a.published);
  if (!published.length) {
    annEmpty.hidden = false;
    return;
  }
  annEmpty.hidden = true;
  published.forEach(ann => {
    const card = document.createElement("div");
    card.className = "ann-card";

    if (ann.previewUrl) {
      const img = document.createElement("img");
      img.className = "ann-card-thumb";
      img.src = ann.previewUrl;
      img.alt = ann.title || "Announcement";
      img.loading = "lazy";
      card.appendChild(img);
    } else {
      const ph = document.createElement("div");
      ph.className = "ann-card-thumb-placeholder";
      ph.textContent = "📢";
      card.appendChild(ph);
    }

    const body = document.createElement("div");
    body.className = "ann-card-body";
    const title = document.createElement("div");
    title.className = "ann-card-title";
    title.textContent = ann.title || "Untitled";
    const date  = document.createElement("div");
    date.className = "ann-card-date";
    date.textContent = ann.createdAt?.toDate
      ? ann.createdAt.toDate().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
      : "";
    body.appendChild(title);
    body.appendChild(date);
    card.appendChild(body);

    const actions = document.createElement("div");
    actions.className = "ann-card-actions";
    const editBtn = document.createElement("button");
    editBtn.className = "ann-btn-edit";
    editBtn.textContent = "✏️ Edit";
    editBtn.addEventListener("click", () => openEditor(ann.id));
    const delBtn = document.createElement("button");
    delBtn.className = "ann-btn-del";
    delBtn.textContent = "🗑️ Delete";
    delBtn.addEventListener("click", () => confirmDeleteAnn(ann));
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    card.appendChild(actions);

    annGrid.appendChild(card);
  });

  // "+ Add Announcement" tile at end
  const addTile = document.createElement("div");
  addTile.className = "ann-card";
  addTile.style.cssText = "border:2px dashed #6b1020;cursor:pointer;display:grid;place-items:center;min-height:200px;color:#6b1020;font-weight:700;font-size:15px;gap:8px;";
  addTile.innerHTML = "<div style='font-size:32px'>➕</div><div>Add Announcement</div>";
  addTile.addEventListener("click", () => openEditor(null));
  annGrid.appendChild(addTile);
}

// ── Delete confirmation ───────────────────────────────────────────
function confirmDeleteAnn(ann) {
  const overlay = document.createElement("div");
  overlay.className = "ann-del-popup-overlay";
  overlay.innerHTML = `
    <div class="ann-del-popup">
      <p>Delete this announcement?</p>
      <small>"${ann.title || 'Untitled'}"</small>
      <div class="ann-del-popup-btns">
        <button class="ann-pop-no">No</button>
        <button class="ann-pop-yes">Yes, Delete</button>
      </div>
    </div>`;
  overlay.querySelector(".ann-pop-no").addEventListener("click", () => overlay.remove());
  overlay.querySelector(".ann-pop-yes").addEventListener("click", async () => {
    overlay.remove();
    showStatus("Deleting…");
    try {
      // Delete storage files
      try {
        const folder = ref(storage, `announcements/${ann.id}`);
        const listed = await listAll(folder);
        await Promise.all(listed.items.map(r => deleteObject(r)));
      } catch (_) {}
      await deleteDoc(doc(db, "announcements", ann.id));
      showStatus("Deleted.");
    } catch (e) {
      console.error(e);
      showStatus("Delete failed. See console.");
    }
  });
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

// ── Open editor ───────────────────────────────────────────────────
async function openEditor(docId) {
  editingId  = docId;
  elements   = [];
  undoStack  = [];
  redoStack  = [];
  drawHistory = [];
  selectedEl = null;

  // Reset canvas
  setCanvasSize(794, 1123);
  setCanvasBg("#fffef8");
  clearDrawCanvas();
  renderElements();
  renderLayers();

  if (docId) {
    showStatus("Loading…");
    try {
      const snap = await getDoc(doc(db, "announcements", docId));
      if (snap.exists()) {
        const data = snap.data();
        const proj = data.projectData || {};
        if (proj.canvasW) setCanvasSize(proj.canvasW, proj.canvasH);
        if (proj.bg) setCanvasBg(proj.bg);
        elements = proj.elements || [];
        renderElements();
        renderLayers();
        // Restore drawing
        if (proj.drawDataUrl) {
          const img = new Image();
          img.onload = () => drawingCtx.drawImage(img, 0, 0);
          img.src = proj.drawDataUrl;
        }
        document.getElementById("edTitleInput").value = data.title || "";
      }
    } catch (e) {
      console.error("Load failed:", e);
      showStatus("Could not load poster.");
    }
  } else {
    document.getElementById("edTitleInput").value = "";
  }

  annEditor.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  showStatus("Editor ready.");
}

function closeEditor() {
  annEditor.classList.add("hidden");
  document.body.style.overflow = "";
}

// ── Canvas size & bg ─────────────────────────────────────────────
function setCanvasSize(w, h) {
  canvasW = w; canvasH = h;
  canvasBgEl.style.width  = w + "px";
  canvasBgEl.style.height = h + "px";
  drawCanvas.width  = w;
  drawCanvas.height = h;
  document.getElementById("edWidth").value  = w;
  document.getElementById("edHeight").value = h;
  applyZoom();
}
function setCanvasBg(color) {
  canvasBg = color;
  canvasBgEl.style.background = color;
  document.getElementById("edBgSwatch").value = color.startsWith("#") ? color : "#ffffff";
}
function applyZoom() {
  canvasBgEl.style.transform = `scale(${zoom})`;
  canvasBgEl.style.transformOrigin = "top center";
  if (zoomLabel) zoomLabel.textContent = Math.round(zoom * 100) + "%";
}

// ── Element management ────────────────────────────────────────────
function addElement(el) {
  pushUndo();
  elements.push(el);
  renderElements();
  renderLayers();
  selectElement(el.id);
}

function removeElement(id) {
  pushUndo();
  elements = elements.filter(e => e.id !== id);
  if (selectedEl === id) selectedEl = null;
  renderElements();
  renderLayers();
}

function selectElement(id) {
  selectedEl = id;
  document.querySelectorAll(".ed-el").forEach(el => {
    el.classList.toggle("selected", el.dataset.id === id);
  });
  renderLayers();
  // Update toolbar with element's text properties
  const el = elements.find(e => e.id === id);
  if (el && el.type === "text") {
    document.getElementById("edFontSize").value = el.fontSize || 24;
    document.getElementById("edFontSel").value  = el.fontFamily || "Pacifico";
    document.getElementById("edTextColor").value = el.color || "#222222";
    document.getElementById("edAlignL").classList.toggle("active", el.align === "left");
    document.getElementById("edAlignC").classList.toggle("active", el.align === "center");
    document.getElementById("edAlignR").classList.toggle("active", el.align === "right");
  }
}

function renderElements() {
  // Remove old el divs (keep drawCanvas)
  canvasBgEl.querySelectorAll(".ed-el").forEach(e => e.remove());

  [...elements].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0)).forEach(elData => {
    const div = document.createElement("div");
    div.className = "ed-el";
    div.dataset.id = elData.id;
    div.style.cssText = `
      left:${elData.x || 0}px; top:${elData.y || 0}px;
      width:${elData.w || 200}px; height:${elData.h || 60}px;
      transform:rotate(${elData.rotate || 0}deg);
      z-index:${elData.zIndex || 1};
      display:${elData.hidden ? "none" : "block"};
    `;

    if (elData.type === "text") {
      div.contentEditable = "true";
      div.className += " ed-text-el";
      div.style.fontSize   = (elData.fontSize  || 24) + "px";
      div.style.fontFamily = elData.fontFamily  || "Pacifico";
      div.style.color      = elData.color       || "#222222";
      div.style.textAlign  = elData.align       || "center";
      div.style.fontWeight = elData.bold        ? "700" : "400";
      div.style.fontStyle  = elData.italic      ? "italic" : "normal";
      div.textContent = elData.text || "Double-click to edit";
      div.addEventListener("input", () => {
        const e = elements.find(e => e.id === elData.id);
        if (e) e.text = div.textContent;
      });
      div.addEventListener("focus", () => selectElement(elData.id));
    } else if (elData.type === "image" || elData.type === "sticker") {
      const img = document.createElement("img");
      img.className = "ed-img-el";
      img.src = elData.src;
      img.alt = elData.alt || "";
      div.appendChild(img);
    } else if (elData.type === "border") {
      div.style.width  = canvasW + "px";
      div.style.height = canvasH + "px";
      div.style.left   = "0px";
      div.style.top    = "0px";
      div.style.pointerEvents = "none";
      div.innerHTML = makeBorderSVG(elData.borderType || "double1");
      div.style.position = "absolute";
    } else if (elData.type === "link") {
      div.style.fontSize   = "16px";
      div.style.color      = "#0645ad";
      div.style.textDecoration = "underline";
      div.style.cursor     = "default";
      div.textContent = elData.linkText || elData.linkUrl || "Link";
    }

    if (selectedEl === elData.id) div.classList.add("selected");

    // Resize + rotate handles (only on selected)
    if (selectedEl === elData.id && elData.type !== "border") {
      ["nw","n","ne","e","se","s","sw","w"].forEach(dir => {
        const h = document.createElement("div");
        h.className = "resize-handle";
        h.dataset.dir = dir;
        h.addEventListener("mousedown", e => startResize(e, elData.id, dir));
        div.appendChild(h);
      });
      const rh = document.createElement("div");
      rh.className = "rotate-handle";
      rh.textContent = "↻";
      rh.addEventListener("mousedown", e => startRotate(e, elData.id));
      div.appendChild(rh);
    }

    div.addEventListener("mousedown", e => {
      if (e.target.classList.contains("resize-handle") || e.target.classList.contains("rotate-handle")) return;
      if (elData.type === "text" && div.isContentEditable) return;
      e.preventDefault();
      selectElement(elData.id);
      startDrag(e, elData.id);
    });
    div.addEventListener("click", () => {
      if (elData.type === "text") return;
      selectElement(elData.id);
    });

    canvasBgEl.insertBefore(div, drawCanvas);
  });
}

// ── Drag ─────────────────────────────────────────────────────────
function startDrag(e, id) {
  const elData = elements.find(el => el.id === id);
  if (!elData) return;
  const startX = e.clientX, startY = e.clientY;
  const origX  = elData.x, origY = elData.y;
  function onMove(mv) {
    elData.x = origX + (mv.clientX - startX) / zoom;
    elData.y = origY + (mv.clientY - startY) / zoom;
    const div = canvasBgEl.querySelector(`[data-id="${id}"]`);
    if (div) { div.style.left = elData.x + "px"; div.style.top = elData.y + "px"; }
  }
  function onUp() {
    pushUndo();
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
  }
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}

// ── Resize ────────────────────────────────────────────────────────
function startResize(e, id, dir) {
  e.stopPropagation();
  const elData = elements.find(el => el.id === id);
  if (!elData) return;
  const startX = e.clientX, startY = e.clientY;
  const origW = elData.w, origH = elData.h, origX = elData.x, origY = elData.y;
  function onMove(mv) {
    const dx = (mv.clientX - startX) / zoom;
    const dy = (mv.clientY - startY) / zoom;
    if (dir.includes("e")) elData.w = Math.max(40, origW + dx);
    if (dir.includes("s")) elData.h = Math.max(20, origH + dy);
    if (dir.includes("w")) { elData.w = Math.max(40, origW - dx); elData.x = origX + dx; }
    if (dir.includes("n")) { elData.h = Math.max(20, origH - dy); elData.y = origY + dy; }
    const div = canvasBgEl.querySelector(`[data-id="${id}"]`);
    if (div) {
      div.style.width  = elData.w + "px";
      div.style.height = elData.h + "px";
      div.style.left   = elData.x + "px";
      div.style.top    = elData.y + "px";
    }
  }
  function onUp() {
    pushUndo();
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
  }
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}

// ── Rotate ────────────────────────────────────────────────────────
function startRotate(e, id) {
  e.stopPropagation();
  const elData = elements.find(el => el.id === id);
  if (!elData) return;
  const div   = canvasBgEl.querySelector(`[data-id="${id}"]`);
  const rect  = div.getBoundingClientRect();
  const cx    = rect.left + rect.width / 2;
  const cy    = rect.top  + rect.height / 2;
  function onMove(mv) {
    const angle = Math.atan2(mv.clientY - cy, mv.clientX - cx) * 180 / Math.PI + 90;
    elData.rotate = Math.round(angle);
    if (div) div.style.transform = `rotate(${elData.rotate}deg)`;
  }
  function onUp() {
    pushUndo();
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
  }
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}

// ── Layers ────────────────────────────────────────────────────────
function renderLayers() {
  if (!layersList) return;
  layersList.replaceChildren();
  [...elements].reverse().forEach(elData => {
    const item = document.createElement("div");
    item.className = "ed-layer-item" + (elData.id === selectedEl ? " selected" : "");
    const icon = document.createElement("span");
    icon.className = "ed-layer-icon";
    icon.textContent = elData.type === "text" ? "T" : elData.type === "border" ? "▭" : elData.type === "link" ? "🔗" : "🖼";
    const name = document.createElement("span");
    name.className = "ed-layer-name";
    name.textContent = elData.type === "text" ? (elData.text || "Text").slice(0, 20) : elData.type;
    const eye = document.createElement("button");
    eye.className = "ed-layer-eye";
    eye.textContent = elData.hidden ? "👁️‍🗨️" : "👁️";
    eye.addEventListener("click", e => {
      e.stopPropagation();
      elData.hidden = !elData.hidden;
      renderElements();
      renderLayers();
    });
    item.appendChild(icon);
    item.appendChild(name);
    item.appendChild(eye);
    item.addEventListener("click", () => selectElement(elData.id));
    layersList.appendChild(item);
  });
}

// ── Undo / Redo ───────────────────────────────────────────────────
function pushUndo() {
  undoStack.push(JSON.stringify({ elements, canvasW, canvasH, canvasBg }));
  if (undoStack.length > 30) undoStack.shift();
  redoStack = [];
}
function undo() {
  if (!undoStack.length) return;
  redoStack.push(JSON.stringify({ elements, canvasW, canvasH, canvasBg }));
  const state = JSON.parse(undoStack.pop());
  elements = state.elements;
  setCanvasSize(state.canvasW, state.canvasH);
  setCanvasBg(state.canvasBg);
  renderElements();
  renderLayers();
}
function redo() {
  if (!redoStack.length) return;
  undoStack.push(JSON.stringify({ elements, canvasW, canvasH, canvasBg }));
  const state = JSON.parse(redoStack.pop());
  elements = state.elements;
  setCanvasSize(state.canvasW, state.canvasH);
  setCanvasBg(state.canvasBg);
  renderElements();
  renderLayers();
}

// ── Drawing ───────────────────────────────────────────────────────
function clearDrawCanvas() {
  if (drawingCtx) drawingCtx.clearRect(0, 0, canvasW, canvasH);
}

function bindDrawEvents() {
  function getPos(e) {
    const r = drawCanvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return [(clientX - r.left) / zoom, (clientY - r.top) / zoom];
  }
  function down(e) {
    if (!["pencil","brush","marker","eraser"].includes(activeTool)) return;
    isDrawing = true;
    [lastX, lastY] = getPos(e);
    drawingCtx.beginPath();
    drawingCtx.moveTo(lastX, lastY);
  }
  function move(e) {
    if (!isDrawing) return;
    e.preventDefault();
    const [x, y] = getPos(e);
    drawingCtx.beginPath();
    drawingCtx.moveTo(lastX, lastY);
    drawingCtx.lineTo(x, y);
    if (activeTool === "eraser") {
      drawingCtx.globalCompositeOperation = "destination-out";
      drawingCtx.lineWidth = drawSize * 4;
    } else {
      drawingCtx.globalCompositeOperation = "source-over";
      drawingCtx.lineWidth = activeTool === "marker" ? drawSize * 3 : activeTool === "brush" ? drawSize * 2 : drawSize;
      drawingCtx.globalAlpha = activeTool === "marker" ? 0.55 : 1;
      drawingCtx.strokeStyle = drawColor;
    }
    drawingCtx.lineCap  = "round";
    drawingCtx.lineJoin = "round";
    drawingCtx.stroke();
    drawingCtx.globalAlpha = 1;
    drawingCtx.globalCompositeOperation = "source-over";
    [lastX, lastY] = [x, y];
  }
  function up() { isDrawing = false; }
  drawCanvas.addEventListener("mousedown",  down);
  drawCanvas.addEventListener("mousemove",  move);
  drawCanvas.addEventListener("mouseup",    up);
  drawCanvas.addEventListener("touchstart", down, { passive: false });
  drawCanvas.addEventListener("touchmove",  move, { passive: false });
  drawCanvas.addEventListener("touchend",   up);
}

function setActiveTool(tool) {
  activeTool = tool;
  const isDrawTool = ["pencil","brush","marker","eraser"].includes(tool);
  drawCanvas.classList.toggle("drawing", isDrawTool);
  document.querySelectorAll(".ed-tool-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.tool === tool);
  });
}

// ── Toolbar bindings ──────────────────────────────────────────────
function bindToolbar() {
  // Font size
  document.getElementById("edFontSize").addEventListener("change", e => {
    applyToSelected(el => { el.fontSize = +e.target.value; });
  });
  // Font family
  document.getElementById("edFontSel").addEventListener("change", e => {
    applyToSelected(el => { el.fontFamily = e.target.value; });
    loadGoogleFont(e.target.value);
  });
  // Text color
  document.getElementById("edTextColor").addEventListener("input", e => {
    applyToSelected(el => { el.color = e.target.value; });
  });
  // Alignment
  ["L","C","R"].forEach(dir => {
    document.getElementById("edAlign" + dir).addEventListener("click", () => {
      const a = dir === "L" ? "left" : dir === "C" ? "center" : "right";
      applyToSelected(el => { el.align = a; });
      document.getElementById("edAlignL").classList.toggle("active", dir === "L");
      document.getElementById("edAlignC").classList.toggle("active", dir === "C");
      document.getElementById("edAlignR").classList.toggle("active", dir === "R");
    });
  });
  // Clear All
  document.getElementById("edClearAll").addEventListener("click", () => {
    if (!confirm("Clear all elements?")) return;
    pushUndo();
    elements = [];
    clearDrawCanvas();
    renderElements();
    renderLayers();
  });
  // Delete selected
  document.getElementById("edDeleteSel").addEventListener("click", () => {
    if (selectedEl) removeElement(selectedEl);
  });
  // Keyboard shortcuts
  document.addEventListener("keydown", e => {
    if (!annEditor || annEditor.classList.contains("hidden")) return;
    if (e.target.isContentEditable) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      if (selectedEl) { e.preventDefault(); removeElement(selectedEl); }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); undo(); }
    if ((e.ctrlKey || e.metaKey) && e.key === "y") { e.preventDefault(); redo(); }
  });
  // Drawing tools
  document.querySelectorAll(".ed-tool-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const tool = btn.dataset.tool;
      setActiveTool(activeTool === tool && tool !== "select" ? "select" : tool);
      if (tool === "pencil" || tool === "brush" || tool === "marker") {
        const popup = document.getElementById("drawPopup");
        popup.classList.toggle("hidden");
      }
    });
  });
  // Draw popup swatches
  const drawColors = ["#222222","#c0392b","#e67e22","#f1c40f","#27ae60","#2980b9","#8e44ad","#ffffff","#ff69b4","#00bcd4"];
  const swatchWrap = document.getElementById("drawColorSwatches");
  drawColors.forEach(c => {
    const s = document.createElement("div");
    s.className = "draw-color-swatch";
    s.style.background = c;
    s.style.border = c === "#ffffff" ? "2px solid #ccc" : "2px solid transparent";
    s.addEventListener("click", () => {
      drawColor = c;
      swatchWrap.querySelectorAll(".draw-color-swatch").forEach(x => x.classList.remove("active"));
      s.classList.add("active");
    });
    swatchWrap.appendChild(s);
  });
  // Draw size slider
  document.getElementById("drawSizeSlider").addEventListener("input", e => {
    drawSize = +e.target.value;
    const prev = document.getElementById("drawSizePreview");
    const sz = Math.max(4, drawSize * 3);
    prev.style.width  = sz + "px";
    prev.style.height = sz + "px";
  });
  // Bg swatch (color input)
  document.getElementById("edBgSwatch").addEventListener("input", e => setCanvasBg(e.target.value));
  // Close editor
  document.getElementById("edClose").addEventListener("click", () => {
    if (confirm("Close editor? Unsaved changes will be lost.")) closeEditor();
  });
  // Undo / Redo buttons
  document.getElementById("edUndo").addEventListener("click", undo);
  document.getElementById("edRedo").addEventListener("click", redo);
  // Add text button
  document.getElementById("edAddText").addEventListener("click", () => {
    addElement({
      id: uid(), type: "text", text: "Your Text Here",
      x: canvasW/2 - 150, y: canvasH/2 - 30,
      w: 300, h: 60, fontSize: 28, fontFamily: "Pacifico",
      color: "#222222", align: "center", rotate: 0, zIndex: elements.length + 1
    });
    loadGoogleFont("Pacifico");
  });
}

function applyToSelected(fn) {
  const el = elements.find(e => e.id === selectedEl);
  if (!el || el.type !== "text") return;
  fn(el);
  renderElements();
}

function loadGoogleFont(family) {
  const id = "gf_" + family.replace(/\s/g, "_");
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id   = id;
  link.rel  = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400;700&display=swap`;
  document.head.appendChild(link);
}

// ── Sidebar ───────────────────────────────────────────────────────
function bindSidebar() {
  document.querySelectorAll(".ed-sidebar-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const panel = btn.dataset.panel;
      document.querySelectorAll(".ed-sidebar-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const lp = document.getElementById("edLeftPanel");
      if (lp.dataset.open === panel) {
        lp.classList.toggle("hidden");
        btn.classList.toggle("active");
        lp.dataset.open = lp.classList.contains("hidden") ? "" : panel;
        return;
      }
      lp.classList.remove("hidden");
      lp.dataset.open = panel;
      // Show/hide sub-panels
      ["edPanelDesign","edPanelUploads","edPanelRandom"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.hidden = el.id !== ("edPanel" + capitalize(panel));
      });
    });
  });
  // Design sub-tabs
  document.querySelectorAll(".ed-panel-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".ed-panel-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      const sub = tab.dataset.sub;
      ["edSubTemplates","edSubBorders","edSubStickers","edSubLinks"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.hidden = el.id !== ("edSub" + capitalize(sub));
      });
    });
  });
  // Template search + filter
  document.getElementById("edTplSearch").addEventListener("input", e => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll(".ed-tpl-item").forEach(item => {
      item.hidden = !item.dataset.label.toLowerCase().includes(q);
    });
  });
  document.querySelectorAll(".ed-tpl-cat").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".ed-tpl-cat").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const cat = btn.dataset.cat;
      document.querySelectorAll(".ed-tpl-item").forEach(item => {
        item.hidden = cat !== "all" && item.dataset.cat !== cat;
      });
    });
  });
  // Sticker search
  document.getElementById("edStickerSearch").addEventListener("input", e => {
    const q = e.target.value.toLowerCase();
    const filtered = q ? STICKERS.filter(s => s.name.toLowerCase().includes(q)) : STICKERS;
    renderStickerGrid(filtered);
  });
  // Upload sticker
  document.getElementById("edStickerUploadBtn").addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.addEventListener("change", async () => {
      const file = input.files[0];
      if (!file) return;
      const data = await compressImage(file);
      if (!data) return;
      addElement({
        id: uid(), type: "sticker", src: data, alt: file.name,
        x: 80, y: 80, w: 120, h: 120, rotate: 0, zIndex: elements.length + 1
      });
    });
    input.click();
  });
  // Uploads panel
  document.getElementById("edImgUploadBtn").addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpg,image/jpeg";
    input.addEventListener("change", async () => {
      const file = input.files[0];
      if (!file) return;
      showStatus("Uploading image…");
      const data = await compressImage(file);
      if (!data) { showStatus("Could not read image."); return; }
      addElement({
        id: uid(), type: "image", src: data, alt: file.name,
        x: 50, y: 50, w: canvasW - 100, h: 300, rotate: 0, zIndex: elements.length + 1
      });
      showStatus("Image added.");
    });
    input.click();
  });
  // Random layout
  document.getElementById("edRandomBtn").addEventListener("click", applyRandomLayout);
  // Link form
  document.getElementById("edLinkAdd").addEventListener("click", () => {
    const url  = document.getElementById("edLinkUrl").value.trim();
    const text = document.getElementById("edLinkText").value.trim() || url;
    if (!url) { showStatus("Enter a URL first."); return; }
    addElement({
      id: uid(), type: "link", linkUrl: url, linkText: text,
      x: 100, y: canvasH - 80, w: canvasW - 200, h: 40,
      rotate: 0, zIndex: elements.length + 1
    });
    document.getElementById("edLinkUrl").value  = "";
    document.getElementById("edLinkText").value = "";
  });
}
function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

// ── Render template / border / sticker lists ─────────────────────
function renderTemplates(cat) {
  const grid = document.getElementById("edTplGrid");
  if (!grid) return;
  grid.replaceChildren();
  TEMPLATES.forEach(tpl => {
    loadGoogleFont(tpl.font);
    const item = document.createElement("div");
    item.className   = "ed-tpl-item";
    item.dataset.cat = tpl.cat;
    item.dataset.label = tpl.label;
    item.style.background  = tpl.bg;
    item.style.color       = tpl.color;
    item.style.fontFamily  = `'${tpl.font}', cursive`;
    item.style.fontSize    = Math.min(tpl.size * 0.55, 14) + "px";
    if (tpl.border) item.style.border = tpl.border;
    item.textContent = tpl.label;
    item.hidden = cat !== "all" && tpl.cat !== cat;
    item.addEventListener("click", () => {
      addElement({
        id: uid(), type: "text", text: tpl.label,
        x: canvasW/2 - 150, y: 60 + elements.length * 10,
        w: 300, h: 80, fontSize: tpl.size, fontFamily: tpl.font,
        color: tpl.color, align: "center", rotate: 0, zIndex: elements.length + 1,
        bg: tpl.bg
      });
      loadGoogleFont(tpl.font);
    });
    grid.appendChild(item);
  });
}

function renderBorders() {
  const grid = document.getElementById("edBorderGrid");
  if (!grid) return;
  grid.replaceChildren();
  const borderTypes = [
    "floral1","leaves1","rainbow1","fire1","water1",
    "celebration1","stars1","art1","double1","dots1",
    "geometric1","paint1"
  ];
  borderTypes.forEach(bt => {
    const item = document.createElement("div");
    item.className = "ed-border-item";
    item.innerHTML = makeBorderSVG(bt);
    item.addEventListener("click", () => {
      // Remove existing border
      elements = elements.filter(e => e.type !== "border");
      addElement({
        id: uid(), type: "border", borderType: bt,
        x: 0, y: 0, w: canvasW, h: canvasH,
        rotate: 0, zIndex: 0
      });
    });
    grid.appendChild(item);
  });
}

function renderStickerGrid(list) {
  const grid = document.getElementById("edStickerGrid");
  if (!grid) return;
  grid.replaceChildren();
  list.forEach(stk => {
    const item = document.createElement("div");
    item.className = "ed-sticker-item";
    const em = document.createElement("span");
    em.textContent = stk.emoji;
    em.style.fontSize = "28px";
    const lb = document.createElement("span");
    lb.className = "stk-label";
    lb.textContent = stk.name;
    item.appendChild(em);
    item.appendChild(lb);
    item.addEventListener("click", () => {
      // Create a small canvas to render the emoji
      const ec = document.createElement("canvas");
      ec.width = ec.height = 80;
      const ctx2 = ec.getContext("2d");
      ctx2.font = "60px serif";
      ctx2.textAlign = "center";
      ctx2.textBaseline = "middle";
      ctx2.fillText(stk.emoji, 40, 40);
      addElement({
        id: uid(), type: "sticker", src: ec.toDataURL(), alt: stk.name,
        x: Math.random() * (canvasW - 120), y: Math.random() * (canvasH - 120),
        w: 100, h: 100, rotate: 0, zIndex: elements.length + 1
      });
    });
    grid.appendChild(item);
  });
}

// ── Canvas settings ───────────────────────────────────────────────
function bindCanvasSettings() {
  const sizeSel = document.getElementById("edCanvasSizeSel");
  Object.keys(SIZES).forEach(name => {
    const opt = document.createElement("option");
    opt.value = name; opt.textContent = name;
    sizeSel.appendChild(opt);
  });
  sizeSel.value = "A4 Portrait (210×297mm)";
  sizeSel.addEventListener("change", () => {
    const size = SIZES[sizeSel.value];
    if (size) {
      setCanvasSize(size[0], size[1]);
    } else {
      // Custom: use inputs
      const w = +document.getElementById("edWidth").value || 794;
      const h = +document.getElementById("edHeight").value || 1123;
      setCanvasSize(w, h);
    }
  });
  document.getElementById("edWidth").addEventListener("change", e => {
    if (sizeSel.value === "Custom") setCanvasSize(+e.target.value || canvasW, canvasH);
  });
  document.getElementById("edHeight").addEventListener("change", e => {
    if (sizeSel.value === "Custom") setCanvasSize(canvasW, +e.target.value || canvasH);
  });
  // Position buttons
  document.getElementById("edBringFwd").addEventListener("click", () => {
    const el = elements.find(e => e.id === selectedEl);
    if (!el) return;
    pushUndo();
    el.zIndex = (el.zIndex || 1) + 1;
    renderElements();
  });
  document.getElementById("edSendBwd").addEventListener("click", () => {
    const el = elements.find(e => e.id === selectedEl);
    if (!el) return;
    pushUndo();
    el.zIndex = Math.max(0, (el.zIndex || 1) - 1);
    renderElements();
  });
  document.getElementById("edDuplicate").addEventListener("click", () => {
    const el = elements.find(e => e.id === selectedEl);
    if (!el) return;
    const copy = JSON.parse(JSON.stringify(el));
    copy.id = uid();
    copy.x  = (copy.x || 0) + 20;
    copy.y  = (copy.y || 0) + 20;
    copy.zIndex = elements.length + 1;
    addElement(copy);
  });
  document.getElementById("edDeleteSelR").addEventListener("click", () => {
    if (selectedEl) removeElement(selectedEl);
  });
}

function bindZoom() {
  if (!zoomInput) return;
  zoomInput.min = 25; zoomInput.max = 200; zoomInput.value = 100;
  zoomInput.addEventListener("input", () => {
    zoom = zoomInput.value / 100;
    applyZoom();
  });
}

// ── Random layout ─────────────────────────────────────────────────
function applyRandomLayout() {
  pushUndo();
  const layout = RANDOM_LAYOUTS[Math.floor(Math.random() * RANDOM_LAYOUTS.length)];
  setCanvasBg(layout.bg);
  // Remove existing border
  elements = elements.filter(e => e.type !== "border");
  addElement({
    id: uid(), type: "border", borderType: layout.borderType,
    x: 0, y: 0, w: canvasW, h: canvasH, rotate: 0, zIndex: 0
  });
  // Add 3 stickers at corners
  const positions = [
    [20, 20], [canvasW - 140, 20], [canvasW / 2 - 50, canvasH - 140]
  ];
  layout.stickerEmojis.forEach((emoji, i) => {
    const ec = document.createElement("canvas");
    ec.width = ec.height = 80;
    const ctx2 = ec.getContext("2d");
    ctx2.font = "60px serif";
    ctx2.textAlign = "center";
    ctx2.textBaseline = "middle";
    ctx2.fillText(emoji, 40, 40);
    addElement({
      id: uid(), type: "sticker", src: ec.toDataURL(), alt: emoji,
      x: positions[i][0], y: positions[i][1],
      w: 120, h: 120, rotate: 0, zIndex: i + 1
    });
  });
  showStatus("Random layout applied! Add your text.");
}

// ── Save / Upload ─────────────────────────────────────────────────
function bindEditorButtons() {
  document.getElementById("edSaveBtn").addEventListener("click", () => saveProject(false));
  document.getElementById("edUploadBtn").addEventListener("click", () => saveProject(true));
}

async function saveProject(publish) {
  const user = auth.currentUser;
  if (!user) { showStatus("Not logged in."); return; }
  const title = document.getElementById("edTitleInput").value.trim() || "Untitled";
  showStatus("Saving…");

  // Snapshot draw canvas
  const drawDataUrl = drawCanvas.toDataURL("image/png");

  const projectData = {
    canvasW, canvasH, bg: canvasBg,
    elements: elements.map(el => {
      // Don't store large base64 in projectData for images — use Storage
      if ((el.type === "image" || el.type === "sticker") && el.src && el.src.startsWith("data:")) {
        return { ...el, _hasSrc: true };
      }
      return el;
    }),
    drawDataUrl
  };

  try {
    let docId = editingId;
    // Create or update Firestore doc
    if (!docId) {
      const ref_ = await addDoc(collection(db, "announcements"), {
        title, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        published: false, createdBy: user.uid
      });
      docId = ref_.id;
      editingId = docId;
    } else {
      await setDoc(doc(db, "announcements", docId), {
        title, updatedAt: serverTimestamp()
      }, { merge: true });
    }

    // Upload asset images to Storage (stickers/images with data URLs)
    const uploadPromises = elements
      .filter(el => (el.type === "image" || el.type === "sticker") && el.src && el.src.startsWith("data:"))
      .map(async el => {
        const sRef = ref(storage, `announcements/${docId}/assets/${el.id}.png`);
        await uploadString(sRef, el.src, "data_url");
        const url = await getDownloadURL(sRef);
        // Update element src to Storage URL
        const found = projectData.elements.find(e => e.id === el.id);
        if (found) found.src = url;
        el.src = url; // update in-memory too
      });
    await Promise.all(uploadPromises);

    // If publishing, generate poster preview PNG
    let previewUrl = null;
    if (publish) {
      // Use html2canvas to capture the canvas
      const preview = await generatePreview();
      if (preview) {
        const pRef = ref(storage, `announcements/${docId}/preview.png`);
        await uploadString(pRef, preview, "data_url");
        previewUrl = await getDownloadURL(pRef);
      }
    }

    // Save final projectData (with Storage URLs)
    await setDoc(doc(db, "announcements", docId), {
      title,
      projectData: JSON.parse(JSON.stringify(projectData)),
      ...(publish ? { published: true, previewUrl: previewUrl || "" } : {}),
      updatedAt: serverTimestamp()
    }, { merge: true });

    renderElements(); // re-render with Storage URLs
    showStatus(publish ? "Published! ✅" : "Saved ✅");
    if (publish) closeEditor();
  } catch (e) {
    console.error("Save failed:", e);
    showStatus("Save failed. Check console.");
  }
}

async function generatePreview() {
  if (typeof html2canvas === "undefined") return null;
  try {
    const c = await html2canvas(canvasBgEl, {
      scale: 0.5,
      useCORS: true,
      allowTaint: true,
      backgroundColor: canvasBg
    });
    return c.toDataURL("image/png", 0.85);
  } catch (e) {
    console.error("Preview gen failed:", e);
    return drawCanvas.toDataURL("image/png", 0.85);
  }
}

// ── Inject HTML ───────────────────────────────────────────────────
function injectEditorHTML() {
  // Editor status toast
  const statusEl = document.createElement("div");
  statusEl.id = "edStatus";
  statusEl.className = "ed-status";
  document.body.appendChild(statusEl);

  const shell = document.getElementById("annEditor");
  if (!shell) return;
  shell.innerHTML = `
<!-- Top toolbar -->
<div class="ed-toolbar">
  <div class="ed-toolbar-group">
    <button class="ed-icon-btn" id="edClose" title="Close editor">✕</button>
    <input type="text" id="edTitleInput" placeholder="Poster title…"
      style="border:1px solid #ddd;border-radius:8px;padding:6px 10px;font-size:14px;font-family:inherit;width:150px;">
  </div>
  <div class="ed-toolbar-group">
    <span class="ed-lbl">Size</span>
    <input type="number" id="edFontSize" value="24" min="8" max="200"
      style="width:60px;border:1px solid #ddd;border-radius:6px;padding:4px 6px;font-size:13px;font-family:inherit;">
  </div>
  <div class="ed-toolbar-group">
    <span class="ed-lbl">Font</span>
    <select class="ed-select" id="edFontSel" style="max-width:150px;"></select>
  </div>
  <div class="ed-toolbar-group">
    <span class="ed-lbl">Text</span>
    <input type="color" class="ed-color-btn" id="edTextColor" value="#222222" title="Text colour">
  </div>
  <div class="ed-toolbar-group">
    <span class="ed-lbl">Align</span>
    <button class="ed-align-btn" id="edAlignL" title="Left">☰</button>
    <button class="ed-align-btn active" id="edAlignC" title="Centre">≡</button>
    <button class="ed-align-btn" id="edAlignR" title="Right">☷</button>
  </div>
  <div class="ed-toolbar-group">
    <button class="ed-icon-btn" id="edClearAll" title="Clear all">🗑</button>
    <button class="ed-icon-btn" id="edDeleteSel" title="Delete selected">✂️</button>
    <button class="ed-icon-btn" id="edUndo" title="Undo (Ctrl+Z)">↩</button>
    <button class="ed-icon-btn" id="edRedo" title="Redo (Ctrl+Y)">↪</button>
    <button class="ed-icon-btn" id="edAddText" title="Add text box">T+</button>
  </div>
  <div class="ed-toolbar-group" style="position:relative;">
    <button class="ed-tool-btn" data-tool="pencil" title="Pencil">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M17 3a2.83 2.83 0 014 4L7 21H3v-4L17 3z"/></svg>
      Pencil
    </button>
    <button class="ed-tool-btn" data-tool="brush" title="Brush">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 19c-4 0-6-2-6-5 0-2 1.5-4 4-5l8-5-5 8c-1 2.5.8 4 2 4-2.5 3-3 3-3 3z"/></svg>
      Brush
    </button>
    <button class="ed-tool-btn" data-tool="marker" title="Marker">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="9" y="3" width="6" height="12" rx="2"/><path d="M12 15v6"/></svg>
      Marker
    </button>
    <button class="ed-tool-btn" data-tool="eraser" title="Eraser">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M20 20H7L3 16l13-13 6 6-3 3"/><path d="M6 20l4-4"/></svg>
      Eraser
    </button>
    <!-- Drawing popup -->
    <div class="draw-popup hidden" id="drawPopup">
      <div>
        <label>Colour</label>
        <div class="draw-colors" id="drawColorSwatches"></div>
      </div>
      <div>
        <label>Size</label>
        <div class="draw-size-row">
          <input type="range" id="drawSizeSlider" min="1" max="20" value="4">
          <div class="draw-size-preview" id="drawSizePreview" style="width:12px;height:12px;"></div>
        </div>
      </div>
    </div>
  </div>
  <div class="ed-toolbar-group" style="margin-left:auto;">
    <input type="color" class="ed-color-btn ed-bg-swatch" id="edBgSwatch" value="#fffef8" title="Background colour">
    <button class="ed-save-btn" id="edSaveBtn">💾 Save</button>
    <button class="ed-upload-btn" id="edUploadBtn">📤 Upload</button>
  </div>
</div>

<!-- Editor body -->
<div class="ed-body">
  <!-- Left sidebar icons -->
  <div class="ed-sidebar">
    <button class="ed-sidebar-btn active" data-panel="design" title="Design">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93A10 10 0 115 18.07"/></svg>
      Design
    </button>
    <button class="ed-sidebar-btn" data-panel="uploads" title="Uploads">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
      Uploads
    </button>
    <button class="ed-sidebar-btn" data-panel="random" title="Random Layout">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>
      Random
    </button>
  </div>

  <!-- Left panel -->
  <div class="ed-left-panel" id="edLeftPanel" data-open="design">
    <!-- Design panel -->
    <div id="edPanelDesign">
      <div class="ed-panel-tabs">
        <button class="ed-panel-tab active" data-sub="templates">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
          Templates
        </button>
        <button class="ed-panel-tab" data-sub="borders">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="4 2"/></svg>
          Borders
        </button>
        <button class="ed-panel-tab" data-sub="stickers">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9 10h.01M15 10h.01M9.5 15a4 4 0 005 0"/></svg>
          Stickers
        </button>
        <button class="ed-panel-tab" data-sub="links">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07L12 5"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07L11 19"/></svg>
          Links
        </button>
      </div>
      <div class="ed-panel-content">
        <!-- Templates -->
        <div id="edSubTemplates">
          <input class="ed-tpl-search" id="edTplSearch" placeholder="Search templates…" type="text">
          <div class="ed-tpl-cats">
            <button class="ed-tpl-cat active" data-cat="all">All</button>
            <button class="ed-tpl-cat" data-cat="announcement">Announcement</button>
            <button class="ed-tpl-cat" data-cat="event">Event</button>
            <button class="ed-tpl-cat" data-cat="news">News</button>
            <button class="ed-tpl-cat" data-cat="timing">Timing</button>
            <button class="ed-tpl-cat" data-cat="reminder">Reminder</button>
          </div>
          <div class="ed-tpl-grid" id="edTplGrid"></div>
        </div>
        <!-- Borders -->
        <div id="edSubBorders" hidden>
          <div class="ed-border-grid" id="edBorderGrid"></div>
        </div>
        <!-- Stickers -->
        <div id="edSubStickers" hidden>
          <input class="ed-sticker-search" id="edStickerSearch" placeholder="Search stickers…" type="text">
          <label class="ed-sticker-upload-btn" id="edStickerUploadBtn">⬆️ Upload Sticker</label>
          <div class="ed-sticker-grid" id="edStickerGrid"></div>
        </div>
        <!-- Links -->
        <div id="edSubLinks" hidden>
          <div class="ed-link-form">
            <label>URL</label>
            <input type="url" id="edLinkUrl" placeholder="https://…">
            <label>Link text (optional)</label>
            <input type="text" id="edLinkText" placeholder="Click here">
            <button class="ed-link-add" id="edLinkAdd">Add Link</button>
          </div>
        </div>
      </div>
    </div>
    <!-- Uploads panel -->
    <div id="edPanelUploads" hidden>
      <div class="ed-panel-content">
        <label class="ed-upload-img-btn" id="edImgUploadBtn">
          📁 Upload Image (PNG / JPG)
        </label>
        <p style="font-size:13px;color:#888;text-align:center;margin-top:8px;">
          Images appear on the canvas where you can resize and move them.
        </p>
      </div>
    </div>
    <!-- Random Layout panel -->
    <div id="edPanelRandom" hidden>
      <div class="ed-panel-content">
        <button class="ed-random-btn" id="edRandomBtn">🎲 Random Layout</button>
        <p class="ed-random-hint">
          Generates a fresh artistic background each time — no text added.<br>
          Add your own announcement text after.
        </p>
      </div>
    </div>
  </div>

  <!-- Central canvas workspace -->
  <div class="ed-canvas-wrap" id="edCanvasWrap">
    <div class="ed-canvas-bg" id="edCanvasBg" style="background:#fffef8;width:794px;height:1123px;">
      <canvas class="ed-draw-canvas" id="edDrawCanvas" width="794" height="1123"></canvas>
    </div>
  </div>

  <!-- Right panel -->
  <div class="ed-right-panel">
    <!-- Canvas settings -->
    <div class="ed-right-section">
      <h4>Canvas</h4>
      <select class="ed-canvas-size-select" id="edCanvasSizeSel"></select>
      <div class="ed-dim-row">
        <label>W</label><input type="number" id="edWidth" value="794" min="200" max="3000"> px
        <label>H</label><input type="number" id="edHeight" value="1123" min="200" max="3000"> px
      </div>
      <div class="ed-bg-row">
        <label>BG</label>
        <input type="color" class="ed-bg-swatch" id="edBgSwatch2" value="#fffef8" title="Background">
      </div>
    </div>
    <!-- Layers -->
    <div class="ed-right-section" style="flex:1;overflow:hidden;display:flex;flex-direction:column;padding-bottom:0">
      <h4>Layers</h4>
      <div class="ed-layers-list" id="edLayersList"></div>
    </div>
    <!-- Position -->
    <div class="ed-right-section">
      <h4>Position</h4>
      <div class="ed-pos-btns">
        <button class="ed-pos-btn" id="edBringFwd">Bring Forward</button>
        <button class="ed-pos-btn" id="edSendBwd">Send Backward</button>
        <button class="ed-pos-btn" id="edDuplicate">Duplicate</button>
        <button class="ed-pos-btn" id="edDeleteSelR" style="color:#c0392b;">Delete</button>
      </div>
    </div>
    <!-- Zoom -->
    <div class="ed-zoom-bar">
      <span>Zoom</span>
      <input type="range" id="edZoom" min="25" max="200" value="100">
      <span class="ed-zoom-label" id="edZoomLabel">100%</span>
    </div>
  </div>
</div>`;

  // Second bg swatch synced
  document.getElementById("edBgSwatch2").addEventListener("input", e => {
    setCanvasBg(e.target.value);
    document.getElementById("edBgSwatch").value = e.target.value;
  });
}

// ── Boot ─────────────────────────────────────────────────────────
// Fires once when user first clicks Announcements in the navbar
window.addEventListener("bs:announcements", () => {
  injectEditorHTML();
  setTimeout(() => {
    initAnnouncements();
    // Expose editor opener globally for the "Add Announcement" button
    window._annOpenEditor = openEditor;
  }, 0);
});