// Entry point: wires the dice state, the 3D cube and the panel together.

import { createDiceController } from './dice/controller.js';
import { createCube } from './scene/cube.js';
import { bindPanel } from './ui/panel.js';

const view = document.getElementById('view');
if (!view) throw new Error('Missing #view element');

let controller;

const panel = bindPanel(document, {
  onToggle: () => {
    void controller.toggle();
  },
  onPickFace: (face) => {
    controller.showDemoFace(face);
  },
});

const cube = createCube(view);

controller = createDiceController((snapshot) => {
  panel.render(snapshot);
  cube.setReading(snapshot.state);
});
