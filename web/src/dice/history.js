// Rules for what counts as a roll, and the list of recent rolls.

import { NO_FACE } from './faces.js';

export const MAX_ROLLS = 12;

/**
 * True when `next` is a newly settled face compared with `prev`:
 * the die just became stable, or it is stable on a different face.
 */
export function isNewRoll(prev, next) {
  if (!next.stable || next.face === NO_FACE) return false;
  return !prev.stable || prev.face !== next.face;
}

/** Returns a new list with `face` first, keeping at most MAX_ROLLS entries. */
export function addRoll(rolls, face) {
  return [face, ...rolls].slice(0, MAX_ROLLS);
}
