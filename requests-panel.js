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

// ── Attendance sync: admin web -> student project ────────────
// Sources (admin project):
//   main = "attendance"        -> Members attendance page (drafts + saved events)
//   core = "core-attendance"   -> Core Members attendance page (drafts + saved sessions)
// Har student ke liye saare sessions bante hain (jisme present / half / absent teeno):
//   - normal member : sirf main sessions
//   - core member   : main + core sessions dono
const hashCache = new Map();
async function hashOf(k) {
  if (!hashCache.has(k)) hashCache.set(k, await computeNameHash(k));
  return hashCache.get(k);
}
const canon = k => (typeof window.bsCanonName === "function" ? window.bsCanonName(k) : k);
const CORE_ALIASES = { "Shaksham Katiyar": "Saksham Katiyar" };
const coreCanon = k => CORE_ALIASES[k] || k;

function stable(v) {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}";
  }
  return JSON.stringify(v);
}

// {name: "present"|"half"} (purani spelling ho toh naya naam; dono ho toh naya jeetta hai)
function marksFromMap(map, canonFn) {
  const out = {};
  if (!map || typeof map !== "object") return out;
  for (const [k, v] of Object.entries(map)) {
    if (k.startsWith("_")) continue;
    if (v !== "present" && v !== "half") continue;
    const ck = canonFn(k);
    if (ck !== k && ck in map) continue;
    out[ck] = v;
  }
  return out;
}

function mainSessionsOf(docsMap) {
  const list = [];
  for (const [id, data] of docsMap) {
    const parsed = parseDocId(id);
    if (!parsed) continue;
    const marks = marksFromMap(data, canon);
    const isEvent = /_ev_/.test(id);
    if (!isEvent && !Object.keys(marks).length) continue;   // khaali draft / purana doc session nahi
    list.push({
      id, kind: "main", date: parsed.date, mode: parsed.mode,
      title: typeof data._title === "string" ? data._title : "", marks
    });
  }
  return list;
}

const CORE_DRAFT_RE = /^(\d{4}-\d{2}-\d{2})_(online|offline)_draft$/;
const CORE_SAVED_RE = /^(\d{4}-\d{2}-\d{2})(?:_(online|offline)_cm_[a-z0-9]+)?$/;
function coreSessionsOf(docsMap) {
  const list = [];
  for (const [id, d] of docsMap) {
    const dm = id.match(CORE_DRAFT_RE);
    if (dm) {                                              // draft: {state:{name:status}}
      const marks = marksFromMap(d && d.state, coreCanon);
      if (!Object.keys(marks).length) continue;
      list.push({ id, kind: "core", date: dm[1], mode: dm[2], title: "", marks });
      continue;
    }
    const sm = id.match(CORE_SAVED_RE);                    // saved: {title, mode, members:[{name,status}]}
    if (!sm) continue;
    const data = d || {};
    const marks = {};
    (Array.isArray(data.members) ? data.members : []).forEach(m => {
      if (m && (m.status === "present" || m.status === "half")) marks[coreCanon(m.name)] = m.status;
    });
    const mode = (data.mode === "online" || data.mode === "offline") ? data.mode : (sm[2] || "online");
    list.push({ id, kind: "core", date: sm[1], mode, title: data.title || "", marks });
  }
  return list;
}

async function attachHashes(list) {
  for (const s of list) {
    s.hm = new Map();
    for (const [nm, st] of Object.entries(s.marks)) s.hm.set(await hashOf(nm), st);
  }
}

async function knownNames(mainList, coreList) {
  const names = new Set();
  (window.bsStudentNames || []).forEach(n => names.add(canon(n)));
  (window.bsCoreMemberNames || []).forEach(n => names.add(n));
  mainList.concat(coreList).forEach(s => Object.keys(s.marks).forEach(n => names.add(n)));
  const hashes = new Set();
  for (const n of names) hashes.add(await hashOf(n));
  return { names, hashes };
}
async function coreHashSet() {
  const set = new Set();
  for (const n of (window.bsCoreMemberNames || [])) set.add(await hashOf(n));
  return set;
}

// pichhli baar student project me kya likha tha (bekaar reads/writes bachane ke liye)
const lastWritten = new Map();   // nameHash -> { months: Map(mk -> stableStr), summary: stableStr }

async function writeStudentSummary(nameHash, normName, monthMap, extra) {
  let prev = lastWritten.get(nameHash);
  let prevMonths;
  if (prev) prevMonths = prev.months;
  else {
    prevMonths = new Map();
    const ex = await getDocs(collection(studentDb, "attendance_summary", nameHash, "months"));
    ex.forEach(d => prevMonths.set(d.id, stable(d.data().sessions || {})));
  }
  const newMonths = new Map();
  for (const [mk, md] of monthMap) newMonths.set(mk, stable(md.sessions));

  const wb = writeBatch(studentDb);
  let ops = 0;
  for (const mk of prevMonths.keys()) {
    if (!newMonths.has(mk)) { wb.delete(doc(studentDb, "attendance_summary", nameHash, "months", mk)); ops++; }
  }
  for (const [mk, str] of newMonths) {
    if (prevMonths.get(mk) !== str) {
      wb.set(doc(studentDb, "attendance_summary", nameHash, "months", mk),
             { sessions: monthMap.get(mk).sessions, lastUpdated: serverTimestamp() });
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
  const summary = {
    presentCount: present, halfCount: half, absentCount: total - present - half,
    totalSessions: total, normName, isCore: !!extra.isCore, nameMatched: !!extra.nameMatched
  };
  const sumStr = stable(summary);
  let wrote = ops > 0;
  if (!prev || prev.summary !== sumStr) {
    await setDoc(doc(studentDb, "attendance_summary", nameHash),
                 { ...summary, lastUpdated: serverTimestamp() }, { merge: true });
    wrote = true;
  }
  lastWritten.set(nameHash, { months: newMonths, summary: sumStr });
  return { total, present, half, absent: total - present - half, wrote };
}

async function syncWithLists(nameHash, normName, mainList, coreList, known, coreHashes, docsCount) {
  const nameMatched = known.hashes.has(nameHash);
  const isCore = coreHashes.has(nameHash);
  const monthMap = new Map();
  if (nameMatched) {
    const list = isCore ? mainList.concat(coreList) : mainList;
    for (const s of list) {
      const status = s.hm.get(nameHash) || "absent";
      const mk = monthKey(s.date);
      if (!monthMap.has(mk)) monthMap.set(mk, { sessions: {} });
      monthMap.get(mk).sessions[safeKey((s.kind === "core" ? "core_" : "") + s.id)] = {
        date: s.date, mode: s.mode, title: s.title, status, kind: s.kind, adminDocId: s.id
      };
    }
  }
  const r = await writeStudentSummary(nameHash, normName, monthMap, { isCore, nameMatched });
  const words = String(normName || "").toLowerCase().split(/\s+/).filter(w => w.length >= 3);
  const candidates = [...known.names].filter(k => words.some(w => k.toLowerCase().includes(w))).slice(0, 6);
  return { ...r, docs: docsCount, nameMatched, isCore, candidates };
}

// Sync button / approve: admin DB se taaza padhkar ek student sync
async function syncStudentAttendance(nameHash, normName) {
  const adminDb = window.bsAdminDb;
  if (!adminDb) throw new Error("Admin DB not ready");
  const [a, c] = await Promise.all([
    getDocs(collection(adminDb, "attendance")),
    getDocs(collection(adminDb, "core-attendance"))
  ]);
  const mainMap = new Map(a.docs.map(d => [d.id, d.data()]));
  const coreMap = new Map(c.docs.map(d => [d.id, d.data()]));
  const mainList = mainSessionsOf(mainMap), coreList = coreSessionsOf(coreMap);
  await attachHashes(mainList); await attachHashes(coreList);
  lastWritten.delete(nameHash);                            // pehle server se compare karo
  const r = await syncWithLists(nameHash, normName, mainList, coreList,
    await knownNames(mainList, coreList), await coreHashSet(), mainMap.size);
  console.log("[REQ] sync:", { mainDocs: mainMap.size, coreDocs: coreMap.size, ...r });
  return r;
}

// ── Auto-sync: admin me attendance (main ya core) badalte hi student data update ─
let attCache = new Map(), coreCache = new Map();
let attUnsub = null, coreUnsub = null, attReady = false, coreReady = false;
let flushTimer = null, flushChain = Promise.resolve(), attRetry = 0;

function scheduleFlush() {
  if (!attReady || !coreReady) return;
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flushAll, 1500);
}

function flushAll() {
  flushChain = flushChain.then(async () => {
    if (!attReady || !coreReady) return;
    const students = allStudents.filter(s => s.status === "approved" && s.nameHash);
    if (!students.length) return;
    try {
      const mainList = mainSessionsOf(attCache), coreList = coreSessionsOf(coreCache);
      await attachHashes(mainList); await attachHashes(coreList);
      const known = await knownNames(mainList, coreList), coreHashes = await coreHashSet();
      let changed = 0;
      for (const s of students) {
        const r = await syncWithLists(s.nameHash, s.normName || s.fullName || "",
                                      mainList, coreList, known, coreHashes, attCache.size);
        if (r.wrote) changed++;
      }
      if (changed) toast("🔄 Student attendance updated", 2200);
    } catch (e) {
      console.error("[REQ] auto-sync failed:", e);
      toast("⚠️ Auto-sync failed: " + (e.code || e.message), 5000);
    }
  });
}

function startAutoSync() {
  if (attUnsub) return;
  const adminDb = window.bsAdminDb;
  if (!adminDb) {
    if (attRetry++ < 20) setTimeout(startAutoSync, 1000);
    return;
  }
  attUnsub = onSnapshot(collection(adminDb, "attendance"), snap => {
    attCache = new Map(snap.docs.map(d => [d.id, d.data()]));
    attReady = true; scheduleFlush();
  }, err => console.error("[REQ] attendance listener:", err));
  coreUnsub = onSnapshot(collection(adminDb, "core-attendance"), snap => {
    coreCache = new Map(snap.docs.map(d => [d.id, d.data()]));
    coreReady = true; scheduleFlush();
  }, err => { console.error("[REQ] core-attendance listener:", err); coreReady = true; scheduleFlush(); });
}

function stopAutoSync() {
  if (attUnsub)  { attUnsub();  attUnsub = null; }
  if (coreUnsub) { coreUnsub(); coreUnsub = null; }
  attCache = new Map(); coreCache = new Map();
  attReady = false; coreReady = false; attRetry = 0;
  lastWritten.clear();
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
          if (!r.nameMatched) {
            toast("⚠️ Naam admin ki list mein nahi mila. Milte-julte naam: " +
                  (r.candidates.length ? r.candidates.join(", ") : "koi nahi") +
                  " — student ka naam admin list jaisa hona chahiye.", 12000);
          } else {
            toast(`✅ Synced${r.isCore ? " (Core + Main)" : ""}: ${r.total} sessions (${r.present}P/${r.half}H/${r.absent}A)`, 6000);
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
      setTimeout(scheduleFlush, 0);
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
