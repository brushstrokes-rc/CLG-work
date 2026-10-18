// ================================================================
//  announcements.js — Announcement Maker + Info Page
//  Fixes: mobile joystick drag, upload via base64 Firestore (no Storage CORS)
// ================================================================
import { getApp }  from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, setDoc,
  deleteDoc, onSnapshot, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

const auth = getAuth(getApp());
const db   = getFirestore(getApp());

// ================================================================
//  ANNOUNCEMENTS MAKER
// ================================================================

let editingId  = null;
let annUnsub   = null;
let boxes      = [];
let selectedId = null;
let undoStack  = [];
let redoStack  = [];
let idCounter  = 0;

function newId() { return "b" + (++idCounter); }

function defaultBox(id) {
  return {
    id, text: "Write your text here…",
    x: 60, y: 80, fontSize: 36,
    fontFamily: "'Pacifico',cursive",
    color: "#1a1a1a", align: "center", width: 440
  };
}

// ── Undo / Redo ───────────────────────────────────────────────────
function snap() { return JSON.stringify(boxes.map(b => ({...b}))); }
function pushUndo() {
  undoStack.push(snap());
  if (undoStack.length > 40) undoStack.shift();
  redoStack = [];
}
function undo() {
  if (!undoStack.length) return;
  redoStack.push(snap());
  boxes = JSON.parse(undoStack.pop());
  selectedId = null; renderCanvas();
}
function redo() {
  if (!redoStack.length) return;
  undoStack.push(snap());
  boxes = JSON.parse(redoStack.pop());
  selectedId = null; renderCanvas();
}

// ── Canvas ────────────────────────────────────────────────────────
function getCV() { return document.getElementById("annCanvas"); }

function renderCanvas() {
  const cv = getCV();
  if (!cv) return;
  cv.querySelectorAll(".ann-box").forEach(e => e.remove());

  boxes.forEach(box => {
    const wrap = document.createElement("div");
    wrap.className = "ann-box" + (box.id === selectedId ? " ann-box-sel" : "");
    wrap.dataset.id = box.id;
    wrap.style.cssText = `position:absolute;left:${box.x}px;top:${box.y}px;
      width:${box.width}px;box-sizing:border-box;border-radius:3px;`;

    // ── Drag handle bar (top strip) ──
    const bar = document.createElement("div");
    bar.className = "ann-drag-bar";
    bar.textContent = box.id === selectedId ? "⠿ drag" : "";
    bar.addEventListener("mousedown", e => { e.preventDefault(); selectBox(box.id); startDrag(e, box, wrap); });
    bar.addEventListener("touchstart", e => { e.preventDefault(); selectBox(box.id); startDragTouch(e, box, wrap); }, {passive:false});
    wrap.appendChild(bar);

    // ── Text ──
    const txt = document.createElement("div");
    txt.className = "ann-box-txt";
    txt.contentEditable = "true";
    txt.spellcheck = false;
    txt.innerHTML = box.text;
    txt.style.cssText = `font-size:${box.fontSize}px;font-family:${box.fontFamily};
      color:${box.color};text-align:${box.align};outline:none;
      word-break:break-word;white-space:pre-wrap;line-height:1.35;
      min-height:1em;padding:4px 6px;cursor:text;`;
    txt.addEventListener("mousedown", e => { e.stopPropagation(); selectBox(box.id); });
    txt.addEventListener("touchstart", e => { e.stopPropagation(); selectBox(box.id); }, {passive:true});
    txt.addEventListener("focus", () => selectBox(box.id));
    txt.addEventListener("input",  () => { box.text = txt.innerHTML; });
    wrap.appendChild(txt);

    // ── Delete btn ──
    if (box.id === selectedId) {
      const del = document.createElement("button");
      del.className = "ann-box-del";
      del.textContent = "✕";
      del.addEventListener("click", e => {
        e.preventDefault(); e.stopPropagation();
        pushUndo();
        boxes = boxes.filter(b => b.id !== box.id);
        selectedId = null; renderCanvas();
      });
      wrap.appendChild(del);

      // ── JOYSTICK (mobile drag) ──
      const joy = document.createElement("div");
      joy.className = "ann-joystick";
      joy.innerHTML = `
        <button class="joy-btn joy-up"   data-dx="0"   data-dy="-10">▲</button>
        <button class="joy-btn joy-left" data-dx="-10" data-dy="0">◀</button>
        <button class="joy-btn joy-center" title="Move mode">✦</button>
        <button class="joy-btn joy-right" data-dx="10"  data-dy="0">▶</button>
        <button class="joy-btn joy-down"  data-dx="0"   data-dy="10">▼</button>`;
      // Each direction button moves the box
      joy.querySelectorAll("[data-dx]").forEach(btn => {
        // Hold to keep moving
        let interval;
        const move = () => {
          pushUndo();
          box.x = Math.max(0, box.x + parseInt(btn.dataset.dx));
          box.y = Math.max(0, box.y + parseInt(btn.dataset.dy));
          wrap.style.left = box.x + "px";
          wrap.style.top  = box.y + "px";
        };
        btn.addEventListener("mousedown",  () => { move(); interval = setInterval(move, 120); });
        btn.addEventListener("touchstart", () => { move(); interval = setInterval(move, 120); }, {passive:true});
        const stop = () => clearInterval(interval);
        btn.addEventListener("mouseup",   stop);
        btn.addEventListener("mouseleave",stop);
        btn.addEventListener("touchend",  stop);
      });
      wrap.appendChild(joy);
    }

    // Mouse drag on wrap background
    wrap.addEventListener("mousedown", e => {
      if (e.target === txt || txt.contains(e.target)) return;
      if (e.target.classList.contains("joy-btn")) return;
      if (e.target.classList.contains("ann-box-del")) return;
      e.preventDefault();
      selectBox(box.id);
      startDrag(e, box, wrap);
    });

    // Touch drag on drag bar
    cv.appendChild(wrap);
  });
}

// ── Mouse drag ───────────────────────────────────────────────────
function startDrag(e, box, wrap) {
  const sx = e.clientX, sy = e.clientY, ox = box.x, oy = box.y;
  let moved = false;
  function onMove(mv) {
    const dx = mv.clientX - sx, dy = mv.clientY - sy;
    if (!moved && Math.abs(dx)+Math.abs(dy) > 4) { pushUndo(); moved = true; }
    box.x = Math.max(0, ox + dx);
    box.y = Math.max(0, oy + dy);
    wrap.style.left = box.x + "px";
    wrap.style.top  = box.y + "px";
  }
  function onUp() { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); }
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup",   onUp);
}

// ── Touch drag (drag bar) ─────────────────────────────────────────
function startDragTouch(e, box, wrap) {
  const t  = e.touches[0];
  const sx = t.clientX, sy = t.clientY, ox = box.x, oy = box.y;
  let moved = false;
  function onMove(mv) {
    const dt = mv.touches[0];
    const dx = dt.clientX - sx, dy = dt.clientY - sy;
    if (!moved && Math.abs(dx)+Math.abs(dy) > 4) { pushUndo(); moved = true; }
    box.x = Math.max(0, ox + dx);
    box.y = Math.max(0, oy + dy);
    wrap.style.left = box.x + "px";
    wrap.style.top  = box.y + "px";
  }
  function onEnd() { document.removeEventListener("touchmove", onMove); document.removeEventListener("touchend", onEnd); }
  document.addEventListener("touchmove", onMove, {passive:false});
  document.addEventListener("touchend",  onEnd);
}

// ── Select ────────────────────────────────────────────────────────
function selectBox(id) {
  if (selectedId === id) return;
  selectedId = id;
  renderCanvas();
  syncToolbar(id);
  requestAnimationFrame(() => {
    const el = document.querySelector(`.ann-box[data-id="${id}"] .ann-box-txt`);
    if (el) el.focus();
  });
}

function syncToolbar(id) {
  const box = boxes.find(b => b.id === id);
  if (!box) return;
  const fs = document.getElementById("annFontSize");
  const fn = document.getElementById("annFont");
  const tc = document.getElementById("annTextColor");
  if (fs) fs.value = box.fontSize;
  if (fn) fn.value = box.fontFamily;
  if (tc) tc.value = box.color.startsWith("#") ? box.color : "#1a1a1a";
  document.querySelectorAll(".ann-align-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.align === box.align));
}

function applyToSelected(fn) {
  const box = boxes.find(b => b.id === selectedId);
  if (!box) return;
  fn(box);
  const el = document.querySelector(`.ann-box[data-id="${box.id}"] .ann-box-txt`);
  if (!el) return;
  el.style.fontSize   = box.fontSize   + "px";
  el.style.fontFamily = box.fontFamily;
  el.style.color      = box.color;
  el.style.textAlign  = box.align;
}

// ── Toolbar ───────────────────────────────────────────────────────
function bindToolbar() {
  const fs = document.getElementById("annFontSize");
  fs.addEventListener("input", () => {
    const v = parseInt(fs.value);
    if (v && v >= 6) applyToSelected(b => { b.fontSize = v; });
  });

  document.getElementById("annFont").addEventListener("change", e =>
    applyToSelected(b => { b.fontFamily = e.target.value; }));

  document.getElementById("annTextColor").addEventListener("input", e =>
    applyToSelected(b => { b.color = e.target.value; }));

  document.getElementById("annBgColor").addEventListener("input", e => {
    const cv = getCV(); if (cv) cv.style.background = e.target.value;
  });

  document.querySelectorAll(".ann-align-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".ann-align-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      applyToSelected(b => { b.align = btn.dataset.align; });
    });
  });

  document.getElementById("annAddTextBtn").addEventListener("click", () => {
    pushUndo();
    const box = defaultBox(newId());
    box.x = 60 + (boxes.length % 5) * 8;
    box.y = 80 + (boxes.length % 5) * 30;
    boxes.push(box);
    selectedId = box.id;
    renderCanvas();
    syncToolbar(box.id);
  });

  document.getElementById("annUndoBtn").addEventListener("click", undo);
  document.getElementById("annRedoBtn").addEventListener("click", redo);
  document.getElementById("annClearBtn").addEventListener("click", () => {
    if (!boxes.length || !confirm("Clear all text boxes?")) return;
    pushUndo(); boxes = []; selectedId = null; renderCanvas();
  });

  document.addEventListener("keydown", e => {
    const ed = document.getElementById("annEditor");
    if (!ed || ed.classList.contains("ann-editor-hidden")) return;
    if ((e.ctrlKey||e.metaKey) && e.key==="z") { e.preventDefault(); undo(); }
    if ((e.ctrlKey||e.metaKey) && e.key==="y") { e.preventDefault(); redo(); }
  });

  document.getElementById("annCloseBtn").addEventListener("click", () => {
    if (confirm("Close editor? Unsaved changes will be lost.")) closeEditor();
  });

  document.getElementById("annUploadBtn").addEventListener("click", uploadAnnouncement);
  document.getElementById("annAddBtn").addEventListener("click", () => openEditor(null, null));

  getCV().addEventListener("mousedown", e => {
    if (e.target === getCV()) { selectedId = null; renderCanvas(); }
  });
}

// ── Open / Close editor ───────────────────────────────────────────
function openEditor(docId, savedData) {
  editingId = docId || null;
  boxes = []; selectedId = null; undoStack = []; redoStack = [];
  const cv = getCV();

  if (savedData && savedData.boxes) {
    boxes = savedData.boxes.map(b => ({...b}));
    idCounter = boxes.reduce((m,b) => Math.max(m, parseInt(b.id.slice(1))||0), 0);
    if (cv) cv.style.background = savedData.bgColor || "#fffef8";
    document.getElementById("annBgColor").value = savedData.bgColor || "#fffef8";
    document.getElementById("annTitle").value   = savedData.title   || "";
  } else {
    if (cv) cv.style.background = "#fffef8";
    document.getElementById("annBgColor").value = "#fffef8";
    document.getElementById("annTitle").value   = "";
    const b = defaultBox(newId()); b.x=40; b.y=80; boxes.push(b); selectedId = b.id;
  }

  renderCanvas();
  if (selectedId) syncToolbar(selectedId);
  document.getElementById("annEditor").classList.remove("ann-editor-hidden");
  document.body.style.overflow = "hidden";
}

function closeEditor() {
  document.getElementById("annEditor").classList.add("ann-editor-hidden");
  document.body.style.overflow = "";
}

// ── Preview PNG (Canvas API — no html2canvas, no CORS) ────────────
function buildPreview() {
  const cv      = getCV();
  const bgColor = document.getElementById("annBgColor").value || "#fffef8";

  // Sync text from DOM
  boxes.forEach(box => {
    const el = cv.querySelector(`.ann-box[data-id="${box.id}"] .ann-box-txt`);
    if (el) box.text = el.innerText || el.textContent || "";
  });

  const W = cv.offsetWidth  || 560;
  const H = Math.max(cv.offsetHeight || 792, 400);
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, W, H);

  boxes.forEach(box => {
    const fs    = box.fontSize || 36;
    const fam   = (box.fontFamily||"sans-serif").replace(/'/g,"");
    const color = box.color || "#1a1a1a";
    const align = box.align || "center";
    const bx    = box.x || 0;
    const by    = box.y || 0;
    const bw    = box.width || W - 80;
    const text  = (box.text || "").replace(/<[^>]*>/g,"").trim();
    if (!text) return;

    ctx.font      = `${fs}px ${fam}, sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = align;

    const drawX = align==="center" ? bx+bw/2 : align==="right" ? bx+bw : bx+8;
    const maxW  = bw - 16;
    const lineH = fs * 1.4;
    let   lineY = by + fs + 14;
    let   line  = "";

    text.split(/\s+/).forEach(word => {
      const test = line ? line+" "+word : word;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, drawX, lineY);
        line = word; lineY += lineH;
      } else { line = test; }
    });
    if (line) ctx.fillText(line, drawX, lineY);
  });

  return c.toDataURL("image/jpeg", 0.88);  // JPEG — smaller, Firestore-friendly
}

// ── Upload — stores EVERYTHING in Firestore (no Firebase Storage CORS issue) ─
async function uploadAnnouncement() {
  const user = auth.currentUser;
  if (!user) { alert("Not logged in."); return; }
  if (!boxes.length) { alert("Add at least one text box first."); return; }

  const title   = (document.getElementById("annTitle").value||"").trim() || "Untitled";
  const bgColor = document.getElementById("annBgColor").value || "#fffef8";
  const btn     = document.getElementById("annUploadBtn");
  btn.disabled = true; btn.textContent = "Saving…";

  // Sync text
  boxes.forEach(box => {
    const el = document.querySelector(`.ann-box[data-id="${box.id}"] .ann-box-txt`);
    if (el) box.text = el.innerText || el.textContent || "";
  });

  // Generate preview
  btn.textContent = "Generating preview…";
  let previewUrl = "";
  try { previewUrl = buildPreview(); } catch(e) { console.error("Preview failed:", e); }

  const projectData = { title, bgColor, boxes: boxes.map(b=>({...b})) };

  btn.textContent = "Uploading…";
  try {
    // Store preview as base64 string directly in Firestore — no Storage needed
    const payload = {
      ...projectData,
      published:  true,
      previewUrl,          // base64 JPEG data URL — works everywhere, no CORS
      updatedAt:  serverTimestamp()
    };

    if (!editingId) {
      const r = await addDoc(collection(db, "announcements"), {
        ...payload,
        createdAt: serverTimestamp(),
        createdBy: user.uid
      });
      editingId = r.id;
    } else {
      await setDoc(doc(db, "announcements", editingId), payload, { merge: true });
    }

    btn.textContent = "✅ Done!";
    setTimeout(() => {
      btn.disabled = false; btn.textContent = "📤 Upload";
      closeEditor();
    }, 700);

  } catch(e) {
    console.error("Upload failed:", e);
    alert("Upload failed: " + e.message);
    btn.disabled = false; btn.textContent = "📤 Upload";
  }
}

// ── Delete ────────────────────────────────────────────────────────
function confirmDeleteAnn(ann) {
  const ov = document.createElement("div");
  ov.style.cssText = "position:fixed;inset:0;z-index:700;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);padding:16px";
  ov.innerHTML = `<div style="background:#fff;color:#222;border-radius:16px;padding:28px 24px 22px;max-width:360px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,.25);text-align:center">
    <p style="font-size:16px;font-weight:700;margin:0 0 6px">Delete this announcement?</p>
    <p style="font-size:13px;color:#666;margin:0 0 22px">"${(ann.title||"Untitled").replace(/</g,"&lt;")}"</p>
    <div style="display:flex;gap:12px;justify-content:center">
      <button data-no style="flex:1;max-width:120px;padding:11px 0;border:none;border-radius:10px;background:#002aff;color:#fff;font-size:15px;font-weight:700;cursor:pointer">No</button>
      <button data-yes style="flex:1;max-width:120px;padding:11px 0;border:none;border-radius:10px;background:#00ff77;color:#111;font-size:15px;font-weight:700;cursor:pointer">Yes, Delete</button>
    </div></div>`;
  document.body.appendChild(ov);
  ov.querySelector("[data-no]").addEventListener("click", () => ov.remove());
  ov.querySelector("[data-yes]").addEventListener("click", async () => {
    ov.remove();
    try { await deleteDoc(doc(db, "announcements", ann.id)); }
    catch(e) { console.error(e); alert("Delete failed: "+e.message); }
  });
  ov.addEventListener("click", e => { if(e.target===ov) ov.remove(); });
}

// ── Render listing page ───────────────────────────────────────────
function renderAnnGrid(list) {
  const grid  = document.getElementById("annGrid");
  const empty = document.getElementById("annEmpty");
  if (!grid||!empty) return;
  grid.replaceChildren();
  const pub = list.filter(a => a.published);
  if (!pub.length) { empty.hidden = false; return; }
  empty.hidden = true;

  pub.forEach(ann => {
    const item = document.createElement("div");      // card + uske bahar ke buttons
    item.className = "ann-item";
    const card = document.createElement("div");
    card.className = "ann-card";

    if (ann.previewUrl) {
      const img = document.createElement("img");
      img.className="ann-card-thumb"; img.src=ann.previewUrl;
      img.alt=ann.title||"Announcement"; img.loading="lazy";
      card.appendChild(img);
    } else {
      const ph = document.createElement("div");
      ph.className="ann-card-thumb-ph"; ph.textContent="📢";
      card.appendChild(ph);
    }

    const body = document.createElement("div"); body.className="ann-card-body";
    const ttl  = document.createElement("div"); ttl.className="ann-card-title"; ttl.textContent=ann.title||"Untitled";
    const dt   = document.createElement("div"); dt.className="ann-card-date";
    dt.textContent = ann.createdAt?.toDate
      ? ann.createdAt.toDate().toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})
      : "";
    body.append(ttl,dt); card.appendChild(body);

    const actions = document.createElement("div"); actions.className="ann-card-actions ann-side";
    const editBtn = document.createElement("button"); editBtn.className="ann-btn-edit"; editBtn.textContent="✏️ Edit";
    editBtn.addEventListener("click", () => openEditor(ann.id, ann));
    const delBtn  = document.createElement("button"); delBtn.className="ann-btn-del";  delBtn.textContent="🗑️ Delete";
    delBtn.addEventListener("click", () => confirmDeleteAnn(ann));
    actions.append(editBtn,delBtn);
    item.append(card, actions);                      // buttons card ke andar nahi, bagal me
    grid.appendChild(item);
  });
}

function startAnnListener() {
  if (annUnsub) return;
  const q = query(collection(db,"announcements"), orderBy("createdAt","desc"));
  annUnsub = onSnapshot(q, snap => {
    const list = []; snap.forEach(d => list.push({id:d.id,...d.data()}));
    renderAnnGrid(list);
  }, err => { console.error("Ann listener:", err); annUnsub = null; });   // error ke baad dobara start ho sake
}

// ================================================================
//  INFO PAGE — paragraphs + images
// ================================================================

let infoUnsub = null;

function startInfoListener() {
  if (infoUnsub) return;
  const q = query(collection(db,"info_posts"), orderBy("createdAt","desc"));
  infoUnsub = onSnapshot(q, snap => {
    const list = []; snap.forEach(d => list.push({id:d.id,...d.data()}));
    renderInfoPosts(list);
  }, err => { console.error("Info listener:", err); infoUnsub = null; });
}

function renderInfoPosts(list) {
  const container = document.getElementById("infoPostsList");
  if (!container) return;
  container.replaceChildren();
  if (!list.length) {
    container.innerHTML = `<p style="color:var(--s-muted);text-align:center;padding:30px 0">No posts yet.</p>`;
    return;
  }
  list.forEach(post => {
    const card = document.createElement("div");
    card.className = "info-post-card";

    if (post.title) {
      const h = document.createElement("h3");
      h.className="info-post-title"; h.textContent=post.title;
      card.appendChild(h);
    }
    if (post.text) {
      const p = document.createElement("div");
      p.className="info-post-text";
      // Preserve line breaks
      p.innerHTML = post.text.replace(/\n/g,"<br>");
      card.appendChild(p);
    }
    if (post.images && post.images.length) {
      const grid = document.createElement("div");
      grid.className = "info-img-grid";
      post.images.forEach(src => {
        const img = document.createElement("img");
        img.src=src; img.alt="Info image"; img.loading="lazy";
        img.className="info-img";
        // Lightbox on click
        img.addEventListener("click", () => {
          const lb = document.getElementById("lightbox");
          if (lb) { lb.querySelector("img").src=src; lb.classList.add("on"); }
        });
        grid.appendChild(img);
      });
      card.appendChild(grid);
    }

    const meta = document.createElement("div");
    meta.className="info-post-meta";
    meta.textContent = post.createdAt?.toDate
      ? post.createdAt.toDate().toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})
      : "";

    // Delete button
    const delBtn = document.createElement("button");
    delBtn.className="info-del-btn"; delBtn.textContent="🗑 Delete";
    delBtn.addEventListener("click", () => confirmDeleteInfo(post));

    const metaRow = document.createElement("div"); metaRow.className="info-meta-row";
    metaRow.append(meta, delBtn); card.appendChild(metaRow);

    container.appendChild(card);
  });
}

function confirmDeleteInfo(post) {
  if (!confirm(`Delete "${post.title||"this post"}"?`)) return;
  deleteDoc(doc(db,"info_posts",post.id)).catch(e => alert("Delete failed: "+e.message));
}

function bindInfoForm() {
  const form    = document.getElementById("infoForm");
  const imgInp  = document.getElementById("infoImages");
  const imgHint = document.getElementById("infoImgHint");
  if (!form) return;

  imgInp.addEventListener("change", function() {
    const n = Math.min(this.files.length, 6);
    imgHint.textContent = n ? n+" image"+(n>1?"s":"")+" selected" : "Up to 6 images";
  });

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) { alert("Not logged in."); return; }

    const title = document.getElementById("infoTitle").value.trim();
    const text  = document.getElementById("infoText").value.trim();
    if (!title && !text) { alert("Add a title or text first."); return; }

    const btn = form.querySelector("[type=submit]");
    btn.disabled=true; btn.textContent="Saving…";

    // Compress images
    const files  = [...imgInp.files].slice(0,6);
    const images = [];
    for (const file of files) {
      const data = await compressInfoImage(file);
      if (data) images.push(data);
    }

    try {
      await addDoc(collection(db,"info_posts"), {
        title, text, images,
        createdAt: serverTimestamp(),
        createdBy: user.uid
      });
      form.reset();
      imgHint.textContent = "Up to 6 images";
      document.getElementById("infoFormWrap").hidden = true;
    } catch(err) {
      console.error(err); alert("Save failed: "+err.message);
    }
    btn.disabled=false; btn.textContent="Post";
  });

  document.getElementById("infoAddBtn").addEventListener("click", () => {
    const fw = document.getElementById("infoFormWrap");
    fw.hidden = !fw.hidden;
    if (!fw.hidden) fw.scrollIntoView({behavior:"smooth", block:"start"});
  });
}

function compressInfoImage(file) {
  return new Promise(res => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      const m=1000, k=Math.min(1, m/Math.max(im.width,im.height));
      const c=document.createElement("canvas");
      c.width=Math.round(im.width*k); c.height=Math.round(im.height*k);
      c.getContext("2d").drawImage(im,0,0,c.width,c.height);
      URL.revokeObjectURL(url);
      res(c.toDataURL("image/jpeg",0.78));
    };
    im.onerror=()=>{ URL.revokeObjectURL(url); res(null); };
    im.src=url;
  });
}

// ================================================================
//  INIT
// ================================================================
function startLive() {
  startAnnListener();
  startInfoListener();
}

function init() {
  bindToolbar();
  bindInfoForm();
  // Firestore listeners sirf LOGIN ke baad. Login se pehle rules (request.auth != null) permission-denied dete hain
  // aur listener hamesha ke liye band ho jata tha, isliye posts upload hone par bhi list me nahi dikhte the.
  window.addEventListener("bs:enter", startLive);
  if (auth.currentUser) startLive();
}

if (document.readyState==="loading") {
  document.addEventListener("DOMContentLoaded", init);
} else { init(); }