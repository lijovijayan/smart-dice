// Pure motion helpers for the die scene. No Three.js in here, so they are easy to test.

const MIN_GRAVITY_G = 0.35;
const HOP_GRAVITY = 26;
const HOP_RESTITUTION = 0.4;

/** Upward speed given to the die when a roll lands. */
export const HOP_IMPULSE = 4.4;

/** Keeps `value` between `min` and `max`. */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Moves `current` toward `target`, the same way at any frame rate.
 * A higher `rate` gets there faster.
 */
export function approach(current, target, dt, rate) {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

/**
 * Converts a sensor gravity reading (in g) to the "up" direction in scene space.
 * Sensor +X is scene +X, sensor +Z is scene +Y, and sensor +Y is scene -Z.
 * Returns null when the reading is too weak to trust (free fall) or not a number.
 * @returns {[number, number, number] | null}
 */
export function sensorToSceneUp(ax, ay, az) {
  const length = Math.hypot(ax, ay, az);
  if (!(length >= MIN_GRAVITY_G)) return null;
  return [ax / length, az / length, -ay / length];
}

/**
 * One physics step of the landing hop: a small bounce that settles.
 * `y` is the height above rest and `vy` its speed.
 */
export function stepHop({ y, vy }, dt) {
  let nextVy = vy - HOP_GRAVITY * dt;
  let nextY = y + nextVy * dt;
  if (nextY <= 0) {
    nextY = 0;
    const restSpeed = HOP_GRAVITY * dt * 2;
    nextVy = Math.abs(nextVy) > restSpeed ? -nextVy * HOP_RESTITUTION : 0;
  }
  return { y: nextY, vy: nextVy };
}
