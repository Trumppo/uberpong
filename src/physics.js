export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function lerp(from, to, t) {
  return from + (to - from) * t;
}

export function reflectValue(value, min, max) {
  const range = max - min;
  if (range <= 0) return min;
  const span = range * 2;
  const rel = value - min;
  const mod = ((rel % span) + span) % span;
  const reflected = mod > range ? span - mod : mod;
  return min + reflected;
}
