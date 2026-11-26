// The one dice for the whole app: a Bluetooth connection, or demo mode when nothing is connected.
// Pages never touch Bluetooth. They get this service and use two methods:
//   subscribe(fn)  fn(snapshot) now and after every change: the live state, recent rolls, connection
//   onRoll(fn)     fn({ face, fromDevice }) each time a roll happens: the board settled, or a demo pick
// Both return a function that stops listening.

import { connect, isBluetoothSupported, isPickerCancelled } from './bluetooth.js';
import { FACE_GRAVITY, isFaceNumber } from './faces.js';
import { addRoll, isNewRoll } from './history.js';

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
export function createDiceService() {
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
