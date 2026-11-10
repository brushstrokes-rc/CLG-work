// ============================================================
//  student-activities.js  —  BRUSHSTROKE (admin website)
//
//  Shows one student's activity records (added on the "BS student"
//  website) LIVE, e.g. below that student's attendance data:
//  event date, event name, mode, college name, screenshots, plus a
//  search bar to find activities by event name.
//
//  The records live in the student Firebase project (collection
//  "activities"). This file opens a SECOND, separate Firebase app that
//  points at that project, so your existing admin Firebase (attendance,
//  login, users ...) is never touched.
//
//  Usage (inside the student profile page code):
//
//    import { mountStudentActivities } from "./student-activities.js";
//    const box = document.createElement("div");
//    profileRoot.appendChild(box);                       // below the attendance data
//    const view = mountStudentActivities(box, { names: [student.name] });
//    // when the profile page is closed:  view.destroy();
//
//  The admin signs in ONCE in the small "Connect" form; the sign-in is remembered in that
//  browser, so reloads and reopens show the activities straight away. "Disconnect" (top
//  right of the box) forgets it, e.g. on a shared computer.
//
//  Optional: sign in from your own code instead of the form:
//    import { connectStudentData } from "./student-activities.js";
//    await connectStudentData("admin-email", "admin-password");
// ============================================================
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  initializeAuth, indexedDBLocalPersistence, browserLocalPersistence,
  onAuthStateChanged, signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import {
  getFirestore, collection, query, where, onSnapshot
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

const STUDENT_FIREBASE = {
  apiKey: "AIzaSyATW9btDBBsJg32Qcj84yEU34l1OzX5G_Q",
  authDomain: "brushstrokes-student.firebaseapp.com",
  projectId: "brushstrokes-student",
  storageBucket: "brushstrokes-student.firebasestorage.app",
  messagingSenderId: "140790604149",
  appId: "1:140790604149:web:18dc0eaf59d9672ce8333c"
};
const APP_NAME = "bs-student-data";

// ── second Firebase app (student project) ────────────────────
let _link = null;
function link() {
  if (_link) return _link;
  const app = getApps().find(a => a.name === APP_NAME) || initializeApp(STUDENT_FIREBASE, APP_NAME);
  _link = {
    // The sign-in is remembered in THIS browser (only a Firebase session token, never the password),
    // so reloads / reopens do not ask again. "Disconnect" in the box forgets it.
    auth: initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] }),
    db: getFirestore(app)
  };
  return _link;
}

export async function connectStudentData(email, password) {
  return signInWithEmailAndPassword(link().auth, email, password);
}
export const studentDataConnected = () => !!link().auth.currentUser;
export const disconnectStudentData = () => signOut(link().auth);

// ── same name matching as the student website ────────────────
// (must stay identical to normalizeName / nameHash in the student site's bs.js)
const normalizeName = n => String(n || "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
async function nameHash(name) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalizeName(name)));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}

// ── tiny helpers ─────────────────────────────────────────────
const mk = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const isShot = s => typeof s === "string" && /^data:image\//.test(s);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? `${m[3]} ${MONTHS[+m[2] - 1] || ""} ${m[1]}` : (iso || "");
}

// ── styles (scoped, injected once) ───────────────────────────
function injectStyles() {
  if (document.getElementById("sa-style")) return;
  const s = document.createElement("style");
  s.id = "sa-style";
  s.textContent = `
.sa-box{margin-top:26px;padding:18px;border-radius:14px;background:var(--sa-bg,var(--s-card,#fff));color:var(--sa-ink,#2a1f2d);
  border:1px solid var(--sa-border,rgba(0,0,0,.12));box-shadow:0 4px 16px rgba(0,0,0,.08);font-family:inherit;text-align:left}
.sa-box *{box-sizing:border-box}
.sa-box [hidden]{display:none !important}
.sa-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.sa-head h3{margin:0;font-size:1.15rem}
.sa-badges{display:flex;gap:8px;align-items:center}
.sa-count{font-size:.8rem;font-weight:700;padding:3px 10px;border-radius:999px;background:rgba(122,63,201,.12);color:#6a35b5}
.sa-live{font-size:.78rem;font-weight:700;color:#1f8a3a}
.sa-off{padding:3px 8px;font:inherit;font-size:.78rem;font-weight:700;color:inherit;opacity:.7;background:none;border:0;cursor:pointer;text-decoration:underline}
.sa-off:hover{opacity:1}
.sa-search{display:block;width:100%;margin-top:12px;height:42px;padding:0 12px;font:inherit;color:inherit;
  background:transparent;border:1.5px solid var(--sa-border,rgba(0,0,0,.25));border-radius:10px;outline:none}
.sa-search:focus{border-color:#7a3fc9;box-shadow:0 0 0 3px rgba(122,63,201,.2)}
.sa-note{margin:12px 0 0;font-size:.9rem;opacity:.8;line-height:1.45}
.sa-msg{margin:10px 0 0;padding:9px 12px;border-radius:8px;font-size:.88rem;font-weight:700;color:#a3231a;background:#fdecea;border:1px solid #f3b9b3}
.sa-connect{display:grid;gap:8px;margin-top:12px;max-width:380px}
.sa-connect input{height:40px;padding:0 12px;font:inherit;color:inherit;background:transparent;border:1.5px solid var(--sa-border,rgba(0,0,0,.25));border-radius:8px}
.sa-btn{height:40px;padding:0 16px;font:inherit;font-weight:700;color:#fff;background:#7a3fc9;border:0;border-radius:8px;cursor:pointer}
.sa-btn:disabled{opacity:.6;cursor:progress}
.sa-list{display:grid;gap:12px;margin-top:14px}
.sa-item{padding:14px;border-radius:12px;border:1px solid var(--sa-border,rgba(0,0,0,.12));background:rgba(122,63,201,.04)}
.sa-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap}
.sa-name{margin:0;font-size:1.02rem;font-weight:800;overflow-wrap:anywhere}
.sa-date{font-size:.85rem;font-weight:700;color:#6a35b5;white-space:nowrap}
.sa-meta{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:6px;font-size:.88rem}
.sa-pill{padding:2px 10px;border-radius:999px;font-size:.75rem;font-weight:800}
.sa-pill.online{color:#1b5aa6;background:rgba(62,140,235,.16)}
.sa-pill.offline{color:#226b34;background:rgba(79,164,92,.18)}
.sa-thumbs{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.sa-thumb{width:88px;height:88px;padding:0;overflow:hidden;cursor:zoom-in;border:2px solid rgba(122,63,201,.4);border-radius:10px;background:#fff}
.sa-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.sa-empty{padding:20px 12px;text-align:center;opacity:.75;border:2px dashed rgba(122,63,201,.35);border-radius:12px;font-weight:700}
#sa-lightbox{position:fixed;inset:0;z-index:100000;display:grid;place-items:center;padding:18px;background:rgba(12,6,22,.85)}
#sa-lightbox[hidden]{display:none}
#sa-lightbox img{max-width:100%;max-height:88vh;border-radius:10px;background:#fff}
#sa-lightbox button{position:absolute;top:12px;right:14px;width:42px;height:42px;font:900 24px/1 sans-serif;color:#fff;
  cursor:pointer;background:rgba(255,255,255,.16);border:2px solid rgba(255,255,255,.7);border-radius:50%}`;
  document.head.appendChild(s);
}

// one full-size viewer shared by every mounted list
function lightbox() {
  let box = document.getElementById("sa-lightbox");
  if (box) return box;
  box = mk("div"); box.id = "sa-lightbox"; box.hidden = true;
  box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-label", "Screenshot");
  const close = mk("button", "", "×"); close.type = "button"; close.setAttribute("aria-label", "Close");
  const img = mk("img"); img.alt = "Screenshot";
  box.append(close, img);
  const hide = () => { box.hidden = true; img.removeAttribute("src"); };
  close.addEventListener("click", hide);
  box.addEventListener("click", e => { if (e.target === box) hide(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !box.hidden) hide(); });
  document.body.appendChild(box);
  return box;
}
function openShot(src) {
  const box = lightbox();
  box.querySelector("img").src = src;
  box.hidden = false;
  box.querySelector("button").focus();
}

// ════════════════════════════════════════════════════════════
export function mountStudentActivities(container, student) {
  injectStyles();
  const raw = Array.isArray(student) ? student
    : student && Array.isArray(student.names) ? student.names
    : [student && typeof student === "object" ? student.name : student];
  const names = raw.filter(n => typeof n === "string" && n.trim());

  const box = mk("section", "sa-box");
  box.setAttribute("aria-label", "Student activities");
  const head = mk("div", "sa-head");
  head.appendChild(mk("h3", "", "Activities"));
  const badges = mk("div", "sa-badges");
  const live = mk("span", "sa-live", "● Live"); live.hidden = true;
  const count = mk("span", "sa-count"); count.hidden = true;
  const off = mk("button", "sa-off", "Disconnect"); off.type = "button"; off.hidden = true;
  off.title = "Forget the student-data sign-in on this browser";
  badges.append(live, count, off); head.appendChild(badges);

  // connect form (shown until the admin account is signed in to the student project)
  const connect = mk("form", "sa-connect"); connect.hidden = true;
  const note = mk("p", "sa-note", "Sign in with the admin account of the student website's Firebase project to see this student's activities.");
  const email = mk("input"); email.type = "email"; email.placeholder = "Admin email"; email.autocomplete = "username"; email.required = true;
  const pass = mk("input"); pass.type = "password"; pass.placeholder = "Password"; pass.autocomplete = "current-password"; pass.required = true;
  const cbtn = mk("button", "sa-btn", "Connect"); cbtn.type = "submit";
  const cmsg = mk("p", "sa-msg"); cmsg.hidden = true;
  connect.append(note, email, pass, cbtn, cmsg);

  // live list
  const body = mk("div"); body.hidden = true;
  const search = mk("input", "sa-search"); search.type = "search"; search.placeholder = "Search by event name…";
  search.setAttribute("aria-label", "Search activities by event name");
  const list = mk("div", "sa-list"); list.setAttribute("aria-live", "polite");
  const err = mk("p", "sa-msg"); err.hidden = true;
  body.append(search, err, list);

  box.append(head, connect, body);
  container.appendChild(box);

  let items = [], unsubSnap = null, unsubAuth = null, destroyed = false, hashes = null;

  function render() {
    list.textContent = "";
    const q = search.value.trim().toLowerCase();
    const sorted = [...items].sort((a, b) => (b.eventDate || "").localeCompare(a.eventDate || ""));
    const shown = q ? sorted.filter(i => String(i.eventName || "").toLowerCase().includes(q)) : sorted;
    count.hidden = !items.length;
    count.textContent = q ? `${shown.length} of ${items.length}` : `${items.length} event${items.length === 1 ? "" : "s"}`;
    if (!items.length) { list.appendChild(mk("p", "sa-empty", "This student hasn't added any activities yet.")); return; }
    if (!shown.length) { list.appendChild(mk("p", "sa-empty", `No activity matches “${search.value.trim()}”.`)); return; }
    shown.forEach(it => {
      const card = mk("article", "sa-item");
      const top = mk("div", "sa-top");
      top.append(mk("h4", "sa-name", it.eventName || ""), mk("span", "sa-date", fmtDate(it.eventDate)));
      const meta = mk("div", "sa-meta");
      meta.append(mk("span", "sa-pill " + (it.mode === "Online" ? "online" : "offline"), it.mode || ""),
                  mk("span", "sa-college", it.college || ""));
      card.append(top, meta);
      const shots = (it.shots || []).filter(isShot);
      if (shots.length) {
        const th = mk("div", "sa-thumbs");
        shots.forEach((src, i) => {
          const b = mk("button", "sa-thumb"); b.type = "button";
          b.setAttribute("aria-label", `View screenshot ${i + 1} of ${it.eventName}`);
          const img = new Image(); img.src = src; img.alt = ""; img.loading = "lazy";
          b.appendChild(img); b.addEventListener("click", () => openShot(src));
          th.appendChild(b);
        });
        card.appendChild(th);
      }
      list.appendChild(card);
    });
  }
  search.addEventListener("input", render);
  off.addEventListener("click", () => { disconnectStudentData().catch(e => console.error(e)); });

  function showConnect() { connect.hidden = false; body.hidden = true; live.hidden = true; count.hidden = true; off.hidden = true; }
  function stopSnap() { if (unsubSnap) unsubSnap(); unsubSnap = null; items = []; }

  async function subscribe() {
    if (unsubSnap || destroyed) return;
    if (!hashes) hashes = [...new Set(await Promise.all(names.map(nameHash)))].slice(0, 30);
    if (destroyed || unsubSnap) return;
    connect.hidden = true; body.hidden = false; off.hidden = false;
    if (!hashes.length) { err.textContent = "No student name to look up."; err.hidden = false; return; }
    const { db } = link();
    unsubSnap = onSnapshot(
      query(collection(db, "activities"), where("nameHash", "in", hashes)),
      snap => {
        err.hidden = true; live.hidden = false;
        items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        render();
      },
      e => {
        console.error("Student activities listener failed", e);
        live.hidden = true;
        err.textContent = e && e.code === "permission-denied"
          ? "Not allowed to read activities. Put this admin account's UID in the student Firestore rules (ADMIN_UID) and publish them."
          : "Couldn't load activities. Check your connection.";
        err.hidden = false;
      }
    );
  }

  connect.addEventListener("submit", async e => {
    e.preventDefault();
    cmsg.hidden = true; cbtn.disabled = true; cbtn.textContent = "Connecting…";
    try { await connectStudentData(email.value.trim(), pass.value); pass.value = ""; }
    catch (ex) {
      console.error(ex);
      cmsg.textContent = "Couldn't sign in. Check the admin email and password of the student Firebase project.";
      cmsg.hidden = false;
    } finally { cbtn.disabled = false; cbtn.textContent = "Connect"; }
  });

  unsubAuth = onAuthStateChanged(link().auth, user => {
    if (destroyed) return;
    if (user) subscribe(); else { stopSnap(); showConnect(); }
  });

  return {
    destroy() {
      destroyed = true;
      if (unsubAuth) unsubAuth();
      stopSnap();
      box.remove();
    }
  };
}