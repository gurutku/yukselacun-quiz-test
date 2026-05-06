// script.js — Tam, modül (index.html: type="module")
// FIREBASE + FIRESTORE ENTEGRASYONU
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.1/firebase-app.js";
import {
  getFirestore, collection, addDoc, getDocs, query, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.11.1/firebase-firestore.js";

/* ---------- CONFIG (senin verdiğin) ---------- */
const firebaseConfig = {
  apiKey: "AIzaSyBJRW8fnsWCtgRa5kmrICMK3qj7VrbwoUc",
  authDomain: "yukselacun-quiz.firebaseapp.com",
  projectId: "yukselacun-quiz",
  storageBucket: "yukselacun-quiz.firebasestorage.app",
  messagingSenderId: "257586634791",
  appId: "1:257586634791:web:a674b36425f3e4db582e02",
  measurementId: "G-Y0WCZWYEC9"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const SCORE_COLLECTION = "yukselacunScores";

/* ---------- Firestore yardımcıları ---------- */
async function saveScoreToFirestore(obj){
  try {
    await addDoc(collection(db, SCORE_COLLECTION), obj);
    console.log("Firestore: Kayıt eklendi.");
  } catch (err) {
    console.error("Firestore kayıt hatası:", err);
    // Hata kullanıcıya gösterilebilir
    const r = document.getElementById('recentScores');
    if(r) r.innerHTML = `<p class="small">Skor kaydedilemedi: ${err.code || err.message}</p>`;
  }
}

async function loadRecentScores(){
  try {
    const q = query(collection(db, SCORE_COLLECTION), orderBy("timestamp","desc"), limit(20));
    const snap = await getDocs(q);
    const results = [];
    snap.forEach(d => results.push(d.data()));
    return results;
  } catch(e){
    console.error("Firestore okuma hatası:", e);
    return [];
  }
}

async function renderRecentScores(){
  const recent = await loadRecentScores();
  const html = recent.length
    ? "<ul>" + recent.map(s => `<li>${s.date} — ${escapeHtml(s.name)} (${escapeHtml(s.cls)}) → ${s.score} puan (D:${s.correct} P:${s.pass} Y:${s.wrong})</li>`).join("") + "</ul>"
    : "<p class='small'>Henüz kayıt yok.</p>";
  const r = document.getElementById("recentScores");
  const s = document.getElementById("scoreList");
  if(r) r.innerHTML = html;
  if(s) s.innerHTML = html;
}

/* ---------- WebAudio (ambient + efektler) ---------- */
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let ambientNode = null;
let ambientGain = null;
let ambientOn = false;

function ensureAudioResume() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function startAmbient(){
  if (ambientOn) return;
  ensureAudioResume();
  ambientGain = audioCtx.createGain();
  ambientGain.gain.value = 0.06;
  ambientGain.connect(audioCtx.destination);

  const osc1 = audioCtx.createOscillator(); osc1.type='sine'; osc1.frequency.value = 110;
  const osc2 = audioCtx.createOscillator(); osc2.type='sine'; osc2.frequency.value = 220;
  const g1 = audioCtx.createGain(); g1.gain.value = 0.02;
  const g2 = audioCtx.createGain(); g2.gain.value = 0.01;

  const lfo = audioCtx.createOscillator(); lfo.type='sine'; lfo.frequency.value = 0.07;
  const lfoGain = audioCtx.createGain(); lfoGain.gain.value = 0.015;

  osc1.connect(g1); osc2.connect(g2);
  g1.connect(ambientGain); g2.connect(ambientGain);
  lfo.connect(lfoGain);
  lfoGain.connect(g1.gain); lfoGain.connect(g2.gain);

  osc1.start(); osc2.start(); lfo.start();
  ambientNode = {osc1,osc2,lfo};
  ambientOn = true;
}

function stopAmbient(){
  if(!ambientOn) return;
  try { ambientNode.osc1.stop(); ambientNode.osc2.stop(); ambientNode.lfo.stop(); } catch(e){}
  ambientNode = null; ambientOn = false;
}

function beep(freq=440, time=0.12, type='sine', gain=0.12){
  ensureAudioResume();
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type; o.frequency.value = freq; g.gain.value = gain;
  o.connect(g); g.connect(audioCtx.destination);
  o.start(); o.stop(audioCtx.currentTime + time);
}
function playStart(){ beep(520,0.08,'sawtooth',0.08); setTimeout(()=>beep(660,0.08,'sine',0.08),90); }
function playCorrect(){ beep(880,0.12,'sine',0.12); setTimeout(()=>beep(1100,0.08,'sine',0.08),120); }
function playWrong(){ beep(220,0.18,'sawtooth',0.12); }
function playTick(){ beep(1200,0.03,'sine',0.02); }
function playPass(){ beep(520,0.06,'triangle',0.06); setTimeout(()=>beep(420,0.06,'sine',0.05),70); }

/* ---------- Soru havuzları (senin içerik) ---------- */
/* (Kısaltılmış gösterim; senin gönderdiğin tam havuzu buraya bırak) */
const pool = {
  fizik: [ /* ... */ ],
  matematik: [ /* ... */ ],
  kimya: [ /* ... */ ],
  biyoloji: [ /* ... */ ],
  tarih: [ /* ... */ ],
  cografya: [ /* ... */ ],
  edebiyat: [ /* ... */ ],
  genelkultur: [ /* ... */ ]
};
/* ---------- OYUN AYARLARI ---------- */
const ORDER = [
  {branch:'fizik', count:3},
  {branch:'matematik', count:4},
  {branch:'kimya', count:3},
  {branch:'biyoloji', count:3},
  {branch:'tarih', count:3},
  {branch:'cografya', count:3},
  {branch:'edebiyat', count:3},
  {branch:'genelkultur', count:3}
];

let gameQuestions = [];
let current = 0;
let score = 0;
let timer = 30;
let timerInterval = null;
let playerName = "", playerClass = "";
let passesLeft = 2;
let correctCount = 0;
let passCount = 0;
let wrongCount = 0;

/* DOM yardımcı */
const el = id => document.getElementById(id);

/* Branch görseller ve emoji map (senin yollarla eşleştir) */
const branchImages = {
  "Fizik":"images/fizik.jpg",
  "Matematik":"images/matematik.jpg",
  "Kimya":"images/kimya.jpg",
  "Biyoloji":"images/biyoloji.jpg",
  "Tarih":"images/tarih.jpg",
  "Cografya":"images/cografya.jpg",
  "Edebiyat":"images/edebiyat.jpg",
  "Genelkultur":"images/genelkultur.jpg"
};
const branchEmoji = {
  "Fizik":"⚡","Matematik":"➗","Kimya":"🧪","Biyoloji":"🧬",
  "Tarih":"🏛️","Cografya":"🗺️","Edebiyat":"📚","Genelkultur":"🌐"
};

/* ---------- Başlangıç: event listener'lar ---------- */
document.addEventListener('DOMContentLoaded', ()=>{
  // Güvenlik: element yoksa hata fırlatmasın
  try {
    if(el('startBtn')) el('startBtn').addEventListener('click', ()=>{ ensureAudioResume(); startGame(); });
    if(el('musicToggle')) el('musicToggle').addEventListener('click', ()=>{
      ensureAudioResume();
      if(!ambientOn){ startAmbient(); if(el('musicToggle')) el('musicToggle').textContent='Müziği Kapat'; }
      else { stopAmbient(); if(el('musicToggle')) el('musicToggle').textContent='Müziği Aç'; }
    });
    if(el('howBtn')) el('howBtn').addEventListener('click', ()=> { if(el('modal')) { el('modal').classList.add('active'); el('modal').setAttribute('aria-hidden','false'); } });
    if(el('closeModal')) el('closeModal').addEventListener('click', ()=> { if(el('modal')) { el('modal').classList.remove('active'); el('modal').setAttribute('aria-hidden','true'); } });
    if(el('submitBtn')) el('submitBtn').addEventListener('click', submitAnswer);
    if(el('skipBtn')) el('skipBtn').addEventListener('click', ()=>{ playPass(); skipQuestion(); });
    if(el('retryBtn')) el('retryBtn').addEventListener('click', ()=> location.reload());
    if(el('homeBtn')) el('homeBtn').addEventListener('click', ()=> location.reload());

    document.addEventListener('keydown', (e)=>{
      if(el('soruEkrani') && el('soruEkrani').style.display === 'block' && e.key === 'Enter') submitAnswer();
    });
  } catch(e){
    console.error("Event listener init hatası:", e);
  }

  // İlk render: Firestore'dan son kayıtları getir
  renderRecentScores().catch(()=>{});
});

/* ---------- Soru seçimi ---------- */
function shuffle(array){
  for(let i=array.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [array[i],array[j]] = [array[j],array[i]];
  }
  return array;
}
function capitalize(s){ return s.charAt(0).toUpperCase() + s.slice(1); }

function pickRandomQuestions(){
  const selected = [];
  const poolCopy = {};
  for(const b in pool) poolCopy[b] = pool[b].slice();
  for(const b in poolCopy) shuffle(poolCopy[b]);

  ORDER.forEach(item=>{
    const b = item.branch;
    for(let i=0;i<item.count;i++){
      const s = poolCopy[b].pop();
      selected.push({branch:capitalize(b), q:s.q, a: s.a});
    }
  });
  shuffle(selected);
  return selected;
}

/* ---------- Oyun akışı ---------- */
function startGame(){
  const name = el('inputName') ? el('inputName').value.trim() : '';
  const cls = el('inputClass') ? el('inputClass').value.trim() : '';
  if(!name || !cls){ alert('Lütfen ad soyad ve sınıf gir.'); return; }

  playerName = name; playerClass = cls;
  playStart();

  gameQuestions = pickRandomQuestions();
  current = 0; score = 0; passesLeft = 2;
  correctCount = 0; passCount = 0; wrongCount = 0;
  if(el('passesLeft')) el('passesLeft').textContent = passesLeft;
  if(el('currentScore')) el('currentScore').textContent = score;

  if(el('giris')) { el('giris').classList.remove('active'); el('giris').style.display='none'; }
  if(el('soruEkrani')) { el('soruEkrani').classList.add('active'); el('soruEkrani').style.display='block'; }
  if(el('sonuc')) el('sonuc').style.display='none';

  loadQuestion();
}

function loadQuestion(){
  if(current >= gameQuestions.length){ endGame(); return; }

  const s = gameQuestions[current];
  if(el('qIndex')) el('qIndex').textContent = `${current+1} / ${gameQuestions.length}`;
  if(el('branchTag')) el('branchTag').textContent = s.branch;

  const emoji = branchEmoji[s.branch] || '';
  if(el('questionText')) el('questionText').textContent = `${emoji}  ${s.q}`;

  if(el('answerInput')) el('answerInput').value = '';
  if(el('feedback')) { el('feedback').textContent = ''; el('feedback').className = 'feedback'; }

  setBranchVisual(s.branch);
  setProgress(1);

  timer = 30;
  if(el('timeText')) el('timeText').textContent = timer;

  clearInterval(timerInterval);
  timerInterval = setInterval(()=>{
    timer--;
    if(el('timeText')) el('timeText').textContent = timer;
    setProgress(timer/30);
    if(timer <= 5 && timer > 0) playTick();
    if(timer <= 0){
      clearInterval(timerInterval);
      handleWrongTimeout();
    }
  },1000);
}

function setProgress(ratio){
  const circle = document.getElementById('progressCircle');
  if(!circle) return;
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - ratio);
  circle.style.strokeDasharray = `${circumference}`;
  circle.style.strokeDashoffset = `${offset}`;
}

/* ---------- Cevap kontrol ---------- */
function normalizeAnswer(s){
  if(!s) return '';
  let t = s.toString().toLowerCase().trim();
  t = t.replace(/\s+/g,' ');
  t = t.replace(/ı/g,'i').replace(/ş/g,'s').replace(/ç/g,'c').replace(/ö/g,'o').replace(/ü/g,'u').replace(/ğ/g,'g');
  t = t.replace(/,/g,'.');
  t = t.replace(/\s*\/\s*/g,'/');
  t = t.replace(/\s*-\s*/g,'-');
  if(/^[-+]?\d+(\.\d+)?$/.test(t)) return String(Number(t));
  if(/^\d+\/\d+$/.test(t)){
    const parts = t.split('/');
    const val = Number(parts[0]) / Number(parts[1]);
    return String(val);
  }
  t = t.replace(/\s+/g,' ');
  return t;
}
function numericEquals(a,b){
  if(a === '' || b === '') return false;
  const na = Number(a);
  const nb = Number(b);
  if(!isNaN(na) && !isNaN(nb)){
    const diff = Math.abs(na - nb);
    return diff < 0.05;
  }
  return false;
}
function affirmativeEquals(userNorm, correctNorm){
  if(!userNorm || !correctNorm) return false;
  if(userNorm === correctNorm) return true;
  if(userNorm === 'evet'){
    const affirmSub = ['evet','artir','artirir','artiriyor','artir']; 
    for(const sub of affirmSub) if(correctNorm.includes(sub)) return true;
    if(!/^[0-9e\.\-\/]+$/.test(correctNorm) && correctNorm.length <= 12 && !correctNorm.includes('hayir')) return true;
  }
  if(userNorm === 'hayir'){
    const negSub = ['hayir','degil','yok','olmuyor','olmadi'];
    for(const sub of negSub) if(correctNorm.includes(sub)) return true;
    if(correctNorm === 'hayir') return true;
  }
  if(correctNorm === 'evet' && (userNorm === 'evet' || userNorm === 'evet.')) return true;
  if(correctNorm === 'hayir' && (userNorm === 'hayir' || userNorm === 'hayir.')) return true;
  return false;
}

function submitAnswer(){
  if(current >= gameQuestions.length) return;
  clearInterval(timerInterval);

  const userRaw = el('answerInput') ? el('answerInput').value.trim() : '';
  const user = normalizeAnswer(userRaw);
  const correctRaw = gameQuestions[current].a;
  const correct = normalizeAnswer(correctRaw);

  const numericMatch = numericEquals(user, correct);
  const affirmativeMatch = affirmativeEquals(user, correct);

  if(user === correct || numericMatch || affirmativeMatch){
    score += 5; correctCount++; playCorrect();
    showFeedback(true, 'Doğru! +5 puan'); updateScoreDisplay();
    current++; setTimeout(loadQuestion, 700);
  } else {
    score -= 2; wrongCount++; playWrong(); updateScoreDisplay();
    showCorrectThenNext(correctRaw);
  }
}

/* ---------- Pas (skip) fonksiyonu ---------- */
function skipQuestion(){
  if(current >= gameQuestions.length) return;
  if(passesLeft <= 0){ showFeedback(false, 'Pas hakkın kalmadı'); return; }
  passesLeft--; passCount++; if(el('passesLeft')) el('passesLeft').textContent = passesLeft;
  playPass();
  clearInterval(timerInterval);
  current++;
  setTimeout(loadQuestion, 250);
}

/* ---------- Zaman dolunca yanlış işlemi ---------- */
function handleWrongTimeout(){
  // zaman doldu -> yanlış say, doğruyu göster, sonra devam
  wrongCount++; score -= 2; updateScoreDisplay();
  const correctRaw = gameQuestions[current] ? gameQuestions[current].a : '';
  showCorrectThenNext(correctRaw);
}

/* ---------- Görsel ve feedback ---------- */
function showCorrectThenNext(correctRaw){
  const f = el('feedback');
  if(f) {
    f.innerHTML = `Yanlış! Doğru: <span class="correctReveal">${escapeHtml(correctRaw)}</span>`;
    f.className = 'feedback bad';
  }
  setTimeout(()=>{
    current++;
    loadQuestion();
  },2000);
}
function showFeedback(ok, text){
  const f = el('feedback');
  if(f){ f.textContent = text; f.className = 'feedback ' + (ok ? 'good' : 'bad'); }
}
function updateScoreDisplay(){ if(el('currentScore')) el('currentScore').textContent = score; }

/* ---------- Oyun bitişi: Firestore'a kaydet ---------- */
async function endGame(){
  clearInterval(timerInterval);
  if(el('soruEkrani')) { el('soruEkrani').classList.remove('active'); el('soruEkrani').style.display='none'; }
  if(el('sonuc')) { el('sonuc').classList.add('active'); el('sonuc').style.display='block'; }

  if(el('resName')) el('resName').textContent = playerName;
  if(el('resClass')) el('resClass').textContent = playerClass;
  if(el('resScore')) el('resScore').textContent = score;

  const breakdown = el('resBreakdown');
  if(breakdown){
    breakdown.innerHTML = '';
    const total = gameQuestions.length;
    const li1 = document.createElement('li'); li1.textContent = `Doğru: ${correctCount}`;
    const li2 = document.createElement('li'); li2.textContent = `Pas: ${passCount}`;
    const li3 = document.createElement('li'); li3.textContent = `Yanlış: ${wrongCount}`;
    const li4 = document.createElement('li'); li4.textContent = `Toplam soru: ${total}`;
    breakdown.appendChild(li1); breakdown.appendChild(li2); breakdown.appendChild(li3); breakdown.appendChild(li4);
  }

  // Firestore'a kaydet
  await saveScoreToFirestore({
    name: playerName || "İsimsiz",
    cls: playerClass || "",
    score: score,
    correct: correctCount,
    pass: passCount,
    wrong: wrongCount,
    date: new Date().toLocaleString('tr-TR'),
    timestamp: Date.now()
  });

  await renderRecentScores();

  if(score >= 80) playCorrect();
  else if(score >= 40) playStart();
  else playWrong();
}

/* ---------- Branch görsel ayarlama ---------- */
function setBranchVisual(branch){
  const imgEl = el('branchImage');
  const container = el('branchVisual');
  if(!container || !imgEl) return;
  const key = branch.toLowerCase();
  const mapKey = {
    'fizik':'Fizik','matematik':'Matematik','kimya':'Kimya','biyoloji':'Biyoloji',
    'tarih':'Tarih','cografya':'Cografya','edebiyat':'Edebiyat','genelkultur':'Genelkultur'
  }[key] || null;
  const path = mapKey ? branchImages[mapKey] : null;
  if(!path){ container.style.display = 'none'; return; }
  container.style.display = 'block';
  imgEl.classList.remove('loaded');
  imgEl.alt = branch + " görseli";
  const pre = new Image();
  pre.src = path;
  pre.onload = () => { imgEl.src = path; setTimeout(()=> imgEl.classList.add('loaded'),80); };
  pre.onerror = () => { container.style.display = 'none'; };
}

/* ---------- Yardımcılar ---------- */
function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

/* ---------- Debug erişimleri ---------- */
window.startGame = startGame;
window.submitAnswer = submitAnswer;
window.skipQuestion = skipQuestion;
