const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const modeSelect = document.getElementById("modeSelect");
const startBtn = document.getElementById("startBtn");

const tempoValue = document.getElementById("tempoValue");
const comboValue = document.getElementById("comboValue");
const p1Score = document.getElementById("p1Score");
const p2Score = document.getElementById("p2Score");
const enduranceValue = document.getElementById("enduranceValue");
const bestValue = document.getElementById("bestValue");

const W = canvas.width;
const H = canvas.height;
const keys = new Set();

const game = {
  config: null,
  modeKey: "casual",
  mode: null,
  paddles: [],
  puck: null,
  scores: [0, 0],
  combo: 0,
  tempo: 0,
  rallyStart: performance.now(),
  enduranceCurrent: 0,
  enduranceBest: 0,
  lastScorer: 0,
  lastHitBy: 0,
  ended: false
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
  const angle = (Math.random() * 0.8 - 0.4);
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
  game.rallyStart = performance.now();
  game.lastHitBy = servingPlayer;
  game.puck = createPuck(servingPlayer);
  game.paddles.forEach((p) => {
    p.slapReady = false;
  });
}

function applyMode(modeKey) {
  game.modeKey = modeKey;
  game.mode = game.config.modes[modeKey];
  game.scores = [0, 0];
  game.enduranceCurrent = 0;
  game.enduranceBest = loadHighScore(modeKey);
  game.ended = false;
  game.paddles = createPaddles();
  resetRally(0);
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
  }

  const dir = playerIndex === 0 ? 1 : -1;
  game.puck.vx = Math.cos(angle) * nextSpeed * dir;
  game.puck.vy = Math.sin(angle) * nextSpeed;

  game.combo += 1;
  game.lastHitBy = playerIndex;
  game.tempo = clamp(game.tempo + 4.5, 0, 100);
}

function checkRiskZones() {
  for (const zone of game.config.riskZones) {
    if (
      game.puck.x + game.puck.r >= zone.x &&
      game.puck.x - game.puck.r <= zone.x + zone.w &&
      game.puck.y + game.puck.r >= zone.y &&
      game.puck.y - game.puck.r <= zone.y + zone.h
    ) {
      if (game.modeKey !== "endurance") {
        game.scores[game.lastHitBy] += game.mode.riskBonus;
      }
      const speed = Math.hypot(game.puck.vx, game.puck.vy);
      const boosted = clamp(speed * 1.04, game.mode.basePuckSpeed, game.mode.maxPuckSpeed * 1.2);
      const scale = boosted / (speed || 1);
      game.puck.vx *= scale;
      game.puck.vy *= scale;
      break;
    }
  }
}

function updatePaddles() {
  game.paddles.forEach((p) => {
    if (keys.has(p.upKey)) p.y -= p.speed;
    if (keys.has(p.downKey)) p.y += p.speed;
    p.y = clamp(p.y, 0, H - p.h);

    if (keys.has(p.slapKey) && performance.now() >= p.slapCooldownUntil) {
      p.slapReady = true;
    }
  });
}

function updatePuck() {
  game.puck.x += game.puck.vx;
  game.puck.y += game.puck.vy;

  if (game.puck.y - game.puck.r <= 0 || game.puck.y + game.puck.r >= H) {
    const wallBoost = 1 + (game.tempo / 100) * game.mode.wallBounceBoost;
    game.puck.vy *= -wallBoost;
    game.puck.vy = clamp(game.puck.vy, -game.mode.maxPuckSpeed, game.mode.maxPuckSpeed);
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
    return;
  }

  resetRally(scorer);
}

function update() {
  if (game.ended) return;

  updatePaddles();
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

function drawCourt() {
  ctx.clearRect(0, 0, W, H);

  const glow = Math.floor(30 + (game.tempo / 100) * 150);
  ctx.fillStyle = `rgb(${10 + glow / 12}, ${14 + glow / 14}, ${20 + glow / 10})`;
  ctx.fillRect(0, 0, W, H);

  for (const zone of game.config.riskZones) {
    ctx.fillStyle = "rgba(255, 196, 74, 0.26)";
    ctx.strokeStyle = "rgba(255, 196, 74, 0.9)";
    ctx.lineWidth = 2;
    ctx.fillRect(zone.x, zone.y, zone.w, zone.h);
    ctx.strokeRect(zone.x, zone.y, zone.w, zone.h);
  }

  ctx.strokeStyle = "rgba(255,255,255,0.2)";
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

  ctx.fillStyle = "rgba(235,242,250,0.82)";
  ctx.font = "bold 36px 'Segoe UI', sans-serif";
  ctx.fillText(String(game.scores[0]), W * 0.25, 56);
  ctx.fillText(String(game.scores[1]), W * 0.75, 56);

  if (game.ended) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 42px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`P${game.lastScorer + 1} voitti!`, W / 2, H / 2 - 10);
    ctx.font = "20px 'Segoe UI', sans-serif";
    ctx.fillText("Paina 'Aloita / Resetoi' pelataksesi uudelleen", W / 2, H / 2 + 28);
    ctx.textAlign = "start";
  }
}

function renderHud() {
  tempoValue.textContent = game.tempo.toFixed(0);
  comboValue.textContent = String(game.combo);
  p1Score.textContent = String(game.scores[0]);
  p2Score.textContent = String(game.scores[1]);
  enduranceValue.textContent = `${game.enduranceCurrent.toFixed(1)}s`;
  bestValue.textContent = `${game.enduranceBest.toFixed(1)}s`;
}

function loop() {
  update();
  drawCourt();
  drawObjects();
  renderHud();
  requestAnimationFrame(loop);
}

function setupInputs() {
  window.addEventListener("keydown", (ev) => {
    keys.add(ev.code);
    if (["ArrowUp", "ArrowDown", "Space"].includes(ev.code)) {
      ev.preventDefault();
    }
  });

  window.addEventListener("keyup", (ev) => {
    keys.delete(ev.code);
  });

  startBtn.addEventListener("click", () => {
    applyMode(modeSelect.value);
  });

  modeSelect.addEventListener("change", () => {
    applyMode(modeSelect.value);
  });
}

async function init() {
  const response = await fetch("./config/courts.json");
  game.config = await response.json();

  const keys = Object.keys(game.config.modes);
  keys.forEach((key) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = game.config.modes[key].label;
    modeSelect.appendChild(option);
  });

  modeSelect.value = "casual";
  applyMode("casual");
  setupInputs();
  loop();
}

init();
