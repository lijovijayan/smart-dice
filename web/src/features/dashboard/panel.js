// Keeps the dashboard's side panel in sync with the dice state.

import { FACE_NUMBERS, NO_FACE, faceColor } from '../../dice/faces.js';
import { refsOf, restartClass } from '../../shared/dom.js';

const HINT_DEMO = 'Press 1–6 or tap a face. Drag to rotate, double-click to reset.';
const HINT_LIVE = 'Drag to rotate, double-click to reset.';
const STABLE_LABELS = { stable: 'Stable', settling: 'Settling', moving: 'Moving' };

const REF_NAMES = [
  'mode',
  'hint',
  'face',
  'stable',
  'faces',
  'ax',
  'ay',
  'az',
  'barAx',
  'barAy',
  'barAz',
  'history',
  'historyEmpty',
];

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
 * @param {HTMLElement} root the dashboard page
 * @param {{ onPickFace: (face: number) => void }} handlers
 * @returns {{ render: (snapshot: import('../../dice/service.js').DiceSnapshot) => void }}
 */
export function bindPanel(root, { onPickFace }) {
  const doc = root.ownerDocument;
  const refs = refsOf(root, REF_NAMES);

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
    refs.face.textContent = face === NO_FACE ? '–' : String(face);
    // Replay the pop animation.
    restartClass(refs.face, 'pop');
  }

  function render({ state, rolls, connected }) {
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
  }

  return { render };
}
