import { clamp, lerp, reflectValue } from "./physics.js";
import { getComboTier, getGoalSplashFrame, getTempoGainBoost } from "./spectacle.js";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const modeSelect = document.getElementById("modeSelect");
const opponentSelect = document.getElementById("opponentSelect");
const startBtn = document.getElementById("startBtn");

const tempoValue = document.getElementById("tempoValue");
const comboValue = document.getElementById("comboValue");
const p1Score = document.getElementById("p1Score");
const p2Score = document.getElementById("p2Score");
const enduranceValue = document.getElementById("enduranceValue");
const bestValue = document.getElementById("bestValue");
const aiState = document.getElementById("aiState");
const sfxState = document.getElementById("sfxState");
const songName = document.getElementById("songName");
const nextTrackBtn = document.getElementById("nextTrackBtn");
const uberFill = document.getElementById("uberFill");
const mobileControls = document.getElementById("mobileControls");

const W = canvas.width;
const H = canvas.height;
const keys = new Set();
const GAME_VERSION = { major: 2, minor: 0 };
const GAME_VERSION_LABEL = `v${GAME_VERSION.major}.${GAME_VERSION.minor}`;
const FONT_DISPLAY = "'Orbitron', 'Segoe UI', sans-serif";
const FONT_UI = "'Exo 2', 'Segoe UI', sans-serif";
const DEFAULT_MUSIC_CONFIG = {
  songs: [
    {
      id: "fallback",
      label: "Fallback",
      bpm: 168,
      roots: [57, 57, 60, 60, 62, 62, 55, 55],
      lead: [0, 7, 12, 7, 2, 9, 14, 9, 4, 11, 16, 11, 2, 9, 14, 7]
    }
  ]
};

const game = {
  config: null,
  modeKey: "casual",
  mode: null,
  opponent: "human",
  paddles: [],
  puck: null,
  puckTrail: [],
  impactRings: [],
  particles: [],
  scores: [0, 0],
  combo: 0,
  comboTier: 0,
  tempo: 0,
  rallyStart: performance.now(),
  enduranceCurrent: 0,
  enduranceBest: 0,
  lastScorer: 0,
  lastHitBy: 0,
  ended: false,
  started: false,
  riskZoneActive: false,
  victoryExplosionDone: false,
  sfxEnabled: true,
  musicEnabled: true,
  musicStep: 0,
  musicTimer: null,
  musicStepMs: 0,
  musicConfig: null,
  musicSong: null,
  audioCtx: null,
  shakePower: 0,
  flashAlpha: 0,
  hitFreezeFrames: 0,
  slowMoFrames: 0,
  slowMoTick: false,
  goalSplashTimer: 0,
  hudPulseTimers: new Map(),
  lastHud: {
    tempo: 0,
    combo: 0,
    p1: 0,
    p2: 0
  }
};

function loadHighScore(modeKey) {
  const raw = localStorage.getItem(`uberpong_best_${modeKey}`);
  return raw ? Number(raw) || 0 : 0;
}

function saveHighScore(modeKey, value) {
  localStorage.setItem(`uberpong_best_${modeKey}`, String(value));
}

function spawnParticles(x, y, color = "#ffffff", amount = 12, speed = 3) {
  for (let i = 0; i < amount; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const vel = (0.6 + Math.random()) * speed;
    game.particles.push({
      x,
      y,
      vx: Math.cos(angle) * vel,
      vy: Math.sin(angle) * vel,
      life: 30 + Math.random() * 18,
      color,
      size: 1 + Math.random() * 2.5
    });
  }
}

function updateParticles() {
  game.particles.forEach((p) => {
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.98;
    p.vy *= 0.98;
    p.life -= 1;
  });
  game.particles = game.particles.filter((p) => p.life > 0);
}

function drawParticles() {
  for (const p of game.particles) {
    const alpha = clamp(p.life / 48, 0, 1);
    ctx.fillStyle = `${p.color}${Math.floor(alpha * 255)
      .toString(16)
      .padStart(2, "0")}`;
    ctx.fillRect(p.x, p.y, p.size, p.size);
  }
}

function getAudioCtx() {
  if (!game.audioCtx) {
    game.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return game.audioCtx;
}

function resumeAudioContext() {
  try {
    const ctxAudio = getAudioCtx();
    if (ctxAudio.state === "suspended") {
      ctxAudio.resume();
    }
  } catch {
    // Ignore audio resume failures.
  }
}

function midiToFreq(midi) {
  return 440 * (2 ** ((midi - 69) / 12));
}

function playTone(freq = 440, duration = 0.06, type = "sine", gain = 0.05) {
  if (!game.sfxEnabled) return;
  try {
    const ctxAudio = getAudioCtx();
    const o = ctxAudio.createOscillator();
    const g = ctxAudio.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = gain;
    o.connect(g);
    g.connect(ctxAudio.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, ctxAudio.currentTime + duration);
    o.stop(ctxAudio.currentTime + duration);
  } catch {
    // Browser may block audio before first interaction.
  }
}

function playMusicTone(freq, duration = 0.1, type = "square", gain = 0.018) {
  if (!game.musicEnabled) return;
  try {
    const ctxAudio = getAudioCtx();
    const o = ctxAudio.createOscillator();
    const g = ctxAudio.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = gain;
    o.connect(g);
    g.connect(ctxAudio.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, ctxAudio.currentTime + duration);
    o.stop(ctxAudio.currentTime + duration);
  } catch {
    // Ignore audio failures.
  }
}

function getMusicStepMs(bpm) {
  const safeBpm = Number(bpm) > 0 ? Number(bpm) : 168;
  return Math.round((60000 / safeBpm) / 4);
}

function pickRandomSong() {
  const songs = game.musicConfig?.songs;
  if (!Array.isArray(songs) || songs.length === 0) return null;
  const idx = Math.floor(Math.random() * songs.length);
  return songs[idx];
}

function setMusicSong(song) {
  if (!song) return;
  game.musicSong = song;
  game.musicStep = 0;
  game.musicStepMs = getMusicStepMs(song.bpm);
  if (songName) {
    songName.textContent = song.label || song.id || "-";
  }
  if (game.musicTimer !== null) {
    window.clearInterval(game.musicTimer);
    game.musicTimer = null;
  }
  if (game.started && game.musicEnabled) {
    ensureMusicLoop();
  }
}

function randomizeMusicSong() {
  const song = pickRandomSong();
  if (song) {
    setMusicSong(song);
  }
}

function tickMusic() {
  if (!game.musicSong) return;
  const step = game.musicStep;
  game.musicStep += 1;
  const gainBoost = getTempoGainBoost(game.tempo);

  const roots = game.musicSong.roots || [];
  const lead = game.musicSong.lead || [];
  const root = roots.length ? roots[Math.floor(step / 4) % roots.length] : 57;
  const leadOffset = lead.length ? lead[step % lead.length] : 0;

  if (step % 2 === 0) {
    playMusicTone(midiToFreq(root - 12), 0.16, "square", 0.02 * gainBoost);
  }

  playMusicTone(
    midiToFreq(root + leadOffset),
    0.11,
    step % 4 === 0 ? "triangle" : "square",
    0.016 * gainBoost
  );

  if (step % 8 === 4) {
    playMusicTone(midiToFreq(root + 12), 0.08, "sawtooth", 0.01 * gainBoost);
  }
}

function ensureMusicLoop() {
  if (!game.musicSong) return;
  if (game.musicTimer !== null) return;
  const interval = game.musicStepMs || getMusicStepMs(game.musicSong?.bpm);
  game.musicTimer = window.setInterval(() => {
    if (!game.started || game.ended || !game.musicEnabled) return;
    tickMusic();
  }, interval);
}

function createPaddles() {
  return [
    {
      x: 24,
      y: H / 2 - 55,
      w: 14,
      h: 110,
      speed: 7,
      upKey: "KeyW",
      downKey: "KeyS",
      slapKey: "ShiftLeft",
      slapReady: false,
      slapCooldownUntil: 0,
      color: "#5be0ff"
    },
    {
      x: W - 38,
      y: H / 2 - 55,
      w: 14,
      h: 110,
      speed: 7,
      upKey: "ArrowUp",
      downKey: "ArrowDown",
      slapKey: "Enter",
      slapReady: false,
      slapCooldownUntil: 0,
      color: "#ff6e9c"
    }
  ];
}

function createPuck(servingPlayer = 0) {
  const dir = servingPlayer === 0 ? 1 : -1;
  const angle = Math.random() * 0.8 - 0.4;
  const speed = game.mode.basePuckSpeed;
  return {
    x: W / 2,
    y: H / 2,
    r: 10,
    vx: Math.cos(angle) * speed * dir,
    vy: Math.sin(angle) * speed,
    color: "#f6f7fb"
  };
}

function resetRally(servingPlayer = 0) {
  game.combo = 0;
  game.comboTier = 0;
  game.tempo = 0;
  game.riskZoneActive = false;
  game.rallyStart = performance.now();
  game.lastHitBy = servingPlayer;
  game.puck = createPuck(servingPlayer);
  game.puckTrail = [];
  game.impactRings = [];
  game.paddles.forEach((p) => {
    p.slapReady = false;
  });
  spawnParticles(W / 2, H / 2, "#9edcff", 20, 2.2);
  addFlash(0.2);
}

function applyMode(modeKey, options = {}) {
  const { start = false, randomizeSong = false } = options;
  game.modeKey = modeKey;
  game.mode = game.config.modes[modeKey];
  game.scores = [0, 0];
  game.enduranceCurrent = 0;
  game.enduranceBest = loadHighScore(modeKey);
  game.ended = false;
  game.victoryExplosionDone = false;
  game.musicStep = 0;
  game.started = start;
  game.particles = [];
  game.paddles = createPaddles();
  resetRally(0);
  if (randomizeSong) {
    randomizeMusicSong();
  }
  if (!start) {
    game.puck.vx = 0;
    game.puck.vy = 0;
  }
}

function updateTempo() {
  game.tempo = clamp(game.tempo + game.mode.tempoRamp, 0, 100);
}

function reflectFromPaddle(paddle, playerIndex) {
  const rel = (game.puck.y - (paddle.y + paddle.h / 2)) / (paddle.h / 2);
  const clampedRel = clamp(rel, -1, 1);
  const angle = clampedRel * 0.95;

  const speedNow = Math.hypot(game.puck.vx, game.puck.vy);
  const boost = 1 + (game.tempo / 100) * 0.35;
  let nextSpeed = speedNow * boost;
  nextSpeed = clamp(nextSpeed, game.mode.basePuckSpeed, game.mode.maxPuckSpeed);

  if (paddle.slapReady) {
    nextSpeed = clamp(nextSpeed * game.mode.slapMultiplier, game.mode.basePuckSpeed, game.mode.maxPuckSpeed * 1.3);
    paddle.slapReady = false;
    paddle.slapCooldownUntil = performance.now() + game.mode.slapCooldownMs;
    spawnParticles(game.puck.x, game.puck.y, "#ffe66f", 34, 4.2);
    playTone(250, 0.08, "triangle", 0.07);
    addShake(2.8 + (game.tempo / 100) * 2.2);
    addFlash(0.35 + (game.tempo / 100) * 0.2);
    game.hitFreezeFrames = Math.max(game.hitFreezeFrames, 2);
  }

  const dir = playerIndex === 0 ? 1 : -1;
  game.puck.vx = Math.cos(angle) * nextSpeed * dir;
  game.puck.vy = Math.sin(angle) * nextSpeed;

  game.combo += 1;
  game.lastHitBy = playerIndex;
  game.tempo = clamp(game.tempo + 4.5, 0, 100);

  const nextTier = getComboTier(game.combo);
  if (nextTier > game.comboTier) {
    game.comboTier = nextTier;
    onComboTierUp(nextTier, game.puck.x, game.puck.y);
  }

  spawnParticles(game.puck.x, game.puck.y, playerIndex === 0 ? "#5be0ff" : "#ff6e9c", 16, 2.6);
  spawnParticles(game.puck.x, game.puck.y, "#ffffff", 6, 4.6);
  playTone(440 + Math.min(game.combo, 12) * 16, 0.045, "square", 0.03);
  addShake(0.6 + (game.tempo / 100) * 1.2);
  addImpactRing(game.puck.x, game.puck.y, playerIndex === 0 ? "#5be0ff" : "#ff6e9c");
}

function checkRiskZones() {
  let inRiskZone = false;
  for (const zone of game.config.riskZones) {
    const overlaps =
      game.puck.x + game.puck.r >= zone.x &&
      game.puck.x - game.puck.r <= zone.x + zone.w &&
      game.puck.y + game.puck.r >= zone.y &&
      game.puck.y - game.puck.r <= zone.y + zone.h;
    if (!overlaps) continue;

    inRiskZone = true;
    if (!game.riskZoneActive) {
      if (game.modeKey !== "endurance") {
        const riskBonus = Number(game.mode.riskBonus ?? 1);
        if (riskBonus > 0) {
          game.scores[game.lastHitBy] += riskBonus;
        }
      }
      const speed = Math.hypot(game.puck.vx, game.puck.vy);
      const boosted = clamp(speed * 1.04, game.mode.basePuckSpeed, game.mode.maxPuckSpeed * 1.2);
      const scale = boosted / (speed || 1);
      game.puck.vx *= scale;
      game.puck.vy *= scale;
      spawnParticles(game.puck.x, game.puck.y, "#ffc24a", 16, 2.8);
      playTone(600, 0.03, "sawtooth", 0.03);
    }
    break;
  }
  game.riskZoneActive = inRiskZone;
}

function updatePaddlesHuman() {
  game.paddles.forEach((p, idx) => {
    if (game.opponent === "ai" && idx === 1) return;

    if (keys.has(p.upKey)) p.y -= p.speed;
    if (keys.has(p.downKey)) p.y += p.speed;
    p.y = clamp(p.y, 0, H - p.h);

    if (keys.has(p.slapKey) && performance.now() >= p.slapCooldownUntil) {
      p.slapReady = true;
    }
  });
}

function spawnVictoryExplosion(winner) {
  const loser = winner === 0 ? 1 : 0;
  const loserPaddle = game.paddles[loser];
  const cx = loserPaddle.x + loserPaddle.w / 2;
  const cy = loserPaddle.y + loserPaddle.h / 2;
  const colors = ["#ff4fd8", "#ff9f43", "#ffe14f", "#62ff8a", "#30d9ff", "#8d66ff", "#ffffff"];

  // Main blast: huge amount of particles launched from loser's paddle.
  for (let i = 0; i < 120; i += 1) {
    const c = colors[i % colors.length];
    const amount = 14 + Math.floor(Math.random() * 8);
    const speed = 4.4 + Math.random() * 3.8;
    spawnParticles(cx, cy, c, amount, speed);
  }

  // Secondary shockwaves across the field for a big victory finish.
  for (let i = 0; i < 42; i += 1) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const c = colors[(i + 3) % colors.length];
    spawnParticles(x, y, c, 8 + Math.floor(Math.random() * 7), 2.2 + Math.random() * 2.6);
  }

  spawnParticles(cx, cy, "#ffffff", 90, 7.2);
  spawnParticles(cx, cy, winner === 0 ? "#5be0ff" : "#ff6e9c", 80, 6.6);
  playTone(300, 0.07, "sawtooth", 0.08);
  playTone(450, 0.09, "square", 0.06);
  playTone(620, 0.11, "triangle", 0.05);
}

function updatePaddleAI() {
  if (game.opponent !== "ai") return;

  const p2 = game.paddles[1];
  const tempoT = clamp(game.tempo / 100, 0, 1);
  const comboT = clamp(game.combo / 18, 0, 1);
  const rallyT = clamp((performance.now() - game.rallyStart) / 12000, 0, 1);
  const intensity = clamp(0.25 + 0.35 * tempoT + 0.2 * comboT + 0.15 * rallyT, 0, 1);
  const reaction = lerp(0.06, 0.18, intensity);
  const maxStep = p2.speed * lerp(0.6, 1.15, intensity);
  let targetY = game.puck.y;

  if (game.puck.vx > 0) {
    const minY = game.puck.r;
    const maxY = H - game.puck.r;
    const timeToPaddle = (p2.x - game.puck.x) / game.puck.vx;
    let predictedY = game.puck.y;

    if (timeToPaddle > 0) {
      const rawY = game.puck.y + game.puck.vy * timeToPaddle;
      predictedY = reflectValue(rawY, minY, maxY);
    }

    const errorPx = lerp(28, 4, intensity);
    predictedY += (Math.random() * 2 - 1) * errorPx;
    targetY = lerp(game.puck.y, predictedY, intensity);
    p2.y += clamp((targetY - (p2.y + p2.h / 2)) * reaction, -maxStep, maxStep);
  } else {
    const neutral = lerp(H / 2, game.puck.y, 0.25 + 0.35 * intensity) - p2.h / 2;
    p2.y += clamp((neutral - p2.y) * 0.06, -maxStep * 0.6, maxStep * 0.6);
  }

  p2.y = clamp(p2.y, 0, H - p2.h);

  if (
    performance.now() >= p2.slapCooldownUntil &&
    game.puck.vx > 0 &&
    game.puck.x > W * 0.62
  ) {
    const slapWindow = lerp(0.18, 0.3, intensity);
    const fastPuck = Math.hypot(game.puck.vx, game.puck.vy) > lerp(7.5, 6.0, intensity);
    if (
      intensity > 0.45 &&
      fastPuck &&
      Math.abs(game.puck.y - (p2.y + p2.h / 2)) < p2.h * slapWindow
    ) {
      p2.slapReady = true;
    }
  }
}

function addShake(amount) {
  game.shakePower = Math.max(game.shakePower, amount);
}

function addFlash(amount) {
  game.flashAlpha = Math.max(game.flashAlpha, amount);
}

function updateSpectacle() {
  if (game.shakePower > 0) {
    game.shakePower *= 0.82;
    if (game.shakePower < 0.05) {
      game.shakePower = 0;
    }
  }
  if (game.flashAlpha > 0) {
    game.flashAlpha = Math.max(0, game.flashAlpha - 0.06);
  }
  if (game.goalSplashTimer > 0) {
    game.goalSplashTimer -= 1;
  }
}

function updatePuckTrail() {
  if (!game.started || game.ended || !game.puck) return;
  const hueBase = (190 + game.tempo * 1.2 + performance.now() * 0.04) % 360;
  const speed = Math.hypot(game.puck.vx, game.puck.vy);
  game.puckTrail.push({
    x: game.puck.x,
    y: game.puck.y,
    life: 1,
    hue: hueBase,
    size: 3.6 + speed * 0.2
  });
  game.puckTrail = game.puckTrail
    .map((point) => ({
      x: point.x,
      y: point.y,
      life: point.life - 0.07,
      hue: point.hue,
      size: point.size
    }))
    .filter((point) => point.life > 0);
  if (game.puckTrail.length > 34) {
    game.puckTrail.shift();
  }
}

function drawPuckTrail() {
  for (let i = 0; i < game.puckTrail.length; i += 1) {
    const point = game.puckTrail[i];
    const alpha = clamp(point.life, 0, 1);
    const hue = (point.hue + i * 4) % 360;
    ctx.fillStyle = `hsla(${hue}, 100%, 72%, ${alpha * 0.75})`;
    ctx.beginPath();
    ctx.arc(point.x, point.y, point.size + i * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }
}

function onComboTierUp(tier, x, y) {
  const colors = ["#30d9ff", "#8d66ff", "#ff4fd8", "#ffe14f"];
  const color = colors[Math.max(0, tier - 1) % colors.length];
  spawnParticles(x, y, color, 36 + tier * 6, 4.2 + tier * 0.35);
  addFlash(0.28 + tier * 0.06);
  addShake(2 + tier * 0.6);
  playTone(520 + tier * 90, 0.08, "triangle", 0.07);
}

function addImpactRing(x, y, color) {
  const ringColors = [color, "#ffffff", "#ffe14f"];
  ringColors.forEach((ringColor, idx) => {
    game.impactRings.push({
      x,
      y,
      r: 8 + idx * 4,
      life: 1,
      color: ringColor,
      width: 2 + idx
    });
  });
}

function updateImpactRings() {
  game.impactRings = game.impactRings
    .map((ring) => ({
      x: ring.x,
      y: ring.y,
      r: ring.r + 3.4,
      life: ring.life - 0.08,
      color: ring.color,
      width: ring.width
    }))
    .filter((ring) => ring.life > 0);
  if (game.impactRings.length > 18) {
    game.impactRings.shift();
  }
}

function drawImpactRings() {
  for (const ring of game.impactRings) {
    ctx.strokeStyle = `${ring.color}${Math.floor(ring.life * 200)
      .toString(16)
      .padStart(2, "0")}`;
    ctx.lineWidth = ring.width || 2;
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawGoalSplash() {
  if (game.goalSplashTimer <= 0) return;
  const { alpha, scale } = getGoalSplashFrame(game.goalSplashTimer, 42);
  ctx.save();
  ctx.translate(W / 2, H / 2 - 80);
  ctx.scale(scale, scale);
  ctx.textAlign = "center";
  ctx.font = `700 66px ${FONT_DISPLAY}`;
  ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
  ctx.shadowColor = `rgba(255, 79, 216, ${alpha * 0.9})`;
  ctx.shadowBlur = 24;
  ctx.fillText("UBER GOAL!", 0, 0);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = `rgba(76, 223, 255, ${alpha * 0.9})`;
  ctx.lineWidth = 4;
  ctx.strokeText("UBER GOAL!", 0, 0);
  ctx.restore();
}

function updatePuck() {
  game.puck.x += game.puck.vx;
  game.puck.y += game.puck.vy;

  if (game.puck.y - game.puck.r <= 0 || game.puck.y + game.puck.r >= H) {
    const wallBoost = 1 + (game.tempo / 100) * game.mode.wallBounceBoost;
    game.puck.vy *= -wallBoost;
    game.puck.vy = clamp(game.puck.vy, -game.mode.maxPuckSpeed, game.mode.maxPuckSpeed);
    spawnParticles(game.puck.x, clamp(game.puck.y, 0, H), "#9ac6ff", 10, 2.2);
    playTone(320, 0.02, "triangle", 0.02);
  }

  const p1 = game.paddles[0];
  const p2 = game.paddles[1];

  if (
    game.puck.vx < 0 &&
    game.puck.x - game.puck.r <= p1.x + p1.w &&
    game.puck.y >= p1.y &&
    game.puck.y <= p1.y + p1.h
  ) {
    game.puck.x = p1.x + p1.w + game.puck.r;
    reflectFromPaddle(p1, 0);
  }

  if (
    game.puck.vx > 0 &&
    game.puck.x + game.puck.r >= p2.x &&
    game.puck.y >= p2.y &&
    game.puck.y <= p2.y + p2.h
  ) {
    game.puck.x = p2.x - game.puck.r;
    reflectFromPaddle(p2, 1);
  }

  if (game.puck.x < -40) {
    onGoal(1);
  }
  if (game.puck.x > W + 40) {
    onGoal(0);
  }
}

function onGoal(scorer) {
  spawnParticles(game.puck.x, game.puck.y, scorer === 0 ? "#5be0ff" : "#ff6e9c", 26, 4.4);
  playTone(scorer === 0 ? 220 : 180, 0.13, "square", 0.06);
  addShake(3.5);
  addFlash(0.25);
  game.goalSplashTimer = 42;
  game.slowMoFrames = 12;
  game.slowMoTick = false;

  const confetti = ["#30d9ff", "#8d66ff", "#ff4fd8", "#ffe14f", "#62ff8a"];
  for (let i = 0; i < 6; i += 1) {
    const cx = Math.random() * W;
    const cy = Math.random() * H;
    const c = confetti[i % confetti.length];
    spawnParticles(cx, cy, c, 14, 3.8);
  }

  if (game.modeKey === "endurance") {
    game.enduranceCurrent = (performance.now() - game.rallyStart) / 1000;
    if (game.enduranceCurrent > game.enduranceBest) {
      game.enduranceBest = game.enduranceCurrent;
      saveHighScore(game.modeKey, game.enduranceBest);
    }
    resetRally(scorer);
    return;
  }

  game.scores[scorer] += 1;
  game.lastScorer = scorer;

  const lead = Math.abs(game.scores[0] - game.scores[1]);
  const reachedThreshold =
    game.scores[0] >= game.mode.pointsToWin || game.scores[1] >= game.mode.pointsToWin;
  if (reachedThreshold && lead >= 2) {
    const winner = game.scores[0] > game.scores[1] ? 0 : 1;
    game.ended = true;
    game.lastScorer = winner;
    if (!game.victoryExplosionDone) {
      spawnVictoryExplosion(winner);
      game.victoryExplosionDone = true;
    }
    playTone(720, 0.12, "sawtooth", 0.08);
    playTone(520, 0.18, "triangle", 0.06);
    return;
  }

  resetRally(scorer);
}

function update() {
  if (game.hitFreezeFrames > 0) {
    game.hitFreezeFrames -= 1;
    updateParticles();
    updateImpactRings();
    updateSpectacle();
    return;
  }

  if (game.slowMoFrames > 0) {
    game.slowMoFrames -= 1;
    game.slowMoTick = !game.slowMoTick;
    if (!game.slowMoTick) {
      updateParticles();
      updateImpactRings();
      updateSpectacle();
      return;
    }
  }

  if (game.started && !game.ended) {
    updatePaddlesHuman();
    updatePaddleAI();
    updateTempo();
    updatePuck();
    checkRiskZones();
    updatePuckTrail();
    updateImpactRings();

    if (game.modeKey === "endurance") {
      game.enduranceCurrent = (performance.now() - game.rallyStart) / 1000;
      if (game.enduranceCurrent > game.enduranceBest) {
        game.enduranceBest = game.enduranceCurrent;
        saveHighScore(game.modeKey, game.enduranceBest);
      }
    }
  }

  updateParticles();
  updateImpactRings();
  updateSpectacle();
}

function drawCourt() {
  ctx.clearRect(0, 0, W, H);

  const now = performance.now() * 0.001;
  const tempoT = game.tempo / 100;
  const pulse = 0.12 + tempoT * 0.32 + Math.sin(now * 3.4) * (0.06 + tempoT * 0.1);

  const base = ctx.createLinearGradient(0, 0, W, H);
  base.addColorStop(0, "rgba(9, 6, 22, 1)");
  base.addColorStop(0.45, "rgba(18, 10, 38, 1)");
  base.addColorStop(1, "rgba(10, 8, 28, 1)");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  const centerGlow = ctx.createRadialGradient(W * 0.5, H * 0.45, 40, W * 0.5, H * 0.45, W * 0.65);
  centerGlow.addColorStop(0, `rgba(76, 223, 255, ${0.18 + pulse})`);
  centerGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = centerGlow;
  ctx.fillRect(0, 0, W, H);

  const leftGlow = ctx.createRadialGradient(0, H * 0.2, 20, 0, H * 0.2, W * 0.5);
  leftGlow.addColorStop(0, `rgba(255, 79, 216, ${0.12 + pulse * 0.8})`);
  leftGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = leftGlow;
  ctx.fillRect(0, 0, W, H);

  const rightGlow = ctx.createRadialGradient(W, H * 0.8, 20, W, H * 0.8, W * 0.55);
  rightGlow.addColorStop(0, `rgba(255, 217, 61, ${0.12 + pulse * 0.7})`);
  rightGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = rightGlow;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  const rainbow = ctx.createLinearGradient(
    Math.cos(now * 0.3) * W * 0.35,
    0,
    W + Math.sin(now * 0.35) * W * 0.35,
    H
  );
  rainbow.addColorStop(0, `rgba(255, 70, 190, ${0.32 + pulse})`);
  rainbow.addColorStop(0.18, `rgba(255, 142, 76, ${0.28 + pulse})`);
  rainbow.addColorStop(0.36, `rgba(255, 225, 85, ${0.26 + pulse})`);
  rainbow.addColorStop(0.54, `rgba(116, 255, 125, ${0.24 + pulse})`);
  rainbow.addColorStop(0.72, `rgba(76, 223, 255, ${0.24 + pulse})`);
  rainbow.addColorStop(1, `rgba(158, 108, 255, ${0.32 + pulse})`);
  ctx.fillStyle = rainbow;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.globalAlpha = 0.12 + tempoT * 0.12;
  ctx.translate(-W * 0.2, 0);
  ctx.rotate(-Math.PI / 12);
  for (let i = 0; i < 5; i += 1) {
    const x = ((now * 80 + i * 220) % (W * 1.6)) - W * 0.3;
    ctx.fillStyle = "rgba(120, 255, 255, 0.18)";
    ctx.fillRect(x, -H, 120, H * 2);
  }
  ctx.restore();

  const vignette = ctx.createRadialGradient(W / 2, H / 2, 80, W / 2, H / 2, W * 0.62);
  vignette.addColorStop(0, `rgba(10, 8, 26, ${0.05 + tempoT * 0.08})`);
  vignette.addColorStop(1, `rgba(9, 7, 24, ${0.5 + tempoT * 0.16})`);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);

  for (let i = 0; i < 24; i += 1) {
    const sx = (i * 97 + now * 70) % W;
    const sy = (i * 57 + now * 40) % H;
    const twinkle = 0.25 + ((Math.sin(now * 2.2 + i) + 1) / 2) * 0.45;
    ctx.fillStyle = `rgba(255,255,255,${twinkle})`;
    ctx.fillRect(sx, sy, 2, 2);
  }

  game.config.riskZones.forEach((zone, idx) => {
    const hue = (now * 90 + idx * 80) % 360;
    const glow = 0.22 + tempoT * 0.28 + Math.sin(now * 4 + idx) * 0.12;
    const field = ctx.createLinearGradient(zone.x, zone.y, zone.x + zone.w, zone.y + zone.h);
    field.addColorStop(0, `hsla(${hue}, 100%, 70%, ${0.18 + glow})`);
    field.addColorStop(1, `hsla(${(hue + 60) % 360}, 100%, 72%, ${0.32 + glow})`);
    ctx.fillStyle = field;
    ctx.fillRect(zone.x, zone.y, zone.w, zone.h);

    ctx.save();
    ctx.strokeStyle = `hsla(${(hue + 55) % 360}, 100%, 76%, ${0.7 + glow})`;
    ctx.lineWidth = 2 + tempoT * 1.8;
    ctx.shadowColor = `hsla(${(hue + 55) % 360}, 100%, 76%, ${0.6 + glow})`;
    ctx.shadowBlur = 12 + tempoT * 10;
    ctx.setLineDash([8, 10]);
    ctx.lineDashOffset = -now * 40;
    ctx.strokeRect(zone.x, zone.y, zone.w, zone.h);
    ctx.restore();
  });

  ctx.strokeStyle = "rgba(255,255,255,0.38)";
  ctx.setLineDash([8, 10]);
  ctx.beginPath();
  ctx.moveTo(W / 2, 0);
  ctx.lineTo(W / 2, H);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = "rgba(5, 4, 12, 0.6)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let y = 0; y < H; y += 4) {
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawObjects() {
  game.paddles.forEach((p) => {
    ctx.save();
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 18 + game.tempo * 0.25;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.restore();

    if (p.slapReady) {
      const glow = 0.4 + (game.tempo / 100) * 0.6;
      ctx.strokeStyle = `rgba(255, 230, 111, ${glow})`;
      ctx.lineWidth = 3;
      ctx.strokeRect(p.x - 3, p.y - 3, p.w + 6, p.h + 6);
      ctx.strokeStyle = `rgba(255, 160, 80, ${glow * 0.7})`;
      ctx.lineWidth = 6;
      ctx.strokeRect(p.x - 6, p.y - 6, p.w + 12, p.h + 12);
    }
  });

  drawImpactRings();
  drawPuckTrail();
  const glow = ctx.createRadialGradient(
    game.puck.x,
    game.puck.y,
    2,
    game.puck.x,
    game.puck.y,
    game.puck.r * 4.2
  );
  const glowHue = (200 + game.tempo * 1.4) % 360;
  glow.addColorStop(0, `hsla(${glowHue}, 100%, 80%, 0.9)`);
  glow.addColorStop(0.4, `hsla(${glowHue}, 100%, 70%, 0.5)`);
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(game.puck.x, game.puck.y, game.puck.r * 3.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = game.puck.color;
  ctx.beginPath();
  ctx.arc(game.puck.x, game.puck.y, game.puck.r, 0, Math.PI * 2);
  ctx.fill();

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(91,224,255,0.95)";
  ctx.font = `700 15px ${FONT_DISPLAY}`;
  ctx.shadowColor = "rgba(91, 224, 255, 0.6)";
  ctx.shadowBlur = 12;
  ctx.fillText("P1", W * 0.25, 24);
  ctx.fillStyle = "rgba(255,110,156,0.95)";
  ctx.fillText("P2", W * 0.75, 24);
  ctx.shadowBlur = 0;

  ctx.fillStyle = "rgba(235,242,250,0.92)";
  ctx.font = `700 42px ${FONT_DISPLAY}`;
  ctx.shadowColor = "rgba(158, 108, 255, 0.5)";
  ctx.shadowBlur = 16;
  ctx.fillText(String(game.scores[0]), W * 0.25, 56);
  ctx.fillText(String(game.scores[1]), W * 0.75, 56);
  ctx.textAlign = "start";
  ctx.shadowBlur = 0;

  if (game.ended) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 42px ${FONT_DISPLAY}`;
    ctx.textAlign = "center";
    ctx.fillText(`P${game.lastScorer + 1} voitti!`, W / 2, H / 2 - 10);
    ctx.font = `20px ${FONT_UI}`;
    ctx.fillText("Paina aloita / resetoi pelataksesi uudelleen", W / 2, H / 2 + 28);
    ctx.textAlign = "start";
  }

  if (!game.started) {
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 36px ${FONT_DISPLAY}`;
    ctx.textAlign = "center";
    ctx.fillText("Paina aloita / resetoi pelataksesi uudelleen", W / 2, H / 2);
    ctx.textAlign = "start";
  }

  // Keep particles visible over overlays so victory blast can fade out naturally.
  drawParticles();
  drawGoalSplash();

  ctx.fillStyle = "rgba(245, 242, 255, 0.75)";
  ctx.font = `12px ${FONT_UI}`;
  ctx.textAlign = "center";
  ctx.fillText(GAME_VERSION_LABEL, W / 2, H - 10);
  ctx.textAlign = "start";
}

function pulseHud(el) {
  if (!el) return;
  const existing = game.hudPulseTimers.get(el);
  if (existing) window.clearTimeout(existing);
  el.classList.remove("hud-pulse");
  window.requestAnimationFrame(() => {
    el.classList.add("hud-pulse");
  });
  const timer = window.setTimeout(() => {
    el.classList.remove("hud-pulse");
    game.hudPulseTimers.delete(el);
  }, 240);
  game.hudPulseTimers.set(el, timer);
}

function renderHud() {
  const tempoNow = Math.round(game.tempo);
  const comboNow = game.combo;
  const p1Now = game.scores[0];
  const p2Now = game.scores[1];

  tempoValue.textContent = String(tempoNow);
  comboValue.textContent = String(comboNow);
  p1Score.textContent = String(p1Now);
  p2Score.textContent = String(p2Now);

  if (tempoNow !== game.lastHud.tempo) {
    pulseHud(tempoValue);
    game.lastHud.tempo = tempoNow;
  }
  if (comboNow !== game.lastHud.combo) {
    pulseHud(comboValue);
    game.lastHud.combo = comboNow;
  }
  if (p1Now !== game.lastHud.p1) {
    pulseHud(p1Score);
    game.lastHud.p1 = p1Now;
  }
  if (p2Now !== game.lastHud.p2) {
    pulseHud(p2Score);
    game.lastHud.p2 = p2Now;
  }
  enduranceValue.textContent = `${game.enduranceCurrent.toFixed(1)}s`;
  bestValue.textContent = `${game.enduranceBest.toFixed(1)}s`;
  aiState.textContent = game.opponent === "ai" ? "ON" : "OFF";
  sfxState.textContent = game.sfxEnabled ? "ON" : "OFF";
  if (uberFill) {
    const fill = clamp(game.tempo, 0, 100);
    uberFill.style.width = `${fill}%`;
    uberFill.classList.toggle("is-hot", fill >= 90);
  }
}

function loop() {
  update();
  const shake = game.shakePower;
  const shakeX = shake ? (Math.random() * 2 - 1) * shake : 0;
  const shakeY = shake ? (Math.random() * 2 - 1) * shake : 0;
  const zoom = game.goalSplashTimer > 0 ? 1 + (game.goalSplashTimer / 42) * 0.012 : 1;

  ctx.save();
  ctx.translate(shakeX, shakeY);
  if (zoom !== 1) {
    ctx.translate(W / 2, H / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-W / 2, -H / 2);
  }
  drawCourt();
  drawObjects();
  if (game.flashAlpha > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${game.flashAlpha})`;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
  renderHud();
  requestAnimationFrame(loop);
}

function bindHoldButton(btn) {
  const code = btn.dataset.hold;
  if (!code) return;

  const down = (ev) => {
    ev.preventDefault();
    resumeAudioContext();
    keys.add(code);
    playTone(520, 0.02, "sine", 0.01);
  };
  const up = (ev) => {
    ev.preventDefault();
    keys.delete(code);
  };

  btn.addEventListener("touchstart", down, { passive: false });
  btn.addEventListener("touchend", up, { passive: false });
  btn.addEventListener("touchcancel", up, { passive: false });
  btn.addEventListener("mousedown", down);
  btn.addEventListener("mouseup", up);
  btn.addEventListener("mouseleave", up);
}

function setupInputs() {
  window.addEventListener("keydown", (ev) => {
    resumeAudioContext();
    keys.add(ev.code);
    if (["ArrowUp", "ArrowDown", "Space"].includes(ev.code)) {
      ev.preventDefault();
    }
    if (ev.code === "KeyM") {
      game.sfxEnabled = !game.sfxEnabled;
    }
    if (ev.code === "KeyB") {
      game.musicEnabled = !game.musicEnabled;
    }
  });

  window.addEventListener("keyup", (ev) => {
    keys.delete(ev.code);
  });

  startBtn.addEventListener("click", () => {
    resumeAudioContext();
    applyMode(modeSelect.value, { start: true, randomizeSong: true });
    ensureMusicLoop();
  });

  modeSelect.addEventListener("change", () => {
    applyMode(modeSelect.value, { start: false });
  });

  opponentSelect.addEventListener("change", () => {
    game.opponent = opponentSelect.value;
    applyMode(modeSelect.value, { start: false });
  });

  sfxState.style.cursor = "pointer";
  sfxState.addEventListener("click", () => {
    game.sfxEnabled = !game.sfxEnabled;
  });

  nextTrackBtn.addEventListener("click", () => {
    randomizeMusicSong();
  });

  mobileControls.querySelectorAll("button[data-hold]").forEach(bindHoldButton);
}

async function init() {
  const [courtsResponse, musicResponse] = await Promise.all([
    fetch("./config/courts.json"),
    fetch("./config/music.json")
  ]);
  game.config = await courtsResponse.json();
  try {
    game.musicConfig = await musicResponse.json();
  } catch {
    game.musicConfig = DEFAULT_MUSIC_CONFIG;
  }
  if (!game.musicConfig || !Array.isArray(game.musicConfig.songs)) {
    game.musicConfig = DEFAULT_MUSIC_CONFIG;
  }

  const modeKeys = Object.keys(game.config.modes);
  modeKeys.forEach((key) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = game.config.modes[key].label;
    modeSelect.appendChild(option);
  });

  modeSelect.value = "casual";
  opponentSelect.value = "human";
  game.opponent = opponentSelect.value;
  randomizeMusicSong();
  applyMode("casual", { start: false });
  setupInputs();
  loop();
}

init();
