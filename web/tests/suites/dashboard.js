// The dice dashboard feature: the motion math behind the 3D cube.

import { assertClose, assertEqual, assertTrue } from '../assert.js';
import { FACE_GRAVITY, FACE_NUMBERS } from '../../src/dice/faces.js';
import {
  approach,
  clamp,
  HOP_IMPULSE,
  sensorToSceneUp,
  stepHop,
} from '../../src/features/dashboard/scene/motion.js';

export const tests = [
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
