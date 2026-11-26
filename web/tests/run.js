// Browser test page: open http://localhost:8000/tests/ while a local server runs in web/.
// Covers the pure logic only: packet decoding, face mapping, rolls, and motion math.

import {
  FACE_COLORS,
  FACE_GRAVITY,
  FACE_NUMBERS,
  FACE_PIPS,
  faceColor,
  isFaceNumber,
  NO_FACE,
  toFace,
} from '../src/dice/faces.js';
import { addRoll, isNewRoll, MAX_ROLLS } from '../src/dice/history.js';
import { formatDuration, powerStatus, SLEEP_WARNING_SECONDS } from '../src/dice/power.js';
import { parseState, STATE_PACKET_FULL_SIZE, STATE_PACKET_SIZE } from '../src/dice/protocol.js';
import { approach, clamp, HOP_IMPULSE, sensorToSceneUp, stepHop } from '../src/scene/motion.js';

class AssertionError extends Error {}

function assertEqual(actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new AssertionError(`expected ${e}, got ${a}`);
}

function assertTrue(value, message) {
  if (!value) throw new AssertionError(message);
}

function assertClose(actual, expected, tolerance = 1e-9) {
  assertTrue(Math.abs(actual - expected) <= tolerance, `expected ${expected}, got ${actual}`);
}

function packet(ax, ay, az, face, stable, sleepIn) {
  const size = sleepIn === undefined ? STATE_PACKET_SIZE : STATE_PACKET_FULL_SIZE;
  const view = new DataView(new ArrayBuffer(size));
  view.setInt16(0, ax, true);
  view.setInt16(2, ay, true);
  view.setInt16(4, az, true);
  view.setUint8(6, face);
  view.setUint8(7, stable);
  if (sleepIn !== undefined) view.setUint8(8, sleepIn);
  return view;
}

const tests = [
  // Protocol
  [
    'parseState converts milli-g to g and reads face and stable',
    () =>
      assertEqual(parseState(packet(1000, -500, 0, 2, 1)), {
        ax: 1,
        ay: -0.5,
        az: 0,
        face: 2,
        stable: true,
        sleepIn: null,
      }),
  ],
  [
    'parseState reads the seconds until sleep, and treats 255 and missing as "not reported"',
    () => {
      assertEqual(parseState(packet(0, 0, 1000, 1, 1, 42)).sleepIn, 42);
      assertEqual(parseState(packet(0, 0, 1000, 1, 1, 0)).sleepIn, 0);
      assertEqual(parseState(packet(0, 0, 1000, 1, 1, 255)).sleepIn, null);
      assertEqual(parseState(packet(0, 0, 1000, 1, 1)).sleepIn, null);
    },
  ],
  [
    'formatDuration writes seconds and minutes',
    () => {
      assertEqual(formatDuration(0), '0 s');
      assertEqual(formatDuration(45), '45 s');
      assertEqual(formatDuration(120), '2 min');
      assertEqual(formatDuration(185), '3 min 5 s');
    },
  ],
  [
    'powerStatus says asleep, going to sleep, awake, or unknown',
    () => {
      const asleep = powerStatus({ connected: false, asleep: true, sleepIn: 0 });
      assertEqual([asleep.kind, asleep.label], ['asleep', 'Asleep']);

      const idle = powerStatus({ connected: false, asleep: false, sleepIn: null });
      assertEqual(idle.kind, 'unknown');

      const awake = powerStatus({ connected: true, asleep: false, sleepIn: 120 });
      assertEqual([awake.kind, awake.label], ['awake', 'Awake']);
      assertTrue(awake.note.includes('2 min'), 'the note gives the time left');

      const soon = powerStatus({ connected: true, asleep: false, sleepIn: SLEEP_WARNING_SECONDS });
      assertEqual([soon.kind, soon.label], ['soon', 'Sleeping in 20 s']);
      assertEqual(powerStatus({ connected: true, asleep: false, sleepIn: 0 }).label, 'Going to sleep');

      const off = powerStatus({ connected: true, asleep: false, sleepIn: null });
      assertEqual([off.kind, off.label], ['unknown', 'Awake']);
      assertEqual(powerStatus({ connected: true, asleep: false, sleepIn: undefined }).kind, 'unknown');
    },
  ],
  [
    'parseState reads little-endian negative values',
    () => {
      const state = parseState(packet(-1000, 0, -32768, 6, 0));
      assertEqual(state.ax, -1);
      assertClose(state.az, -32.768);
      assertEqual(state.stable, false);
    },
  ],
  [
    'parseState maps unknown face bytes to 0',
    () => {
      assertEqual(parseState(packet(0, 0, 0, 0, 0)).face, 0);
      assertEqual(parseState(packet(0, 0, 0, 7, 0)).face, 0);
      assertEqual(parseState(packet(0, 0, 0, 255, 0)).face, 0);
    },
  ],
  [
    'parseState rejects packets that are too short',
    () => {
      let threw = false;
      try {
        parseState(new DataView(new ArrayBuffer(7)));
      } catch (error) {
        threw = error instanceof RangeError;
      }
      assertTrue(threw, 'expected a RangeError');
    },
  ],

  // Faces
  [
    'isFaceNumber accepts only 1 to 6',
    () => {
      assertTrue(FACE_NUMBERS.every(isFaceNumber), 'faces 1-6 should be valid');
      for (const value of [0, 7, -1, 1.5, Number.NaN]) {
        assertTrue(!isFaceNumber(value), `${value} should be invalid`);
      }
    },
  ],
  [
    'toFace passes valid faces through and maps the rest to 0',
    () => {
      assertEqual(toFace(3), 3);
      assertEqual(toFace(9), 0);
    },
  ],
  [
    'opposite faces point along opposite gravity axes (sum to 7)',
    () => {
      for (const face of FACE_NUMBERS) {
        const [x, y, z] = FACE_GRAVITY[face];
        const [ox, oy, oz] = FACE_GRAVITY[7 - face];
        assertEqual([x + ox, y + oy, z + oz], [0, 0, 0]);
      }
    },
  ],
  [
    'faceColor gives each face its own color and a neutral color for no face',
    () => {
      const colors = FACE_NUMBERS.map(faceColor);
      assertEqual(new Set(colors).size, 6);
      assertEqual(colors[0], FACE_COLORS[1]);
      assertTrue(!colors.includes(faceColor(NO_FACE)), 'no-face color should be different');
    },
  ],
  [
    'each face has as many pips as its number, all on the 3 by 3 grid',
    () => {
      for (const face of FACE_NUMBERS) {
        const pips = FACE_PIPS[face];
        assertEqual(pips.length, face);
        assertEqual(new Set(pips.map(([c, r]) => `${c},${r}`)).size, face);
        assertTrue(
          pips.every(([c, r]) => c >= 0 && c <= 2 && r >= 0 && r <= 2),
          `face ${face} has a pip outside the grid`,
        );
      }
    },
  ],

  // Rolls
  [
    'isNewRoll is true when the die becomes stable or settles on another face',
    () => {
      const moving = { face: 2, stable: false };
      const onTwo = { face: 2, stable: true };
      const onFive = { face: 5, stable: true };
      assertEqual(isNewRoll(moving, onTwo), true);
      assertEqual(isNewRoll(onTwo, onFive), true);
    },
  ],
  [
    'isNewRoll is false for repeats, motion, and no clear face',
    () => {
      const onTwo = { face: 2, stable: true };
      assertEqual(isNewRoll(onTwo, { ...onTwo }), false);
      assertEqual(isNewRoll(onTwo, { face: 2, stable: false }), false);
      assertEqual(isNewRoll(onTwo, { face: 0, stable: true }), false);
    },
  ],
  [
    'addRoll puts the newest first and keeps at most MAX_ROLLS',
    () => {
      let rolls = [];
      for (let i = 0; i < MAX_ROLLS + 5; i += 1) rolls = addRoll(rolls, (i % 6) + 1);
      assertEqual(rolls.length, MAX_ROLLS);
      assertEqual(addRoll([1, 2], 6), [6, 1, 2]);
    },
  ],

  // Motion
  [
    'clamp limits a value to a range',
    () => {
      assertEqual(clamp(5, 0, 1), 1);
      assertEqual(clamp(-5, 0, 1), 0);
      assertEqual(clamp(0.4, 0, 1), 0.4);
    },
  ],
  [
    'approach moves toward the target, never past it, and not at all with no time',
    () => {
      assertEqual(approach(3, 10, 0, 8), 3);
      const next = approach(0, 1, 1 / 60, 8);
      assertTrue(next > 0 && next < 1, `expected between 0 and 1, got ${next}`);
      assertClose(approach(0, 1, 100, 8), 1, 1e-6);
    },
  ],
  [
    'sensorToSceneUp maps sensor axes to scene axes',
    () => {
      assertEqual(sensorToSceneUp(0, 0, 1), [0, 1, 0]);
      assertEqual(sensorToSceneUp(1, 0, 0), [1, 0, 0]);
      assertEqual(sensorToSceneUp(0, 1, 0), [0, 0, -1]);
    },
  ],
  [
    'sensorToSceneUp returns a unit vector and ignores free fall and bad numbers',
    () => {
      const [x, y, z] = sensorToSceneUp(0.6, 0.3, 0.5);
      assertClose(Math.hypot(x, y, z), 1);
      assertEqual(sensorToSceneUp(0, 0, 0.05), null);
      assertEqual(sensorToSceneUp(Number.NaN, 0, 1), null);
    },
  ],
  [
    'opposite faces point in opposite scene directions',
    () => {
      for (const face of FACE_NUMBERS) {
        const [x, y, z] = sensorToSceneUp(...FACE_GRAVITY[face]);
        const [ox, oy, oz] = sensorToSceneUp(...FACE_GRAVITY[7 - face]);
        assertEqual([x + ox, y + oy, z + oz], [0, 0, 0]);
      }
    },
  ],
  [
    'stepHop rises, never goes below the floor, and comes to rest',
    () => {
      let hop = { y: 0, vy: HOP_IMPULSE };
      let peak = 0;
      for (let step = 0; step < 300; step += 1) {
        hop = stepHop(hop, 1 / 60);
        assertTrue(hop.y >= 0, `went below the floor: ${hop.y}`);
        peak = Math.max(peak, hop.y);
      }
      assertTrue(peak > 0.2 && peak < 0.6, `unexpected peak ${peak}`);
      assertEqual(hop, { y: 0, vy: 0 });
    },
  ],
  [
    'stepHop stays put when nothing is moving',
    () => assertEqual(stepHop({ y: 0, vy: 0 }, 1 / 60), { y: 0, vy: 0 }),
  ],
  [
    'stepHop also settles at a slow frame rate',
    () => {
      let hop = { y: 0, vy: HOP_IMPULSE };
      for (let step = 0; step < 100; step += 1) hop = stepHop(hop, 1 / 30);
      assertEqual(hop, { y: 0, vy: 0 });
    },
  ],
];

const list = document.getElementById('results');
let passed = 0;

for (const [name, run] of tests) {
  const item = document.createElement('li');
  try {
    run();
    item.className = 'pass';
    item.textContent = name;
    passed += 1;
  } catch (error) {
    item.className = 'fail';
    item.textContent = name;
    const detail = document.createElement('small');
    detail.textContent = error instanceof Error ? error.message : String(error);
    item.append(detail);
  }
  list.append(item);
}

const summary = document.getElementById('summary');
if (summary) {
  summary.textContent = `${passed} of ${tests.length} passed`;
}
