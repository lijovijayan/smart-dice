// The accent color of the whole app follows the upper face of the dice.
// Pages and styles read it as the CSS variable --face.

import { faceColor } from '../dice/faces.js';

/**
 * @param {Document} doc
 * @param {import('../dice/service.js').DiceService} dice
 */
export function bindAmbient(doc, dice) {
  let shown = null;
  dice.subscribe(({ state }) => {
    if (state.face === shown) return;
    shown = state.face;
    doc.documentElement.style.setProperty('--face', faceColor(state.face));
  });
}
