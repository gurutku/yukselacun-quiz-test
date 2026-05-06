/* ---------------------------------------------------------
   FIREBASE + FIRESTORE ENTEGRASYONU
   (Dosyanın en başına ekleyin; index.html'de type="module" olmalı)
--------------------------------------------------------- */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.1/firebase-app.js";
import {
  getFirestore, collection, addDoc, getDocs, query, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.11.1/firebase-firestore.js";

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

/* Firestore'a kayıt ekleme */
async function saveScoreToFirestore(obj){
  try {
    await addDoc(collection(db, SCORE_COLLECTION), obj);
    console.log("Firestore: Kayıt eklendi.");
  } catch (err) {
    console.error("Firestore kayıt hatası:", err);
  }
}

/* Firestore'dan son 20 kaydı çekme */
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

/* Ekrana basma (varsa #recentScores veya #scoreList elementlerine) */
async function renderRecentScores(){
  const recent = await loadRecentScores();
  const html = recent.length
    ? "<ul>" + recent.map(s => `<li>${s.date} — ${s.name} (${s.cls}) → ${s.score} puan (D:${s.correct} P:${s.pass} Y:${s.wrong})</li>`).join("") + "</ul>"
    : "<p class='small'>Henüz kayıt yok.</p>";
  const r = document.getElementById("recentScores");
  const s = document.getElementById("scoreList");
  if(r) r.innerHTML = html;
  if(s) s.innerHTML = html;
}

/* ---------------------------------------------------------
   Orijinal script.js içeriği (oyun mantığı, ses, sorular vb.)
   Aşağıya orijinal dosyanın tüm içeriği eklendi; sadece
   skor kaydetme/okuma localStorage yerine Firestore'a yönlendirildi.
--------------------------------------------------------- */

/* -------------------------
   WebAudio: ambient + efektler + pass sesi
   ------------------------- */
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let ambientNode = null;
let ambientGain = null;
let ambientOn = false;

function ensureAudioResume() {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
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

/* -------------------------
   SORU HAVUZLARI
   - Her branş 20 soru, genel kültür 30 soru
   - Sorular ipuçsuz; evet/hayır soruları 'evet'/'hayir' cevabı içerir
   - (Havuzlar örnek olarak burada; senin tam havuzun korunur)
   ------------------------- */
const pool = {
  fizik: [
    {q:"⚡ 5 m/s hızla 40 s hareket eden cismin aldığı yol kaç metredir?", a:"200"},
    {q:"🧲 2 kg kütleye 10 N net kuvvet uygulanıyor. İvme kaç m/s^2?", a:"5"},
    {q:"🌍 Serbest düşmede ivme yaklaşık kaç m/s^2'dir?", a:"9.8"},
    {q:"🏃 m=3 kg, v=4 m/s ise kinetik enerji kaç J?", a:"24"},
    {q:"🔩 k=200 N/m, x=0.1 m ise yay enerjisi kaç J?", a:"1"},
    {q:"🔋 V=12 V, I=2 A ise güç kaç W?", a:"24"},
    {q:"⚖️ F=50 N, A=0.5 m^2 ise basınç kaç N/m^2?", a:"100"},
    {q:"🧮 m=2 kg, v=10 m/s ise momentum kaç kg·m/s?", a:"20"},
    {q:"💡 Işık hızı yaklaşık kaç m/s'tir?", a:"3e8"},
    {q:"📐 m=2 kg, g=9.8, h=5 m ise potansiyel enerji kaç J?", a:"98"},
    {q:"⏱️ T=0.2 s ise frekans f kaç Hz?", a:"5"},
    {q:"🌊 f=50 Hz, λ=2 m ise dalga hızı kaç m/s?", a:"100"},
    {q:"🔌 I=0.5 A, R=8 Ω ise V kaç V?", a:"4"},
    {q:"💪 F=10 N, d=3 m ise iş kaç J?", a:"30"},
    {q:"🔁 ω = 2π/T, T=2 s ise ω yaklaşık kaçtır?", a:"3.14"},
    {q:"🎯 Basit harmonik hareket periyodu formülü nedir?", a:"2π√(m/k)"},
    {q:"🔤 Enerji birimi hangi harfle gösterilir?", a:"j"},
    {q:"⚡ Elektriksel iş W = V·Q. Q birimi nedir?", a:"c"},
    {q:"🧭 İvme sıfırsa net kuvvet kaçtır?", a:"0"},
    {q:"⚙️ KE=50 J, m=2 kg ise v yaklaşık kaçtır?", a:"7.071"}
  ],
  matematik: [
    {q:"➗ (2x-3)+(5x+7)=4x+10 ise x kaçtır?", a:"2"},
    {q:"🧩 3/x - 1/2 = 1/6 denklemini çözünüz.", a:"2"},
    {q:"📊 Bir sayının 5/8'i 25 ise sayı kaçtır?", a:"40"},
    {q:"🔢 |3x-4|=5 denkleminin çözümlerini 'a,b' şeklinde yazınız.", a:"3,-1/3"},
    {q:"✖️ (x-1)(x-5)=0 denkleminin kökleri çarpımı kaçtır?", a:"5"},
    {q:"2^5 kaçtır?", a:"32"},
    {q:"√144 kaçtır?", a:"12"},
    {q:"log10(1000) kaçtır?", a:"3"},
    {q:"Dik üçgende kenarlar 3,4,5 ise hipotenüs kaçtır?", a:"5"},
    {q:"2/3 + 1/6 işleminin sonucu kesir olarak nedir?", a:"5/6"},
    {q:"5! kaçtır?", a:"120"},
    {q:"P(6,2) = 6·5 kaçtır?", a:"30"},
    {q:"Alan = a·b, a=5,b=8 ise alan kaçtır?", a:"40"},
    {q:"3/4 = x/12 ise x kaçtır?", a:"9"},
    {q:"Polinom x^3+2x derecesi kaçtır?", a:"3"},
    {q:"Üçgen alanı formülü nedir?", a:"1/2 a h"},
    {q:"x^2-16 çarpanlara ayrımı nedir?", a:"(x-4)(x+4)"},
    {q:"√81 kaçtır?", a:"9"},
    {q:"Basit faiz: r yüzde 5 ise r kaçtır?", a:"5"},
    {q:"Dikdörtgen a=3,b=4 çevresi kaçtır?", a:"14"}
  ],
kimya: [
    {q:"🧪 Proton 17, nötron 18 ise kütle numarası kaçtır?", a:"35"},
    {q:"🧾 NaCl'de Cl'nin yükseltgenme basamağı kaçtır?", a:"-1"},
    {q:"💧 Su molekülünün formülü nedir?", a:"h2o"},
    {q:"🧪 pH 2 ile pH 5'ten hangisi daha asidiktir?", a:"2"},
    {q:"⚖️ 1 mol su yaklaşık kaç gramdır?", a:"18"},
    {q:"Oksijen sembolü nedir?", a:"o"},
    {q:"Katalizör reaksiyon hızını artırır mı?", a:"artirir"},
    {q:"pH + pOH yaklaşık kaçtır?", a:"14"},
    {q:"Endotermik reaksiyon ısı alır mı verir mi?", a:"alir"},
    {q:"Avogadro sayısı yaklaşık kaçtır?", a:"6.02e23"},
    {q:"İyonik bağ metal ile ametal arasında mı oluşur?", a:"evet"},
    {q:"Katalizör reaksiyon hızını artırır mı?", a:"artirir"},
    {q:"Çözünürlük nedir?", a:"cozunurluk"},
    {q:"Mol kavramı neyi ifade eder?", a:"madde miktari"},
    {q:"Nötrleşme ürünü genelde tuz ve su mudur?", a:"evet"},
    {q:"PV = nRT denkleminde P birimi genelde nedir?", a:"pa"},
    {q:"pH = -log[H+] formülünde log taban 10 mudur?", a:"evet"},
    {q:"Çözelti doymuşsa daha fazla madde çözünür mü?", a:"hayir"},
    {q:"Kovalent bağ elektron paylaşımı mıdır?", a:"evet"},
    {q:"Titrasyonda eşdeğerlik noktası neyi gösterir?", a:"esdegerlik"}
  ],
  biyoloji: [
    {q:"🧬 Protein sentezi hangi organelde gerçekleşir?", a:"ribozom"},
    {q:"🌿 Fotosentez hangi organelde gerçekleşir?", a:"kloroplast"},
    {q:"🧬 DNA'nın yapı birimi nedir?", a:"nukleotid"},
    {q:"❤️ İnsanlarda kanı pompalayan organ hangisidir?", a:"kalp"},
    {q:"🫁 Solunum sisteminin ana organı hangisidir?", a:"akciger"},
    {q:"⚡ Mitokondri hücrede ne üretir?", a:"enerji"},
    {q:"🦠 Bakteriler prokaryot mudur?", a:"prokaryot"},
    {q:"🌱 Bitkilerde su taşınması hangi doku ile olur?", a:"ksilem"},
    {q:"🔬 Hücre bölünmesi büyüme için hangi süreçtir?", a:"mitoz"},
    {q:"🛡️ Antikorlar hangi sistemin parçasıdır?", a:"bagisiklik"},
    {q:"ATP hücresel enerji taşıyıcısı mıdır?", a:"evet"},
    {q:"Fotosentez için gerekli gaz hangisidir?", a:"karbondioksit"},
    {q:"Alel neyi ifade eder?", a:"gen varyanti"},
    {q:"Hücre zarının temel yapısı nedir?", a:"lipid cift tabaka"},
    {q:"Ekosistem canlı ve cansız öğelerden mi oluşur?", a:"evet"},
    {q:"Bitkilerde depo polisakkarit hangisidir?", a:"nisasta"},
    {q:"İnsanlarda en büyük organ hangisidir?", a:"deri"},
    {q:"Fotosentez sonucu oluşan şeker nedir?", a:"glikoz"},
    {q:"mRNA protein sentezinde görevli midir?", a:"mrna"},
    {q:"Mayoz sonucunda kaç hücre oluşur?", a:"4"}
  ],
tarih: [
    {q:"🏛️ Türkiye Cumhuriyeti hangi yıl ilan edildi?", a:"1923"},
    {q:"📜 Lozan Antlaşması hangi yılda imzalandı?", a:"1923"},
    {q:"🕰️ Atatürk'ün doğum yılı kaçtır?", a:"1881"},
    {q:"🏰 İstanbul'un fethi hangi yılda gerçekleşti?", a:"1453"},
    {q:"🇺🇸 Amerikan Bağımsızlık Bildirgesi hangi yılda ilan edildi?", a:"1776"},
    {q:"🔎 Fransız Devrimi hangi yüzyılda oldu?", a:"18"},
    {q:"🏭 Sanayi Devrimi hangi kıtada başladı?", a:"avrupa"},
    {q:"🎨 Rönesans hangi ülkede başladı?", a:"italya"},
    {q:"📜 Magna Carta hangi ülkenin belgesidir?", a:"ingiltere"},
    {q:"📜 Hammurabi Kanunları hangi uygarlığa aittir?", a:"babil"},
    {q:"Tanzimat Fermanı hangi yüzyılda ilan edildi?", a:"19"},
    {q:"Sömürgecilik hangi yüzyılda yoğunlaştı?", a:"19"},
    {q:"Osmanlı'nın kuruluşu hangi yüzyılda kabul edilir?", a:"13"},
    {q:"Milli Mücadele hangi şehirde başladı?", a:"samsun"},
    {q:"Cumhuriyetin ilanından sonra başkent hangi şehirdir?", a:"ankara"},
    {q:"Lozan hangi ülke ile ilgili bir antlaşmadır?", a:"isvicre"},
    {q:"Hammurabi hangi uygarlığa aittir?", a:"babil"},
    {q:"Fransız Devrimi hangi yılda başladı?", a:"1789"},
    {q:"Atatürk'ün vefat yılı kaçtır?", a:"1938"},
    {q:"Amerikan Bağımsızlık Bildirgesi hangi yılda?", a:"1776"}
  ],
  cografya: [
    {q:"🗺️ Türkiye'nin en uzun akarsuyu hangisidir?", a:"kizilirmak"},
    {q:"🌊 Dünyanın en büyük okyanusu hangisidir?", a:"pasifik"},
    {q:"📍 Ekvator hangi enlem derecesindedir?", a:"0"},
    {q:"🌍 Türkiye hangi kıtada yer alır?", a:"avrupa/asya"},
    {q:"☀️ Akdeniz ikliminin Türkçesi nedir?", a:"akdeniz"},
    {q:"⛰️ Türkiye'nin en yüksek dağı hangisidir?", a:"agri"},
    {q:"Delta neyin sonucudur?", a:"nehir birikimi"},
    {q:"Tsunami genellikle hangi olayla ilişkilidir?", a:"deprem"},
    {q:"Jeotermal enerji hangi bölgelerde yaygındır?", a:"volkanik bölgeler"},
    {q:"Harita ölçeği küçüldükçe gösterilen alan artar mı?", a:"artar"},
    {q:"Enlem paralelleri kutuplara paralel midir?", a:"evet"},
    {q:"Nüfus yoğunluğu = nüfus / alan formülü doğru mu?", a:"dogru"},
    {q:"Küresel ısınma deniz seviyesini yükseltir mi?", a:"evet"},
    {q:"Rüzgar yönü haritalarda okla gösterilir mi?", a:"evet"},
    {q:"Akarsu havzası neyi ifade eder?", a:"su toplama alanı"},
    {q:"Enlem iklimi en çok etkiler mi?", a:"enlem"},
    {q:"Başkent genelde neyi ifade eder?", a:"idari merkez"},
    {q:"İklim kuşakları sıralaması sıcak→ılıman→soğuk şeklinde midir?", a:"sıcak→ılıman→soguk"},
    {q:"Tektonik plaklar jeolojik oluşumlarda rol oynar mı?", a:"evet"},
    {q:"Rüzgar enerjisi hangi coğrafi koşullarda verimlidir?", a:"acik alanlar"}
  ],
  edebiyat: [
    {q:"📚 İstiklal Marşı'nın şairi kimdir?", a:"mehmet akif ersoy"},
    {q:"📖 Tutunamayanlar romanının yazarı kimdir?", a:"oguz atay"},
    {q:"🖋️ Divan edebiyatında gazel hangi türdendir?", a:"siir"},
    {q:"🎵 Şiirde kafiyeye ne ad verilir?", a:"kafiye"},
    {q:"📘 Roman türü genelde uzun mu kısa mı?", a:"uzun"},
    {q:"✍️ Nazım birimi nedir?", a:"dize"},
    {q:"🏹 Epik şiir ne anlatır?", a:"kahramanlik"},
    {q:"🔍 Sembolizm hangi alanda etkilidir?", a:"edebiyat"},
    {q:"📜 Hikâye kısa anlatı mıdır?", a:"evet"},
    {q:"🔁 Metafor mecazlı anlatım mıdır?", a:"evet"},
    {q:"🎭 Realizm akımı gerçekçi betimleme yapar mı?", a:"evet"},
    {q:"🎬 Tiyatro eserleri sahnede mi sergilenir?", a:"evet"},
    {q:"🔤 Sözcüklerin anlam bilimi hangi alandır?", a:"semantik"},
    {q:"🔊 Şiirde ritim sağlayan öğe nedir?", a:"olcu"},
    {q:"🔎 Alegori ne demektir?", a:"simgesel anlatim"},
    {q:"🎭 Dram türü trajedi ve komediyi kapsar mı?", a:"evet"},
    {q:"👁️ Anlatıcı bakış açısı hikâyeyi etkiler mi?", a:"evet"},
    {q:"📎 Öykü kısa anlatı demektir.", a:"dogru"},
    {q:"🔤 Sözcüklerin köken bilimi nedir?", a:"etimoloji"},
    {q:"⭐ Roman kahramanı genelde ana karakter midir?", a:"evet"}
  ],
  genelkultur: [
    {q:"🌐 Dünya Sağlık Örgütü kısaltması nedir?", a:"who"},
    {q:"🏛️ Birleşmiş Milletler kısaltması nedir?", a:"un"},
    {q:"💶 Avrupa Birliği'nin para birimi nedir?", a:"euro"},
    {q:"🏔️ Dünyanın en yüksek dağı hangisidir?", a:"everest"},
    {q:"🏞️ Dünyanın en uzun nehri hangisidir?", a:"nil"},
    {q:"🦴 İnsan vücudunda kaç kemik vardır (yetişkin)?", a:"206"},
    {q:"🌙 Dünya'nın uydusunun adı nedir?", a:"ay"},
    {q:"🏅 İlk modern olimpiyatlar hangi yılda başladı?", a:"1896"},
    {q:"🏥 Dünya Sağlık Örgütü merkezi hangi şehirde?", a:"cenevre"},
    {q:"🌐 İnternetin kısaltması nedir?", a:"internet"},
    {q:"🌏 Dünyanın en büyük kıtası hangisidir?", a:"asya"},
    {q:"🏙️ Birleşmiş Milletler merkezi hangi şehirde?", a:"new york"},
    {q:"👥 Dünyanın en kalabalık ülkesi hangisidir?", a:"cin"},
    {q:"🌊 Dünyanın en büyük gölü hangisidir?", a:"hazar denizi"},
    {q:"🧬 İnsan DNA'sındaki baz çiftleri yaklaşık kaçtır?", a:"6e9"},
    {q:"🏆 Nobel ödülleri hangi ülke kökenlidir?", a:"isvec"},
    {q:"🏜️ Dünyanın en büyük çölü hangisidir?", a:"sahara"},
    {q:"🗺️ Dünyanın en büyük adası hangisidir?", a:"gronland"},
    {q:"🚀 İlk insanlı Ay inişi hangi yılda gerçekleşti?", a:"1969"},
    {q:"🌍 Dünya nüfusu yaklaşık kaçtır (2020'ler için)?", a:"8e9"},
    {q:"🧭 Birleşmiş Milletler kaç üye devletten oluşur?", a:"193"},
    {q:"🐠 Dünya'nın en büyük mercan resifi hangisidir?", a:"great barrier reef"},
    {q:"🇩🇪 Almanya'nın başkenti nedir?", a:"berlin"},
    {q:"🌳 Dünyanın en büyük yağmur ormanı hangisidir?", a:"amazon"},
    {q:"⛰️ Dünyanın en uzun dağı (volkanik) hangisidir?", a:"mauna kea"},
    {q:"🏥 Dünya Sağlık Örgütü (WHO) merkezi hangi ülkededir?", a:"isvicre"},
    {q:"🇨🇳 Çin'in başkenti nedir?", a:"pekin"},
    {q:"🧭 Grönland hangi kıtaya bağlıdır?", a:"kuzey amerika"},
    {q:"🌊 Hazar Denizi hangi iki kıta arasında yer alır?", a:"asya-avrupa"},
    {q:"🌳 Amazon hangi kıtadadır?", a:"guney amerika"}
  ]
};

/* -------------------------
   OYUN AKIŞI (25 soru)
   ------------------------- */
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

/* DOM yardımcıları */
const el = id => document.getElementById(id);

/* Branch görseller (images klasörüne koy) */
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
/* emoji map (branşa göre) */
const branchEmoji = {
  "Fizik":"⚡",
  "Matematik":"➗",
  "Kimya":"🧪",
  "Biyoloji":"🧬",
  "Tarih":"🏛️",
  "Cografya":"🗺️",
  "Edebiyat":"📚",
  "Genelkultur":"🌐"
};

/* Başlangıç: buton bağlama (ayrık davranışlar) */
document.addEventListener('DOMContentLoaded', ()=>{
  el('startBtn').addEventListener('click', ()=>{
    ensureAudioResume();
    startGame();
  });

  el('musicToggle').addEventListener('click', ()=>{
    ensureAudioResume();
    if(!ambientOn){
      startAmbient();
      el('musicToggle').textContent = 'Müziği Kapat';
    } else {
      stopAmbient();
      el('musicToggle').textContent = 'Müziği Aç';
    }
  });

  el('howBtn').addEventListener('click', ()=> {
    el('modal').classList.add('active');
    el('modal').setAttribute('aria-hidden','false');
  });
  el('closeModal').addEventListener('click', ()=> {
    el('modal').classList.remove('active');
    el('modal').setAttribute('aria-hidden','true');
  });
  el('submitBtn').addEventListener('click', submitAnswer);
  el('skipBtn').addEventListener('click', ()=>{
    playPass();
    skipQuestion();
  });
  el('retryBtn').addEventListener('click', ()=> location.reload());
  el('homeBtn').addEventListener('click', ()=> location.reload());

  document.addEventListener('keydown', (e)=>{
    if(el('soruEkrani').style.display === 'block' && e.key === 'Enter') submitAnswer();
  });

  // Sayfa yüklendiğinde Firestore'dan son kayıtları getir
  renderRecentScores().catch(()=>{});
});
/* Rastgele seçim (havuzdan tekrar etmeyen) */
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

/* Başlat */
function startGame(){
  const name = el('inputName').value.trim();
  const cls = el('inputClass').value.trim();
  if(!name || !cls){ alert('Lütfen ad soyad ve sınıf gir.'); return; }

  playerName = name; playerClass = cls;
  playStart();

  gameQuestions = pickRandomQuestions();
  current = 0; score = 0; passesLeft = 2;
  correctCount = 0; passCount = 0; wrongCount = 0;
  el('passesLeft').textContent = passesLeft;
  el('currentScore').textContent = score;

  el('giris').classList.remove('active'); el('giris').style.display='none';
  el('soruEkrani').classList.add('active'); el('soruEkrani').style.display='block';
  el('sonuc').style.display='none';

  loadQuestion();
}
/* Soru yükle ve sayaç başlat */
function loadQuestion(){
  if(current >= gameQuestions.length){ endGame(); return; }

  const s = gameQuestions[current];
  el('qIndex').textContent = `${current+1} / ${gameQuestions.length}`;
  el('branchTag').textContent = s.branch;

  // emoji prefix
  const emoji = branchEmoji[s.branch] || '';
  el('questionText').textContent = `${emoji}  ${s.q}`;

  el('answerInput').value = '';
  el('feedback').textContent = ''; el('feedback').className = 'feedback';

  setBranchVisual(s.branch);
  setProgress(1);

  timer = 30;
  el('timeText').textContent = timer;

  clearInterval(timerInterval);
  timerInterval = setInterval(()=>{
    timer--;
    el('timeText').textContent = timer;
    setProgress(timer/30);
    if(timer <= 5 && timer > 0) playTick();
    if(timer <= 0){
      clearInterval(timerInterval);
      handleWrongTimeout();
    }
  },1000);
}

/* Dairesel progress */
function setProgress(ratio){
  const circle = document.getElementById('progressCircle');
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - ratio);
  circle.style.strokeDasharray = `${circumference}`;
  circle.style.strokeDashoffset = `${offset}`;
}

/* Cevap gönder */
function submitAnswer(){
  if(current >= gameQuestions.length) return;
  clearInterval(timerInterval);

  const userRaw = el('answerInput').value.trim();
  const user = normalizeAnswer(userRaw);
  const correctRaw = gameQuestions[current].a;
  const correct = normalizeAnswer(correctRaw);

  const numericMatch = numericEquals(user, correct);
  const affirmativeMatch = affirmativeEquals(user, correct);

  if(user === correct || numericMatch || affirmativeMatch){
    score += 5;
    correctCount++;
    playCorrect();
    showFeedback(true, 'Doğru! +5 puan');
    updateScoreDisplay();
    current++;
    setTimeout(loadQuestion, 700);
  } else {
    score -= 2;
    wrongCount++;
    playWrong();
    updateScoreDisplay();
    showCorrectThenNext(correctRaw);
  }
}
// --- Pas (skip) fonksiyonu ---
function skipQuestion(){
  if(current >= gameQuestions.length) return;

  if(passesLeft <= 0){
    showFeedback(false, 'Pas hakkın kalmadı');
    return;
  }

  passesLeft--;
  passCount++;
  el('passesLeft').textContent = passesLeft;
  playPass();

  clearInterval(timerInterval);
  current++;
  setTimeout(loadQuestion, 250);
}

/* Yanlışta doğruyu kırmızı göster, 2s sonra sonraki soru */
function showCorrectThenNext(correctRaw){
  const f = el('feedback');
  f.innerHTML = `Yanlış! Doğru: <span class="correctReveal">${escapeHtml(correctRaw)}</span>`;
  f.className = 'feedback bad';
  setTimeout(()=>{
    current++;
    loadQuestion();
  },2000);
}

/* Kısa feedback */
function showFeedback(ok, text){
  const f = el('feedback');
  f.textContent = text;
  f.className = 'feedback ' + (ok ? 'good' : 'bad');
}

/* Oyun bitiş */
async function endGame(){
  clearInterval(timerInterval);
  el('soruEkrani').classList.remove('active'); el('soruEkrani').style.display='none';
  el('sonuc').classList.add('active'); el('sonuc').style.display='block';

  el('resName').textContent = playerName;
  el('resClass').textContent = playerClass;
  el('resScore').textContent = score;

  // breakdown
  const breakdown = el('resBreakdown');
  breakdown.innerHTML = '';
  const total = gameQuestions.length;
  const li1 = document.createElement('li'); li1.textContent = `Doğru: ${correctCount}`;
  const li2 = document.createElement('li'); li2.textContent = `Pas: ${passCount}`;
  const li3 = document.createElement('li'); li3.textContent = `Yanlış: ${wrongCount}`;
  const li4 = document.createElement('li'); li4.textContent = `Toplam soru: ${total}`;
  breakdown.appendChild(li1); breakdown.appendChild(li2); breakdown.appendChild(li3); breakdown.appendChild(li4);

  // Firestore'a kaydet (localStorage yerine)
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

  if(score >= 80){ playCorrect(); }
  else if(score >= 40) playStart();
  else playWrong();
}

/* Branch görsel ayarlama (küçültülmüş) */
function setBranchVisual(branch){
  const imgEl = el('branchImage');
  const container = el('branchVisual');
  const key = branch.toLowerCase();
  const mapKey = {
    'fizik':'Fizik','matematik':'Matematik','kimya':'Kimya','biyoloji':'Biyoloji',
    'tarih':'Tarih','cografya':'Cografya','edebiyat':'Edebiyat','genelkultur':'Genelkultur'
  }[key] || null;
  const path = mapKey ? branchImages[mapKey] : null;
  if(!path){
    container.style.display = 'none';
    return;
  }
  container.style.display = 'block';
  imgEl.classList.remove('loaded');
  imgEl.alt = branch + " görseli";
  const pre = new Image();
  pre.src = path;
  pre.onload = () => { imgEl.src = path; setTimeout(()=> imgEl.classList.add('loaded'),80); };
  pre.onerror = () => { container.style.display = 'none'; };
}

/* Yardımcılar */
function shuffle(array){
  for(let i=array.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [array[i],array[j]] = [array[j],array[i]];
  }
  return array;
}
function capitalize(s){ return s.charAt(0).toUpperCase() + s.slice(1); }
function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

/* Normalize ve numeric eşleme */
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

/* Affirmative matching: 'evet' should match answers like 'artirir' or 'evet' etc.
   Also accept 'evet' when correct contains affirmative verbs; accept 'hayir' for negatives. */
function affirmativeEquals(userNorm, correctNorm){
  if(!userNorm || !correctNorm) return false;
  // direct matches
  if(userNorm === correctNorm) return true;

  // if user explicitly wrote 'evet' or 'hayir'
  if(userNorm === 'evet'){
    // if correct is explicit 'evet' or contains affirmative verb substrings
    const affirmSub = ['evet','artir','artirir','artiriyor','artirir','artir']; // common affirmative stems
    for(const sub of affirmSub){
      if(correctNorm.includes(sub)) return true;
    }
    // if correct is a positive short word (e.g., 'artirir','artir') accept
    if(!/^[0-9e\.\-\/]+$/.test(correctNorm) && correctNorm.length <= 12 && !correctNorm.includes('hayir')){
      // accept as affirmative if not explicitly negative
      return true;
    }
  }
  if(userNorm === 'hayir'){
    const negSub = ['hayir','degil','yok','olmuyor','olmadi'];
    for(const sub of negSub){
      if(correctNorm.includes(sub)) return true;
    }
    // if correct explicitly 'hayir'
    if(correctNorm === 'hayir') return true;
  }

  // also accept if correct is 'evet' and user wrote affirmative synonyms
  if(correctNorm === 'evet' && (userNorm === 'evet' || userNorm === 'evet.')) return true;
  if(correctNorm === 'hayir' && (userNorm === 'hayir' || userNorm === 'hayir.')) return true;

  return false;
}

/* Update score display */
function updateScoreDisplay(){
  el('currentScore').textContent = score;
}

/* Expose for debug */
window.startGame = startGame;
window.submitAnswer = submitAnswer;
window.skipQuestion = skipQuestion;
