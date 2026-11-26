// The connection status and Connect button in the header. They belong to the app, not to
// any one page, so the board can be connected from wherever you are.

const UNSUPPORTED_MESSAGE =
  'This browser has no Web Bluetooth. Use Chrome or Edge on a laptop or Android phone.';

/**
 * @param {Document} doc
 * @param {import('../dice/service.js').DiceService} dice
 */
export function bindConnection(doc, dice) {
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
