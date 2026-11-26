// Entry point: creates the shared services, then hands the pages to the shell.

import { bindAmbient } from './app/ambient.js';
import { bindConnection } from './app/connection.js';
import { FEATURES } from './app/features.js';
import { startShell } from './app/shell.js';
import { bindDemoKeys } from './dice/demo-keys.js';
import { createDiceService } from './dice/service.js';

const dice = createDiceService();

bindDemoKeys(window, dice);
bindConnection(document, dice);
bindAmbient(document, dice);
startShell({ doc: document, win: window, features: FEATURES, services: { dice } });
