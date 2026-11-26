// Browser test page: open http://localhost:8000/tests/ while a local server runs in web/.
// Each file in suites/ covers one part of the app and exports a `tests` list.
// To add tests for a new page, add a suite file and one line below.

import { tests as appTests } from './suites/app.js';
import { tests as dashboardTests } from './suites/dashboard.js';
import { tests as diceTests } from './suites/dice.js';
import { tests as gameTests } from './suites/game.js';

const suites = [
  ['dice', diceTests],
  ['app', appTests],
  ['game', gameTests],
  ['dashboard', dashboardTests],
];

const list = document.getElementById('results');
let passed = 0;
let total = 0;

for (const [suite, tests] of suites) {
  for (const [name, run] of tests) {
    total += 1;
    const item = document.createElement('li');
    item.textContent = `[${suite}] ${name}`;
    try {
      run();
      item.className = 'pass';
      passed += 1;
    } catch (error) {
      item.className = 'fail';
      const detail = document.createElement('small');
      detail.textContent = error instanceof Error ? error.message : String(error);
      item.append(detail);
    }
    list.append(item);
  }
}

const summary = document.getElementById('summary');
if (summary) {
  summary.textContent = `${passed} of ${total} passed`;
}
