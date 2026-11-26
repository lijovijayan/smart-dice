// Demo mode: with no board connected, the keys 1 to 6 act as the dice.

import { isTypingTarget } from '../shared/dom.js';
import { isFaceNumber } from './faces.js';

/**
 * @param {Window} win
 * @param {{ showDemoFace: (face: number) => void }} dice
 * @returns {() => void} stops listening
 */
export function bindDemoKeys(win, dice) {
  function onKeyDown(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (isTypingTarget(event.target)) return;
    const face = Number(event.key);
    if (isFaceNumber(face)) dice.showDemoFace(face);
  }
  win.addEventListener('keydown', onKeyDown);
  return () => win.removeEventListener('keydown', onKeyDown);
}
