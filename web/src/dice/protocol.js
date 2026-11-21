// Bluetooth UUIDs and the state packet layout.
// These must match firmware/smart_dice/smart_dice.ino (see docs/protocol.md).

import { toFace } from './faces.js';

export const SERVICE_UUID = 'f0bd0001-2ae7-429a-8fe0-3aa48ebf8220';
export const STATE_UUID = 'f0bd0002-2ae7-429a-8fe0-3aa48ebf8220';

export const STATE_PACKET_SIZE = 8;

const MILLI_G_PER_G = 1000;

/**
 * Decodes the 8-byte little-endian state packet.
 * @param {DataView} view
 * @returns {{ ax: number, ay: number, az: number, face: number, stable: boolean }}
 * @throws {RangeError} if the packet is shorter than STATE_PACKET_SIZE.
 */
export function parseState(view) {
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
