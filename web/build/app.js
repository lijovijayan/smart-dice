(() => {
"use strict";
const __modules = {};

// --- dice/faces.js ---
__modules["dice/faces.js"] = (() => {
// Face numbering shared by the 3D cube, the panel, and demo mode.
// Opposite faces add up to 7. Board top (+Z) is face 1.

const FACE_NUMBERS = Object.freeze([1, 2, 3, 4, 5, 6]);

/** Face numbers read from the board's upper-face byte. 0 means "no clear face". */
const NO_FACE = 0;

/** Accent color for each face. */
const FACE_COLORS = Object.freeze({
  1: '#4f7cff',
  2: '#ff5d5d',
  3: '#34c98b',
  4: '#2bc4c4',
  5: '#a877ff',
  6: '#f2a13a',
});

/** Color used when no face is known. */
const FACE_NEUTRAL_COLOR = '#8a96ab';

/** Gravity reading (in g, sensor axes) when each face is up. Used by demo mode. */
const FACE_GRAVITY = Object.freeze({
  1: [0, 0, 1],
  2: [1, 0, 0],
  3: [0, 1, 0],
  4: [0, -1, 0],
  5: [-1, 0, 0],
  6: [0, 0, -1],
});

/** Pip positions per face as [column, row] on a 3 by 3 grid (0 to 2). */
const FACE_PIPS = Object.freeze({
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
function isFaceNumber(value) {
  return FACE_NUMBERS.includes(value);
}

/** Maps a raw byte from the board to a face. Anything unknown becomes NO_FACE. */
function toFace(value) {
  return isFaceNumber(value) ? value : NO_FACE;
}

/** Accent color for a face, or the neutral color for NO_FACE. */
function faceColor(face) {
  return isFaceNumber(face) ? FACE_COLORS[face] : FACE_NEUTRAL_COLOR;
}
return { FACE_NUMBERS, NO_FACE, FACE_COLORS, FACE_NEUTRAL_COLOR, FACE_GRAVITY, FACE_PIPS, isFaceNumber, toFace, faceColor };
})();

// --- app/ambient.js ---
__modules["app/ambient.js"] = (() => {
const { faceColor } = __modules["dice/faces.js"];
// The accent color of the whole app follows the upper face of the dice.
// Pages and styles read it as the CSS variable --face.


/**
 * @param {Document} doc
 * @param {import('../dice/service.js').DiceService} dice
 */
function bindAmbient(doc, dice) {
  let shown = null;
  dice.subscribe(({ state }) => {
    if (state.face === shown) return;
    shown = state.face;
    doc.documentElement.style.setProperty('--face', faceColor(state.face));
  });
}
return { bindAmbient };
})();

// --- app/connection.js ---
__modules["app/connection.js"] = (() => {
// The connection status and Connect button in the header. They belong to the app, not to
// any one page, so the board can be connected from wherever you are.

const UNSUPPORTED_MESSAGE =
  'This browser has no Web Bluetooth. Use Chrome or Edge on a laptop or Android phone.';

/**
 * @param {Document} doc
 * @param {import('../dice/service.js').DiceService} dice
 */
function bindConnection(doc, dice) {
  const el = (id) => {
    const node = doc.getElementById(id);
    if (!node) throw new Error(`Missing #${id} element`);
    return node;
  };
  const status = el('connection-status');
  const statusText = el('connection-text');
  const toggle = el('connection-toggle');
  const notice = el('notice');

  toggle.addEventListener('click', () => {
    void dice.toggle();
  });

  dice.subscribe(({ connected, busy, deviceName, error, supported }) => {
    statusText.textContent = connected
      ? `Connected to ${deviceName ?? 'board'}`
      : busy
        ? 'Connecting…'
        : 'Not connected';
    status.classList.toggle('ok', connected);
    status.classList.toggle('busy', busy);

    toggle.textContent = busy ? 'Connecting…' : connected ? 'Disconnect' : 'Connect';
    toggle.dataset.connected = String(connected);
    toggle.disabled = busy || !supported;

    notice.textContent = supported ? (error ?? '') : UNSUPPORTED_MESSAGE;
  });
}
return { bindConnection };
})();

// --- shared/dom.js ---
__modules["shared/dom.js"] = (() => {
// Small DOM helpers shared by every page.

/**
 * Finds the elements marked `data-ref="name"` inside `root`, so a page can look up its own
 * elements without ids. Two pages can then use the same names without clashing.
 * Throws when one is missing, so a typo shows up straight away.
 * @template {string} Name
 * @param {ParentNode} root
 * @param {readonly Name[]} names
 * @returns {Record<Name, HTMLElement>}
 */
function refsOf(root, names) {
  const refs = {};
  for (const name of names) {
    const node = root.querySelector(`[data-ref="${name}"]`);
    if (!node) throw new Error(`Missing [data-ref="${name}"] element`);
    refs[name] = node;
  }
  return refs;
}

/**
 * True when a key press came from somewhere the visitor is typing text, so page-wide
 * shortcuts should leave it alone.
 * @param {EventTarget | null | undefined} target
 */
function isTypingTarget(target) {
  if (!target) return false;
  const { tagName, isContentEditable } = /** @type {HTMLElement} */ (target);
  return isContentEditable === true || /^(INPUT|TEXTAREA|SELECT)$/.test(tagName ?? '');
}

/** Restarts a CSS animation: remove the class, force a reflow, then add it back. */
function restartClass(node, name) {
  node.classList.remove(name);
  void node.offsetWidth;
  node.classList.add(name);
}
return { refsOf, isTypingTarget, restartClass };
})();

// --- features/game/rules.js ---
__modules["features/game/rules.js"] = (() => {
// Snake and ladder rules. Pure functions only, so they can be tested without a page.
//
// Squares are numbered 1 to 100. Square 0 means "not on the board yet".
// To win, a player has to land on 100 exactly; a roll that would go past it is wasted.

const BOARD_SIZE = 10;
const LAST_SQUARE = BOARD_SIZE * BOARD_SIZE;
const START_SQUARE = 0;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 4;

const PLAYER_NAMES = Object.freeze(['Red', 'Blue', 'Green', 'Amber']);
const PLAYER_COLORS = Object.freeze(['#ff5d5d', '#4f7cff', '#34c98b', '#f2a13a']);

/** Ladder bottom square -> square at the top. */
const LADDERS = Object.freeze({
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
const SNAKES = Object.freeze({
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
function squareCell(square) {
  const index = square - 1;
  const row = Math.floor(index / BOARD_SIZE);
  const offset = index % BOARD_SIZE;
  return { col: row % 2 === 0 ? offset : BOARD_SIZE - 1 - offset, row };
}

/** The square a player ends up on after landing on `square`: up a ladder, down a snake, or the same. */
function jumpTarget(square) {
  return LADDERS[square] ?? SNAKES[square] ?? square;
}

/** Starts a game with every player off the board and the first player to move. */
function createGame(playerCount) {
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
function playTurn(game, roll) {
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
function moveRecord(move) {
  const { player, roll, from, landed, to, kind, won } = move;
  return { player, roll, from, landed, to, kind, won };
}

/** One line of text for the move list. `names` are the player names to use (the colors by default). */
function describeMove(move, names = PLAYER_NAMES) {
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
return { BOARD_SIZE, LAST_SQUARE, START_SQUARE, MIN_PLAYERS, MAX_PLAYERS, PLAYER_NAMES, PLAYER_COLORS, LADDERS, SNAKES, squareCell, jumpTarget, createGame, playTurn, moveRecord, describeMove };
})();

// --- features/game/easing.js ---
__modules["features/game/easing.js"] = (() => {
// Easing curves for the board animations. Every input is clamped to 0 to 1.

function clamp01(t) {
  return Math.min(1, Math.max(0, t));
}

function lerp(from, to, t) {
  return from + (to - from) * t;
}

/** Accelerates, then slows down. Used for walking and sliding, so motion never looks abrupt. */
function easeInOutCubic(t) {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

/** Starts fast and settles gently. Used for ripples and other things that expand. */
function easeOutCubic(t) {
  return 1 - (1 - clamp01(t)) ** 3;
}

/** 0 at both ends and 1 at the top of the arc. Used for hops, lifts and bumps. */
function hopHeight(t) {
  return Math.sin(Math.PI * clamp01(t));
}

/** A gentle S curve. Used for climbing, where speed should barely change. */
function easeInOutSine(t) {
  return (1 - Math.cos(Math.PI * clamp01(t))) / 2;
}

/**
 * Eases in, holds a steady speed, then eases out. Like something that slithers or rolls:
 * it picks up speed over the first `ramp` of the time, cruises, and slows over the last `ramp`.
 * Returns how far along the way it is, 0 to 1.
 */
function cruise(t, ramp = 0.2) {
  const x = clamp01(t);
  const r = Math.min(0.5, Math.max(0.01, ramp));
  const top = 1 / (1 - r);
  if (x < r) return (top * x * x) / (2 * r);
  if (x > 1 - r) return 1 - (top * (1 - x) * (1 - x)) / (2 * r);
  return top * (r / 2 + (x - r));
}

/** Overshoots the target a little, then settles back. Used for things that pop out. */
function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const x = clamp01(t) - 1;
  return 1 + c3 * x ** 3 + c1 * x ** 2;
}

/**
 * Squash and stretch for one hop, `t` from 0 to 1. The token flattens as it leaves and
 * lands, and stretches a little in the air. Returns horizontal and vertical scale (both 1 at rest).
 */
function hopShape(t) {
  const x = clamp01(t);
  const edge = Math.min(x, 1 - x) / 0.14;
  if (edge < 1) {
    const squash = 1 - edge;
    return { sx: 1 + 0.16 * squash, sy: 1 - 0.2 * squash };
  }
  const air = Math.sin(Math.PI * x) * Math.min(1, edge - 1);
  return { sx: 1 - 0.05 * air, sy: 1 + 0.09 * air };
}
return { lerp, easeInOutCubic, easeOutCubic, hopHeight, easeInOutSine, cruise, easeOutBack, hopShape };
})();

// --- features/game/board.js ---
__modules["features/game/board.js"] = (() => {
const { BOARD_SIZE, LADDERS, LAST_SQUARE, PLAYER_COLORS, PLAYER_NAMES, SNAKES, START_SQUARE, squareCell } = __modules["features/game/rules.js"];
const { cruise, easeInOutSine, easeOutBack, easeOutCubic, hopHeight, hopShape, lerp } = __modules["features/game/easing.js"];
// Draws the snake and ladder board as SVG and animates the player tokens on it.
// Tokens are moved by hand each frame (not with CSS transitions), so a walk, a ladder climb
// and a snake swallowing a token can each follow their own path, and the snakes can
// strike, bulge and flick while they do it.


const SVG_NS = 'http://www.w3.org/2000/svg';

// Used when no sound is given, so the board can run silently (for example, in tests).
const SILENT_SOUND = Object.freeze({ play() {} });

// Everything is drawn in board units: one square is CELL_SIZE wide.
const CELL_SIZE = 60;
const BOARD_UNITS = CELL_SIZE * BOARD_SIZE;
const START_STRIP = 52;
const TOKEN_RADIUS = 11;

// Where tokens sit when they share a square: one entry per head count, one offset per token.
const GROUP_OFFSETS = [
  [[0, 0]],
  [
    [-13, 0],
    [13, 0],
  ],
  [
    [-13, 9],
    [13, 9],
    [0, -11],
  ],
  [
    [-13, -11],
    [13, -11],
    [-13, 11],
    [13, 11],
  ],
];

const SNAKE_COLORS = ['#34c98b', '#ff8a5c', '#a877ff', '#2bc4c4', '#f2a13a'];
const SNAKE_POINTS = 48;
const SNAKE_AMPLITUDE = 15;
const SNAKE_WIDTH = 12;
const SNAKE_NECK_WIDTH = 8.5;
const SNAKE_TAIL_WIDTH = 2;
const SNAKE_SPOT_GAP = 26;

const LADDER_RAIL_OFFSET = 8;
const LADDER_RUNG_GAP = 21;
const LADDER_GOLD = '#ffd166';

// Animation timings in milliseconds, and heights in board units.
const STEP_MS = 230;
const SETTLE_MS = 240;
const CLIMB_BASE_MS = 480;
const CLIMB_MS_PER_UNIT = 2.2;
const CLIMB_BOB = 4;
// A snake that catches a token pulls back, strikes, swallows it (a lump travels down the
// body at a slow, steady pace) and spits it out of its tail.
const STRIKE_MS = 560;
const STRIKE_PULL_BACK = 8;
const STRIKE_LUNGE = 11;
const SWALLOW_BASE_MS = 500;
const SWALLOW_UNITS_PER_MS = 0.3;
const SWALLOW_LUMP = 7.5;
const SWALLOW_LUMP_SPREAD = 24;
const SPIT_MS = 480;
const GHOST_SCALE = 0.62;
const GHOST_OPACITY = 0.62;
const BUMP_MS = 380;
const BUMP_DISTANCE = 7;
const RIPPLE_MS = 620;
const RIPPLE_RADIUS = 42;
const SPARK_MS = 560;
const SPARK_COUNT = 9;

function svgNode(name, attrs = {}, parent = null) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (parent) parent.append(node);
  return node;
}

/** Sets a CSS custom property, used to stagger animations by index. */
function setVar(node, name, value) {
  node.style.setProperty(name, String(value));
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

/** Center of a square on the board in board units (squares 1 to 100 only). */
function squareCenter(square) {
  const { col, row } = squareCell(square);
  return {
    x: col * CELL_SIZE + CELL_SIZE / 2,
    y: (BOARD_SIZE - 1 - row) * CELL_SIZE + CELL_SIZE / 2,
  };
}

function drawSquares(parent) {
  for (let square = 1; square <= LAST_SQUARE; square += 1) {
    const { col, row } = squareCell(square);
    const x = col * CELL_SIZE;
    const y = (BOARD_SIZE - 1 - row) * CELL_SIZE;
    let kind = '';
    if (square === LAST_SQUARE) kind = ' goal';
    else if (LADDERS[square]) kind = ' ladder-base';
    else if (SNAKES[square]) kind = ' snake-head';
    const shade = (col + row) % 2 === 0 ? 'even' : 'odd';

    // Each square is its own group so it can pop in, one after another.
    const cell = svgNode('g', { class: 'cell' }, parent);
    setVar(cell, '--i', square);
    svgNode(
      'rect',
      { x, y, width: CELL_SIZE, height: CELL_SIZE, class: `square ${shade}${kind}` },
      cell,
    );
    const label = svgNode('text', { x: x + 6, y: y + 15, class: 'square-number' }, cell);
    label.textContent = String(square);
  }
}

function drawStartStrip(parent) {
  svgNode(
    'rect',
    { x: 0, y: BOARD_UNITS, width: BOARD_UNITS, height: START_STRIP, class: 'start-strip' },
    parent,
  );
  const label = svgNode('text', { x: 176, y: BOARD_UNITS + START_STRIP / 2 + 4, class: 'start-label' }, parent);
  label.textContent = 'START';
}

/** Draws a ladder and returns what the climb animation needs: its group and its rungs in order. */
function drawLadder(parent, bottom, top, index) {
  const a = squareCenter(bottom);
  const b = squareCenter(top);
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const ux = (b.x - a.x) / length;
  const uy = (b.y - a.y) / length;
  // Normal to the ladder, used to place the two rails.
  const nx = -uy * LADDER_RAIL_OFFSET;
  const ny = ux * LADDER_RAIL_OFFSET;

  const group = svgNode('g', { class: 'ladder' }, parent);
  setVar(group, '--i', index);
  // pathLength makes each line count as length 1, so the CSS can draw it in.
  const segments = Math.max(2, Math.floor(length / LADDER_RUNG_GAP));
  const rungs = [];
  for (let i = 1; i < segments; i += 1) {
    const t = i / segments;
    const cx = a.x + (b.x - a.x) * t;
    const cy = a.y + (b.y - a.y) * t;
    rungs.push(
      svgNode(
        'line',
        { x1: cx - nx, y1: cy - ny, x2: cx + nx, y2: cy + ny, class: 'ladder-rung', pathLength: 1 },
        group,
      ),
    );
  }
  for (const sign of [-1, 1]) {
    svgNode(
      'line',
      {
        x1: a.x + nx * sign,
        y1: a.y + ny * sign,
        x2: b.x + nx * sign,
        y2: b.y + ny * sign,
        class: 'ladder-rail',
        pathLength: 1,
      },
      group,
    );
  }
  return { group, rungs, segments, from: a, to: b, length };
}

/**
 * Points along a snake's body, from the head square to the tail square, in board units.
 * The drawing and the token travelling inside the snake both use this, so they always match.
 */
function snakeCurve(headSquare, tailSquare) {
  const head = squareCenter(headSquare);
  const tail = squareCenter(tailSquare);
  const dx = tail.x - head.x;
  const dy = tail.y - head.y;
  const length = Math.hypot(dx, dy);
  const nx = -dy / length;
  const ny = dx / length;
  // Whole number of half waves, so the body starts and ends exactly on its squares.
  const halfWaves = Math.max(3, Math.round(length / 55));

  const points = [];
  for (let i = 0; i <= SNAKE_POINTS; i += 1) {
    const t = i / SNAKE_POINTS;
    const sway = Math.sin(t * Math.PI * halfWaves) * SNAKE_AMPLITUDE * (1 - t * 0.55);
    points.push({ x: head.x + dx * t + nx * sway, y: head.y + dy * t + ny * sway });
  }
  return points;
}

function pathOf(points) {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
}

function smoothstep(x) {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
}

/** How thick the body is at `fraction` (0 at the head, 1 at the tail tip): a slim neck, a full middle, a tapering tail. */
function bodyWidth(fraction) {
  if (fraction < 0.08) return lerp(SNAKE_NECK_WIDTH, SNAKE_WIDTH, easeOutCubic(fraction / 0.08));
  return lerp(SNAKE_WIDTH, SNAKE_TAIL_WIDTH, smoothstep((fraction - 0.4) / 0.6));
}

/** The closed outline of a body that is `widths[i]` thick at `points[i]`, with a pointed tail. */
function outlineOf(points, widths) {
  const left = [];
  const right = [];
  let tx = 1;
  let ty = 0;
  points.forEach((point, i) => {
    const before = points[Math.max(0, i - 1)];
    const after = points[Math.min(points.length - 1, i + 1)];
    const length = Math.hypot(after.x - before.x, after.y - before.y) || 1;
    tx = (after.x - before.x) / length;
    ty = (after.y - before.y) / length;
    const half = widths[i] / 2;
    left.push(`${(point.x - ty * half).toFixed(1)} ${(point.y + tx * half).toFixed(1)}`);
    right.push(`${(point.x + ty * half).toFixed(1)} ${(point.y - tx * half).toFixed(1)}`);
  });
  const tail = points[points.length - 1];
  const tip = `${(tail.x + tx * 4).toFixed(1)} ${(tail.y + ty * 4).toFixed(1)}`;
  return `M${left.join(' L')} L${tip} L${right.reverse().join(' L')} Z`;
}

/**
 * Draws a snake and returns a view to animate it. `render` redraws the body, and takes:
 *   headPull   how far the head is pushed along its facing (negative pulls it back)
 *   headScale  size of the head
 *   mouth      0 closed to 1 open
 *   tailKick   sideways flick of the tail tip
 *   bumps      lumps in the body, [{ at, amount, spread }] with `at` the distance from the head
 * It returns the points of the body as drawn.
 */
function drawSnake(parent, headSquare, tailSquare, color, index) {
  const rest = snakeCurve(headSquare, tailSquare);
  const last = rest.length - 1;
  const arc = [0];
  for (let i = 1; i <= last; i += 1) {
    arc.push(arc[i - 1] + Math.hypot(rest[i].x - rest[i - 1].x, rest[i].y - rest[i - 1].y));
  }
  const length = arc[last];
  const baseWidths = rest.map((_, i) => bodyWidth(i / last));

  const group = svgNode('g', { class: 'snake' }, parent);
  setVar(group, '--i', index);
  const shadow = svgNode('path', { class: 'snake-shadow', transform: 'translate(2 3)' }, group);
  const body = svgNode('path', { class: 'snake-body', fill: color }, group);
  const sheen = svgNode('path', { class: 'snake-sheen' }, group);

  // Blotches along the back. They are tied to points of the body, so they move with it.
  const spots = [];
  for (let distance = SNAKE_SPOT_GAP; distance < length - 16; distance += SNAKE_SPOT_GAP) {
    const at = arc.findIndex((value) => value >= distance);
    spots.push({ at, node: svgNode('ellipse', { rx: 3.4, ry: 2, class: 'snake-spot' }, group) });
  }

  // The head, drawn facing right with its middle at the origin.
  const face = svgNode('g', {}, group);
  const tongue = svgNode('line', { x1: 8, y1: 0, x2: 17, y2: 0, class: 'snake-tongue' }, face);
  svgNode(
    'path',
    { d: 'M-7 -5 C-1 -9.5 10 -7 15 0 C10 7 -1 9.5 -7 5 Z', fill: color, class: 'snake-head' },
    face,
  );
  const mouth = svgNode('path', { d: 'M5 0 L14.5 -4.2 Q17.5 0 14.5 4.2 Z', class: 'snake-mouth', opacity: 0 }, face);
  svgNode('circle', { cx: 4, cy: -4, r: 2.6, class: 'snake-eye' }, face);
  svgNode('circle', { cx: 4, cy: 4, r: 2.6, class: 'snake-eye' }, face);

  const outX = rest[0].x - rest[4].x;
  const outY = rest[0].y - rest[4].y;
  const outLength = Math.hypot(outX, outY) || 1;
  const headDir = { x: outX / outLength, y: outY / outLength };
  const tailX = rest[last].x - rest[last - 4].x;
  const tailY = rest[last].y - rest[last - 4].y;
  const tailLength = Math.hypot(tailX, tailY) || 1;
  const tailSide = { x: -tailY / tailLength, y: tailX / tailLength };
  const headReach = Math.round(last * 0.3);
  const tailReach = Math.round(last * 0.82);

  function render({ headPull = 0, headScale = 1, mouth: open = 0, tailKick = 0, bumps = [] } = {}) {
    const points = rest.map((p) => ({ x: p.x, y: p.y }));
    if (headPull !== 0) {
      // The head moves most and the body follows less and less, so the neck bends rather than slides.
      for (let i = 0; i < headReach; i += 1) {
        const weight = (1 - i / headReach) ** 2;
        points[i].x += headDir.x * headPull * weight;
        points[i].y += headDir.y * headPull * weight;
      }
    }
    if (tailKick !== 0) {
      for (let i = tailReach; i <= last; i += 1) {
        const weight = ((i - tailReach) / (last - tailReach)) ** 2;
        points[i].x += tailSide.x * tailKick * weight;
        points[i].y += tailSide.y * tailKick * weight;
      }
    }

    const widths = baseWidths.map((width, i) => {
      let total = width;
      for (const bump of bumps) total += bump.amount * Math.exp(-(((arc[i] - bump.at) / bump.spread) ** 2));
      return total;
    });

    const outline = outlineOf(points, widths);
    body.setAttribute('d', outline);
    shadow.setAttribute('d', outline);
    sheen.setAttribute('d', pathOf(points.slice(0, last - 2)));

    for (const spot of spots) {
      const point = points[spot.at];
      const before = points[spot.at - 1];
      const after = points[spot.at + 1];
      const angle = (Math.atan2(after.y - before.y, after.x - before.x) * 180) / Math.PI;
      spot.node.setAttribute('transform', `translate(${point.x.toFixed(1)} ${point.y.toFixed(1)}) rotate(${angle.toFixed(1)})`);
      spot.node.setAttribute('ry', (widths[spot.at] * 0.28).toFixed(2));
    }

    const head = points[0];
    const next = points[3];
    // The head looks away from the body.
    const angle = (Math.atan2(head.y - next.y, head.x - next.x) * 180) / Math.PI;
    face.setAttribute(
      'transform',
      `translate(${head.x.toFixed(1)} ${head.y.toFixed(1)}) rotate(${angle.toFixed(1)}) scale(${headScale.toFixed(3)})`,
    );
    mouth.setAttribute('opacity', open.toFixed(2));
    tongue.setAttribute('opacity', (1 - open).toFixed(2));
    return points;
  }
  render();

  /** The point on the resting body `distance` along it from the head. */
  function pointAt(distance) {
    const d = Math.min(length, Math.max(0, distance));
    let i = 1;
    while (i < last && arc[i] < d) i += 1;
    const span = arc[i] - arc[i - 1] || 1;
    const f = (d - arc[i - 1]) / span;
    return { x: lerp(rest[i - 1].x, rest[i].x, f), y: lerp(rest[i - 1].y, rest[i].y, f) };
  }

  return { group, color, rest, length, render, pointAt, head: headSquare, tail: tailSquare };
}

/**
 * Draws the board into `container` and returns controls for the tokens.
 * Every movement returns a promise that resolves when it ends. A reset cancels
 * anything still running, and those promises resolve early.
 * @param {HTMLElement} container
 * @param {{ play(name: string): void }} [sound] plays the named sound cue
 */
function createBoardView(container, sound = SILENT_SOUND) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const svg = svgNode('svg', {
    viewBox: `0 0 ${BOARD_UNITS} ${BOARD_UNITS + START_STRIP}`,
    role: 'img',
    'aria-label': 'Snake and ladder board',
    class: 'board-svg',
  });

  const squares = svgNode('g', {}, svg);
  drawSquares(squares);
  drawStartStrip(squares);

  const ladderViews = new Map();
  const ladders = svgNode('g', {}, svg);
  Object.entries(LADDERS).forEach(([bottom, top], index) => {
    ladderViews.set(Number(bottom), drawLadder(ladders, Number(bottom), top, index));
  });

  const snakeViews = new Map();
  const snakes = svgNode('g', {}, svg);
  Object.entries(SNAKES).forEach(([head, tail], index) => {
    snakeViews.set(
      Number(head),
      drawSnake(snakes, Number(head), tail, SNAKE_COLORS[index % SNAKE_COLORS.length], index),
    );
  });

  const rippleLayer = svgNode('g', {}, svg);
  const shadowLayer = svgNode('g', {}, svg);
  const tokenLayer = svgNode('g', {}, svg);
  container.replaceChildren(svg);

  /** @type {{ body: SVGGElement, shadow: SVGEllipseElement, title: SVGTitleElement, x: number, y: number }[]} */
  let tokens = [];
  /** @type {readonly string[]} */
  let names = PLAYER_NAMES;
  // The square each token rests on, or null while it is being moved.
  /** @type {(number | null)[]} */
  let at = [];
  // Bumped on every reset. Animations that started before a reset stop at once.
  let epoch = 0;

  const scaled = (ms) => (reduceMotion.matches ? 0 : ms);

  /** Calls onFrame with progress from 0 to 1 over `ms`. Resolves early after a reset. */
  function tween(ms, onFrame) {
    const run = epoch;
    return new Promise((resolve) => {
      let start = null;
      const frame = (now) => {
        if (run !== epoch) {
          resolve();
          return;
        }
        if (start === null) start = now;
        const t = ms <= 0 ? 1 : Math.min(1, (now - start) / ms);
        onFrame(t);
        if (t < 1) requestAnimationFrame(frame);
        else resolve();
      };
      requestAnimationFrame(frame);
    });
  }

  /**
   * Where a token rests on a square. Alone it sits in the middle. With company the tokens
   * share the square, each in its own spot, and the player count decides the layout.
   */
  function seatOf(player, square) {
    if (square === START_SQUARE) {
      return { x: 30 + player * 34, y: BOARD_UNITS + START_STRIP / 2 };
    }
    const here = [];
    at.forEach((where, other) => {
      if (other === player || where === square) here.push(other);
    });
    const [offsetX, offsetY] = GROUP_OFFSETS[Math.min(here.length, GROUP_OFFSETS.length) - 1][here.indexOf(player)];
    const center = squareCenter(square);
    return { x: center.x + offsetX, y: center.y + offsetY };
  }

  /**
   * Puts a token at (x, y), lifted by `lift` and squashed or stretched. The squash is anchored
   * at the token's feet. Its shadow stays on the board.
   */
  function draw(player, x, y, lift = 0, scaleX = 1, scaleY = scaleX) {
    const token = tokens[player];
    if (!token) return;
    token.x = x;
    token.y = y;
    token.body.setAttribute(
      'transform',
      `translate(${x.toFixed(2)} ${(y - lift + TOKEN_RADIUS).toFixed(2)}) scale(${scaleX.toFixed(3)} ${scaleY.toFixed(3)}) translate(0 ${-TOKEN_RADIUS})`,
    );
    const shade = Math.max(0.35, 1 - lift / 60);
    token.shadow.setAttribute(
      'transform',
      `translate(${x.toFixed(2)} ${(y + TOKEN_RADIUS * 0.7).toFixed(2)}) scale(${shade.toFixed(3)})`,
    );
    token.shadow.setAttribute('opacity', shade.toFixed(3));
  }

  /** A ring that spreads out and fades where something has landed. */
  function ripple(point, color) {
    const ring = svgNode(
      'circle',
      { cx: point.x, cy: point.y, r: TOKEN_RADIUS, class: 'ripple', stroke: color },
      rippleLayer,
    );
    tween(scaled(RIPPLE_MS), (t) => {
      const radius = TOKEN_RADIUS + (RIPPLE_RADIUS - TOKEN_RADIUS) * easeOutCubic(t);
      ring.setAttribute('r', radius.toFixed(2));
      ring.setAttribute('opacity', (1 - t).toFixed(3));
    }).then(() => ring.remove());
  }

  /** Little dots that fly outward and fade. Used when a token reaches the top of a ladder or exits a snake. */
  function burst(point, color) {
    const sparks = Array.from({ length: SPARK_COUNT }, (_, i) => ({
      node: svgNode('circle', { cx: point.x, cy: point.y, r: 3, fill: color, class: 'spark' }, rippleLayer),
      angle: (i / SPARK_COUNT) * Math.PI * 2 + Math.random() * 0.5,
      distance: 24 + Math.random() * 16,
    }));
    tween(scaled(SPARK_MS), (t) => {
      const e = easeOutCubic(t);
      for (const spark of sparks) {
        spark.node.setAttribute('cx', (point.x + Math.cos(spark.angle) * spark.distance * e).toFixed(2));
        spark.node.setAttribute('cy', (point.y + Math.sin(spark.angle) * spark.distance * e).toFixed(2));
        spark.node.setAttribute('r', (3 * (1 - t)).toFixed(2));
        spark.node.setAttribute('opacity', (1 - t).toFixed(3));
      }
    }).then(() => sparks.forEach((spark) => spark.node.remove()));
  }

  /** Slides the tokens that are standing still into their seats (for example, to the middle once alone). */
  function settle(except = -1) {
    const jobs = [];
    tokens.forEach((token, player) => {
      const square = at[player];
      if (player === except || square === null) return;
      const from = { x: token.x, y: token.y };
      const to = seatOf(player, square);
      if (Math.hypot(to.x - from.x, to.y - from.y) < 0.5) return;
      jobs.push(
        tween(scaled(SETTLE_MS), (t) => {
          const e = easeOutCubic(t);
          draw(player, lerp(from.x, to.x, e), lerp(from.y, to.y, e));
        }),
      );
    });
    return Promise.all(jobs);
  }

  /** The token leaves its square: it goes on top, and the tokens left behind spread out. */
  function depart(player) {
    at[player] = null;
    tokenLayer.append(tokens[player].body);
    return settle();
  }

  /** The token arrives: it takes its seat on the square and the tokens there make room. */
  function arrive(player, square) {
    at[player] = square;
    return settle(player);
  }

  /** One hop from one point to another, flattening on takeoff and landing. */
  async function hop(player, from, to) {
    const run = epoch;
    sound.play('step');
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const height = Math.min(20, Math.max(10, distance * 0.32));
    await tween(scaled(STEP_MS), (t) => {
      // Mostly steady with a touch of easing, so a run of hops flows instead of stopping on every square.
      const along = 0.55 * t + 0.45 * easeInOutSine(t);
      const { sx, sy } = hopShape(t);
      draw(player, lerp(from.x, to.x, along), lerp(from.y, to.y, along), height * hopHeight(t), sx, sy);
    });
    // The squash is only for the air. Land at rest, or the token stays flattened on its square.
    if (run === epoch) draw(player, to.x, to.y);
  }

  /** Hops the token from square to square, one hop per square. */
  async function walk(player, squaresToWalk) {
    if (squaresToWalk.length === 0) return;
    const run = epoch;
    const finalSquare = squaresToWalk[squaresToWalk.length - 1];
    const jobs = [depart(player)];
    for (let i = 0; i < squaresToWalk.length; i += 1) {
      const from = { x: tokens[player].x, y: tokens[player].y };
      const last = i === squaresToWalk.length - 1;
      // The last hop lands in the token's seat, and the tokens already there shift over as it comes down.
      const to = last ? seatOf(player, finalSquare) : squareCenter(squaresToWalk[i]);
      if (last) jobs.push(arrive(player, finalSquare));
      await hop(player, from, to);
      if (run !== epoch) return;
    }
    ripple(seatOf(player, finalSquare), PLAYER_COLORS[player]);
    await Promise.all(jobs);
  }

  /** Flashes one rung as the token passes it. */
  function flashRung(rung) {
    if (reduceMotion.matches) return;
    rung.animate(
      [
        { stroke: '#ffffff', strokeWidth: 6 },
        { stroke: LADDER_GOLD, strokeWidth: 3.6, offset: 0.5 },
        { stroke: LADDER_GOLD, strokeWidth: 3 },
      ],
      { duration: 380, easing: 'ease-out' },
    );
  }

  /**
   * Climbs the token up a ladder, rung by rung: it hops onto the ladder, goes up with a small
   * bounce for every rung (each rung lights up as it passes), and hops off at the top.
   */
  async function climb(player, bottom, top) {
    const run = epoch;
    const ladder = ladderViews.get(bottom);
    if (!ladder) return;
    sound.play('climb');
    const jobs = [depart(player)];
    const startOffset = { x: tokens[player].x - ladder.from.x, y: tokens[player].y - ladder.from.y };
    const end = seatOf(player, top);
    const endOffset = { x: end.x - ladder.to.x, y: end.y - ladder.to.y };
    jobs.push(arrive(player, top));

    ladder.group.classList.add('lit');
    let passed = 0;
    await tween(scaled(CLIMB_BASE_MS + ladder.length * CLIMB_MS_PER_UNIT), (t) => {
      const progress = easeInOutSine(t);
      const phase = progress * ladder.segments;

      // Hop on during the first part and hop off during the last part; between them stay on the rails.
      const onGrip = easeInOutSine(clamp01(t / 0.12));
      const offGrip = easeInOutSine(clamp01((1 - t) / 0.12));
      const onWeight = t < 0.5 ? 1 - onGrip : 0;
      const offWeight = t < 0.5 ? 0 : 1 - offGrip;
      const x = lerp(ladder.from.x, ladder.to.x, progress) + startOffset.x * onWeight + endOffset.x * offWeight;
      const y = lerp(ladder.from.y, ladder.to.y, progress) + startOffset.y * onWeight + endOffset.y * offWeight;

      const middle = Math.min(onGrip, offGrip);
      const edgeHop = t < 0.12 ? hopHeight(t / 0.12) * 8 : t > 0.88 ? hopHeight((1 - t) / 0.12) * 8 : 0;
      const bob = Math.abs(Math.sin(Math.PI * phase)) * CLIMB_BOB * middle;
      draw(player, x, y, edgeHop + bob, 1 + 0.1 * middle);

      const rungsPassed = Math.floor(phase);
      while (passed < rungsPassed && passed < ladder.rungs.length) {
        flashRung(ladder.rungs[passed]);
        passed += 1;
      }
    });
    ladder.group.classList.remove('lit');
    if (run !== epoch) return;
    draw(player, end.x, end.y);
    sound.play('chime');
    ripple(end, LADDER_GOLD);
    burst(end, LADDER_GOLD);
    await Promise.all(jobs);
  }

  /** Puts a snake back to its resting shape. */
  function calmSnake(snake) {
    snake.group.classList.remove('angry');
    snake.render();
  }

  function setOpacity(player, value) {
    tokens[player]?.body.setAttribute('opacity', value.toFixed(3));
  }

  /**
   * The snake pulls its head back and strikes, and swallows the token. A lump travels down its
   * body at a slow, steady pace (the token shows through the skin), and at the tail the snake
   * flicks and spits the token out.
   */
  async function slide(player, head, tail) {
    const run = epoch;
    const snake = snakeViews.get(head);
    if (!snake) return;
    const jobs = [depart(player)];
    const start = { x: tokens[player].x, y: tokens[player].y };
    const end = seatOf(player, tail);
    jobs.push(arrive(player, tail));
    const lump = (at, amount) => [{ at, amount, spread: SWALLOW_LUMP_SPREAD }];

    // 1. Pull back, strike with the mouth open, and take the token into the mouth.
    snake.group.classList.add('angry');
    let struck = false;
    await tween(scaled(STRIKE_MS), (t) => {
      let pull;
      if (t < 0.5) pull = -STRIKE_PULL_BACK * easeInOutSine(t / 0.5);
      else if (t < 0.7) pull = lerp(-STRIKE_PULL_BACK, STRIKE_LUNGE, easeOutCubic((t - 0.5) / 0.2));
      else pull = lerp(STRIKE_LUNGE, 0, easeInOutSine((t - 0.7) / 0.3));
      const open = t < 0.4 ? 0 : t < 0.7 ? easeOutCubic((t - 0.4) / 0.3) : 1;
      const points = snake.render({
        headPull: pull,
        mouth: open,
        headScale: 1 + 0.08 * hopHeight(clamp01((t - 0.4) / 0.4)),
      });
      if (!struck && t >= 0.6) {
        struck = true;
        sound.play('bite');
        ripple(start, '#ff5d5d');
      }
      const grab = easeInOutSine(clamp01((t - 0.62) / 0.38));
      draw(player, lerp(start.x, points[0].x, grab), lerp(start.y, points[0].y, grab), 0, lerp(1, GHOST_SCALE, grab));
      setOpacity(player, lerp(1, GHOST_OPACITY, grab));
    });
    if (run !== epoch) {
      calmSnake(snake);
      return;
    }

    // 2. Swallowed: the lump goes down the body at a steady pace, and the mouth closes.
    sound.play('swallow');
    await tween(scaled(SWALLOW_BASE_MS + snake.length / SWALLOW_UNITS_PER_MS), (t) => {
      const distance = cruise(t, 0.22) * snake.length;
      snake.render({
        mouth: 1 - easeOutCubic(clamp01(t / 0.3)),
        bumps: lump(distance, SWALLOW_LUMP * Math.min(1, t / 0.1)),
      });
      const inside = snake.pointAt(distance);
      draw(player, inside.x, inside.y, 0, GHOST_SCALE);
    });
    if (run !== epoch) {
      calmSnake(snake);
      return;
    }

    // 3. Spat out of the tail with a flick, landing in the token's seat.
    sound.play('spit');
    const tip = snake.pointAt(snake.length);
    await tween(scaled(SPIT_MS), (t) => {
      snake.render({
        tailKick: Math.sin(t * Math.PI * 3) * 7 * (1 - t),
        bumps: lump(snake.length, SWALLOW_LUMP * (1 - clamp01(t / 0.5))),
      });
      const travel = easeOutCubic(t);
      const { sx, sy } = hopShape(t);
      const size = lerp(GHOST_SCALE, 1, easeOutBack(clamp01(t / 0.6)));
      draw(player, lerp(tip.x, end.x, travel), lerp(tip.y, end.y, travel), hopHeight(t) * 14, size * sx, size * sy);
      setOpacity(player, lerp(GHOST_OPACITY, 1, clamp01(t / 0.4)));
    });
    calmSnake(snake);
    setOpacity(player, 1);
    if (run !== epoch) return;

    draw(player, end.x, end.y);
    ripple(end, snake.color);
    await Promise.all(jobs);
  }

  /** A small side-to-side shake when a roll is wasted. */
  async function bump(player) {
    sound.play('bump');
    const x = tokens[player].x;
    const y = tokens[player].y;
    await tween(scaled(BUMP_MS), (t) => {
      draw(player, x + Math.sin(t * Math.PI * 4) * BUMP_DISTANCE * (1 - t), y);
    });
  }

  /** Puts a fresh token for each player on its square. */
  function reset(positions) {
    epoch += 1;
    snakeViews.forEach(calmSnake);
    ladderViews.forEach((ladder) => ladder.group.classList.remove('lit'));
    rippleLayer.replaceChildren();
    shadowLayer.replaceChildren();
    tokenLayer.replaceChildren();
    at = positions.slice();
    tokens = positions.map((_, player) => {
      const shadow = svgNode(
        'ellipse',
        { rx: TOKEN_RADIUS, ry: TOKEN_RADIUS * 0.4, class: 'token-shadow' },
        shadowLayer,
      );
      const body = svgNode('g', { class: 'token' }, tokenLayer);
      svgNode('circle', { r: TOKEN_RADIUS + 4, class: 'token-ring' }, body);
      svgNode('circle', { r: TOKEN_RADIUS, fill: PLAYER_COLORS[player], class: 'token-dot' }, body);
      svgNode('circle', { cx: -3.5, cy: -4, r: 3.4, class: 'token-gloss' }, body);
      const title = svgNode('title', {}, body);
      title.textContent = names[player] || PLAYER_NAMES[player];
      return { body, shadow, title, x: 0, y: 0 };
    });
    tokens.forEach((_, player) => {
      const seat = seatOf(player, positions[player]);
      draw(player, seat.x, seat.y);
    });
  }

  /** Marks whose turn it is. Pass null for nobody. */
  function setActive(player) {
    tokens.forEach((token, index) => {
      token.body.classList.toggle('active', index === player);
    });
  }

  /**
   * Slides every token straight to its square, for undo and redo. A glide that is still
   * running is cancelled, so quick undos do not fight over the tokens.
   */
  function glideTo(positions) {
    epoch += 1;
    at = positions.slice();
    return settle();
  }

  /** Sets the names shown when hovering over the tokens. */
  function setNames(next) {
    names = next;
    tokens.forEach((token, player) => {
      token.title.textContent = names[player] || PLAYER_NAMES[player];
    });
  }

  return { reset, walk, climb, slide, bump, setActive, glideTo, setNames };
}
return { snakeCurve, createBoardView };
})();

// --- features/game/history.js ---
__modules["features/game/history.js"] = (() => {
// Undo and redo for the game. Pure functions only, so they can be tested without a page.
//
// A history keeps what came before (`past`, oldest first), what is showing now (`present`)
// and what was undone (`future`, the next redo first). A state is whatever the page needs to
// show a moment of the game: `{ game, moves, lastRoll }`. Histories are never changed in
// place, every function returns a new one.

const MAX_HISTORY = 100;

/** A history that has only a starting point, so there is nothing to undo or redo. */
function startHistory(present) {
  return { past: [], present, future: [] };
}

/** Adds a new state after the present one. Anything that had been undone is forgotten. */
function record(history, next) {
  return {
    past: [...history.past, history.present].slice(-MAX_HISTORY),
    present: next,
    future: [],
  };
}

function canUndo(history) {
  return history.past.length > 0;
}

function canRedo(history) {
  return history.future.length > 0;
}

/** Steps back one state, or returns the same history when there is nothing to undo. */
function undo(history) {
  if (!canUndo(history)) return history;
  return {
    past: history.past.slice(0, -1),
    present: history.past[history.past.length - 1],
    future: [history.present, ...history.future].slice(0, MAX_HISTORY),
  };
}

/** Steps forward one state, or returns the same history when there is nothing to redo. */
function redo(history) {
  if (!canRedo(history)) return history;
  return {
    past: [...history.past, history.present].slice(-MAX_HISTORY),
    present: history.future[0],
    future: history.future.slice(1),
  };
}
return { MAX_HISTORY, startHistory, record, canUndo, canRedo, undo, redo };
})();

// --- features/game/markup.js ---
__modules["features/game/markup.js"] = (() => {
// The page's HTML. Elements are marked data-ref so view.js can find them without ids.

const GAME_MARKUP = `
  <section class="board-card">
    <div class="board" data-ref="board"></div>
    <div class="winner" data-ref="winner" role="status" hidden>
      <p class="winner-text" data-ref="winnerText"></p>
      <button type="button" data-ref="winnerAgain">Play again</button>
    </div>
  </section>

  <aside class="panel">
    <div class="card">
      <h2>Turn</h2>
      <div class="turn-row">
        <div class="die" data-ref="dieFace" role="img" aria-label="No roll yet"></div>
        <div>
          <p class="turn-text" data-ref="turnText" aria-live="polite"></p>
          <p class="note" data-ref="rollText"></p>
        </div>
      </div>
      <button class="primary" type="button" data-ref="roll">Roll</button>
      <div class="history" role="group" aria-label="Undo and redo">
        <button type="button" data-ref="undo" title="Undo the last move (Ctrl/Cmd + Z)">↶ Undo</button>
        <button type="button" data-ref="redo" title="Redo (Shift + Ctrl/Cmd + Z)">Redo ↷</button>
      </div>
      <p class="note" data-ref="hint"></p>
    </div>

    <div class="card">
      <h2>Players</h2>
      <ul class="players" data-ref="players"></ul>
      <p class="note">Click a name to rename it. Leave it empty to use the color.</p>
      <div class="setup">
        <span class="note">Players</span>
        <div class="count" data-ref="playerCount" role="group" aria-label="Number of players"></div>
      </div>
      <button class="wide" type="button" data-ref="newGame">New game</button>
      <button class="wide" type="button" data-ref="sound" aria-pressed="true">Sound: on</button>
    </div>

    <div class="card">
      <h2>Moves</h2>
      <ol class="moves" data-ref="moves"></ol>
      <p class="empty" data-ref="movesEmpty">Nothing rolled yet.</p>
    </div>
  </aside>
`;
return { GAME_MARKUP };
})();

// --- features/game/players.js ---
__modules["features/game/players.js"] = (() => {
const { MAX_PLAYERS, PLAYER_NAMES } = __modules["features/game/rules.js"];
// Player names. Every color has a default name (the color itself); a visitor can give it another.
// Pure functions only, so they can be tested without a page.


const MAX_NAME_LENGTH = 14;

/** Tidies a typed name: no control characters, single spaces, trimmed, at most MAX_NAME_LENGTH letters. */
function cleanName(text) {
  const plain = String(text ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(plain).slice(0, MAX_NAME_LENGTH).join('').trim();
}

/**
 * What to remember when `typed` is entered for `player`: the cleaned name, or '' (meaning
 * "use the color") when it is blank or just the color's own name.
 */
function customNameFor(player, typed) {
  const name = cleanName(typed);
  return name.toLowerCase() === PLAYER_NAMES[player].toLowerCase() ? '' : name;
}

/** The names to show for every color, given what the visitor chose ('' meaning the color's name). */
function displayNames(customNames) {
  return Array.from({ length: MAX_PLAYERS }, (_, i) => customNames?.[i] || PLAYER_NAMES[i]);
}

/** No custom names at all. */
function defaultCustomNames() {
  return Array.from({ length: MAX_PLAYERS }, () => '');
}
return { MAX_NAME_LENGTH, cleanName, customNameFor, displayNames, defaultCustomNames };
})();

// --- features/game/storage.js ---
__modules["features/game/storage.js"] = (() => {
const { MAX_HISTORY } = __modules["features/game/history.js"];
const { cleanName, defaultCustomNames } = __modules["features/game/players.js"];
const { LAST_SQUARE, MAX_PLAYERS, MIN_PLAYERS } = __modules["features/game/rules.js"];
// Saves the game in the browser so a refresh or a closed tab does not lose it.
//
// localStorage is enough here: the whole game is a few kilobytes, and reading it is
// instant, so the page can draw the right board on the first frame. Nothing from storage
// is trusted. A saved game that is damaged, from an unknown layout, or edited by hand is
// dropped and a fresh game starts.
//
// Layout 2 adds the undo history and the player names. Layout 1 games are still read, with
// an empty history, because their move list was plain text.


const STORAGE_KEY = 'smart-dice:game';
const STORAGE_VERSION = 2;
const MAX_SAVED_MOVES = 8;
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
function sanitizeSavedGame(raw) {
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
function createGameStore(storage = browserStorage()) {
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
return { STORAGE_KEY, STORAGE_VERSION, MAX_SAVED_MOVES, sanitizeSavedGame, createGameStore };
})();

// --- features/game/sound.js ---
__modules["features/game/sound.js"] = (() => {
// Game sound effects. Every sound is made in the browser with the Web Audio API, so there are
// no audio files to load and the page still works from file://. A cue is a few short tones
// and noise bursts.
//
// Browsers only allow sound after the visitor has clicked or pressed a key. The audio context
// is therefore made on the first sound played, which always follows a roll or a click.

const SOUND_KEY = 'smart-dice:sound';
const MASTER_VOLUME = 0.6;
const NOISE_SECONDS = 0.5;

/** Makes the audio context. Returns null where Web Audio is not available. */
function defaultContext() {
  const Constructor = window.AudioContext || window.webkitAudioContext;
  return Constructor ? new Constructor() : null;
}

function browserStorage() {
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

/** A tone that glides from `from` to `to` Hz (in `dur` seconds) and fades out. */
function tone(audio, out, { type = 'sine', from, to = from, start = 0, dur, gain = 0.2 }) {
  const t0 = audio.currentTime + start;
  const osc = audio.createOscillator();
  const env = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.01, dur / 4));
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(env).connect(out);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** A short burst of filtered noise, for clicks, hisses and pops. */
function burst(audio, out, noise, { start = 0, dur, freq, q = 1, type = 'bandpass', gain = 0.2 }) {
  const t0 = audio.currentTime + start;
  const src = audio.createBufferSource();
  const filter = audio.createBiquadFilter();
  const env = audio.createGain();
  src.buffer = noise;
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  env.gain.setValueAtTime(gain, t0);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(env).connect(out);
  src.start(t0, Math.random() * Math.max(0, NOISE_SECONDS - dur));
  src.stop(t0 + dur + 0.02);
}

/** Each cue is named for when the board or the page plays it. */
const CUES = {
  // A tap on a button, or the sound toggle.
  click: (a, o) => tone(a, o, { type: 'square', from: 900, dur: 0.02, gain: 0.03 }),
  // Undo falls, redo rises: a short slide in the matching direction.
  undo: (a, o) => tone(a, o, { type: 'triangle', from: 560, to: 300, dur: 0.14, gain: 0.1 }),
  redo: (a, o) => tone(a, o, { type: 'triangle', from: 300, to: 560, dur: 0.14, gain: 0.1 }),
  // One soft tick per square a token hops over.
  step: (a, o) => {
    const pitch = 620 + Math.random() * 60;
    tone(a, o, { type: 'triangle', from: pitch, to: pitch * 0.94, dur: 0.06, gain: 0.06 });
  },
  // Dice clatter: a run of clicks that fade out, like a die bouncing on a table.
  roll: (a, o, n) => {
    for (let i = 0; i < 7; i += 1) {
      burst(a, o, n, {
        start: i * 0.065 + Math.random() * 0.02,
        dur: 0.05,
        freq: 2600 + Math.random() * 900,
        q: 2.5,
        gain: 0.35 - i * 0.03,
      });
    }
  },
  // A token drops onto its square.
  land: (a, o) => tone(a, o, { type: 'sine', from: 320, to: 170, dur: 0.12, gain: 0.16 }),
  // A wasted roll: a low, short knock.
  bump: (a, o) => tone(a, o, { type: 'triangle', from: 210, to: 120, dur: 0.2, gain: 0.14 }),
  // Climbing a ladder: a rising sweep.
  climb: (a, o) => tone(a, o, { type: 'sine', from: 330, to: 1100, dur: 0.8, gain: 0.1 }),
  // Reaching the top of a ladder: two bright notes.
  chime: (a, o) => {
    tone(a, o, { type: 'sine', from: 1319, dur: 0.5, gain: 0.12 });
    tone(a, o, { type: 'sine', from: 1976, start: 0.08, dur: 0.5, gain: 0.09 });
  },
  // A snake strikes: a hiss and a thump.
  bite: (a, o, n) => {
    burst(a, o, n, { dur: 0.3, freq: 4200, q: 0.9, gain: 0.22 });
    tone(a, o, { type: 'sawtooth', from: 170, to: 60, dur: 0.28, gain: 0.14 });
  },
  // The snake swallows: a low gulp.
  swallow: (a, o) => tone(a, o, { type: 'sine', from: 260, to: 85, dur: 0.5, gain: 0.2 }),
  // The snake spits the token out: a pop.
  spit: (a, o, n) => {
    burst(a, o, n, { dur: 0.08, freq: 1800, q: 1.5, gain: 0.25 });
    tone(a, o, { type: 'sine', from: 700, to: 1400, dur: 0.12, gain: 0.1 });
  },
  // Someone wins: a rising arpeggio.
  win: (a, o) => {
    [523.25, 659.25, 783.99, 1046.5].forEach((pitch, i) => {
      tone(a, o, { type: 'triangle', from: pitch, start: i * 0.13, dur: 0.4, gain: 0.14 });
    });
  },
};

const SOUND_CUES = Object.freeze(Object.keys(CUES));

function makeNoise(audio) {
  const size = Math.floor(audio.sampleRate * NOISE_SECONDS);
  const buffer = audio.createBuffer(1, size, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < size; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/**
 * The sound effects for the game. Sound is on unless the visitor turns it off, and that choice
 * is remembered. Every method is safe when audio is blocked or missing: it just stays silent.
 * @param {{ storage?: Pick<Storage, 'getItem' | 'setItem'> | null, createContext?: () => any }} [options]
 */
function createSound({ storage = browserStorage(), createContext = defaultContext } = {}) {
  let enabled = true;
  try {
    enabled = storage ? storage.getItem(SOUND_KEY) !== 'off' : true;
  } catch {
    enabled = true;
  }

  let audio = null;
  let out = null;
  let noise = null;
  let unavailable = false;

  /** Makes the audio graph the first time it is needed. Returns null when audio is unavailable. */
  function ready() {
    if (audio) return audio;
    if (unavailable) return null;
    audio = createContext();
    if (!audio) {
      unavailable = true;
      return null;
    }
    out = audio.createGain();
    out.gain.value = MASTER_VOLUME;
    out.connect(audio.destination);
    noise = makeNoise(audio);
    return audio;
  }

  function play(name) {
    if (!enabled || !Object.prototype.hasOwnProperty.call(CUES, name)) return;
    const context = ready();
    if (!context) return;
    if (context.state === 'suspended') void context.resume();
    try {
      CUES[name](context, out, noise);
    } catch {
      // A sound must never break the game, so a failure here is ignored.
    }
  }

  return {
    get enabled() {
      return enabled;
    },
    setEnabled(value) {
      enabled = Boolean(value);
      try {
        storage?.setItem(SOUND_KEY, enabled ? 'on' : 'off');
      } catch {
        // Storage may be full or blocked. The choice then lasts for this visit only.
      }
      if (enabled) play('click');
    },
    play,
  };
}
return { SOUND_KEY, SOUND_CUES, createSound };
})();

// --- features/game/view.js ---
__modules["features/game/view.js"] = (() => {
const { FACE_PIPS, faceColor, isFaceNumber } = __modules["dice/faces.js"];
const { isTypingTarget, refsOf, restartClass } = __modules["shared/dom.js"];
const { createBoardView } = __modules["features/game/board.js"];
const { canRedo, canUndo, record, redo, startHistory, undo } = __modules["features/game/history.js"];
const { GAME_MARKUP } = __modules["features/game/markup.js"];
const { MAX_NAME_LENGTH, customNameFor, defaultCustomNames, displayNames } = __modules["features/game/players.js"];
const { MAX_PLAYERS, MIN_PLAYERS, PLAYER_COLORS, PLAYER_NAMES, START_SQUARE, createGame, describeMove, moveRecord, playTurn } = __modules["features/game/rules.js"];
const { createGameStore } = __modules["features/game/storage.js"];
const { createSound } = __modules["features/game/sound.js"];
// The snake and ladder page: turn flow, the die, the side panel and the win celebration.
// Rolls arrive from the shared dice service (the real board, or the demo keys) or from the
// Roll button. This file is the only part of the feature that knows about the page.


const TUMBLE_STEPS = 7;
const TUMBLE_STEP_MS = 70;
const LADDER_PAUSE_MS = 200;
const SNAKE_PAUSE_MS = 90;
const REDUCED_MOTION_MAX_MS = 40;
const MAX_MOVES = 8;
const DEFAULT_PLAYERS = 2;
const CONFETTI_COUNT = 90;
const CONFETTI_COLORS = Object.freeze([...PLAYER_COLORS, '#ffd166', '#f2f2f2']);

const GAME_HINT_DEMO = 'Press Roll, or keys 1–6 to choose the number.';
const GAME_HINT_LIVE = 'Roll your Smart Dice, or press Roll.';

const REF_NAMES = [
  'board',
  'winner',
  'winnerText',
  'winnerAgain',
  'dieFace',
  'turnText',
  'rollText',
  'roll',
  'undo',
  'redo',
  'hint',
  'players',
  'playerCount',
  'newGame',
  'sound',
  'moves',
  'movesEmpty',
];

/**
 * Fills `root` with the game and starts listening to the dice.
 * @param {HTMLElement} root
 * @param {import('../../dice/service.js').DiceService} dice
 * @returns {import('../../shared/contracts.js').FeatureInstance}
 */
function mountGame(root, dice, store = createGameStore()) {
  const doc = root.ownerDocument;
  root.innerHTML = GAME_MARKUP;
  const refs = refsOf(root, REF_NAMES);

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const pause = (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, reduceMotion.matches ? Math.min(ms, REDUCED_MOTION_MAX_MS) : ms);
    });

  const sound = createSound();
  const board = createBoardView(refs.board, sound);

  let game = createGame(DEFAULT_PLAYERS);
  let playerCount = DEFAULT_PLAYERS;
  // Newest first. Each is a move record; `describeMove` turns it into text with the current names.
  let moves = [];
  // The last roll as { player, face }, kept so a resumed game can show it.
  let lastRoll = null;
  // Undo and redo. Its present state is always what `game`, `moves` and `lastRoll` hold,
  // except while a move is animating (it already holds the move's outcome by then).
  let history = startHistory({ game, moves, lastRoll });
  // What the visitor typed for each color ('' means use the color's own name).
  let customNames = defaultCustomNames();
  let names = displayNames(customNames);
  let busy = false;
  let active = true;
  let live = false;
  // Bumped when a new game starts, so a move that is still animating knows to stop.
  let session = 0;
  // Set once the winner has been celebrated, so re-renders do not fire confetti again.
  let celebrated = false;
  // True only for the render right after a move is recorded, so just the new entry animates.
  let freshMove = false;
  let lastTurnKey = null;

  // The die: nine cells, with pips lit for the number shown.
  const pipCells = Array.from({ length: 9 }, () => {
    const cell = doc.createElement('span');
    refs.dieFace.append(cell);
    return cell;
  });

  function showDie(face) {
    const lit = isFaceNumber(face) ? FACE_PIPS[face].map(([col, row]) => row * 3 + col) : [];
    pipCells.forEach((cell, index) => cell.classList.toggle('on', lit.includes(index)));
    refs.dieFace.style.setProperty('--c', faceColor(face));
    refs.dieFace.setAttribute('aria-label', isFaceNumber(face) ? `Rolled ${face}` : 'No roll yet');
  }

  // Player count buttons.
  const countButtons = [];
  for (let count = MIN_PLAYERS; count <= MAX_PLAYERS; count += 1) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'chip';
    button.textContent = String(count);
    button.setAttribute('aria-label', `${count} players`);
    button.addEventListener('click', () => {
      startGame(count);
    });
    refs.playerCount.append(button);
    countButtons.push(button);
  }

  /** Bursts confetti from the middle of the win overlay. Each piece falls, spins and fades. */
  function celebrate() {
    if (reduceMotion.matches) return;
    for (let i = 0; i < CONFETTI_COUNT; i += 1) {
      const piece = doc.createElement('i');
      piece.className = 'confetti';
      piece.style.setProperty('--c', CONFETTI_COLORS[i % CONFETTI_COLORS.length]);
      refs.winner.append(piece);

      const sideways = (Math.random() - 0.5) * 520;
      const fall = 380 + Math.random() * 360;
      const spin = (Math.random() - 0.5) * 900;
      const animation = piece.animate(
        [
          { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
          {
            transform: `translate(${sideways * 0.7}px, ${fall * 0.4}px) rotate(${spin * 0.5}deg)`,
            opacity: 1,
            offset: 0.4,
          },
          { transform: `translate(${sideways}px, ${fall}px) rotate(${spin}deg)`, opacity: 0 },
        ],
        {
          duration: 1800 + Math.random() * 1400,
          delay: Math.random() * 350,
          easing: 'cubic-bezier(0.2, 0.6, 0.4, 1)',
          fill: 'backwards',
        },
      );
      animation.onfinish = () => piece.remove();
    }
  }

  function render() {
    const over = game.winner !== null;
    const player = over ? game.winner : game.turn;
    const name = names[player];
    const color = PLAYER_COLORS[player];

    refs.turnText.textContent = over ? `${name} wins!` : `${name}'s turn`;
    refs.turnText.style.setProperty('--player', color);
    const turnKey = over ? 'over' : String(game.turn);
    if (turnKey !== lastTurnKey) {
      restartClass(refs.turnText, 'pop');
      lastTurnKey = turnKey;
    }
    refs.roll.textContent = busy ? 'Moving…' : over ? 'Game over' : `Roll for ${name}`;
    refs.roll.disabled = busy || over;
    refs.hint.textContent = live ? GAME_HINT_LIVE : GAME_HINT_DEMO;

    refs.winner.hidden = !over;
    refs.winnerText.textContent = over ? `${name} wins!` : '';
    refs.winnerText.style.setProperty('--player', color);
    if (over && !celebrated) {
      celebrated = true;
      celebrate();
      sound.play('win');
    }

    if (playerRows.length !== game.positions.length) buildPlayerRows(game.positions.length);
    playerRows.forEach((row, index) => {
      const square = game.positions[index];
      if (!over && index === game.turn) row.item.setAttribute('aria-current', 'true');
      else row.item.removeAttribute('aria-current');
      // Never rewrite a name while it is being typed.
      if (doc.activeElement !== row.input) row.input.value = names[index];
      row.where.textContent =
        over && index === game.winner ? 'Winner' : square === START_SQUARE ? 'Start' : `Square ${square}`;
    });

    countButtons.forEach((button, index) => {
      button.setAttribute('aria-pressed', String(MIN_PLAYERS + index === playerCount));
    });

    const fresh = freshMove;
    freshMove = false;
    refs.moves.replaceChildren(
      ...moves.map((move, index) => {
        const item = doc.createElement('li');
        item.textContent = describeMove(move, names);
        if (fresh && index === 0) item.className = 'fresh';
        return item;
      }),
    );
    refs.movesEmpty.hidden = moves.length > 0;

    refs.undo.disabled = busy || !canUndo(history);
    refs.redo.disabled = busy || !canRedo(history);
    if (!busy) refs.rollText.textContent = rollLabel();

    refs.sound.textContent = sound.enabled ? 'Sound: on' : 'Sound: off';
    refs.sound.setAttribute('aria-pressed', String(sound.enabled));

    board.setActive(over ? null : game.turn);
  }

  function rollLabel() {
    return lastRoll ? `${names[lastRoll.player]} rolled ${lastRoll.face}` : '';
  }

  function showRoll() {
    showDie(lastRoll ? lastRoll.face : null);
    refs.rollText.textContent = rollLabel();
  }

  /** Puts the game, the board and the side panel in the history's present state, without any animation. */
  function setState(nextHistory, saved) {
    history = nextHistory;
    const state = history.present;
    session += 1;
    game = state.game;
    playerCount = game.positions.length;
    moves = state.moves;
    lastRoll = state.lastRoll;
    busy = false;
    // A game that was already won is not celebrated again when it is opened.
    celebrated = game.winner !== null && saved;
    freshMove = false;
    lastTurnKey = null;
    board.reset(game.positions);
    showRoll();
    refs.winner.querySelectorAll('.confetti').forEach((piece) => piece.remove());
    render();
  }

  /** Saves the state at once, so a reload in the middle of a move still shows where it ended. */
  function persist() {
    store.save({ ...history.present, past: history.past, future: history.future, names: customNames });
  }

  function startGame(count) {
    setState(startHistory({ game: createGame(count), moves: [], lastRoll: null }), false);
    persist();
  }

  /** Steps through the history: -1 undoes the last move, 1 redoes one. Not while a move is animating. */
  function stepHistory(direction) {
    if (!active || busy) return;
    const next = direction < 0 ? undo(history) : redo(history);
    if (next === history) return;

    history = next;
    ({ game, moves, lastRoll } = history.present);
    celebrated = false;
    freshMove = false;
    lastTurnKey = null;
    refs.winner.querySelectorAll('.confetti').forEach((piece) => piece.remove());
    sound.play(direction < 0 ? 'undo' : 'redo');
    showRoll();
    void board.glideTo(game.positions);
    persist();
    render();
  }

  function setCustomName(index, typed) {
    customNames[index] = customNameFor(index, typed);
    names = displayNames(customNames);
    board.setNames(names);
    persist();
    render();
  }

  /** The player list: one row per player, with a name field that can be edited in place. */
  let playerRows = [];
  function buildPlayerRows(count) {
    playerRows = Array.from({ length: count }, (_, index) => {
      const item = doc.createElement('li');
      item.className = 'player';
      item.style.setProperty('--player', PLAYER_COLORS[index]);

      const dot = doc.createElement('i');
      dot.className = 'player-dot';

      const input = doc.createElement('input');
      input.type = 'text';
      input.className = 'player-name';
      input.maxLength = MAX_NAME_LENGTH;
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.title = 'Click to rename';
      input.setAttribute('aria-label', `Name for ${PLAYER_NAMES[index]}`);
      input.addEventListener('input', () => setCustomName(index, input.value));
      input.addEventListener('blur', () => {
        input.value = names[index];
      });
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === 'Escape') input.blur();
      });

      const where = doc.createElement('span');
      where.className = 'player-square';
      item.append(dot, input, where);
      return { item, input, where };
    });
    refs.players.replaceChildren(...playerRows.map((row) => row.item));
  }

  async function play(roll, tumble) {
    if (!active || busy || game.winner !== null) return;
    const { game: next, move } = playTurn(game, roll);
    if (!move) return;

    const run = session;
    const stale = () => run !== session;

    // The outcome is already decided, so save it now. If the page is closed during the
    // animation, the game comes back where the move ended.
    const nextMoves = [moveRecord(move), ...moves].slice(0, MAX_MOVES);
    const nextRoll = { player: move.player, face: roll };
    history = record(history, { game: next, moves: nextMoves, lastRoll: nextRoll });
    persist();

    busy = true;
    sound.play(tumble ? 'roll' : 'click');
    render();

    if (tumble && !reduceMotion.matches) {
      restartClass(refs.dieFace, 'tumbling');
      for (let i = 0; i < TUMBLE_STEPS; i += 1) {
        showDie(1 + Math.floor(Math.random() * 6));
        await pause(TUMBLE_STEP_MS);
        if (stale()) return;
      }
    }
    showDie(roll);
    refs.rollText.textContent = `${names[move.player]} rolled ${roll}`;

    if (move.kind === 'blocked') {
      await board.bump(move.player);
    } else {
      await board.walk(move.player, move.steps);
      if (stale()) return;
      if (move.kind === 'ladder') {
        await pause(LADDER_PAUSE_MS);
        if (stale()) return;
        await board.climb(move.player, move.landed, move.to);
      } else if (move.kind === 'snake') {
        await pause(SNAKE_PAUSE_MS);
        if (stale()) return;
        await board.slide(move.player, move.landed, move.to);
      }
    }
    if (stale()) return;

    game = next;
    moves = nextMoves;
    lastRoll = nextRoll;
    busy = false;
    freshMove = true;
    render();
  }

  refs.roll.addEventListener('click', () => {
    void play(1 + Math.floor(Math.random() * 6), true);
  });
  refs.undo.addEventListener('click', () => stepHistory(-1));
  refs.redo.addEventListener('click', () => stepHistory(1));
  // Ctrl or Cmd + Z undoes, with Shift (or Ctrl + Y) it redoes. Typing in a name field keeps its own undo.
  window.addEventListener('keydown', (event) => {
    if (!active || isTypingTarget(event.target)) return;
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === 'z') {
      event.preventDefault();
      stepHistory(event.shiftKey ? 1 : -1);
    } else if (key === 'y') {
      event.preventDefault();
      stepHistory(1);
    }
  });
  refs.sound.addEventListener('click', () => {
    sound.setEnabled(!sound.enabled);
    render();
  });
  refs.newGame.addEventListener('click', () => {
    startGame(playerCount);
  });
  refs.winnerAgain.addEventListener('click', () => {
    startGame(playerCount);
  });

  // Pick up the saved game if there is one; otherwise start a new one.
  const saved = store.load();
  if (saved) {
    customNames = saved.names;
    names = displayNames(customNames);
    board.setNames(names);
    const { past, future, names: _names, ...present } = saved;
    setState({ past, present, future }, true);
  } else {
    startGame(DEFAULT_PLAYERS);
  }

  // A roll from the board looks like a throw (the die tumbles). A demo key press does not.
  dice.onRoll(({ face, fromDevice }) => {
    void play(face, fromDevice);
  });
  dice.subscribe(({ connected }) => {
    if (connected === live) return;
    live = connected;
    render();
  });

  return {
    setActive(next) {
      active = next;
    },
  };
}
return { mountGame };
})();

// --- features/game/index.js ---
__modules["features/game/index.js"] = (() => {
const { mountGame } = __modules["features/game/view.js"];
// Snake and Ladder: the feature the app opens on.
//
// Folder layout (everything the page needs lives here):
//   index.js    the feature definition the app lists
//   markup.js   the page HTML
//   view.js     turn flow, the side panel, and how the page reacts to the dice
//   board.js    the SVG board and the moving tokens
//   rules.js    the game rules, as plain functions
//   easing.js   curves used by the board animation
//   history.js  undo and redo, as plain functions
//   players.js  player names (a color's own name unless the visitor picks one)
//   storage.js  saves and restores the game in localStorage
//   sound.js    sound effects, made with the Web Audio API
//   game.css    styles, imported from src/styles/index.css


/** @type {import('../../shared/contracts.js').Feature} */
const gameFeature = {
  id: 'game',
  title: 'Snake & Ladder',
  subtitle: 'Roll the Smart Dice to race to square 100',
  mount: (root, { dice }) => mountGame(root, dice),
};
return { gameFeature };
})();

// --- features/dashboard/markup.js ---
__modules["features/dashboard/markup.js"] = (() => {
// The page's HTML. Elements are marked data-ref so the code can find them without ids.

const DASHBOARD_MARKUP = `
  <section class="view" data-ref="view">
    <span class="badge" data-ref="mode">Demo</span>
    <p class="hint" data-ref="hint"></p>
  </section>

  <aside class="panel">
    <div class="card">
      <h2>Upper face</h2>
      <div class="face-row">
        <p class="big" data-ref="face" aria-live="polite">–</p>
        <p class="pill" data-ref="stable" data-kind="moving">Moving</p>
      </div>
      <div class="faces" data-ref="faces" role="group" aria-label="Faces"></div>
    </div>

    <div class="card">
      <h2>Accelerometer (g)</h2>
      <div class="axes">
        <div class="axis" data-axis="x">
          <span class="axis-name">X</span>
          <span class="bar"><i data-ref="barAx"></i></span>
          <span class="axis-value" data-ref="ax">0.00</span>
        </div>
        <div class="axis" data-axis="y">
          <span class="axis-name">Y</span>
          <span class="bar"><i data-ref="barAy"></i></span>
          <span class="axis-value" data-ref="ay">0.00</span>
        </div>
        <div class="axis" data-axis="z">
          <span class="axis-name">Z</span>
          <span class="bar"><i data-ref="barAz"></i></span>
          <span class="axis-value" data-ref="az">1.00</span>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>Recent rolls</h2>
      <div class="history" data-ref="history"></div>
      <p class="empty" data-ref="historyEmpty">Rolls show up here once the die settles.</p>
    </div>
  </aside>
`;
return { DASHBOARD_MARKUP };
})();

// --- features/dashboard/panel.js ---
__modules["features/dashboard/panel.js"] = (() => {
const { FACE_NUMBERS, NO_FACE, faceColor } = __modules["dice/faces.js"];
const { refsOf, restartClass } = __modules["shared/dom.js"];
// Keeps the dashboard's side panel in sync with the dice state.


const HINT_DEMO = 'Press 1–6 or tap a face. Drag to rotate, double-click to reset.';
const HINT_LIVE = 'Drag to rotate, double-click to reset.';
const STABLE_LABELS = { stable: 'Stable', settling: 'Settling', moving: 'Moving' };

const REF_NAMES = [
  'mode',
  'hint',
  'face',
  'stable',
  'faces',
  'ax',
  'ay',
  'az',
  'barAx',
  'barAy',
  'barAz',
  'history',
  'historyEmpty',
];

function stableKind({ face, stable }) {
  if (stable) return 'stable';
  return face === NO_FACE ? 'moving' : 'settling';
}

/** Draws a bar that grows left or right from the center. `value` is in g, shown up to ±1. */
function setAxisBar(bar, value) {
  const fraction = Math.min(Math.abs(value), 1) / 2;
  bar.style.width = `${fraction * 100}%`;
  bar.style.left = `${(value >= 0 ? 0.5 : 0.5 - fraction) * 100}%`;
}

/**
 * @param {HTMLElement} root the dashboard page
 * @param {{ onPickFace: (face: number) => void }} handlers
 * @returns {{ render: (snapshot: import('../../dice/service.js').DiceSnapshot) => void }}
 */
function bindPanel(root, { onPickFace }) {
  const doc = root.ownerDocument;
  const refs = refsOf(root, REF_NAMES);

  // One button per face. They act as the demo remote and mark the upper face.
  const chips = FACE_NUMBERS.map((face) => {
    const chip = doc.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = String(face);
    chip.style.setProperty('--c', faceColor(face));
    chip.setAttribute('aria-label', `Show face ${face}`);
    chip.addEventListener('click', () => {
      onPickFace(face);
    });
    refs.faces.append(chip);
    return chip;
  });

  let shownFace = null;
  let shownRolls = null;

  function renderRolls(rolls) {
    if (rolls === shownRolls) return;
    shownRolls = rolls;
    refs.history.replaceChildren(
      ...rolls.map((face) => {
        const roll = doc.createElement('span');
        roll.className = 'roll';
        roll.textContent = String(face);
        roll.style.setProperty('--c', faceColor(face));
        return roll;
      }),
    );
    refs.historyEmpty.hidden = rolls.length > 0;
  }

  function renderFace(face) {
    if (face === shownFace) return;
    shownFace = face;
    refs.face.textContent = face === NO_FACE ? '–' : String(face);
    // Replay the pop animation.
    restartClass(refs.face, 'pop');
  }

  function render({ state, rolls, connected }) {
    refs.mode.textContent = connected ? 'Live' : 'Demo';
    refs.mode.classList.toggle('live', connected);
    refs.hint.textContent = connected ? HINT_LIVE : HINT_DEMO;

    renderFace(state.face);
    const kind = stableKind(state);
    refs.stable.textContent = STABLE_LABELS[kind];
    refs.stable.dataset.kind = kind;

    chips.forEach((chip, index) => {
      chip.setAttribute('aria-pressed', String(FACE_NUMBERS[index] === state.face));
      chip.disabled = connected;
    });

    refs.ax.textContent = state.ax.toFixed(2);
    refs.ay.textContent = state.ay.toFixed(2);
    refs.az.textContent = state.az.toFixed(2);
    setAxisBar(refs.barAx, state.ax);
    setAxisBar(refs.barAy, state.ay);
    setAxisBar(refs.barAz, state.az);

    renderRolls(rolls);
  }

  return { render };
}
return { bindPanel };
})();

// --- dice/history.js ---
__modules["dice/history.js"] = (() => {
const { NO_FACE } = __modules["dice/faces.js"];
// Rules for what counts as a roll, and the list of recent rolls.


const MAX_ROLLS = 12;

/**
 * True when `next` is a newly settled face compared with `prev`:
 * the die just became stable, or it is stable on a different face.
 */
function isNewRoll(prev, next) {
  if (!next.stable || next.face === NO_FACE) return false;
  return !prev.stable || prev.face !== next.face;
}

/** Returns a new list with `face` first, keeping at most MAX_ROLLS entries. */
function addRoll(rolls, face) {
  return [face, ...rolls].slice(0, MAX_ROLLS);
}
return { MAX_ROLLS, isNewRoll, addRoll };
})();

// --- features/dashboard/scene/motion.js ---
__modules["features/dashboard/scene/motion.js"] = (() => {
// Pure motion helpers for the die scene. No Three.js in here, so they are easy to test.

const MIN_GRAVITY_G = 0.35;
const HOP_GRAVITY = 26;
const HOP_RESTITUTION = 0.4;

/** Upward speed given to the die when a roll lands. */
const HOP_IMPULSE = 4.4;

/** Keeps `value` between `min` and `max`. */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Moves `current` toward `target`, the same way at any frame rate.
 * A higher `rate` gets there faster.
 */
function approach(current, target, dt, rate) {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

/**
 * Converts a sensor gravity reading (in g) to the "up" direction in scene space.
 * Sensor +X is scene +X, sensor +Z is scene +Y, and sensor +Y is scene -Z.
 * Returns null when the reading is too weak to trust (free fall) or not a number.
 * @returns {[number, number, number] | null}
 */
function sensorToSceneUp(ax, ay, az) {
  const length = Math.hypot(ax, ay, az);
  if (!(length >= MIN_GRAVITY_G)) return null;
  return [ax / length, az / length, -ay / length];
}

/**
 * One physics step of the landing hop: a small bounce that settles.
 * `y` is the height above rest and `vy` its speed.
 */
function stepHop({ y, vy }, dt) {
  let nextVy = vy - HOP_GRAVITY * dt;
  let nextY = y + nextVy * dt;
  if (nextY <= 0) {
    nextY = 0;
    const restSpeed = HOP_GRAVITY * dt * 2;
    nextVy = Math.abs(nextVy) > restSpeed ? -nextVy * HOP_RESTITUTION : 0;
  }
  return { y: nextY, vy: nextVy };
}
return { HOP_IMPULSE, clamp, approach, sensorToSceneUp, stepHop };
})();

// --- features/dashboard/scene/orbit.js ---
__modules["features/dashboard/scene/orbit.js"] = (() => {
const { approach, clamp } = __modules["features/dashboard/scene/motion.js"];
// Drag to turn the camera around the die, wheel to zoom, double-click to reset.


const ORBIT_HOME = Object.freeze({ azimuth: 0.65, elevation: 0.46, radius: 7.2 });
const ORBIT_TARGET_Y = -0.35;
const ORBIT_MIN_ELEVATION = 0.05;
const ORBIT_MAX_ELEVATION = 1.35;
const ORBIT_MIN_RADIUS = 4.2;
const ORBIT_MAX_RADIUS = 11;
const ORBIT_DRAG_SPEED = 0.008;
const ORBIT_ZOOM_SPEED = 0.0012;
const ORBIT_INERTIA_DECAY = 3.5;
const ORBIT_MAX_SPIN = 6;
const ORBIT_RETURN_RATE = 6;
const ORBIT_STALE_DRAG_MS = 80;

/**
 * @param {HTMLCanvasElement} canvas receives the pointer events
 * @param {THREE.PerspectiveCamera} camera moved on every update
 * @returns {{ update: (dt: number) => void, fit: (aspect: number) => void, dispose: () => void }}
 */
function createOrbit(canvas, camera) {
  let azimuth = ORBIT_HOME.azimuth;
  let elevation = ORBIT_HOME.elevation;
  let radius = ORBIT_HOME.radius;
  let spinAzimuth = 0;
  let spinElevation = 0;
  let fitScale = 1;
  let dragging = false;
  let homing = false;
  let lastX = 0;
  let lastY = 0;
  let lastTime = 0;

  canvas.style.touchAction = 'none';

  function onPointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    dragging = true;
    homing = false;
    lastX = event.clientX;
    lastY = event.clientY;
    lastTime = event.timeStamp;
    spinAzimuth = 0;
    spinElevation = 0;
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('dragging');
  }

  function onPointerMove(event) {
    if (!dragging) return;
    const seconds = Math.max((event.timeStamp - lastTime) / 1000, 1 / 240);
    const turnAzimuth = -(event.clientX - lastX) * ORBIT_DRAG_SPEED;
    const turnElevation = (event.clientY - lastY) * ORBIT_DRAG_SPEED;
    lastX = event.clientX;
    lastY = event.clientY;
    lastTime = event.timeStamp;
    azimuth += turnAzimuth;
    elevation = clamp(elevation + turnElevation, ORBIT_MIN_ELEVATION, ORBIT_MAX_ELEVATION);
    spinAzimuth = clamp(turnAzimuth / seconds, -ORBIT_MAX_SPIN, ORBIT_MAX_SPIN);
    spinElevation = clamp(turnElevation / seconds, -ORBIT_MAX_SPIN, ORBIT_MAX_SPIN);
  }

  function onPointerUp(event) {
    if (!dragging) return;
    dragging = false;
    canvas.classList.remove('dragging');
    if (event.timeStamp - lastTime > ORBIT_STALE_DRAG_MS) {
      spinAzimuth = 0;
      spinElevation = 0;
    }
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  }

  function onWheel(event) {
    event.preventDefault();
    homing = false;
    radius = clamp(
      radius * Math.exp(event.deltaY * ORBIT_ZOOM_SPEED),
      ORBIT_MIN_RADIUS,
      ORBIT_MAX_RADIUS,
    );
  }

  function onDoubleClick() {
    homing = true;
    spinAzimuth = 0;
    spinElevation = 0;
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('dblclick', onDoubleClick);

  function update(dt) {
    if (!dragging) {
      azimuth += spinAzimuth * dt;
      elevation = clamp(
        elevation + spinElevation * dt,
        ORBIT_MIN_ELEVATION,
        ORBIT_MAX_ELEVATION,
      );
      const decay = Math.exp(-ORBIT_INERTIA_DECAY * dt);
      spinAzimuth *= decay;
      spinElevation *= decay;
    }

    if (homing) {
      const behind = ORBIT_HOME.azimuth - azimuth;
      const shortest = Math.atan2(Math.sin(behind), Math.cos(behind));
      azimuth = approach(azimuth, azimuth + shortest, dt, ORBIT_RETURN_RATE);
      elevation = approach(elevation, ORBIT_HOME.elevation, dt, ORBIT_RETURN_RATE);
      radius = approach(radius, ORBIT_HOME.radius, dt, ORBIT_RETURN_RATE);
      if (Math.abs(shortest) < 0.002 && Math.abs(elevation - ORBIT_HOME.elevation) < 0.002) {
        homing = false;
      }
    }

    const distance = radius * fitScale;
    camera.position.set(
      distance * Math.cos(elevation) * Math.sin(azimuth),
      ORBIT_TARGET_Y + distance * Math.sin(elevation),
      distance * Math.cos(elevation) * Math.cos(azimuth),
    );
    camera.lookAt(0, ORBIT_TARGET_Y, 0);
  }

  /** Pulls the camera back on tall, narrow screens so the die is never cut off. */
  function fit(aspect) {
    fitScale = Math.max(1, 1.05 / aspect);
  }

  function dispose() {
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('dblclick', onDoubleClick);
  }

  return { update, fit, dispose };
}
return { createOrbit };
})();

// --- features/dashboard/scene/textures.js ---
__modules["features/dashboard/scene/textures.js"] = (() => {
const { FACE_COLORS, FACE_PIPS } = __modules["dice/faces.js"];
/* global THREE */


const TEXTURE_SIZE = 512;
const PIP_EDGE = 0.25;
const PIP_STEP = 0.25;
const PIP_RADIUS = 0.075;
const LONE_PIP_RADIUS = 0.115;
const FRAME_INSET = 0.09;
const FRAME_RADIUS = 0.12;
const MAX_ANISOTROPY = 8;
const GRADIENT_SIZE = 256;

function drawPip(ctx, x, y, radius, color) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = radius * 0.9;
  const fill = ctx.createRadialGradient(
    x - radius * 0.3,
    y - radius * 0.3,
    radius * 0.1,
    x,
    y,
    radius,
  );
  fill.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
  fill.addColorStop(0.45, color);
  fill.addColorStop(1, color);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Draws one die face: dark glass with glowing pips in the face color.
 * The same texture is used for color and emission, so only the pips glow.
 * @param {1|2|3|4|5|6} face
 * @returns {THREE.CanvasTexture}
 */
function createFaceTexture(face) {
  const size = TEXTURE_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available');

  const color = FACE_COLORS[face];

  const body = ctx.createLinearGradient(0, 0, size, size);
  body.addColorStop(0, '#182033');
  body.addColorStop(1, '#0c111b');
  ctx.fillStyle = body;
  ctx.fillRect(0, 0, size, size);

  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(
    size * FRAME_INSET,
    size * FRAME_INSET,
    size * (1 - FRAME_INSET * 2),
    size * (1 - FRAME_INSET * 2),
    size * FRAME_RADIUS,
  );
  ctx.stroke();
  ctx.globalAlpha = 1;

  const pips = FACE_PIPS[face];
  const radius = (pips.length === 1 ? LONE_PIP_RADIUS : PIP_RADIUS) * size;
  for (const [column, row] of pips) {
    drawPip(ctx, size * (PIP_EDGE + PIP_STEP * column), size * (PIP_EDGE + PIP_STEP * row), radius, color);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = MAX_ANISOTROPY;
  return texture;
}

/**
 * A soft round fade, used for the floor shadow and glow.
 * @param {string} rgb color as "r, g, b", for example "255, 255, 255"
 * @param {number} peakAlpha opacity at the center, 0 to 1
 * @returns {THREE.CanvasTexture}
 */
function createRadialTexture(rgb, peakAlpha) {
  const canvas = document.createElement('canvas');
  canvas.width = GRADIENT_SIZE;
  canvas.height = GRADIENT_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available');

  const half = GRADIENT_SIZE / 2;
  const fade = ctx.createRadialGradient(half, half, 0, half, half, half);
  fade.addColorStop(0, `rgba(${rgb}, ${peakAlpha})`);
  fade.addColorStop(0.35, `rgba(${rgb}, ${peakAlpha * 0.55})`);
  fade.addColorStop(0.7, `rgba(${rgb}, ${peakAlpha * 0.14})`);
  fade.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, GRADIENT_SIZE, GRADIENT_SIZE);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
return { createFaceTexture, createRadialTexture };
})();

// --- features/dashboard/scene/cube.js ---
__modules["features/dashboard/scene/cube.js"] = (() => {
const { FACE_GRAVITY, FACE_NUMBERS, NO_FACE, faceColor } = __modules["dice/faces.js"];
const { isNewRoll } = __modules["dice/history.js"];
const { HOP_IMPULSE, approach, sensorToSceneUp, stepHop } = __modules["features/dashboard/scene/motion.js"];
const { createOrbit } = __modules["features/dashboard/scene/orbit.js"];
const { createFaceTexture, createRadialTexture } = __modules["features/dashboard/scene/textures.js"];
/* global THREE */

// The 3D die. It follows the board's tilt on a spring, snaps to the reported face
// once the board is still, hops when a roll lands, and glows in the face color.


// BoxGeometry material order is +X, -X, +Y, -Y, +Z, -Z.
const MATERIAL_ORDER = [2, 5, 1, 6, 4, 3];

// The up direction (in scene space) that each face points along on the cube.
const FACE_NORMALS = Object.fromEntries(
  FACE_NUMBERS.map((face) => [face, new THREE.Vector3(...sensorToSceneUp(...FACE_GRAVITY[face]))]),
);

const UP = new THREE.Vector3(0, 1, 0);

const DIE_SIZE = 2;
const DIE_ROUNDNESS = 0.16;
const GROUND_Y = -1.85;
const MAX_PIXEL_RATIO = 2;
const MAX_FRAME_SECONDS = 1 / 30;

const SPIN_STIFFNESS = 120;
const SPIN_DAMPING = 13;
const SPIN_MAX_SPEED = 18;
const SPIN_MIN_ANGLE = 1e-4;

const SHADOW_SIZE = 3.6;
const GLOW_SIZE = 6.4;
const GLOW_COLOR_RATE = 6;
const GLOW_FADE_RATE = 3;
const GLOW_BASE_OPACITY = 0.32;
const GLOW_KICK_OPACITY = 0.45;

const PIPS_ACTIVE = 1.25;
const PIPS_IDLE = 0.5;
const PIPS_NO_FACE = 0.6;
const PIPS_KICK = 0.6;
const PIPS_RATE = 8;

/**
 * Creates the die inside `container` (a positioned element).
 * @param {HTMLElement} container
 * @returns {{ setReading: (reading: object) => void, dispose: () => void, group: THREE.Group, die: THREE.Mesh }}
 *   `group` and `die` are exposed for tests and debugging.
 */
function createCube(container) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.toneMapping = THREE.NeutralToneMapping;
  const canvas = renderer.domElement;
  canvas.className = 'scene';
  container.prepend(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  const orbit = createOrbit(canvas, camera);

  // Soft studio reflections, built in code so no image files are needed.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new THREE.RoomEnvironment(), 0.04);
  pmrem.dispose();
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.8;

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
  keyLight.position.set(3, 6, 4);
  scene.add(keyLight);

  // Floor glow (face color) and contact shadow.
  const glowTexture = createRadialTexture('255, 255, 255', 1);
  const glowMaterial = new THREE.MeshBasicMaterial({
    map: glowTexture,
    color: new THREE.Color(faceColor(1)),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: GLOW_BASE_OPACITY,
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), glowMaterial);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = GROUND_Y - 0.01;
  glow.scale.setScalar(GLOW_SIZE);
  glow.renderOrder = 0;
  scene.add(glow);

  const shadowTexture = createRadialTexture('0, 0, 0', 0.8);
  const shadowMaterial = new THREE.MeshBasicMaterial({
    map: shadowTexture,
    transparent: true,
    depthWrite: false,
  });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMaterial);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = GROUND_Y;
  shadow.renderOrder = 1;
  scene.add(shadow);

  // The die. The group carries the hop and the gentle sway; the mesh carries the tilt.
  const group = new THREE.Group();
  scene.add(group);

  const geometry = new THREE.RoundedBoxGeometry(DIE_SIZE, DIE_SIZE, DIE_SIZE, 6, DIE_ROUNDNESS);
  const textures = MATERIAL_ORDER.map((face) => createFaceTexture(face));
  const materials = textures.map(
    (map) =>
      new THREE.MeshPhysicalMaterial({
        map,
        emissiveMap: map,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: PIPS_IDLE,
        roughness: 0.3,
        metalness: 0.05,
        clearcoat: 1,
        clearcoatRoughness: 0.15,
      }),
  );
  const die = new THREE.Mesh(geometry, materials);
  group.add(die);

  const reading = { face: 1, stable: false, ax: 0, ay: 0, az: 1 };
  const target = new THREE.Quaternion();
  const spin = new THREE.Vector3();
  const glowColorTarget = new THREE.Color(faceColor(reading.face));
  const pipLevels = materials.map(() => PIPS_IDLE);
  let hop = { y: 0, vy: 0 };
  let kick = 0;
  let clock = 0;

  // Scratch objects, reused every frame.
  const scratchUp = new THREE.Vector3();
  const scratchAxis = new THREE.Vector3();
  const scratchError = new THREE.Quaternion();
  const scratchInverse = new THREE.Quaternion();
  const scratchTurn = new THREE.Quaternion();

  function updateTarget() {
    if (reading.stable && reading.face !== NO_FACE) {
      target.setFromUnitVectors(FACE_NORMALS[reading.face], UP);
      return;
    }
    // Still moving: follow the real gravity direction from the sensor.
    const up = sensorToSceneUp(reading.ax, reading.ay, reading.az);
    if (up) target.setFromUnitVectors(scratchUp.set(...up), UP);
  }

  /** Feed the latest state: { face, stable, ax, ay, az }. */
  function setReading(next) {
    if (isNewRoll(reading, next) && !reduceMotion.matches) {
      hop = { y: hop.y, vy: HOP_IMPULSE };
      kick = 1;
    }
    Object.assign(reading, next);
    glowColorTarget.set(faceColor(reading.face));
    updateTarget();
  }

  updateTarget();
  die.quaternion.copy(target);

  function resize() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    orbit.fit(camera.aspect);
  }

  const observer = new ResizeObserver(resize);
  observer.observe(container);

  /** Spring the mesh toward the target pose. Overshoots a little, then settles. */
  function stepTilt(dt) {
    const damping = reduceMotion.matches ? 2 * Math.sqrt(SPIN_STIFFNESS) : SPIN_DAMPING;

    scratchError.copy(target).multiply(scratchInverse.copy(die.quaternion).invert());
    if (scratchError.w < 0) {
      scratchError.set(-scratchError.x, -scratchError.y, -scratchError.z, -scratchError.w);
    }
    const angle = 2 * Math.acos(Math.min(1, scratchError.w));
    if (angle > SPIN_MIN_ANGLE) {
      const sine = Math.sqrt(1 - scratchError.w * scratchError.w);
      scratchAxis.set(scratchError.x / sine, scratchError.y / sine, scratchError.z / sine);
      spin.addScaledVector(scratchAxis, angle * SPIN_STIFFNESS * dt);
    }

    spin.multiplyScalar(Math.exp(-damping * dt));
    spin.clampLength(0, SPIN_MAX_SPEED);

    const speed = spin.length();
    if (speed > 1e-5) {
      scratchTurn.setFromAxisAngle(scratchAxis.copy(spin).divideScalar(speed), speed * dt);
      die.quaternion.premultiply(scratchTurn).normalize();
    }
  }

  function stepFloating(dt) {
    clock += dt;
    if (reduceMotion.matches) {
      hop = { y: 0, vy: 0 };
      group.position.y = 0;
      group.rotation.y = 0;
      return 0;
    }
    hop = stepHop(hop, dt);
    const bob = Math.sin(clock * 1.6) * 0.05;
    group.position.y = hop.y + bob;
    // Turning around the vertical axis never changes which face is up.
    group.rotation.y = Math.sin(clock * 0.45) * 0.22;
    return Math.max(0, hop.y + bob * 0.5);
  }

  function stepGlow(dt, lift) {
    kick = approach(kick, 0, dt, GLOW_FADE_RATE);
    glowMaterial.color.lerp(glowColorTarget, 1 - Math.exp(-GLOW_COLOR_RATE * dt));
    glowMaterial.opacity = GLOW_BASE_OPACITY + GLOW_KICK_OPACITY * kick;
    glow.scale.setScalar(GLOW_SIZE * (1 + 0.12 * kick));

    shadow.scale.setScalar(SHADOW_SIZE * (1 - lift * 0.35));
    shadowMaterial.opacity = Math.max(0.3, 1 - lift * 1.2);

    materials.forEach((material, index) => {
      const face = MATERIAL_ORDER[index];
      let goal = reading.face === NO_FACE ? PIPS_NO_FACE : PIPS_IDLE;
      if (reading.face === face) goal = PIPS_ACTIVE + kick * PIPS_KICK;
      pipLevels[index] = approach(pipLevels[index], goal, dt, PIPS_RATE);
      material.emissiveIntensity = pipLevels[index];
    });
  }

  let frameId = 0;
  let lastTime = performance.now();

  function tick(now) {
    const dt = Math.min((now - lastTime) / 1000, MAX_FRAME_SECONDS);
    lastTime = now;

    stepTilt(dt);
    const lift = stepFloating(dt);
    stepGlow(dt, lift);
    orbit.update(dt);
    renderer.render(scene, camera);

    frameId = requestAnimationFrame(tick);
  }
  frameId = requestAnimationFrame(tick);

  function dispose() {
    cancelAnimationFrame(frameId);
    observer.disconnect();
    orbit.dispose();
    for (const material of materials) material.dispose();
    for (const texture of [...textures, glowTexture, shadowTexture]) texture.dispose();
    geometry.dispose();
    glow.geometry.dispose();
    shadow.geometry.dispose();
    glowMaterial.dispose();
    shadowMaterial.dispose();
    environment.dispose();
    renderer.dispose();
    canvas.remove();
  }

  return { setReading, dispose, group, die };
}
return { createCube };
})();

// --- features/dashboard/index.js ---
__modules["features/dashboard/index.js"] = (() => {
const { refsOf } = __modules["shared/dom.js"];
const { DASHBOARD_MARKUP } = __modules["features/dashboard/markup.js"];
const { bindPanel } = __modules["features/dashboard/panel.js"];
const { createCube } = __modules["features/dashboard/scene/cube.js"];
// Dice dashboard: a 3D cube that follows the board, plus live readings.
//
// Folder layout (everything the page needs lives here):
//   index.js    the feature definition the app lists, and the code that wires the page together
//   markup.js   the page HTML
//   panel.js    the side panel (upper face, accelerometer, recent rolls)
//   scene/      the Three.js cube: lighting, spring motion, camera, textures
//   dashboard.css  styles, imported from src/styles/index.css


/** @type {import('../../shared/contracts.js').Feature} */
const dashboardFeature = {
  id: 'dice',
  title: 'Dice',
  subtitle: 'XIAO nRF52840 Sense over Bluetooth LE',
  mount(root, { dice }) {
    root.innerHTML = DASHBOARD_MARKUP;
    const { view } = refsOf(root, ['view']);

    const panel = bindPanel(root, { onPickFace: dice.showDemoFace });
    const cube = createCube(view);

    dice.subscribe((snapshot) => {
      panel.render(snapshot);
      cube.setReading(snapshot.state);
    });
  },
};
return { dashboardFeature };
})();

// --- app/features.js ---
__modules["app/features.js"] = (() => {
const { gameFeature } = __modules["features/game/index.js"];
const { dashboardFeature } = __modules["features/dashboard/index.js"];
// The list of pages. This is the only file that knows every feature.
// To add a page: build it in src/features/<name>/, import it here, and add it to the list.
// The first one is the page the app opens on.


const FEATURES = Object.freeze([gameFeature, dashboardFeature]);
return { FEATURES };
})();

// --- app/router.js ---
__modules["app/router.js"] = (() => {
// Which page to show, taken from the URL hash.

/**
 * The page named by a URL hash such as "#dice". Anything unknown gives `fallback`,
 * so the app always has a page to show.
 * @param {string} hash
 * @param {readonly string[]} ids the page ids that exist
 * @param {string} fallback
 */
function pageFromHash(hash, ids, fallback) {
  const name = hash.replace(/^#/, '');
  return ids.includes(name) ? name : fallback;
}
return { pageFromHash };
})();

// --- app/shell.js ---
__modules["app/shell.js"] = (() => {
const { pageFromHash } = __modules["app/router.js"];
// The app shell. It knows nothing about any page except the Feature contract in
// shared/contracts.js: it makes a tab and a content area for each feature, shows the one
// named in the URL, and mounts a feature the first time it is opened.


/** @typedef {import('../shared/contracts.js').Feature} Feature */
/** @typedef {import('../shared/contracts.js').FeatureInstance} FeatureInstance */
/** @typedef {import('../shared/contracts.js').Services} Services */

/**
 * @param {{ doc: Document, win: Window, features: readonly Feature[], services: Services }} options
 *   The first feature is the default page.
 */
function startShell({ doc, win, features, services }) {
  if (features.length === 0) throw new Error('No features to show');
  const ids = features.map((feature) => feature.id);
  if (new Set(ids).size !== ids.length) throw new Error(`Duplicate feature ids: ${ids.join(', ')}`);

  const tabs = doc.getElementById('tabs');
  const pages = doc.getElementById('pages');
  const subtitle = doc.getElementById('subtitle');
  if (!tabs || !pages) throw new Error('Missing #tabs or #pages element');

  const entries = features.map((feature) => {
    const link = doc.createElement('a');
    link.href = `#${feature.id}`;
    link.textContent = feature.title;
    tabs.append(link);

    const root = doc.createElement('main');
    root.className = 'page';
    root.dataset.feature = feature.id;
    root.hidden = true;
    pages.append(root);

    return { feature, link, root, instance: /** @type {FeatureInstance | null} */ (null) };
  });

  function show() {
    const id = pageFromHash(win.location.hash, ids, ids[0]);
    for (const entry of entries) {
      const current = entry.feature.id === id;
      entry.root.hidden = !current;
      if (current) entry.link.setAttribute('aria-current', 'page');
      else entry.link.removeAttribute('aria-current');
    }

    const shown = entries.find((entry) => entry.feature.id === id);
    if (!shown) return;
    // Mount while the page is visible, so anything that measures its size gets real numbers.
    shown.instance ??= shown.feature.mount(shown.root, services) ?? {};
    if (subtitle) subtitle.textContent = shown.feature.subtitle;
    doc.title = `${shown.feature.title} · Smart Dice`;

    for (const entry of entries) {
      entry.instance?.setActive?.(entry === shown);
    }
  }

  win.addEventListener('hashchange', show);
  show();
}
return { startShell };
})();

// --- dice/demo-keys.js ---
__modules["dice/demo-keys.js"] = (() => {
const { isTypingTarget } = __modules["shared/dom.js"];
const { isFaceNumber } = __modules["dice/faces.js"];
// Demo mode: with no board connected, the keys 1 to 6 act as the dice.


/**
 * @param {Window} win
 * @param {{ showDemoFace: (face: number) => void }} dice
 * @returns {() => void} stops listening
 */
function bindDemoKeys(win, dice) {
  function onKeyDown(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (isTypingTarget(event.target)) return;
    const face = Number(event.key);
    if (isFaceNumber(face)) dice.showDemoFace(face);
  }
  win.addEventListener('keydown', onKeyDown);
  return () => win.removeEventListener('keydown', onKeyDown);
}
return { bindDemoKeys };
})();

// --- dice/protocol.js ---
__modules["dice/protocol.js"] = (() => {
const { toFace } = __modules["dice/faces.js"];
// Bluetooth UUIDs and the state packet layout.
// These must match firmware/smart_dice/smart_dice.ino (see docs/protocol.md).


const SERVICE_UUID = 'f0bd0001-2ae7-429a-8fe0-3aa48ebf8220';
const STATE_UUID = 'f0bd0002-2ae7-429a-8fe0-3aa48ebf8220';

const STATE_PACKET_SIZE = 8;

const MILLI_G_PER_G = 1000;

/**
 * Decodes the 8-byte little-endian state packet.
 * @param {DataView} view
 * @returns {{ ax: number, ay: number, az: number, face: number, stable: boolean }}
 * @throws {RangeError} if the packet is shorter than STATE_PACKET_SIZE.
 */
function parseState(view) {
  if (view.byteLength < STATE_PACKET_SIZE) {
    throw new RangeError(
      `State packet must be ${STATE_PACKET_SIZE} bytes, got ${view.byteLength}`,
    );
  }
  return {
    ax: view.getInt16(0, true) / MILLI_G_PER_G,
    ay: view.getInt16(2, true) / MILLI_G_PER_G,
    az: view.getInt16(4, true) / MILLI_G_PER_G,
    face: toFace(view.getUint8(6)),
    stable: view.getUint8(7) === 1,
  };
}
return { SERVICE_UUID, STATE_UUID, STATE_PACKET_SIZE, parseState };
})();

// --- dice/bluetooth.js ---
__modules["dice/bluetooth.js"] = (() => {
const { parseState, SERVICE_UUID, STATE_UUID } = __modules["dice/protocol.js"];
// Web Bluetooth link to the Smart Dice board.
// Must be started from a user gesture (a button click).


function isBluetoothSupported() {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

/** True when the person closed the device picker without choosing a board. */
function isPickerCancelled(error) {
  return error instanceof DOMException && error.name === 'NotFoundError';
}

/**
 * Opens the device picker, connects, and subscribes to state notifications.
 * @param {{ onState: (state: object) => void, onDisconnect: () => void }} handlers
 * @returns {Promise<{ name: string, disconnect: () => void }>}
 */
async function connect({ onState, onDisconnect }) {
  const device = await navigator.bluetooth.requestDevice({
    filters: [{ services: [SERVICE_UUID] }],
  });
  device.addEventListener('gattserverdisconnected', onDisconnect);

  const { gatt } = device;
  if (!gatt) throw new Error('This device has no GATT server');

  try {
    const server = await gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);
    const characteristic = await service.getCharacteristic(STATE_UUID);

    characteristic.addEventListener('characteristicvaluechanged', () => {
      if (!characteristic.value) return;
      try {
        onState(parseState(characteristic.value));
      } catch (error) {
        console.warn('Ignoring bad state packet', error);
      }
    });
    await characteristic.startNotifications();
  } catch (error) {
    // Do not leave a half-open connection behind.
    device.removeEventListener('gattserverdisconnected', onDisconnect);
    gatt.disconnect();
    throw error;
  }

  return {
    name: device.name ?? 'SmartDice',
    disconnect: () => {
      gatt.disconnect();
    },
  };
}
return { isBluetoothSupported, isPickerCancelled, connect };
})();

// --- dice/service.js ---
__modules["dice/service.js"] = (() => {
const { connect, isBluetoothSupported, isPickerCancelled } = __modules["dice/bluetooth.js"];
const { FACE_GRAVITY, isFaceNumber } = __modules["dice/faces.js"];
const { addRoll, isNewRoll } = __modules["dice/history.js"];
// The one dice for the whole app: a Bluetooth connection, or demo mode when nothing is connected.
// Pages never touch Bluetooth. They get this service and use two methods:
//   subscribe(fn)  fn(snapshot) now and after every change: the live state, recent rolls, connection
//   onRoll(fn)     fn({ face, fromDevice }) each time a roll happens: the board settled, or a demo pick
// Both return a function that stops listening.


const INITIAL_STATE = Object.freeze({ ax: 0, ay: 0, az: 1, face: 1, stable: false });

/**
 * @typedef {object} DiceSnapshot
 * @property {{ ax: number, ay: number, az: number, face: number, stable: boolean }} state
 * @property {number[]} rolls newest first
 * @property {string | null} deviceName
 * @property {boolean} connected
 * @property {boolean} busy
 * @property {string | null} error
 * @property {boolean} supported
 */

/**
 * @typedef {object} DiceService
 * @property {(listener: (snapshot: DiceSnapshot) => void) => () => void} subscribe
 * @property {(listener: (roll: { face: number, fromDevice: boolean }) => void) => () => void} onRoll
 * @property {() => Promise<void>} toggle connect or disconnect the board
 * @property {(face: number) => void} showDemoFace pretend the board settled on `face` (ignored while connected)
 * @property {() => DiceSnapshot} getSnapshot
 */

/** @returns {DiceService} */
function createDiceService() {
  const supported = isBluetoothSupported();

  let state = INITIAL_STATE;
  let rolls = [];
  let deviceName = null;
  let busy = false;
  let error = null;
  /** @type {{ name: string, disconnect: () => void } | null} */
  let link = null;

  const snapshotListeners = new Set();
  const rollListeners = new Set();

  function snapshot() {
    return { state, rolls, deviceName, connected: link !== null, busy, error, supported };
  }

  function publish() {
    const current = snapshot();
    for (const listener of [...snapshotListeners]) listener(current);
  }

  function emitRoll(face, fromDevice) {
    for (const listener of [...rollListeners]) listener({ face, fromDevice });
  }

  /** Stores the new state and tells subscribers. Returns true when it is a newly settled roll. */
  function apply(next) {
    const settled = isNewRoll(state, next);
    if (settled) rolls = addRoll(rolls, next.face);
    state = next;
    publish();
    return settled;
  }

  function showDemoFace(face) {
    if (link || !isFaceNumber(face)) return;
    const [ax, ay, az] = FACE_GRAVITY[face];
    apply({ ax, ay, az, face, stable: true });
    // Picking the same face again is still a roll, so demo mode always reports one.
    emitRoll(face, false);
  }

  async function toggle() {
    error = null;
    if (link) {
      link.disconnect();
      return;
    }

    busy = true;
    publish();
    try {
      link = await connect({
        onState: (next) => {
          if (apply(next)) emitRoll(next.face, true);
        },
        onDisconnect: () => {
          link = null;
          deviceName = null;
          publish();
        },
      });
      deviceName = link.name;
    } catch (err) {
      if (!isPickerCancelled(err)) {
        const reason = err instanceof Error ? err.message : String(err);
        error = `Could not connect: ${reason}`;
      }
    } finally {
      busy = false;
      publish();
    }
  }

  return {
    subscribe(listener) {
      snapshotListeners.add(listener);
      listener(snapshot());
      return () => snapshotListeners.delete(listener);
    },
    onRoll(listener) {
      rollListeners.add(listener);
      return () => rollListeners.delete(listener);
    },
    toggle,
    showDemoFace,
    getSnapshot: snapshot,
  };
}
return { createDiceService };
})();

// --- main.js ---
__modules["main.js"] = (() => {
const { bindAmbient } = __modules["app/ambient.js"];
const { bindConnection } = __modules["app/connection.js"];
const { FEATURES } = __modules["app/features.js"];
const { startShell } = __modules["app/shell.js"];
const { bindDemoKeys } = __modules["dice/demo-keys.js"];
const { createDiceService } = __modules["dice/service.js"];
// Entry point: creates the shared services, then hands the pages to the shell.


const dice = createDiceService();

bindDemoKeys(window, dice);
bindConnection(document, dice);
bindAmbient(document, dice);
startShell({ doc: document, win: window, features: FEATURES, services: { dice } });
return {};
})();

})();
