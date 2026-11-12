// requests-panel.js
// Student registration requests panel — shown bottom-left on admin homepage.
// No separate login needed — uses the admin's existing Firebase Auth session.
// Reads/writes to brushstrokes-student Firestore directly.

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getFirestore, collection, doc,
  onSnapshot, updateDoc, setDoc,
  query, orderBy, serverTimestamp, writeBatch, getDocs
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, setPersistence, inMemoryPersistence }
  from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

console.log("[REQ] requests-panel.js loaded");

// ── Student project config (public — safe to expose) ─────────
const STUDENT_CFG = {
  apiKey: "AIzaSyATW9btDBBsJg32Qcj84yEU34l1OzX5G_Q",
  authDomain: "brushstrokes-student.firebaseapp.com",
  projectId: "brushstrokes-student",
  storageBucket: "brushstrokes-student.firebasestorage.app",
  messagingSenderId: "140790604149",
  appId: "1:140790604149:web:18dc0eaf59d9672ce8333c"
};

// Admin-project UIDs jo requests panel dekh aur approve kar sakte hain
const ADMIN_UIDS_ADMIN_PROJECT = [
  "S5SAl58EhKMiH949NHYKVcwRapH3",
  "tU1b475hZufJKVH0mMHuEBjUXR72",
  "GEpqARVfJoOU2J9NcDrajinwmyI2"
];
const ADMIN_UID_STUDENT_PROJECT = "25Tcm6EsmDSwrznOhNwZaLMV0zg1"; // fallback label only

// Admin-project UID -> us admin ki STUDENT project wali email.
// Jiski yahan entry nahi hai wo DEFAULT email try karega, fail hua toh login poochega.
const STUDENT_ADMIN_EMAILS = {
  "S5SAl58EhKMiH949NHYKVcwRapH3": "2058f51bf5a43aae1b7d5ad3d5f147bb8a6d4f6e@students.brushstrokes.app",
  "tU1b475hZufJKVH0mMHuEBjUXR72": "d51ae77904d69eb36a3a1c774def03c1a79c1dbc@students.brushstrokes.app",
  "GEpqARVfJoOU2J9NcDrajinwmyI2": "cd25e0735065c712c94d26a21014a8a0f1cb2791@students.brushstrokes.app"
};

// ── Init student Firestore (separate app) ─────────────────────
const studentApp = getApps().find(a => a.name === "student-panel")
  || initializeApp(STUDENT_CFG, "student-panel");
const studentDb   = getFirestore(studentApp);
const studentAuth = getAuth(studentApp);
setPersistence(studentAuth, inMemoryPersistence);

let unsubUsers = null;

function currentStudentAdminUid() {
  return (studentAuth.currentUser && studentAuth.currentUser.uid) || ADMIN_UID_STUDENT_PROJECT;
}

async function ensureStudentAuth() {
  if (studentAuth.currentUser) return true;

  let adminUid = null;
  try { adminUid = getAuth(getApp()).currentUser && getAuth(getApp()).currentUser.uid; } catch (_) {}

  const email = STUDENT_ADMIN_EMAILS[adminUid];
  // login ke turant baad password set hone mein thodi der lag sakti hai, isliye 2s tak wait
  for (let i = 0; i < 20 && !window.__bsAdminPw; i++) {
    await new Promise(r => setTimeout(r, 100));
  }
  const pw    = window.__bsAdminPw;

  // 1) auto-login: mapped/default email + admin login password
  if (pw && email) {
    try {
      await signInWithEmailAndPassword(studentAuth, email, pw);
      console.log("[REQ] student auth OK:", studentAuth.currentUser.uid);
      return true;
    } catch (e) {
      console.warn("[REQ] auto student login failed:", e.code);
    }
  }

  // 2) fallback: is admin ka student-project account manually poochho
  const em = window.prompt("Student project admin email daalo (requests ke liye):", "");
  if (!em) return false;
  const pass = window.prompt("Us account ka password:", "");
  if (!pass) return false;
  try {
    await signInWithEmailAndPassword(studentAuth, em.trim(), pass);
    console.log("[REQ] student auth OK (manual):", studentAuth.currentUser.uid);
    return true;
  } catch (e) {
    toast("⚠️ Student login failed: " + (e.code || e.message), 6000);
    return false;
  }
}

// ── DOM refs ──────────────────────────────────────────────────
const requestsBtn     = document.getElementById("requestsBtn");
const requestsBadge   = document.getElementById("requestsBadge");
const requestsPanel   = document.getElementById("requestsPanel");
const requestsContent = document.getElementById("requestsContent");
const panelClose      = document.getElementById("requestsPanelClose");

// ── nameHash (must match bs.js exactly) ───────────────────────
async function computeNameHash(name) {
  const norm = String(name || "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
  const enc  = new TextEncoder().encode(norm);
  const buf  = await crypto.subtle.digest("SHA-256", enc);
  const hex  = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join("");
  return hex.slice(0, 40);
}

// ── Parse admin attendance docId ──────────────────────────────
function parseDocId(docId) {
  const ev = docId.match(/^(\d{4}-\d{2}-\d{2})_(offline|online)_ev_[a-z0-9]+$/);
  if (ev) return { date: ev[1], mode: ev[2] };
  const dr = docId.match(/^(\d{4}-\d{2}-\d{2})_(offline|online)$/);
  if (dr) return { date: dr[1], mode: dr[2] };
  const lg = docId.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (lg) return { date: lg[1], mode: "offline" };
  return null;
}
function safeKey(s)  { return String(s).replace(/[./]/g, "_"); }
function monthKey(s) { return String(s || "").slice(0, 7); }

// ── Sync one student's attendance ─────────────────────────────
const hashCache = new Map();
async function hashOf(k) {
  if (!hashCache.has(k)) hashCache.set(k, await computeNameHash(k));
  return hashCache.get(k);
}
// admin ke purane spelling aliases (agar brushstroke.js ne expose kiya ho)
const canon = k => (typeof window.bsCanonName === "function" ? window.bsCanonName(k) : k);

function stable(v) {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}";
  }
  return JSON.stringify(v);
}

// docsMap: Map(docId -> data) of admin "attendance" collection (drafts + saved events)
async function buildMonthMap(nameHash, docsMap, seenNames) {
  const monthMap = new Map();
  for (const [docId, data] of docsMap) {
    const parsed = parseDocId(docId);
    if (!parsed) continue;
    const { date, mode } = parsed;
    const title = typeof data._title === "string" ? data._title : "";
    for (const [key, value] of Object.entries(data)) {
      if (key.startsWith("_")) continue;
      if (value !== "present" && value !== "half") continue;
      const ck = canon(key);
      if (ck !== key && ck in data) continue;          // naya naam doc mein ho toh wahi jeetta hai
      if (seenNames) seenNames.add(ck);
      if ((await hashOf(ck)) !== nameHash) continue;
      const mk = monthKey(date);
      if (!monthMap.has(mk)) monthMap.set(mk, { sessions: {} });
      monthMap.get(mk).sessions[safeKey(docId)] = { date, mode, title, status: value, adminDocId: docId };
    }
  }
  return monthMap;
}

async function writeStudentSummary(nameHash, normName, monthMap) {
  const existing = await getDocs(collection(studentDb, "attendance_summary", nameHash, "months"));
  const oldById = new Map();
  existing.forEach(d => oldById.set(d.id, d));

  const wb = writeBatch(studentDb);
  let ops = 0;
  oldById.forEach((d, mk) => { if (!monthMap.has(mk)) { wb.delete(d.ref); ops++; } });
  for (const [mk, md] of monthMap) {
    const old = oldById.get(mk);
    if (!old || stable(old.data().sessions || {}) !== stable(md.sessions)) {
      wb.set(doc(studentDb, "attendance_summary", nameHash, "months", mk),
             { sessions: md.sessions, lastUpdated: serverTimestamp() });
      ops++;
    }
  }
  if (ops) await wb.commit();

  let present = 0, half = 0, total = 0;
  for (const [, md] of monthMap) {
    for (const s of Object.values(md.sessions)) {
      total++;
      if (s.status === "present") present++;
      else if (s.status === "half") half++;
    }
  }
  await setDoc(
    doc(studentDb, "attendance_summary", nameHash),
    { presentCount: present, halfCount: half, absentCount: total - present - half,
      totalSessions: total, normName, lastUpdated: serverTimestamp() },
    { merge: true }
  );
  return { total, present, half, absent: total - present - half };
}

// docsMap optional: na ho toh admin DB se padh leta hai (Sync button / approve)
async function syncStudentAttendance(nameHash, normName, docsMap) {
  const adminDb = window.bsAdminDb;
  if (!docsMap) {
    if (!adminDb) throw new Error("Admin DB not ready");
    const snap = await getDocs(collection(adminDb, "attendance"));
    docsMap = new Map(snap.docs.map(d => [d.id, d.data()]));
  }
  const seen = new Set();
  const monthMap = await buildMonthMap(nameHash, docsMap, seen);
  const r = await writeStudentSummary(nameHash, normName, monthMap);

  const words = String(normName || "").toLowerCase().split(/\s+/).filter(w => w.length >= 3);
  const candidates = [...seen].filter(k => words.some(w => k.toLowerCase().includes(w))).slice(0, 6);
  console.log("[REQ] sync:", { adminDocs: docsMap.size, matchedSessions: r.total, looksLike: candidates });
  return { ...r, docs: docsMap.size, candidates };
}

// ── Auto-sync: admin me attendance badalte hi student data update ─
const attCache    = new Map();   // docId -> data (admin "attendance")
const dirtyHashes = new Set();   // jin students ka data badla
let attUnsub = null, attReady = false, flushTimer = null, flushChain = Promise.resolve(), attRetry = 0;

async function markDirtyFrom(data) {
  if (!data) return;
  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith("_")) continue;
    if (value !== "present" && value !== "half") continue;
    dirtyHashes.add(await hashOf(canon(key)));
  }
}

function flushDirty() {
  flushChain = flushChain.then(async () => {
    const hashes = [...dirtyHashes];
    dirtyHashes.clear();
    let done = 0;
    for (const h of hashes) {
      const s = allStudents.find(x => x.nameHash === h && x.status === "approved");
      if (!s) continue;                                   // registered / approved nahi -> skip
      try {
        await syncStudentAttendance(h, s.normName || s.fullName || "", attCache);
        done++;
      } catch (e) {
        console.error("[REQ] auto-sync failed:", e);
        toast("⚠️ Auto-sync failed: " + (e.code || e.message), 5000);
      }
    }
    if (done) toast("🔄 Student attendance updated", 2200);
  });
}

function startAutoSync() {
  if (attUnsub) return;
  const adminDb = window.bsAdminDb;
  if (!adminDb) {
    if (attRetry++ < 20) setTimeout(startAutoSync, 1000);
    return;
  }
  attUnsub = onSnapshot(collection(adminDb, "attendance"), async snap => {
    if (!attReady) {                                      // pehli baar: sirf cache bharo
      snap.docs.forEach(d => attCache.set(d.id, d.data()));
      attReady = true;
      return;
    }
    const jobs = [];
    for (const ch of snap.docChanges()) {
      const old = attCache.get(ch.doc.id);
      const now = ch.type === "removed" ? null : ch.doc.data();
      if (now) attCache.set(ch.doc.id, now); else attCache.delete(ch.doc.id);
      jobs.push([old, now]);
    }
    for (const [o, n] of jobs) { await markDirtyFrom(o); await markDirtyFrom(n); }
    if (dirtyHashes.size) { clearTimeout(flushTimer); flushTimer = setTimeout(flushDirty, 1500); }
  }, err => console.error("[REQ] auto-sync listener:", err));
}

function stopAutoSync() {
  if (attUnsub) { attUnsub(); attUnsub = null; }
  attCache.clear(); dirtyHashes.clear(); attReady = false; attRetry = 0;
  clearTimeout(flushTimer);
}

// ── Toast ─────────────────────────────────────────────────────
function toast(msg, dur = 2800) {
  // Reuse admin site's existing toast if available, else console
  const el = document.getElementById("toast") || document.getElementById("snackbar");
  if (el) {
    el.textContent = msg;
    el.style.display = "block";
    el.style.opacity = "1";
    setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.style.display="none", 400); }, dur);
  } else {
    console.log("REQUESTS:", msg);
    let box = document.getElementById("reqToastBox");
    if (!box) {
      box = document.createElement("div");
      box.id = "reqToastBox";
      box.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);max-width:92vw;" +
        "background:#2a1a0e;color:#fff;padding:10px 16px;border-radius:12px;font:600 .85rem Nunito,sans-serif;" +
        "z-index:99999;box-shadow:0 6px 20px rgba(0,0,0,.3);display:none;text-align:center";
      document.body.appendChild(box);
    }
    box.textContent = msg;
    box.style.display = "block";
    clearTimeout(box._t);
    box._t = setTimeout(() => { box.style.display = "none"; }, dur);
  }
}

// ── Escape HTML ───────────────────────────────────────────────
function esc(s) {
  return String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

// ── Render panel content ──────────────────────────────────────
let allStudents = [];

function renderPanel() {
  const pending  = allStudents.filter(s => s.status === "pending");
  const approved = allStudents.filter(s => s.status === "approved");
  const rejected = allStudents.filter(s => s.status === "rejected");

  if (!allStudents.length) {
    requestsContent.innerHTML = `
      <div style="text-align:center;padding:32px 16px;color:var(--text2,#6b4c2a);font-family:'Nunito',sans-serif;">
        <div style="font-size:2.5rem;margin-bottom:8px">👥</div>
        <div style="font-weight:700;font-size:.9rem">No student accounts yet.</div>
      </div>`;
    return;
  }

  const renderSection = (title, students, status) => {
    if (!students.length) return "";
    return `
      <div style="font-weight:800;font-size:.8rem;text-transform:uppercase;
        letter-spacing:.06em;color:var(--text2,#6b4c2a);margin:12px 0 6px;
        font-family:'Nunito',sans-serif;">${title}</div>
      ${students.map(s => renderStudentRow(s, status)).join("")}`;
  };

  requestsContent.innerHTML =
    renderSection(`⏳ Pending (${pending.length})`,  pending,  "pending")  +
    renderSection(`✅ Approved (${approved.length})`, approved, "approved") +
    renderSection(`❌ Rejected (${rejected.length})`, rejected, "rejected");

  // Attach checkbox + button listeners
  allStudents.forEach(s => {
    const nmEl  = document.getElementById(`nm-${s.uid}`);
    const appBtn = document.getElementById(`app-${s.uid}`);
    const rejBtn = document.getElementById(`rej-${s.uid}`);
    const reappBtn = document.getElementById(`reapp-${s.uid}`);
    const resyncBtn = document.getElementById(`resync-${s.uid}`);

    if (appBtn) {
      appBtn.addEventListener("click", async () => {
        const verified = nmEl ? nmEl.checked : false;
        if (!verified) { toast("⚠️ Confirm name matches attendance list first."); return; }
        appBtn.disabled = true; appBtn.textContent = "…";
        try {
          await updateDoc(doc(studentDb,"users",s.uid), {
            status: "approved", nameMatchVerified: true,
            approvedAt: serverTimestamp(), approvedBy: currentStudentAdminUid()
          });
          await setDoc(doc(studentDb,"pending_approvals",s.uid),
            {status:"approved", updatedAt:serverTimestamp()}, {merge:true});
          toast("✅ Syncing attendance…", 8000);
          const r = await syncStudentAttendance(s.nameHash, s.normName || s.fullName || "");
          toast(`✅ Approved! ${r.total} sessions synced.`);
        } catch(err) {
          appBtn.disabled = false; appBtn.textContent = "✅ Approve";
          toast("Error: " + (err.message || "failed"), 4000);
        }
      });
    }

    if (rejBtn) {
      rejBtn.addEventListener("click", async () => {
        const note = prompt(`Rejection note for "${s.fullName}" (optional):`);
        if (note === null) return;
        try {
          await updateDoc(doc(studentDb,"users",s.uid), {
            status:"rejected", nameMatchVerified:false,
            rejectedAt:serverTimestamp(), rejectedBy:currentStudentAdminUid(),
            rejectionNote: note||""
          });
          await setDoc(doc(studentDb,"pending_approvals",s.uid),
            {status:"rejected",updatedAt:serverTimestamp()},{merge:true});
          toast(`❌ Rejected: ${s.fullName}`);
        } catch(err) { toast("Error: "+(err.message||"failed"),4000); }
      });
    }

    if (reappBtn) {
      reappBtn.addEventListener("click", async () => {
        reappBtn.disabled = true; reappBtn.textContent = "…";
        try {
          await updateDoc(doc(studentDb,"users",s.uid), {
            status:"approved", nameMatchVerified:true,
            approvedAt:serverTimestamp(), approvedBy:currentStudentAdminUid()
          });
          toast("✅ Re-approved! Syncing…", 8000);
          const r = await syncStudentAttendance(s.nameHash, s.normName||s.fullName||"");
          toast(`✅ Done! ${r.total} sessions synced.`);
        } catch(err) {
          reappBtn.disabled=false; reappBtn.textContent="↩ Re-approve";
          toast("Error: "+(err.message||"failed"),4000);
        }
      });
    }

    if (resyncBtn) {
      resyncBtn.addEventListener("click", async () => {
        resyncBtn.disabled=true; resyncBtn.textContent="Syncing…";
        try {
          const r = await syncStudentAttendance(s.nameHash, s.normName||s.fullName||"");
          if (r.total === 0) {
            toast(`⚠️ 0 sessions mile (admin attendance docs: ${r.docs}). Admin list mein milte-julte naam: ` +
                  (r.candidates.length ? r.candidates.join(", ") : "koi nahi"), 12000);
          } else {
            toast(`✅ Synced: ${r.total} sessions (${r.present}P/${r.half}H/${r.absent}A)`, 6000);
          }
        } catch(err) { toast("Sync failed: "+(err.message||""),4000); }
        resyncBtn.disabled=false; resyncBtn.textContent="🔄 Sync";
      });
    }
  });
}

function renderStudentRow(s, status) {
  const initials = String(s.fullName||"?").split(/\s+/).filter(Boolean)
    .map(w=>w[0]).join("").slice(0,2).toUpperCase();

  const statusColors = {
    pending:  {bg:"#fff3e0",color:"#e65100"},
    approved: {bg:"#e8f5e9",color:"#2e7d32"},
    rejected: {bg:"#ffebee",color:"#c62828"}
  };
  const sc = statusColors[status] || statusColors.pending;

  return `
    <div style="background:var(--surface2,#fff9f4);border-radius:12px;
      padding:12px;margin-bottom:8px;border:1px solid var(--border,#e8d5c0);
      font-family:'Nunito',sans-serif;">

      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <div style="width:36px;height:36px;border-radius:50%;flex-shrink:0;
          background:linear-gradient(135deg,#800020,#e8764f);
          color:#fff;font-weight:800;font-size:.9rem;
          display:flex;align-items:center;justify-content:center;">${initials}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:800;font-size:.92rem;white-space:nowrap;
            overflow:hidden;text-overflow:ellipsis">${esc(s.fullName||"Unknown")}</div>
          <div style="font-size:.75rem;color:var(--text2,#6b4c2a)">
            ${esc(s.course||"—")} · ${esc(s.year||"—")} Year
          </div>
        </div>
        <span style="padding:2px 8px;border-radius:999px;font-size:.7rem;
          font-weight:800;background:${sc.bg};color:${sc.color};flex-shrink:0">
          ${status}
        </span>
      </div>

      ${status === "pending" ? `
        <label style="display:flex;align-items:center;gap:6px;
          font-size:.78rem;color:var(--text2,#6b4c2a);margin-bottom:8px;cursor:pointer">
          <input type="checkbox" id="nm-${s.uid}"
            style="width:14px;height:14px;accent-color:#800020;cursor:pointer">
          Name matches attendance list
        </label>
        <div style="display:flex;gap:6px">
          <button id="app-${s.uid}" style="flex:1;padding:7px;border-radius:8px;border:none;
            background:#e8f5e9;color:#2e7d32;font-weight:800;font-size:.8rem;
            cursor:pointer;font-family:'Nunito',sans-serif">✅ Approve</button>
          <button id="rej-${s.uid}" style="flex:1;padding:7px;border-radius:8px;border:none;
            background:#ffebee;color:#c62828;font-weight:800;font-size:.8rem;
            cursor:pointer;font-family:'Nunito',sans-serif">❌ Reject</button>
        </div>` : ""}

      ${status === "approved" ? `
        <div style="display:flex;gap:6px">
          <button id="resync-${s.uid}" style="flex:1;padding:7px;border-radius:8px;
            border:1.5px solid var(--border,#e8d5c0);background:var(--surface,#fff);
            color:var(--text2,#6b4c2a);font-weight:800;font-size:.78rem;
            cursor:pointer;font-family:'Nunito',sans-serif">🔄 Sync</button>
          <button id="rej-${s.uid}" style="flex:1;padding:7px;border-radius:8px;border:none;
            background:#ffebee;color:#c62828;font-weight:800;font-size:.78rem;
            cursor:pointer;font-family:'Nunito',sans-serif">Revoke</button>
        </div>` : ""}

      ${status === "rejected" ? `
        <button id="reapp-${s.uid}" style="width:100%;padding:7px;border-radius:8px;border:none;
          background:#e8f5e9;color:#2e7d32;font-weight:800;font-size:.8rem;
          cursor:pointer;font-family:'Nunito',sans-serif">↩ Re-approve</button>` : ""}
    </div>`;
}

// ── Panel open/close ──────────────────────────────────────────
let panelOpen = false;
function openPanel() {
  panelOpen = true;
  renderPanel();
  requestsPanel.style.display = "flex";
  requestsPanel.style.animation = "slideUpPanel .25s ease both";
}
function closePanel() {
  panelOpen = false;
  requestsPanel.style.display = "none";
}

requestsBtn.addEventListener("click", () => {
  panelOpen ? closePanel() : openPanel();
});
panelClose.addEventListener("click", closePanel);

// Close on outside click
document.addEventListener("click", e => {
  if (panelOpen &&
      !requestsPanel.contains(e.target) &&
      e.target !== requestsBtn) {
    closePanel();
  }
});

// ── Add animation keyframe ────────────────────────────────────
const style = document.createElement("style");
style.textContent = `
  @keyframes slideUpPanel {
    from { opacity:0; transform:translateY(16px); }
    to   { opacity:1; transform:translateY(0); }
  }
`;
document.head.appendChild(style);

// ── Show button only when admin is logged in ──────────────────
// brushstroke.js uses the default Firebase app for auth.
// We wait for it to be initialised (it loads before us via defer),
// then attach onAuthStateChanged to that same default app's auth.
function attachAuthListener() {
  try {
    const defaultApp = getApp(); // throws if not ready yet
    const adminAuth  = getAuth(defaultApp);
    onAuthStateChanged(adminAuth, user => {
      console.log("[REQ] admin auth state:", user && user.uid);
      if (user && ADMIN_UIDS_ADMIN_PROJECT.includes(user.uid)) {
        requestsBtn.style.display        = "flex";
        requestsBtn.style.alignItems     = "center";
        requestsBtn.style.justifyContent = "center";
        startListener();
      } else {
        requestsBtn.style.display   = "none";
        requestsBadge.style.display = "none";
        closePanel();
        if (unsubUsers) { unsubUsers(); unsubUsers = null; }
        stopAutoSync();
        try { studentAuth.signOut(); } catch (_) {}
      }
    });
  } catch (_) {
    // Default app not ready yet — retry in 300ms
    setTimeout(attachAuthListener, 300);
  }
}
attachAuthListener();

// ── Live listener — student users ─────────────────────────────
async function startListener() {
  if (unsubUsers) return;
  if (!(await ensureStudentAuth())) return;
  startAutoSync();
  unsubUsers = onSnapshot(
    collection(studentDb, "users"),
    snap => {
      console.log("[REQ] users docs received:", snap.size);
      allStudents = snap.docs
        .map(d => ({ uid: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

      const pendingCount = allStudents.filter(s => s.status === "pending").length;
      requestsBadge.style.display = pendingCount > 0 ? "flex" : "none";
      requestsBadge.textContent = pendingCount;

      if (panelOpen) renderPanel();
    },
    err => {
      console.error("Requests panel listener:", err);
      toast("⚠️ Requests load nahi hue: " + (err.code || err.message), 6000);
    }
  );
}
