// Draws the snake and ladder board as SVG and animates the player tokens on it.
// Tokens are moved by hand each frame (not with CSS transitions), so a walk, a ladder climb
// and a snake swallowing a token can each follow their own path, and the snakes can
// strike, bulge and flick while they do it.

import { BOARD_SIZE, LADDERS, LAST_SQUARE, PLAYER_COLORS, PLAYER_NAMES, SNAKES, START_SQUARE, squareCell } from './rules.js';
import { cruise, easeInOutSine, easeOutBack, easeOutCubic, hopHeight, hopShape, lerp } from './easing.js';

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
export function snakeCurve(headSquare, tailSquare) {
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
export function createBoardView(container, sound = SILENT_SOUND) {
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
