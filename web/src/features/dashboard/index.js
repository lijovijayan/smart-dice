// Dice dashboard: a 3D cube that follows the board, plus live readings.
//
// Folder layout (everything the page needs lives here):
//   index.js    the feature definition the app lists, and the code that wires the page together
//   markup.js   the page HTML
//   panel.js    the side panel (upper face, accelerometer, recent rolls)
//   scene/      the Three.js cube: lighting, spring motion, camera, textures
//   dashboard.css  styles, imported from src/styles/index.css

import { refsOf } from '../../shared/dom.js';
import { DASHBOARD_MARKUP } from './markup.js';
import { bindPanel } from './panel.js';
import { createCube } from './scene/cube.js';

/** @type {import('../../shared/contracts.js').Feature} */
export const dashboardFeature = {
  id: 'dice',
  title: 'Dice',
  subtitle: 'XIAO nRF52840 Sense over Bluetooth LE',
  mount(root, { dice }) {
    root.innerHTML = DASHBOARD_MARKUP;
    const { view } = refsOf(root, ['view']);

    const panel = bindPanel(root, { onPickFace: dice.showDemoFace });
    const cube = createCube(view);

    dice.subscribe((snapshot) => {
      panel.render(snapshot);
      cube.setReading(snapshot.state);
    });
  },
};
