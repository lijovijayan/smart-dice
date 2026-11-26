// Saves the game in the browser so a refresh or a closed tab does not lose it.
//
// localStorage is enough here: the whole game is a few kilobytes, and reading it is
// instant, so the page can draw the right board on the first frame. Nothing from storage
// is trusted. A saved game that is damaged, from an unknown layout, or edited by hand is
// dropped and a fresh game starts.
//
// Layout 2 adds the undo history and the player names. Layout 1 games are still read, with
// an empty history, because their move list was plain text.

import { MAX_HISTORY } from './history.js';
import { cleanName, defaultCustomNames } from './players.js';
import { LAST_SQUARE, MAX_PLAYERS, MIN_PLAYERS } from './rules.js';

export const STORAGE_KEY = 'smart-dice:game';
export const STORAGE_VERSION = 2;
export const MAX_SAVED_MOVES = 8;
const MOVE_KINDS = ['none', 'ladder', 'snake', 'blocked'];

/**
 * One moment of the game.
 * @typedef {object} SavedState
 * @property {{ positions: number[], turn: number, winner: number | null }} game
 * @property {SavedMove[]} moves     newest first
 * @property {{ player: number, face: number } | null} lastRoll
 *
 * @typedef {object} SavedMove
 * @property {number} player
 * @property {number} roll
 * @property {number} from
 * @property {number} landed
 * @property {number} to
 * @property {'none' | 'ladder' | 'snake' | 'blocked'} kind
 * @property {boolean} won
 *
 * What gets saved: the present state, the history around it and the player names.
 * @typedef {SavedState & { past: SavedState[], future: SavedState[], names: string[] }} SavedGame
 */

function isInteger(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

function isObject(value) {
  return typeof value === 'object' && value !== null;
}

function sanitizeMove(raw, count) {
  if (!isObject(raw)) return null;
  const { player, roll, from, landed, to, kind, won } = raw;
  const ok =
    isInteger(player, 0, count - 1) &&
    isInteger(roll, 1, 6) &&
    isInteger(from, 0, LAST_SQUARE) &&
    isInteger(landed, 0, LAST_SQUARE) &&
    isInteger(to, 0, LAST_SQUARE) &&
    MOVE_KINDS.includes(kind) &&
    typeof won === 'boolean';
  return ok ? { player, roll, from, landed, to, kind, won } : null;
}

/**
 * Checks one state. Returns it clean, or null when anything is wrong. When `expectedCount`
 * is given, a state for a different number of players is wrong too.
 */
function sanitizeState(raw, expectedCount = null) {
  if (!isObject(raw)) return null;
  const { game, moves, lastRoll } = raw;
  if (!isObject(game)) return null;

  const { positions, turn, winner } = game;
  if (!Array.isArray(positions) || !isInteger(positions.length, MIN_PLAYERS, MAX_PLAYERS)) return null;
  if (!positions.every((square) => isInteger(square, 0, LAST_SQUARE))) return null;
  const count = positions.length;
  if (expectedCount !== null && count !== expectedCount) return null;
  if (!isInteger(turn, 0, count - 1)) return null;
  if (winner !== null) {
    // Only the player standing on the last square can have won.
    if (!isInteger(winner, 0, count - 1) || positions[winner] !== LAST_SQUARE) return null;
  } else if (positions.includes(LAST_SQUARE)) {
    return null;
  }

  const cleanMoves = Array.isArray(moves)
    ? moves
        .map((move) => sanitizeMove(move, count))
        .filter(Boolean)
        .slice(0, MAX_SAVED_MOVES)
    : [];

  const cleanRoll =
    isObject(lastRoll) && isInteger(lastRoll.player, 0, count - 1) && isInteger(lastRoll.face, 1, 6)
      ? { player: lastRoll.player, face: lastRoll.face }
      : null;

  return {
    game: { positions: [...positions], turn, winner },
    moves: cleanMoves,
    lastRoll: cleanRoll,
  };
}

/** A list of states from one game. If any of them is wrong, none of them can be trusted. */
function sanitizeStates(list, count) {
  if (!Array.isArray(list)) return [];
  const states = list.map((item) => sanitizeState(item, count));
  return states.includes(null) ? [] : states;
}

/**
 * Checks a value read from storage. Returns a clean SavedGame, or null when anything is wrong.
 * @param {unknown} raw
 * @returns {SavedGame | null}
 */
export function sanitizeSavedGame(raw) {
  if (!isObject(raw) || (raw.version !== 1 && raw.version !== STORAGE_VERSION)) return null;

  const legacy = raw.version === 1;
  const present = sanitizeState(legacy ? { ...raw, moves: [] } : raw);
  if (!present) return null;
  const count = present.game.positions.length;

  const names = defaultCustomNames();
  if (!legacy && Array.isArray(raw.names)) {
    for (let i = 0; i < MAX_PLAYERS; i++) {
      if (typeof raw.names[i] === 'string') names[i] = cleanName(raw.names[i]);
    }
  }

  return {
    ...present,
    past: legacy ? [] : sanitizeStates(raw.past, count).slice(-MAX_HISTORY),
    future: legacy ? [] : sanitizeStates(raw.future, count).slice(0, MAX_HISTORY),
    names,
  };
}

/** The browser's localStorage, or null where it is blocked (private mode, strict settings). */
function browserStorage() {
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * A store for one saved game. Every method is safe to call when storage is missing, full or
 * blocked: saving then does nothing and loading finds no game.
 * @param {Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null} [storage]
 */
export function createGameStore(storage = browserStorage()) {
  return {
    /** @returns {SavedGame | null} */
    load() {
      if (!storage) return null;
      try {
        const text = storage.getItem(STORAGE_KEY);
        return text === null ? null : sanitizeSavedGame(JSON.parse(text));
      } catch {
        return null;
      }
    },

    /** @param {SavedGame} saved */
    save(saved) {
      if (!storage) return false;
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify({ ...saved, version: STORAGE_VERSION }));
        return true;
      } catch {
        return false;
      }
    },

    clear() {
      try {
        storage?.removeItem(STORAGE_KEY);
      } catch {
        // Nothing to do: if storage is blocked there is nothing saved to remove.
      }
    },
  };
}
