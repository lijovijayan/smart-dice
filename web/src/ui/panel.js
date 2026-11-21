// Keeps the header and side panel in sync with the dice state.

import { FACE_NUMBERS, NO_FACE, faceColor } from '../dice/faces.js';

const UNSUPPORTED_MESSAGE =
  'This browser has no Web Bluetooth. Use Chrome or Edge on a laptop or Android phone.';
const HINT_DEMO = 'Press 1–6 or tap a face. Drag to rotate, double-click to reset.';
const HINT_LIVE = 'Drag to rotate, double-click to reset.';
const STABLE_LABELS = { stable: 'Stable', settling: 'Settling', moving: 'Moving' };

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
 * @param {Document} doc
 * @param {{ onToggle: () => void, onPickFace: (face: number) => void }} handlers
 * @returns {{ render: (snapshot: object) => void }}
 */
export function bindPanel(doc, { onToggle, onPickFace }) {
  const el = (id) => {
    const node = doc.getElementById(id);
    if (!node) throw new Error(`Missing #${id} element`);
    return node;
  };

  const refs = {
    status: el('status'),
    statusText: el('status-text'),
    toggle: el('toggle'),
    mode: el('mode'),
    hint: el('hint'),
    face: el('face'),
    stable: el('stable'),
    faces: el('faces'),
    ax: el('ax'),
    ay: el('ay'),
    az: el('az'),
    barAx: el('bar-ax'),
    barAy: el('bar-ay'),
    barAz: el('bar-az'),
    history: el('history'),
    historyEmpty: el('history-empty'),
    message: el('message'),
  };

  refs.toggle.addEventListener('click', onToggle);

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
    doc.documentElement.style.setProperty('--face', faceColor(face));
    refs.face.textContent = face === NO_FACE ? '–' : String(face);
    // Replay the pop animation.
    refs.face.classList.remove('pop');
    void refs.face.offsetWidth;
    refs.face.classList.add('pop');
  }

  function render({ state, rolls, deviceName, connected, busy, error, supported }) {
    refs.statusText.textContent = connected
      ? `Connected to ${deviceName ?? 'board'}`
      : busy
        ? 'Connecting…'
        : 'Not connected';
    refs.status.classList.toggle('ok', connected);
    refs.status.classList.toggle('busy', busy);

    refs.toggle.textContent = busy ? 'Connecting…' : connected ? 'Disconnect' : 'Connect';
    refs.toggle.dataset.connected = String(connected);
    refs.toggle.disabled = busy || !supported;

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

    refs.message.textContent = supported ? (error ?? '') : UNSUPPORTED_MESSAGE;
  }

  return { render };
}
