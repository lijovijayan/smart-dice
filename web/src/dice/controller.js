// Holds the live dice state and the Bluetooth connection.
// While nothing is connected, keys 1 to 6 (or the face buttons) act as a demo board.

import { connect, isBluetoothSupported, isPickerCancelled } from './bluetooth.js';
import { FACE_GRAVITY, isFaceNumber } from './faces.js';
import { addRoll, isNewRoll } from './history.js';

const INITIAL_STATE = Object.freeze({ ax: 0, ay: 0, az: 1, face: 1, stable: false });

/**
 * @param {(snapshot: object) => void} onChange called with a fresh snapshot after every change.
 * @returns {{ toggle: () => Promise<void>, showDemoFace: (face: number) => void }}
 */
export function createDiceController(onChange) {
  const supported = isBluetoothSupported();

  let state = INITIAL_STATE;
  let rolls = [];
  let deviceName = null;
  let busy = false;
  let error = null;
  /** @type {{ name: string, disconnect: () => void } | null} */
  let link = null;

  function notify() {
    onChange({
      state,
      rolls,
      deviceName,
      connected: link !== null,
      busy,
      error,
      supported,
    });
  }

  function setState(next) {
    if (isNewRoll(state, next)) rolls = addRoll(rolls, next.face);
    state = next;
    notify();
  }

  /** Demo mode: pretend the board settled on `face`. Ignored while connected. */
  function showDemoFace(face) {
    if (link || !isFaceNumber(face)) return;
    const [ax, ay, az] = FACE_GRAVITY[face];
    setState({ ax, ay, az, face, stable: true });
  }

  window.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    showDemoFace(Number(event.key));
  });

  async function toggle() {
    error = null;
    if (link) {
      link.disconnect();
      return;
    }

    busy = true;
    notify();
    try {
      link = await connect({
        onState: setState,
        onDisconnect: () => {
          link = null;
          deviceName = null;
          notify();
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
      notify();
    }
  }

  notify();
  return { toggle, showDemoFace };
}
