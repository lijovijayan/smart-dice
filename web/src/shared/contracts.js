// The contract between the app shell and its pages ("features"). Types only: nothing imports
// this file and nothing runs here. Other files point at these types in their doc comments.
//
// A feature never imports another feature or the shell. It gets its own root element and the
// shared services, and the shell does the rest.

/**
 * A page of the app.
 *
 * @typedef {object} Feature
 * @property {string} id used in the URL (#id) and to key the page
 * @property {string} title the tab label
 * @property {string} subtitle the line under the app name while this page is showing
 * @property {(root: HTMLElement, services: Services) => FeatureInstance | void} mount
 *   fills `root`. Called once, the first time the page is opened.
 */

/**
 * What a mounted page hands back to the shell.
 *
 * @typedef {object} FeatureInstance
 * @property {(active: boolean) => void} [setActive] called whenever the page is shown or hidden
 */

/**
 * Things every page can use. Pages get these instead of reaching for globals.
 *
 * @typedef {object} Services
 * @property {import('../dice/service.js').DiceService} dice
 */
