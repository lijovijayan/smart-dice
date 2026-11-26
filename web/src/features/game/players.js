// Player names. Every color has a default name (the color itself); a visitor can give it another.
// Pure functions only, so they can be tested without a page.

import { MAX_PLAYERS, PLAYER_NAMES } from './rules.js';

export const MAX_NAME_LENGTH = 14;

/** Tidies a typed name: no control characters, single spaces, trimmed, at most MAX_NAME_LENGTH letters. */
export function cleanName(text) {
  const plain = String(text ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(plain).slice(0, MAX_NAME_LENGTH).join('').trim();
}

/**
 * What to remember when `typed` is entered for `player`: the cleaned name, or '' (meaning
 * "use the color") when it is blank or just the color's own name.
 */
export function customNameFor(player, typed) {
  const name = cleanName(typed);
  return name.toLowerCase() === PLAYER_NAMES[player].toLowerCase() ? '' : name;
}

/** The names to show for every color, given what the visitor chose ('' meaning the color's name). */
export function displayNames(customNames) {
  return Array.from({ length: MAX_PLAYERS }, (_, i) => customNames?.[i] || PLAYER_NAMES[i]);
}

/** No custom names at all. */
export function defaultCustomNames() {
  return Array.from({ length: MAX_PLAYERS }, () => '');
}
