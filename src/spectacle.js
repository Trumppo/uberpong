import { clamp } from "./physics.js";

export function getComboTier(combo) {
  if (combo >= 20) return 4;
  if (combo >= 15) return 3;
  if (combo >= 10) return 2;
  if (combo >= 5) return 1;
  return 0;
}

export function getTempoGainBoost(tempo) {
  const tempoT = clamp(tempo / 100, 0, 1);
  return 0.8 + tempoT * 0.6;
}

export function getGoalSplashFrame(timer, total = 42) {
  if (timer <= 0 || total <= 0) {
    return { alpha: 0, scale: 1 };
  }
  const t = timer / total;
  const alpha = Math.min(1, t * 2);
  const scale = 1 + (1 - t) * 0.08;
  return { alpha, scale };
}
