// The list of pages. This is the only file that knows every feature.
// To add a page: build it in src/features/<name>/, import it here, and add it to the list.
// The first one is the page the app opens on.

import { gameFeature } from '../features/game/index.js';
import { dashboardFeature } from '../features/dashboard/index.js';

export const FEATURES = Object.freeze([gameFeature, dashboardFeature]);
