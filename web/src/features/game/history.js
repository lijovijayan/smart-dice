// Undo and redo for the game. Pure functions only, so they can be tested without a page.
//
// A history keeps what came before (`past`, oldest first), what is showing now (`present`)
// and what was undone (`future`, the next redo first). A state is whatever the page needs to
// show a moment of the game: `{ game, moves, lastRoll }`. Histories are never changed in
// place, every function returns a new one.

export const MAX_HISTORY = 100;

/** A history that has only a starting point, so there is nothing to undo or redo. */
export function startHistory(present) {
  return { past: [], present, future: [] };
}

/** Adds a new state after the present one. Anything that had been undone is forgotten. */
export function record(history, next) {
  return {
    past: [...history.past, history.present].slice(-MAX_HISTORY),
    present: next,
    future: [],
  };
}

export function canUndo(history) {
  return history.past.length > 0;
}

export function canRedo(history) {
  return history.future.length > 0;
}

/** Steps back one state, or returns the same history when there is nothing to undo. */
export function undo(history) {
  if (!canUndo(history)) return history;
  return {
    past: history.past.slice(0, -1),
    present: history.past[history.past.length - 1],
    future: [history.present, ...history.future].slice(0, MAX_HISTORY),
  };
}

/** Steps forward one state, or returns the same history when there is nothing to redo. */
export function redo(history) {
  if (!canRedo(history)) return history;
  return {
    past: [...history.past, history.present].slice(-MAX_HISTORY),
    present: history.future[0],
    future: history.future.slice(1),
  };
}
