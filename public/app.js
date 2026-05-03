'use strict';

// ─────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────
const state = {
  gameId: null, roundId: null, score: 0, hintsRemaining: 3,
  letters: '', endsAt: null, targetCount: 4,
  correctSubmissions: [], timerInterval: null,
  powerTiles: {}, totalBonusEarned: 0,
};

// ─────────────────────────────────────────────────────────────
// DOM
// ─────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const screens = { start:$('screen-start'), game:$('screen-game'), result:$('screen-result') };
const dom = {
  btnStart:$('btn-start'), startError:$('start-error'),
  hudScore:$('hud-score'), hudTimer:$('hud-timer'), hudHints:$('hud-hints'),
  statTimer:document.querySelector('.stat-timer'),
  lettersDisplay:$('letters-display'),
  foundCount:$('found-count'), targetCount:$('target-count'),
  progressFill:$('progress-fill'),
  wordInput:$('word-input'), btnSubmit:$('btn-submit'),
  feedback:$('feedback'), bonusPopup:$('bonus-popup'),
  hintBox:$('hint-box'), hintWord:$('hint-word'),
  btnHint:$('btn-hint'), hintBtnText:$('hint-btn-text'),
  btnEnd:$('btn-end'), foundWordsList:$('found-words-list'),
  powerStatusText:$('power-status-text'),
  resultBadge:$('result-badge'), resultScoreBig:$('result-score-big'),
  resultBaseWord:$('result-base-word'), resultFound:$('result-found'),
  resultBonus:$('result-bonus'), resultWordsList:$('result-words-list'),
  btnPlayAgain:$('btn-play-again'), canvas:$('particle-canvas'),
  // Music player
  musicPlayer:   $('music-player'),
  vinyl:         $('vinyl'),
  musicTrackName:$('music-track-name'),
  musicBars:     $('music-bars'),
  btnPlay:       $('btn-play'),
  btnPrev:       $('btn-prev'),
  btnNext:       $('btn-next'),
  volSlider:     $('vol-slider'),
};

// ─────────────────────────────────────────────────────────────
// AUDIO CONTEXT  (shared between SFX + Music)
// ─────────────────────────────────────────────────────────────
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

// ─────────────────────────────────────────────────────────────
// SFX ENGINE
// ─────────────────────────────────────────────────────────────
function playTone({ freq=440,type='sine',gain=0.18,attack=0.01,decay=0.18,detune=0 }={}) {
  try {
    const ctx=getAudioCtx();
    const osc=ctx.createOscillator(), env=ctx.createGain();
    osc.type=type; osc.frequency.setValueAtTime(freq,ctx.currentTime);
    osc.detune.setValueAtTime(detune,ctx.currentTime);
    env.gain.setValueAtTime(0,ctx.currentTime);
    env.gain.linearRampToValueAtTime(gain,ctx.currentTime+attack);
    env.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+attack+decay);
    osc.connect(env); env.connect(ctx.destination);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime+attack+decay+0.05);
  } catch(_){}
}
function playChord(freqs,opts={}){ freqs.forEach((f,i)=>setTimeout(()=>playTone({freq:f,...opts}),i*18)); }

const SFX = {
  accept()    { playChord([523,659,784,1047],{type:'triangle',gain:0.14,decay:0.22}); },
  reject()    { playTone({freq:160,type:'sawtooth',gain:0.12,decay:0.14}); setTimeout(()=>playTone({freq:130,type:'sawtooth',gain:0.08,decay:0.10}),60); },
  hint()      { playTone({freq:740,type:'sine',gain:0.13,attack:0.02,decay:0.5}); setTimeout(()=>playTone({freq:988,type:'sine',gain:0.07,decay:0.4}),120); },
  clear()     { [523,659,784,1047,1319].forEach((f,i)=>setTimeout(()=>playTone({freq:f,type:'triangle',gain:0.16,decay:0.28}),i*90)); },
  start()     { [261,330,392,523].forEach((f,i)=>setTimeout(()=>playTone({freq:f,type:'triangle',gain:0.12,decay:0.2}),i*70)); },
  urgent()    { playTone({freq:200,type:'square',gain:0.07,decay:0.08}); },
  goldBonus() { playChord([880,1109,1318],{type:'sine',gain:0.13,decay:0.3}); setTimeout(()=>playTone({freq:1760,type:'sine',gain:0.08,decay:0.25}),120); },
  redBonus()  { playTone({freq:80,type:'sawtooth',gain:0.18,decay:0.18}); setTimeout(()=>playChord([1047,1319,1568,2093],{type:'sine',gain:0.10,decay:0.22}),100); },
  powerSpawn(){ playTone({freq:1200,type:'sine',gain:0.06,attack:0.03,decay:0.4}); },
};

// ─────────────────────────────────────────────────────────────
// LO-FI MUSIC ENGINE
// Generates real procedural lo-fi music using Web Audio API.
//   Each layer (drums, bass, chords, melody) has its own gain node
//   so volume and muting are independent.
// ─────────────────────────────────────────────────────────────
const Music = (() => {
  // ── Track list ──────────────────────────────────────────────
  // Each track is a different musical configuration (key, tempo, feel).
  const TRACKS = [
    { name: 'Midnight Coffee',  bpm: 72,  key: 'Cm',  chord: [261,311,392], feel: 'warm'   },
    { name: 'Rain Window',      bpm: 65,  key: 'Am',  chord: [220,261,329], feel: 'soft'   },
    { name: 'Cozy Corner',      bpm: 80,  key: 'Dm',  chord: [293,349,440], feel: 'bounce' },
    { name: 'Late Night Study', bpm: 68,  key: 'Gm',  chord: [196,233,293], feel: 'deep'   },
    { name: 'Cafe Drift',       bpm: 76,  key: 'Em',  chord: [164,196,246], feel: 'mellow' },
  ];

  let trackIdx   = 0;
  let isPlaying  = false;
  let masterGain = null;
  let compressor = null;
  let loopHandle = null;        // setTimeout handle for the beat loop
  let beatCount  = 0;
  let ctx        = null;
  let volLevel   = 0.40;        // 0-1

  // Gain nodes per layer
  let gainDrum, gainBass, gainChord, gainMelody, gainVinyl;

  // ── Setup audio graph ────────────────────────────────────────
  function ensureGraph() {
    ctx = getAudioCtx();
    if (masterGain) return;

    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value      = 8;
    compressor.ratio.value     = 4;
    compressor.attack.value    = 0.003;
    compressor.release.value   = 0.25;
    compressor.connect(ctx.destination);

    masterGain = ctx.createGain();
    masterGain.gain.value = volLevel;
    masterGain.connect(compressor);

    gainDrum   = makeGain(0.55);
    gainBass   = makeGain(0.45);
    gainChord  = makeGain(0.22);
    gainMelody = makeGain(0.18);
    gainVinyl  = makeGain(0.06);
  }

  function makeGain(val) {
    const g = ctx.createGain();
    g.gain.value = val;
    g.connect(masterGain);
    return g;
  }

  // ── Lo-fi vinyl crackle (pink-ish noise) ─────────────────────
  function startVinylNoise() {
    const bufSize = ctx.sampleRate * 2;
    const buf     = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data    = buf.getChannelData(0);
    let   b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
    for (let i=0; i<bufSize; i++) {
      const white = Math.random()*2-1;
      b0=0.99886*b0+white*0.0555179; b1=0.99332*b1+white*0.0750759;
      b2=0.96900*b2+white*0.1538520; b3=0.86650*b3+white*0.3104856;
      b4=0.55000*b4+white*0.5329522; b5=-0.7616*b5-white*0.0168980;
      data[i]=(b0+b1+b2+b3+b4+b5+b6+white*0.5362)*0.11;
      b6=white*0.115926;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop   = true;

    // Low-pass to make it sound warm/muffled (lo-fi vinyl feel)
    const lp = ctx.createBiquadFilter();
    lp.type            = 'lowpass';
    lp.frequency.value = 2200;
    lp.Q.value         = 0.5;

    src.connect(lp);
    lp.connect(gainVinyl);
    src.start();
    return src;
  }

  let vinylNode = null;

  // ── Helpers ──────────────────────────────────────────────────
  function note(freq, dest, { dur=0.18, gain=0.3, type='sine', when=0, detune=0 }={}) {
    const t   = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type  = type;
    osc.frequency.value = freq;
    osc.detune.value    = detune;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t+0.01);
    env.gain.exponentialRampToValueAtTime(0.001, t+dur);
    osc.connect(env); env.connect(dest);
    osc.start(t); osc.stop(t+dur+0.05);
  }

  function kick(when=0) {
    // Sine sweep down = kick drum
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    const t   = ctx.currentTime + when;
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(40, t+0.08);
    env.gain.setValueAtTime(0.9, t);
    env.gain.exponentialRampToValueAtTime(0.001, t+0.22);
    osc.connect(env); env.connect(gainDrum);
    osc.start(t); osc.stop(t+0.25);
  }

  function snare(when=0) {
    // White noise burst = snare
    const buf  = ctx.createBuffer(1, ctx.sampleRate*0.12, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i=0;i<data.length;i++) data[i]=Math.random()*2-1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const env  = ctx.createGain();
    const hp   = ctx.createBiquadFilter();
    hp.type            = 'highpass';
    hp.frequency.value = 1800;
    const t = ctx.currentTime + when;
    env.gain.setValueAtTime(0.35, t);
    env.gain.exponentialRampToValueAtTime(0.001, t+0.12);
    src.connect(hp); hp.connect(env); env.connect(gainDrum);
    src.start(t);
  }

  function hihat(when=0, open=false) {
    const buf  = ctx.createBuffer(1, ctx.sampleRate*0.04, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i=0;i<data.length;i++) data[i]=Math.random()*2-1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const env  = ctx.createGain();
    const hp   = ctx.createBiquadFilter();
    hp.type            = 'highpass';
    hp.frequency.value = 7000;
    const t   = ctx.currentTime + when;
    const dur = open ? 0.18 : 0.04;
    env.gain.setValueAtTime(0.15, t);
    env.gain.exponentialRampToValueAtTime(0.001, t+dur);
    src.connect(hp); hp.connect(env); env.connect(gainDrum);
    src.start(t);
  }

  // ── One bar of lo-fi pattern ─────────────────────────────────
 
  function playBar(bpm, chordFreqs, feel) {
    const sec = 60/bpm;       // one beat in seconds
    const s16 = sec/4;        // one 16th note

    // ── Kick: beats 1 and 3 (occasionally add a ghost on the & of 2) ──
    kick(0);
    kick(sec*2);
    if (Math.random()>0.6) kick(sec*1.5 + s16*0.5); // ghost

    // ── Snare: beats 2 and 4 with slight swing ──
    const swing = s16 * (Math.random()*0.18);
    snare(sec + swing);
    snare(sec*3 + swing);

    // ── Hi-hats: 8th notes, occasional open ──
    for (let i=0;i<8;i++) {
      const open = (i===3||i===7) && Math.random()>0.5;
      hihat(i*s16*2, open);
    }

    // ── Bass: root on beat 1, fifth on beat 3 ──
    const root   = chordFreqs[0]/2;   // octave below
    const fifth  = chordFreqs[2]/2;
    note(root,  gainBass, {dur:sec*0.9, gain:0.55, type:'triangle', when:0,       detune:Math.random()*6-3});
    note(fifth, gainBass, {dur:sec*0.9, gain:0.4,  type:'triangle', when:sec*2,   detune:Math.random()*6-3});
    // occasional bass fill
    if (beatCount%4===3) {
      note(root*1.5, gainBass, {dur:s16*1.5, gain:0.3, type:'triangle', when:sec*3.5});
    }

    // ── Chord stab: light and muffled (lo-fi piano) ──
    const chordWhen = [0, sec*2, sec*2+s16*2];
    chordWhen.forEach(w => {
      chordFreqs.forEach((f,i) => {
        note(f, gainChord, {
          dur: sec*0.6,
          gain: 0.14 - i*0.02,
          type: 'triangle',
          when: w + Math.random()*0.01, // tiny humanise
          detune: (i-1)*1200 + Math.random()*8-4,
        });
      });
    });

    // ── Melody: pentatonic over the key ──
    const penta = [
      chordFreqs[0],
      chordFreqs[0]*1.125,
      chordFreqs[1],
      chordFreqs[2],
      chordFreqs[2]*1.125,
      chordFreqs[2]*1.25,
    ].map(f=>f*2);  // octave up

    // Sparse: 2-4 notes per bar, random positions
    const noteCount = 2 + Math.floor(Math.random()*3);
    for (let n=0;n<noteCount;n++) {
      const when = Math.random() * sec*3.5;
      const freq = penta[Math.floor(Math.random()*penta.length)];
      note(freq, gainMelody, {
        dur: s16 * (2+Math.random()*4),
        gain: 0.10,
        type: 'sine',
        when,
        detune: Math.random()*12-6,
      });
    }

    beatCount++;
  }

  // ── Loop scheduler ───────────────────────────────────────────
  function scheduleBar() {
    if (!isPlaying) return;
    const track = TRACKS[trackIdx];
    const barDur = (60/track.bpm)*4*1000; // ms per bar
    playBar(track.bpm, track.chord, track.feel);
    loopHandle = setTimeout(scheduleBar, barDur - 30); // -30ms overlap buffer
  }

  // ── Public API ───────────────────────────────────────────────
  function play() {
    ensureGraph();
    if (isPlaying) return;
    isPlaying = true;
    beatCount = 0;
    if (!vinylNode) vinylNode = startVinylNoise();
    scheduleBar();
    updateUI();
  }

  function pause() {
    isPlaying = false;
    if (loopHandle) { clearTimeout(loopHandle); loopHandle=null; }
    updateUI();
  }

  function toggle() {
    isPlaying ? pause() : play();
  }

  function next() {
    trackIdx = (trackIdx+1) % TRACKS.length;
    beatCount = 0;
    if (isPlaying) { pause(); setTimeout(play, 80); }
    updateUI();
  }

  function prev() {
    trackIdx = (trackIdx-1+TRACKS.length) % TRACKS.length;
    beatCount = 0;
    if (isPlaying) { pause(); setTimeout(play, 80); }
    updateUI();
  }

  function setVolume(val) {
    volLevel = val/100;
    if (masterGain) masterGain.gain.setTargetAtTime(volLevel, ctx.currentTime, 0.05);
  }

  function updateUI() {
    const track = TRACKS[trackIdx];
    dom.musicTrackName.textContent = track.name;
    dom.btnPlay.innerHTML          = isPlaying ? '&#9646;&#9646;' : '&#9654;';

    if (isPlaying) {
      dom.vinyl.classList.add('spinning');
      dom.musicBars.classList.add('active');
      dom.musicTrackName.classList.add('scrolling');
    } else {
      dom.vinyl.classList.remove('spinning');
      dom.musicBars.classList.remove('active');
      dom.musicTrackName.classList.remove('scrolling');
    }
  }

  return { play, pause, toggle, next, prev, setVolume, updateUI };
})();

// ─────────────────────────────────────────────────────────────
// PARTICLE SYSTEM
// ─────────────────────────────────────────────────────────────
const canvas=dom.canvas, ctx2d=canvas.getContext('2d');
let particles=[];
function resizeCanvas(){ canvas.width=window.innerWidth; canvas.height=window.innerHeight; }
resizeCanvas(); window.addEventListener('resize',resizeCanvas);

function spawnParticles(x,y,count=24,colors=['#a78bfa','#ec4899','#06b6d4','#34d399','#f59e0b']) {
  for(let i=0;i<count;i++){
    const angle=(Math.PI*2*i/count)+Math.random()*0.5, speed=2+Math.random()*5;
    particles.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed-2,radius:3+Math.random()*4,color:colors[Math.floor(Math.random()*colors.length)],alpha:1,decay:0.018+Math.random()*0.015});
  }
}
function spawnExplosion(x,y,colors){
  spawnParticles(x,y,40,colors);
  for(let i=0;i<20;i++){const angle=Math.PI*2*i/20,speed=7+Math.random()*5;particles.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,radius:5+Math.random()*5,color:colors[Math.floor(Math.random()*colors.length)],alpha:1,decay:0.022+Math.random()*0.01});}
}
function tickParticles(){
  ctx2d.clearRect(0,0,canvas.width,canvas.height);
  particles=particles.filter(p=>p.alpha>0.02);
  particles.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.vy+=0.18;p.vx*=0.98;p.alpha-=p.decay;ctx2d.save();ctx2d.globalAlpha=p.alpha;ctx2d.beginPath();ctx2d.arc(p.x,p.y,p.radius,0,Math.PI*2);ctx2d.fillStyle=p.color;ctx2d.fill();ctx2d.restore();});
  requestAnimationFrame(tickParticles);
}
tickParticles();
function getInputCenter(){ const r=dom.wordInput.getBoundingClientRect(); return{x:r.left+r.width/2,y:r.top+r.height/2}; }
function getTileCenter(el){ const r=el.getBoundingClientRect(); return{x:r.left+r.width/2,y:r.top+r.height/2}; }

// ─────────────────────────────────────────────────────────────
// POWER TILES
// ─────────────────────────────────────────────────────────────
let powerRotateTimer=null;
function assignPowerTiles(){
  const tiles=Array.from(dom.lettersDisplay.querySelectorAll('.letter-tile'));
  if(tiles.length<2)return;
  tiles.forEach(t=>t.classList.remove('power-gold','power-red'));
  state.powerTiles={};
  const indices=[];
  while(indices.length<2){const i=Math.floor(Math.random()*tiles.length);if(!indices.includes(i))indices.push(i);}
  tiles[indices[0]].classList.add('power-gold'); state.powerTiles[indices[0]]='gold';
  tiles[indices[1]].classList.add('power-red');  state.powerTiles[indices[1]]='red';
  SFX.powerSpawn(); updatePowerStatus();
}
function updatePowerStatus(){
  const count=Object.keys(state.powerTiles).length;
  if(count===0){dom.powerStatusText.textContent='All powers used!';dom.powerStatusText.style.color='var(--text-3)';document.querySelector('.power-status-dot').style.background='var(--text-3)';document.querySelector('.power-status-dot').style.boxShadow='none';}
  else{dom.powerStatusText.textContent=`${count} power tile${count>1?'s':''} active!`;dom.powerStatusText.style.color='#34d399';document.querySelector('.power-status-dot').style.background='#10b981';document.querySelector('.power-status-dot').style.boxShadow='0 0 8px #10b981';}
}
function startPowerRotation(){ stopPowerRotation(); powerRotateTimer=setInterval(assignPowerTiles,20000); }
function stopPowerRotation(){ if(powerRotateTimer){clearInterval(powerRotateTimer);powerRotateTimer=null;} }

function buildFreqMap(str){ const m={};for(const c of str)m[c]=(m[c]||0)+1;return m; }

function checkPowerTileBonus(word){
  const tiles=Array.from(dom.lettersDisplay.querySelectorAll('.letter-tile'));
  const wFreq=buildFreqMap(word.toLowerCase());
  let bonus=0,bestType=null,bestTile=null;
  for(const[idx,type]of Object.entries(state.powerTiles)){
    const tile=tiles[parseInt(idx)]; if(!tile)continue;
    const letter=tile.textContent.toLowerCase();
    if(wFreq[letter]&&wFreq[letter]>0){
      const b=type==='gold'?3:5;
      if(b>bonus){bonus=b;bestType=type;bestTile=tile;}
      wFreq[letter]--;
      tile.classList.remove('power-gold','power-red');
      tile.classList.add('power-used');
      setTimeout(()=>tile.classList.remove('power-used'),700);
      delete state.powerTiles[idx];
    }
  }
  if(bonus>0&&bestTile)triggerPowerBonus(bonus,bestType,bestTile);
  updatePowerStatus(); return bonus;
}

function triggerPowerBonus(bonus,type,tileEl){
  state.score+=bonus; state.totalBonusEarned+=bonus; dom.hudScore.textContent=state.score;
  const{x,y}=getTileCenter(tileEl), isGold=type==='gold';
  spawnExplosion(x,y,isGold?['#fde68a','#fbbf24','#f59e0b','#ffffff','#fef3c7']:['#fca5a5','#ef4444','#b91c1c','#ffffff','#fee2e2']);
  const popup=dom.bonusPopup;
  popup.textContent=`+${bonus} POWER BONUS!`;
  popup.className=`bonus-popup ${isGold?'gold-bonus':'red-bonus'}`;
  popup.classList.remove('hidden');
  setTimeout(()=>popup.classList.add('hidden'),1500);
  isGold?SFX.goldBonus():SFX.redBonus();
  showFeedback(isGold?`★ Gold Power! +${bonus} bonus points!`:`⚡ Red Power! +${bonus} bonus points!`,isGold?'gold':'red-power',2500);
}

// ─────────────────────────────────────────────────────────────
// LETTER HIGHLIGHT
// ─────────────────────────────────────────────────────────────
function highlightLetters(typed){
  const tiles=Array.from(dom.lettersDisplay.querySelectorAll('.letter-tile'));
  tiles.forEach(t=>t.classList.remove('lit'));
  if(!typed)return;
  const avail=buildFreqMap(state.letters);
  for(const ch of typed.toLowerCase()){
    const idx=tiles.findIndex(t=>t.textContent.toLowerCase()===ch&&!t.classList.contains('lit')&&avail[ch]>0);
    if(idx!==-1){tiles[idx].classList.add('lit');avail[ch]--;}
  }
}

// ─────────────────────────────────────────────────────────────
// SCREEN / API / RENDER
// ─────────────────────────────────────────────────────────────
function showScreen(name){
  Object.entries(screens).forEach(([k,el])=>{el.classList.toggle('hidden',k!==name);el.classList.toggle('active',k===name);});
}
async function api(method,path,body){
  const opts={method,headers:{'Content-Type':'application/json'}};
  if(body)opts.body=JSON.stringify(body);
  const res=await fetch(path,opts); const data=await res.json();
  if(!res.ok)throw new Error(data.error||`HTTP ${res.status}`);
  return data;
}
function renderLetters(letters){
  dom.lettersDisplay.innerHTML='';
  letters.split('').forEach((ch,i)=>{const tile=document.createElement('div');tile.className='letter-tile';tile.textContent=ch.toUpperCase();tile.style.animationDelay=`${i*70}ms`;dom.lettersDisplay.appendChild(tile);});
}
function renderHUD(){ dom.hudScore.textContent=state.score;dom.hudHints.textContent=state.hintsRemaining;dom.hintBtnText.textContent=`USE HINT \u2014 ${state.hintsRemaining} LEFT`;dom.btnHint.disabled=state.hintsRemaining<=0; }
function renderFoundWords(){
  dom.foundWordsList.innerHTML='';
  if(!state.correctSubmissions.length){dom.foundWordsList.innerHTML='<span class="chips-empty">None yet</span>';return;}
  state.correctSubmissions.forEach(w=>{const c=document.createElement('span');c.className='word-chip';c.textContent=w.toUpperCase();dom.foundWordsList.appendChild(c);});
}
function renderProgress(){
  const found=state.correctSubmissions.length, pct=Math.min((found/state.targetCount)*100,100);
  dom.foundCount.textContent=found; dom.targetCount.textContent=state.targetCount;
  dom.progressFill.style.width=`${pct}%`;
  if(found>0)dom.progressFill.classList.add('has-progress');
}

// ─────────────────────────────────────────────────────────────
// TIMER
// ─────────────────────────────────────────────────────────────
let urgentPlayed=false;
function startTimer(){
  if(state.timerInterval)clearInterval(state.timerInterval);
  urgentPlayed=false;
  state.timerInterval=setInterval(()=>{
    const ms=state.endsAt-Date.now();
    if(ms<=0){clearInterval(state.timerInterval);dom.hudTimer.textContent='0:00';dom.statTimer.classList.add('urgent');showFeedback('Time is up!','error');dom.wordInput.disabled=true;dom.btnSubmit.disabled=true;stopPowerRotation();return;}
    const s=Math.ceil(ms/1000),m=Math.floor(s/60);
    dom.hudTimer.textContent=`${m}:${(s%60).toString().padStart(2,'0')}`;
    if(ms<30000){dom.statTimer.classList.add('urgent');if(!urgentPlayed){SFX.urgent();urgentPlayed=true;}}
  },500);
}
function stopTimer(){ if(state.timerInterval){clearInterval(state.timerInterval);state.timerInterval=null;} }

// ─────────────────────────────────────────────────────────────
// FEEDBACK
// ─────────────────────────────────────────────────────────────
let feedbackTimeout=null;
function showFeedback(msg,type='info',duration=2800){
  if(feedbackTimeout)clearTimeout(feedbackTimeout);
  dom.feedback.textContent=msg; dom.feedback.className=`feedback-bar ${type}`; dom.feedback.classList.remove('hidden');
  feedbackTimeout=setTimeout(()=>dom.feedback.classList.add('hidden'),duration);
}

// ─────────────────────────────────────────────────────────────
// GAME ACTIONS
// ─────────────────────────────────────────────────────────────
async function startGame(){
  dom.btnStart.disabled=true; dom.startError.classList.add('hidden'); state.totalBonusEarned=0;
  try{
    const data=await api('POST','/api/game/start');
    state.gameId=data.gameId; state.roundId=data.round.roundId; state.score=data.score;
    state.hintsRemaining=data.hintsRemaining; state.letters=data.round.letters;
    state.endsAt=new Date(data.round.endsAt); state.targetCount=data.round.targetCount;
    state.correctSubmissions=data.round.correctSubmissions||[]; state.powerTiles={};
    dom.wordInput.disabled=false; dom.btnSubmit.disabled=false;
    dom.hintBox.classList.add('hidden'); dom.feedback.classList.add('hidden');
    dom.statTimer.classList.remove('urgent');
    renderLetters(state.letters); renderHUD(); renderFoundWords(); renderProgress();
    startTimer(); SFX.start();
    setTimeout(()=>{ assignPowerTiles(); startPowerRotation(); },800);
    showScreen('game');
    setTimeout(()=>dom.wordInput.focus(),100);
    // Auto-start music on game start
    Music.play();
  }catch(err){
    dom.startError.textContent=err.message; dom.startError.classList.remove('hidden');
  }finally{ dom.btnStart.disabled=false; }
}

async function submitWord(){
  const word=dom.wordInput.value.trim(); if(!word)return;
  dom.wordInput.value=''; highlightLetters(''); dom.btnSubmit.disabled=true;
  try{
    const data=await api('POST',`/api/game/${state.gameId}/submit`,{roundId:state.roundId,word});
    state.score=data.score; state.correctSubmissions=data.round.correctSubmissions;
    renderHUD(); renderFoundWords(); renderProgress();
    if(data.result.accepted){
      SFX.accept(); const{x,y}=getInputCenter(); spawnParticles(x,y,28);
      const bonus=checkPowerTileBonus(word);
      if(bonus===0)showFeedback(`"${word.toUpperCase()}" accepted  +${word.length} pts`,'success');
      if(data.result.cleared){
        SFX.clear();
        setTimeout(()=>{const c=getInputCenter();spawnParticles(c.x,c.y,60,['#a78bfa','#ec4899','#06b6d4','#34d399','#fde68a','#fff']);},200);
        setTimeout(()=>showFeedback('Round cleared! Keep going for more points!','info',3500),900);
      }
    }else{ SFX.reject(); showFeedback(data.result.reason,'error'); }
  }catch(err){ SFX.reject(); showFeedback(err.message,'error'); }
  finally{ dom.btnSubmit.disabled=false; dom.wordInput.focus(); }
}

async function getHint(){
  dom.btnHint.disabled=true;
  try{
    const data=await api('POST',`/api/game/${state.gameId}/hint`,{roundId:state.roundId});
    state.hintsRemaining=data.hintsRemaining; dom.hintWord.textContent=data.hint.word.toUpperCase();
    dom.hintBox.classList.remove('hidden'); renderHUD(); SFX.hint(); showFeedback('Hint revealed!','info');
  }catch(err){ showFeedback(err.message,'error'); dom.btnHint.disabled=state.hintsRemaining<=0; }
}

async function endGame(){
  stopTimer(); stopPowerRotation();
  dom.wordInput.disabled=true; dom.btnSubmit.disabled=true; dom.btnHint.disabled=true;
  try{
    const data=await api('POST',`/api/game/${state.gameId}/end`);
    const found=data.correctSubmissions.length;
    dom.resultScoreBig.textContent=data.finalScore; dom.resultBaseWord.textContent=data.baseWord.toUpperCase();
    dom.resultFound.textContent=found; dom.resultBonus.textContent=state.totalBonusEarned;
    if(found>=state.targetCount){dom.resultBadge.textContent='CLEARED!';dom.resultBadge.classList.add('cleared');}
    else{dom.resultBadge.textContent='ROUND OVER';dom.resultBadge.classList.remove('cleared');}
    dom.resultWordsList.innerHTML='';
    if(!data.correctSubmissions.length){dom.resultWordsList.innerHTML='<span class="chips-empty">No words found</span>';}
    else{data.correctSubmissions.forEach(w=>{const c=document.createElement('span');c.className='word-chip';c.textContent=w.toUpperCase();dom.resultWordsList.appendChild(c);});}
    showScreen('result');
  }catch(err){ showFeedback(err.message,'error',3000); showScreen('result'); }
}

// ─────────────────────────────────────────────────────────────
// EVENTS
// ─────────────────────────────────────────────────────────────
dom.btnStart.addEventListener('click', startGame);
dom.btnSubmit.addEventListener('click', submitWord);
dom.wordInput.addEventListener('keydown', e=>{ if(e.key==='Enter')submitWord(); });
dom.wordInput.addEventListener('input',   e=>highlightLetters(e.target.value));
dom.btnHint.addEventListener('click', getHint);
dom.btnEnd.addEventListener('click', ()=>{ if(confirm('End game? Your score will be saved.'))endGame(); });
dom.btnPlayAgain.addEventListener('click', ()=>showScreen('start'));

// Music player controls
dom.btnPlay.addEventListener('click', ()=>Music.toggle());
dom.btnNext.addEventListener('click', ()=>Music.next());
dom.btnPrev.addEventListener('click', ()=>Music.prev());
dom.volSlider.addEventListener('input', e=>Music.setVolume(+e.target.value));

showScreen('start');