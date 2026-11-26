// Easing curves for the board animations. Every input is clamped to 0 to 1.

function clamp01(t) {
  return Math.min(1, Math.max(0, t));
}

export function lerp(from, to, t) {
  return from + (to - from) * t;
}

/** Accelerates, then slows down. Used for walking and sliding, so motion never looks abrupt. */
export function easeInOutCubic(t) {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

/** Starts fast and settles gently. Used for ripples and other things that expand. */
export function easeOutCubic(t) {
  return 1 - (1 - clamp01(t)) ** 3;
}

/** 0 at both ends and 1 at the top of the arc. Used for hops, lifts and bumps. */
export function hopHeight(t) {
  return Math.sin(Math.PI * clamp01(t));
}

/** A gentle S curve. Used for climbing, where speed should barely change. */
export function easeInOutSine(t) {
  return (1 - Math.cos(Math.PI * clamp01(t))) / 2;
}

/**
 * Eases in, holds a steady speed, then eases out. Like something that slithers or rolls:
 * it picks up speed over the first `ramp` of the time, cruises, and slows over the last `ramp`.
 * Returns how far along the way it is, 0 to 1.
 */
export function cruise(t, ramp = 0.2) {
  const x = clamp01(t);
  const r = Math.min(0.5, Math.max(0.01, ramp));
  const top = 1 / (1 - r);
  if (x < r) return (top * x * x) / (2 * r);
  if (x > 1 - r) return 1 - (top * (1 - x) * (1 - x)) / (2 * r);
  return top * (r / 2 + (x - r));
}

/** Overshoots the target a little, then settles back. Used for things that pop out. */
export function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const x = clamp01(t) - 1;
  return 1 + c3 * x ** 3 + c1 * x ** 2;
}

/**
 * Squash and stretch for one hop, `t` from 0 to 1. The token flattens as it leaves and
 * lands, and stretches a little in the air. Returns horizontal and vertical scale (both 1 at rest).
 */
export function hopShape(t) {
  const x = clamp01(t);
  const edge = Math.min(x, 1 - x) / 0.14;
  if (edge < 1) {
    const squash = 1 - edge;
    return { sx: 1 + 0.16 * squash, sy: 1 - 0.2 * squash };
  }
  const air = Math.sin(Math.PI * x) * Math.min(1, edge - 1);
  return { sx: 1 - 0.05 * air, sy: 1 + 0.09 * air };
}
