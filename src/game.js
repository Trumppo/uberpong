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
const mobileControls = document.getElementById("mobileControls");

const W = canvas.width;
const H = canvas.height;
const keys = new Set();
const GAME_VERSION = { major: 1, minor: 2 };
const GAME_VERSION_LABEL = `v${GAME_VERSION.major}.${GAME_VERSION.minor}`;
const MUSIC_BPM = 168;
const MUSIC_STEP_MS = Math.round((60000 / MUSIC_BPM) / 4);
const MUSIC_ROOTS = [57, 57, 60, 60, 62, 62, 55, 55];
const MUSIC_LEAD = [0, 7, 12, 7, 2, 9, 14, 9, 4, 11, 16, 11, 2, 9, 14, 7];

const game = {
  config: null,
  modeKey: "casual",
  mode: null,
  opponent: "human",
  paddles: [],
  puck: null,
  particles: [],
  scores: [0, 0],
  combo: 0,
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
  audioCtx: null
};

function loadHighScore(modeKey) {
  const raw = localStorage.getItem(`uberpong_best_${modeKey}`);
  return raw ? Number(raw) || 0 : 0;
}

function saveHighScore(modeKey, value) {
  localStorage.setItem(`uberpong_best_${modeKey}`, String(value));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(from, to, t) {
  return from + (to - from) * t;
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
  } catch (_err) {
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
  } catch (_err) {
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
  } catch (_err) {
    // Ignore audio failures.
  }
}

function tickMusic() {
  const step = game.musicStep;
  game.musicStep += 1;

  const root = MUSIC_ROOTS[Math.floor(step / 4) % MUSIC_ROOTS.length];
  const leadOffset = MUSIC_LEAD[step % MUSIC_LEAD.length];

  if (step % 2 === 0) {
    playMusicTone(midiToFreq(root - 12), 0.16, "square", 0.02);
  }

  playMusicTone(midiToFreq(root + leadOffset), 0.11, step % 4 === 0 ? "triangle" : "square", 0.016);

  if (step % 8 === 4) {
    playMusicTone(midiToFreq(root + 12), 0.08, "sawtooth", 0.01);
  }
}

function ensureMusicLoop() {
  if (game.musicTimer !== null) return;
  game.musicTimer = window.setInterval(() => {
    if (!game.started || !game.musicEnabled) return;
    tickMusic();
  }, MUSIC_STEP_MS);
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
  game.tempo = 0;
  game.riskZoneActive = false;
  game.rallyStart = performance.now();
  game.lastHitBy = servingPlayer;
  game.puck = createPuck(servingPlayer);
  game.paddles.forEach((p) => {
    p.slapReady = false;
  });
  spawnParticles(W / 2, H / 2, "#9edcff", 20, 2.2);
}

function applyMode(modeKey, options = {}) {
  const { start = false } = options;
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
    spawnParticles(game.puck.x, game.puck.y, "#ffe66f", 22, 3.6);
    playTone(250, 0.08, "triangle", 0.07);
  }

  const dir = playerIndex === 0 ? 1 : -1;
  game.puck.vx = Math.cos(angle) * nextSpeed * dir;
  game.puck.vy = Math.sin(angle) * nextSpeed;

  game.combo += 1;
  game.lastHitBy = playerIndex;
  game.tempo = clamp(game.tempo + 4.5, 0, 100);

  spawnParticles(game.puck.x, game.puck.y, playerIndex === 0 ? "#5be0ff" : "#ff6e9c", 14, 2.6);
  playTone(440 + Math.min(game.combo, 12) * 16, 0.045, "square", 0.03);
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
        game.scores[game.lastHitBy] += 1;
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
    const range = Math.max(maxY - minY, 1);
    const timeToPaddle = (p2.x - game.puck.x) / game.puck.vx;
    let predictedY = game.puck.y;

    if (timeToPaddle > 0) {
      const rawY = game.puck.y + game.puck.vy * timeToPaddle;
      const rel = rawY - minY;
      const span = range * 2;
      const mod = ((rel % span) + span) % span;
      const reflected = mod > range ? span - mod : mod;
      predictedY = minY + reflected;
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

  if (game.scores[scorer] >= game.mode.pointsToWin) {
    game.ended = true;
    if (!game.victoryExplosionDone) {
      spawnVictoryExplosion(scorer);
      game.victoryExplosionDone = true;
    }
    return;
  }

  resetRally(scorer);
}

function update() {
  if (game.started && !game.ended) {
    updatePaddlesHuman();
    updatePaddleAI();
    updateTempo();
    updatePuck();
    checkRiskZones();

    if (game.modeKey === "endurance") {
      game.enduranceCurrent = (performance.now() - game.rallyStart) / 1000;
      if (game.enduranceCurrent > game.enduranceBest) {
        game.enduranceBest = game.enduranceCurrent;
        saveHighScore(game.modeKey, game.enduranceBest);
      }
    }
  }

  updateParticles();
}

function drawCourt() {
  ctx.clearRect(0, 0, W, H);

  const now = performance.now() * 0.001;
  const pulse = 0.12 + (game.tempo / 100) * 0.22;

  const rainbow = ctx.createLinearGradient(
    Math.cos(now * 0.3) * W * 0.35,
    0,
    W + Math.sin(now * 0.35) * W * 0.35,
    H
  );
  rainbow.addColorStop(0, `rgba(255, 70, 190, ${0.4 + pulse})`);
  rainbow.addColorStop(0.18, `rgba(255, 142, 76, ${0.33 + pulse})`);
  rainbow.addColorStop(0.36, `rgba(255, 225, 85, ${0.32 + pulse})`);
  rainbow.addColorStop(0.54, `rgba(116, 255, 125, ${0.3 + pulse})`);
  rainbow.addColorStop(0.72, `rgba(76, 223, 255, ${0.3 + pulse})`);
  rainbow.addColorStop(1, `rgba(158, 108, 255, ${0.38 + pulse})`);
  ctx.fillStyle = rainbow;
  ctx.fillRect(0, 0, W, H);

  const vignette = ctx.createRadialGradient(W / 2, H / 2, 80, W / 2, H / 2, W * 0.62);
  vignette.addColorStop(0, "rgba(10, 8, 26, 0.05)");
  vignette.addColorStop(1, "rgba(9, 7, 24, 0.5)");
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
    ctx.fillStyle = `hsla(${hue}, 98%, 66%, 0.28)`;
    ctx.strokeStyle = `hsla(${(hue + 55) % 360}, 100%, 76%, 0.96)`;
    ctx.lineWidth = 2;
    ctx.fillRect(zone.x, zone.y, zone.w, zone.h);
    ctx.strokeRect(zone.x, zone.y, zone.w, zone.h);
  });

  ctx.strokeStyle = "rgba(255,255,255,0.38)";
  ctx.setLineDash([8, 10]);
  ctx.beginPath();
  ctx.moveTo(W / 2, 0);
  ctx.lineTo(W / 2, H);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawObjects() {
  game.paddles.forEach((p) => {
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.w, p.h);

    if (p.slapReady) {
      ctx.strokeStyle = "#ffe66f";
      ctx.lineWidth = 3;
      ctx.strokeRect(p.x - 3, p.y - 3, p.w + 6, p.h + 6);
    }
  });

  ctx.fillStyle = game.puck.color;
  ctx.beginPath();
  ctx.arc(game.puck.x, game.puck.y, game.puck.r, 0, Math.PI * 2);
  ctx.fill();

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(91,224,255,0.95)";
  ctx.font = "700 15px 'Segoe UI', sans-serif";
  ctx.fillText("P1", W * 0.25, 24);
  ctx.fillStyle = "rgba(255,110,156,0.95)";
  ctx.fillText("P2", W * 0.75, 24);

  ctx.fillStyle = "rgba(235,242,250,0.9)";
  ctx.font = "bold 38px 'Segoe UI', sans-serif";
  ctx.fillText(String(game.scores[0]), W * 0.25, 56);
  ctx.fillText(String(game.scores[1]), W * 0.75, 56);
  ctx.textAlign = "start";

  if (game.ended) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 42px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`P${game.lastScorer + 1} voitti!`, W / 2, H / 2 - 10);
    ctx.font = "20px 'Segoe UI', sans-serif";
    ctx.fillText("Paina aloita / resetoi pelataksesi uudelleen", W / 2, H / 2 + 28);
    ctx.textAlign = "start";
  }

  if (!game.started) {
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 36px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Paina aloita / resetoi pelataksesi uudelleen", W / 2, H / 2);
    ctx.textAlign = "start";
  }

  // Keep particles visible over overlays so victory blast can fade out naturally.
  drawParticles();

  ctx.fillStyle = "rgba(245, 242, 255, 0.75)";
  ctx.font = "12px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(GAME_VERSION_LABEL, W / 2, H - 10);
  ctx.textAlign = "start";
}

function renderHud() {
  tempoValue.textContent = game.tempo.toFixed(0);
  comboValue.textContent = String(game.combo);
  p1Score.textContent = String(game.scores[0]);
  p2Score.textContent = String(game.scores[1]);
  enduranceValue.textContent = `${game.enduranceCurrent.toFixed(1)}s`;
  bestValue.textContent = `${game.enduranceBest.toFixed(1)}s`;
  aiState.textContent = game.opponent === "ai" ? "ON" : "OFF";
  sfxState.textContent = game.sfxEnabled ? "ON" : "OFF";
}

function loop() {
  update();
  drawCourt();
  drawObjects();
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
    applyMode(modeSelect.value, { start: true });
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

  mobileControls.querySelectorAll("button[data-hold]").forEach(bindHoldButton);
}

async function init() {
  const response = await fetch("./config/courts.json");
  game.config = await response.json();

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
  applyMode("casual", { start: false });
  setupInputs();
  loop();
}

init();
