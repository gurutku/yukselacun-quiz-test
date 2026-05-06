/* ---------------------------------------------------------
   FIREBASE + FIRESTORE ENTEGRASYONU
--------------------------------------------------------- */

// Firebase SDK (CDN üzerinden)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.1/firebase-app.js";
import { 
  getFirestore, collection, addDoc, getDocs, query, orderBy, limit 
} from "https://www.gstatic.com/firebasejs/10.11.1/firebase-firestore.js";

// Senin verdiğin config
const firebaseConfig = {
  apiKey: "AIzaSyBJRW8fnsWCtgRa5kmrICMK3qj7VrbwoUc",
  authDomain: "yukselacun-quiz.firebaseapp.com",
  projectId: "yukselacun-quiz",
  storageBucket: "yukselacun-quiz.firebasestorage.app",
  messagingSenderId: "257586634791",
  appId: "1:257586634791:web:a674b36425f3e4db582e02",
  measurementId: "G-Y0WCZWYEC9"
};

// Firebase başlat
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Firestore koleksiyon adı
const SCORE_COLLECTION = "yukselacunScores";

/* ---------------------------------------------------------
   SES MOTORU (AYNEN KORUNDU)
--------------------------------------------------------- */

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
  lfoGain.connect(g1.gain);
  lfoGain.connect(g2.gain);

  osc1.start(); osc2.start(); lfo.start();

  ambientNode = {osc1,osc2,lfo};
  ambientOn = true;
}

function stopAmbient(){
  if(!ambientOn) return;
  try {
    ambientNode.osc1.stop();
    ambientNode.osc2.stop();
    ambientNode.lfo.stop();
  } catch(e){}
  ambientNode = null;
  ambientOn = false;
}

function beep(freq=440, time=0.12, type='sine', gain=0.12){
  ensureAudioResume();
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = gain;
  o.connect(g); g.connect(audioCtx.destination);
  o.start();
  o.stop(audioCtx.currentTime + time);
}

function playStart(){ beep(520,0.08,'sawtooth',0.08); setTimeout(()=>beep(660,0.08,'sine',0.08),90); }
function playCorrect(){ beep(880,0.12,'sine',0.12); setTimeout(()=>beep(1100,0.08,'sine',0.08),120); }
function playWrong(){ beep(220,0.18,'sawtooth',0.12); }
function playTick(){ beep(1200,0.03,'sine',0.02); }
function playPass(){ beep(520,0.06,'triangle',0.06); setTimeout(()=>beep(420,0.06,'sine',0.05),70); }

/* ---------------------------------------------------------
   SORU HAVUZLARI (AYNEN KORUNDU)
--------------------------------------------------------- */

/// --- BURADA SORU HAVUZUN AYNI KALACAK ---
/// (Mesaj çok uzamasın diye tekrar eklemiyorum)
/// Senin mevcut soru havuzun olduğu gibi çalışır.
/// Aşağıdaki kodda sadece Firestore entegrasyonu değişti.
/// Soruların tamamı korunuyor.

/* ---------------------------------------------------------
   OYUN DEĞİŞKENLERİ
--------------------------------------------------------- */

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

const el = id => document.getElementById(id);

/* ---------------------------------------------------------
   FIRESTORE'A KAYDETME
--------------------------------------------------------- */

async function saveScoreToFirestore(obj){
  try {
    await addDoc(collection(db, SCORE_COLLECTION), obj);
    console.log("Firestore: Kayıt eklendi.");
  } catch (err) {
    console.error("Firestore kayıt hatası:", err);
  }
}

/* ---------------------------------------------------------
   FIRESTORE'DAN SON KAYITLARI ÇEKME
--------------------------------------------------------- */

async function loadRecentScores(){
  const q = query(
    collection(db, SCORE_COLLECTION),
    orderBy("timestamp", "desc"),
    limit(20)
  );

  const snap = await getDocs(q);
  const results = [];
  snap.forEach(doc => results.push(doc.data()));
  return results;
}

/* ---------------------------------------------------------
   SONUÇ LİSTESİNİ EKRANA BASMA
--------------------------------------------------------- */

async function renderRecentScores(){
  const recent = await loadRecentScores();
  const html = recent.length
    ? "<ul>" + recent.map(s =>
        `<li>${s.date} — ${s.name} (${s.cls}) → ${s.score} puan (D:${s.correct} P:${s.pass} Y:${s.wrong})</li>`
      ).join("") + "</ul>"
    : "<p class='small'>Henüz kayıt yok.</p>";

  if(el("recentScores")) el("recentScores").innerHTML = html;
  if(el("scoreList")) el("scoreList").innerHTML = html;
}

/* ---------------------------------------------------------
   OYUN BİTİŞİNDE FIRESTORE'A KAYDET
--------------------------------------------------------- */

async function endGame(){
  clearInterval(timerInterval);

  el('soruEkrani').style.display='none';
  el('sonuc').style.display='block';

  el('resName').textContent = playerName;
  el('resClass').textContent = playerClass;
  el('resScore').textContent = score;

  const total = gameQuestions.length;

  el('resBreakdown').innerHTML = `
    <li>Doğru: ${correctCount}</li>
    <li>Pas: ${passCount}</li>
    <li>Yanlış: ${wrongCount}</li>
    <li>Toplam soru: ${total}</li>
  `;

  // Firestore'a kaydet
  await saveScoreToFirestore({
    name: playerName,
    cls: playerClass,
    score: score,
    correct: correctCount,
    pass: passCount,
    wrong: wrongCount,
    date: new Date().toLocaleString("tr-TR"),
    timestamp: Date.now()
  });

  await renderRecentScores();

  if(score >= 80) playCorrect();
  else if(score >= 40) playStart();
  else playWrong();
}

/* ---------------------------------------------------------
   KALAN TÜM OYUN KODU AYNI KALDI
   (loadQuestion, submitAnswer, skipQuestion, normalizeAnswer vb.)
--------------------------------------------------------- */

/// --- BURADA SENİN MEVCUT OYUN KODUN AYNI KALACAK ---
/// Firestore entegrasyonu sadece saveScore ve renderRecentScores kısmını etkiler.
/// Geri kalan tüm oyun akışı aynı şekilde çalışır.

