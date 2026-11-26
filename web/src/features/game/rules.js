// Snake and ladder rules. Pure functions only, so they can be tested without a page.
//
// Squares are numbered 1 to 100. Square 0 means "not on the board yet".
// To win, a player has to land on 100 exactly; a roll that would go past it is wasted.

export const BOARD_SIZE = 10;
export const LAST_SQUARE = BOARD_SIZE * BOARD_SIZE;
export const START_SQUARE = 0;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

export const PLAYER_NAMES = Object.freeze(['Red', 'Blue', 'Green', 'Amber']);
export const PLAYER_COLORS = Object.freeze(['#ff5d5d', '#4f7cff', '#34c98b', '#f2a13a']);

/** Ladder bottom square -> square at the top. */
export const LADDERS = Object.freeze({
  1: 38,
  4: 14,
  9: 31,
  21: 42,
  28: 84,
  36: 44,
  51: 67,
  71: 91,
  80: 100,
});

/** Snake head square -> square at the tail. */
export const SNAKES = Object.freeze({
  16: 6,
  47: 26,
  49: 11,
  56: 53,
  62: 19,
  64: 60,
  87: 24,
  93: 73,
  95: 75,
  98: 78,
});

/**
 * Where a square sits on the board: `col` 0 to 9 from the left, `row` 0 to 9 from the bottom.
 * Rows zigzag: the bottom row runs left to right, the next one right to left, and so on.
 */
export function squareCell(square) {
  const index = square - 1;
  const row = Math.floor(index / BOARD_SIZE);
  const offset = index % BOARD_SIZE;
  return { col: row % 2 === 0 ? offset : BOARD_SIZE - 1 - offset, row };
}

/** The square a player ends up on after landing on `square`: up a ladder, down a snake, or the same. */
export function jumpTarget(square) {
  return LADDERS[square] ?? SNAKES[square] ?? square;
}

/** Starts a game with every player off the board and the first player to move. */
export function createGame(playerCount) {
  const count = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, Math.trunc(playerCount) || MIN_PLAYERS));
  return { positions: Array.from({ length: count }, () => START_SQUARE), turn: 0, winner: null };
}

/**
 * Plays `roll` for the player whose turn it is.
 * Returns the next game and a description of the move, or the same game and `null`
 * when the roll is not 1 to 6 or the game is already over.
 *
 * move: { player, roll, from, steps, landed, to, kind, won }
 *   steps: every square walked over, in order (empty when the roll is wasted)
 *   landed: the square the dice brought the player to
 *   to: the square after any snake or ladder
 *   kind: 'none' | 'ladder' | 'snake' | 'blocked'
 */
export function playTurn(game, roll) {
  if (game.winner !== null || !Number.isInteger(roll) || roll < 1 || roll > 6) {
    return { game, move: null };
  }

  const player = game.turn;
  const from = game.positions[player];
  const base = { player, roll, from };

  let move;
  if (from + roll > LAST_SQUARE) {
    move = { ...base, steps: [], landed: from, to: from, kind: 'blocked', won: false };
  } else {
    const landed = from + roll;
    const to = jumpTarget(landed);
    const steps = Array.from({ length: roll }, (_, i) => from + i + 1);
    const kind = to > landed ? 'ladder' : to < landed ? 'snake' : 'none';
    move = { ...base, steps, landed, to, kind, won: to === LAST_SQUARE };
  }

  const positions = game.positions.map((square, i) => (i === player ? move.to : square));
  return {
    game: {
      positions,
      turn: move.won ? player : (player + 1) % positions.length,
      winner: move.won ? player : null,
    },
    move,
  };
}

/** The part of a move worth keeping in the move list: everything but the squares walked over. */
export function moveRecord(move) {
  const { player, roll, from, landed, to, kind, won } = move;
  return { player, roll, from, landed, to, kind, won };
}

/** One line of text for the move list. `names` are the player names to use (the colors by default). */
export function describeMove(move, names = PLAYER_NAMES) {
  const name = names[move.player] || PLAYER_NAMES[move.player];
  const start = `${name} rolled ${move.roll}`;
  if (move.kind === 'blocked') {
    return `${start} but needs exactly ${LAST_SQUARE - move.from} to finish.`;
  }
  const from = move.from === START_SQUARE ? 'start' : String(move.from);
  if (move.won) return `${start} and reached ${LAST_SQUARE}. ${name} wins!`;
  if (move.kind === 'ladder') {
    return `${start}: ${from} to ${move.landed}, then up a ladder to ${move.to}.`;
  }
  if (move.kind === 'snake') {
    return `${start}: ${from} to ${move.landed}, then down a snake to ${move.to}.`;
  }
  return `${start}: ${from} to ${move.to}.`;
}
