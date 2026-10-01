// app-shell.js — login ke baad Home, navbar pages, profile card, events
// brushstroke.js ke BAAD load hota hai (wahi Firebase app use karta hai)
import { getApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const auth = getAuth(getApp());
const db = getFirestore(getApp());

const appShell = document.getElementById("appShell");
const navLinks = document.querySelectorAll("#appNav a");

// ---------- Pages (Home / Attendance / Events) ----------
function showApp(view, clicked) {
  ["Home", "Attendance", "Events"].forEach(function (v) {
    document.getElementById("view" + v).hidden = (v.toLowerCase() !== view);
  });
  const active = clicked || document.querySelector('#appNav a[data-view="' + view + '"]');
  navLinks.forEach(function (a) { a.classList.toggle("active", a === active); });
  window.scrollTo(0, 0);
}
navLinks.forEach(function (a) {
  a.addEventListener("click", function (e) {
    e.preventDefault();
    showApp(a.dataset.view || "home", a);
  });
});

// ---------- Profile card ----------
function renderProfileCard(u) {
  const name = ((u && u.name) || "").trim() || "—";
  const parts = name.split(/\s+/).filter(Boolean);
  document.getElementById("pcName").textContent = name;
  document.getElementById("pcRoll").textContent = (u && u.roll) || "—";
  document.getElementById("pcCourse").textContent = (u && u.course) || "—";
  document.getElementById("pcAvatar").textContent = parts.length > 1
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : (parts[0] || "?").slice(0, 2).toUpperCase();
  document.getElementById("dashHi").textContent = "Welcome, " + (parts[0] || "");
}

async function loadProfile() {
  const user = auth.currentUser;
  if (!user) return;
  // purane accounts (jinki details save nahi hui) ke liye fallback
  let p = { name: (user.email || "").split("@")[0], roll: "", course: "" };
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists()) p = snap.data();
  } catch (e) { console.error("Profile load failed:", e); }
  renderProfileCard(p);
}

// ---------- Login ke baad: brushstroke.js ye event bhejta hai ----------
window.addEventListener("bs:enter", function () {
  document.getElementById("signupSection").classList.add("hidden");
  document.getElementById("loginSection").classList.add("hidden");
  document.documentElement.classList.add("app-mode");
  document.body.classList.add("app-mode");
  appShell.classList.remove("hidden");
  loadProfile();
  showApp("home");
});

// ---------- Dark canvas toggle ----------
(function () {
  const root = document.documentElement, btn = document.getElementById("themeBtn");
  function icon() { btn.textContent = root.dataset.theme === "dark" ? "\u2600\uFE0F" : "\uD83C\uDF19"; }
  btn.addEventListener("click", function () {
    root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
    try { localStorage.setItem("bs-theme", root.dataset.theme); } catch (e) {}
    icon();
  });
  icon();
})();

// ---------- Quotes + scroll reveal ----------
(function(){

  var Q=[["Every child is an artist. The problem is how to remain an artist once we grow up.","Pablo Picasso"],
  ["Art washes away from the soul the dust of everyday life.","Pablo Picasso"],
  ["I dream my painting and then I paint my dream.","Vincent van Gogh"],
  ["Creativity takes courage.","Henri Matisse"],
  ["Colour is a power which directly influences the soul.","Wassily Kandinsky"],
  ["Painting is silent poetry, and poetry is painting that speaks.","Simonides"]];
  var i=0,box=document.getElementById('qBox'),t=document.getElementById('qText'),b=document.getElementById('qBy'),d=document.getElementById('qDots');
  Q.forEach(function(){d.appendChild(document.createElement('i'))});
  function show(){t.textContent=Q[i][0];b.textContent="\u2014 "+Q[i][1];
    [].forEach.call(d.children,function(x,k){x.className=k===i?'on':''});}
  function next(){box.classList.add('fade');setTimeout(function(){i=(i+1)%Q.length;show();box.classList.remove('fade')},600)}
  show();setInterval(next,5500);
  var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('show');io.unobserve(e.target)}})},{threshold:.15});
  document.querySelectorAll('.reveal').forEach(function(el){io.observe(el)});
})();

// ---------- Events + calendar ----------
/* ===== EVENTS + CALENDAR (abhi localStorage; shared admin data ke liye baad me Firebase) ===== */
(function(){
  var KEY='bs-events',list=[],$=function(id){return document.getElementById(id)};
  try{list=JSON.parse(localStorage.getItem(KEY)||'[]')||[]}catch(e){list=[]}
  function save(){try{localStorage.setItem(KEY,JSON.stringify(list));return true}catch(e){return false}}
  function pad(n){return (n<10?'0':'')+n}
  function ymd(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
  function parse(s){var p=s.split('-');return new Date(+p[0],+p[1]-1,+p[2])}
  function fmt(s,o){return parse(s).toLocaleDateString('en-IN',o||{weekday:'short',day:'numeric',month:'short',year:'numeric'})}
  list.forEach(function(e){if(!e.date)e.date=ymd(new Date(e.at))});

  /* ---- home: event blocks ---- */
  var box=$('evList'),lb=$('lightbox');
  function make(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e}
  function renderHome(){
    box.replaceChildren();
    list.slice().sort(function(a,b){return a.date<b.date?1:a.date>b.date?-1:b.at-a.at}).forEach(function(ev){
      var card=make('article','ev-card'),head=make('div','ev-head'),t=make('div');
      t.appendChild(make('h3','ev-name',ev.name));
      t.appendChild(make('span','ev-date',fmt(ev.date)));
      var del=make('button','ev-del');del.type='button';del.setAttribute('aria-label','Delete event');
      del.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>';
      del.addEventListener('click',function(){
        if(!confirm('Delete "'+ev.name+'"?'))return;
        list=list.filter(function(x){return x.id!==ev.id});save();renderHome();renderCal();
      });
      head.appendChild(t);head.appendChild(del);card.appendChild(head);
      if(ev.desc)card.appendChild(make('div','ev-desc',ev.desc));
      if(ev.photos&&ev.photos.length){
        var g=make('div','ev-photos'+(ev.photos.length===1?' one':''));
        ev.photos.forEach(function(src){
          var im=document.createElement('img');im.src=src;im.alt=ev.name+' photo';im.loading='lazy';
          im.addEventListener('click',function(){lb.querySelector('img').src=src;lb.classList.add('on')});
          g.appendChild(im);
        });
        card.appendChild(g);
      }
      box.appendChild(card);
    });
  }

  /* ---- calendar ---- */
  var now=new Date(),vy=now.getFullYear(),vm=now.getMonth(),sel=ymd(now);
  function renderCal(){
    $('calTitle').textContent=new Date(vy,vm,1).toLocaleDateString('en-IN',{month:'long',year:'numeric'});
    $('evPicked').textContent=fmt(sel);
    var g=$('calGrid'),first=new Date(vy,vm,1).getDay(),days=new Date(vy,vm+1,0).getDate(),has={};
    list.forEach(function(e){has[e.date]=1});
    g.replaceChildren();
    for(var i=0;i<first;i++)g.appendChild(document.createElement('span'));
    for(var d=1;d<=days;d++){
      var key=vy+'-'+pad(vm+1)+'-'+pad(d),b=document.createElement('button');
      b.type='button';b.textContent=d;
      if(key===ymd(now))b.classList.add('today');
      if(key===sel)b.classList.add('sel');
      if(has[key])b.classList.add('has');
      b.setAttribute('aria-label',fmt(key));
      (function(k){b.addEventListener('click',function(){sel=k;renderCal()})})(key);
      g.appendChild(b);
    }
  }
  $('calPrev').addEventListener('click',function(){vm--;if(vm<0){vm=11;vy--}renderCal()});
  $('calNext').addEventListener('click',function(){vm++;if(vm>11){vm=0;vy++}renderCal()});

  /* ---- form ---- */
  var form=$('evForm'),hint='Up to 6 photos. They are resized automatically.';
  function compress(file){return new Promise(function(res){
    var url=URL.createObjectURL(file),im=new Image();
    im.onload=function(){var m=900,k=Math.min(1,m/Math.max(im.width,im.height)),c=document.createElement('canvas');
      c.width=Math.round(im.width*k);c.height=Math.round(im.height*k);
      c.getContext('2d').drawImage(im,0,0,c.width,c.height);URL.revokeObjectURL(url);res(c.toDataURL('image/jpeg',.75))};
    im.onerror=function(){URL.revokeObjectURL(url);res(null)};im.src=url;
  })}
  $('evPhotos').addEventListener('change',function(){
    var n=Math.min(this.files.length,6);
    $('evHint').textContent=n?(n+' photo'+(n>1?'s':'')+' selected'+(this.files.length>6?' (only first 6 will be used)':'')):hint;
  });
  form.addEventListener('submit',async function(e){
    e.preventDefault();
    var name=$('evName').value.trim();if(!name)return;
    var files=[].slice.call($('evPhotos').files,0,6),btn=form.querySelector('[type=submit]');
    btn.disabled=true;btn.textContent='Saving…';$('evDone').hidden=true;
    var photos=(await Promise.all(files.map(compress))).filter(Boolean);
    list.push({id:Date.now(),name:name,desc:$('evDesc').value.trim(),photos:photos,date:sel,at:Date.now()});
    if(!save()){list.pop();alert('Storage is full. Try fewer or smaller photos.');}
    else{form.reset();$('evHint').textContent=hint;renderHome();renderCal();$('evDone').hidden=false;}
    btn.disabled=false;btn.textContent='Save Event';
  });

  lb.addEventListener('click',function(){lb.classList.remove('on')});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')lb.classList.remove('on')});
  renderHome();renderCal();
})();