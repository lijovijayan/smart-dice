// Snake and Ladder: the feature the app opens on.
//
// Folder layout (everything the page needs lives here):
//   index.js    the feature definition the app lists
//   markup.js   the page HTML
//   view.js     turn flow, the side panel, and how the page reacts to the dice
//   board.js    the SVG board and the moving tokens
//   rules.js    the game rules, as plain functions
//   easing.js   curves used by the board animation
//   history.js  undo and redo, as plain functions
//   players.js  player names (a color's own name unless the visitor picks one)
//   storage.js  saves and restores the game in localStorage
//   sound.js    sound effects, made with the Web Audio API
//   game.css    styles, imported from src/styles/index.css

import { mountGame } from './view.js';

/** @type {import('../../shared/contracts.js').Feature} */
export const gameFeature = {
  id: 'game',
  title: 'Snake & Ladder',
  subtitle: 'Roll the Smart Dice to race to square 100',
  mount: (root, { dice }) => mountGame(root, dice),
};
