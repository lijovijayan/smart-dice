// The shared dice layer: packet decoding, face mapping, rolls, and the service pages use.

import { assertEqual, assertTrue } from '../assert.js';
import { bindDemoKeys } from '../../src/dice/demo-keys.js';
import {
  FACE_COLORS,
  FACE_GRAVITY,
  FACE_NUMBERS,
  FACE_PIPS,
  faceColor,
  isFaceNumber,
  NO_FACE,
  toFace,
} from '../../src/dice/faces.js';
import { addRoll, isNewRoll, MAX_ROLLS } from '../../src/dice/history.js';
import { parseState, STATE_PACKET_SIZE } from '../../src/dice/protocol.js';
import { createDiceService } from '../../src/dice/service.js';

function packet(ax, ay, az, face, stable) {
  const view = new DataView(new ArrayBuffer(STATE_PACKET_SIZE));
  view.setInt16(0, ax, true);
  view.setInt16(2, ay, true);
  view.setInt16(4, az, true);
  view.setUint8(6, face);
  view.setUint8(7, stable);
  return view;
}

export const tests = [
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
      }),
  ],
  [
    'parseState reads little-endian negative values',
    () => {
      const state = parseState(packet(-1000, 0, -32768, 6, 0));
      assertEqual(state.ax, -1);
      assertTrue(Math.abs(state.az + 32.768) < 1e-9, `unexpected az ${state.az}`);
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

  // Service
  [
    'service.subscribe reports the current state at once, and stops after unsubscribe',
    () => {
      const dice = createDiceService();
      const seen = [];
      const stop = dice.subscribe((snapshot) => seen.push(snapshot.state.face));
      assertEqual(seen, [1]);
      dice.showDemoFace(4);
      assertEqual(seen, [1, 4]);
      stop();
      dice.showDemoFace(5);
      assertEqual(seen, [1, 4]);
    },
  ],
  [
    'service keeps recent rolls in demo mode and reports no device',
    () => {
      const dice = createDiceService();
      dice.showDemoFace(3);
      dice.showDemoFace(5);
      const snapshot = dice.getSnapshot();
      assertEqual(snapshot.rolls, [5, 3]);
      assertEqual(snapshot.connected, false);
      assertEqual(snapshot.state.face, 5);
    },
  ],
  [
    'service.onRoll fires for every demo pick, even the same face twice',
    () => {
      const dice = createDiceService();
      const rolls = [];
      dice.onRoll((roll) => rolls.push(roll));
      dice.showDemoFace(2);
      dice.showDemoFace(2);
      assertEqual(rolls, [
        { face: 2, fromDevice: false },
        { face: 2, fromDevice: false },
      ]);
    },
  ],
  [
    'service ignores faces that do not exist',
    () => {
      const dice = createDiceService();
      let count = 0;
      dice.onRoll(() => {
        count += 1;
      });
      for (const face of [0, 7, 2.5, Number.NaN]) dice.showDemoFace(face);
      assertEqual(count, 0);
      assertEqual(dice.getSnapshot().rolls, []);
    },
  ],
  [
    'bindDemoKeys turns the keys 1 to 6 into demo rolls and ignores the rest',
    () => {
      let handler = null;
      const win = {
        addEventListener: (type, fn) => {
          if (type === 'keydown') handler = fn;
        },
        removeEventListener: () => {
          handler = null;
        },
      };
      const faces = [];
      const stop = bindDemoKeys(win, { showDemoFace: (face) => faces.push(face) });
      handler({ key: '3' });
      handler({ key: 'a' });
      handler({ key: '4', ctrlKey: true });
      handler({ key: '6' });
      handler({ key: '5', target: { tagName: 'INPUT' } });
      handler({ key: '2', target: { tagName: 'BUTTON' } });
      assertEqual(faces, [3, 6, 2]);
      stop();
      assertEqual(handler, null);
    },
  ],
];
