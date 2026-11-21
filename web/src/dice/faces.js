// Face numbering shared by the 3D cube, the panel, and demo mode.
// Opposite faces add up to 7. Board top (+Z) is face 1.

export const FACE_NUMBERS = Object.freeze([1, 2, 3, 4, 5, 6]);

/** Face numbers read from the board's upper-face byte. 0 means "no clear face". */
export const NO_FACE = 0;

/** Accent color for each face. */
export const FACE_COLORS = Object.freeze({
  1: '#4f7cff',
  2: '#ff5d5d',
  3: '#34c98b',
  4: '#2bc4c4',
  5: '#a877ff',
  6: '#f2a13a',
});

/** Color used when no face is known. */
export const FACE_NEUTRAL_COLOR = '#8a96ab';

/** Gravity reading (in g, sensor axes) when each face is up. Used by demo mode. */
export const FACE_GRAVITY = Object.freeze({
  1: [0, 0, 1],
  2: [1, 0, 0],
  3: [0, 1, 0],
  4: [0, -1, 0],
  5: [-1, 0, 0],
  6: [0, 0, -1],
});

/** Pip positions per face as [column, row] on a 3 by 3 grid (0 to 2). */
export const FACE_PIPS = Object.freeze({
  1: [[1, 1]],
  2: [
    [0, 0],
    [2, 2],
  ],
  3: [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  4: [
    [0, 0],
    [2, 0],
    [0, 2],
    [2, 2],
  ],
  5: [
    [0, 0],
    [2, 0],
    [1, 1],
    [0, 2],
    [2, 2],
  ],
  6: [
    [0, 0],
    [2, 0],
    [0, 1],
    [2, 1],
    [0, 2],
    [2, 2],
  ],
});

/** True for 1 to 6. */
export function isFaceNumber(value) {
  return FACE_NUMBERS.includes(value);
}

/** Maps a raw byte from the board to a face. Anything unknown becomes NO_FACE. */
export function toFace(value) {
  return isFaceNumber(value) ? value : NO_FACE;
}

/** Accent color for a face, or the neutral color for NO_FACE. */
export function faceColor(face) {
  return isFaceNumber(face) ? FACE_COLORS[face] : FACE_NEUTRAL_COLOR;
}
