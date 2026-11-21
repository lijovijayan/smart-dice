// Web Bluetooth link to the Smart Dice board.
// Must be started from a user gesture (a button click).

import { parseState, SERVICE_UUID, STATE_UUID } from './protocol.js';

export function isBluetoothSupported() {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

/** True when the person closed the device picker without choosing a board. */
export function isPickerCancelled(error) {
  return error instanceof DOMException && error.name === 'NotFoundError';
}

/**
 * Opens the device picker, connects, and subscribes to state notifications.
 * @param {{ onState: (state: object) => void, onDisconnect: () => void }} handlers
 * @returns {Promise<{ name: string, disconnect: () => void }>}
 */
export async function connect({ onState, onDisconnect }) {
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
