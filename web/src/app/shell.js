// The app shell. It knows nothing about any page except the Feature contract in
// shared/contracts.js: it makes a tab and a content area for each feature, shows the one
// named in the URL, and mounts a feature the first time it is opened.

import { pageFromHash } from './router.js';

/** @typedef {import('../shared/contracts.js').Feature} Feature */
/** @typedef {import('../shared/contracts.js').FeatureInstance} FeatureInstance */
/** @typedef {import('../shared/contracts.js').Services} Services */

/**
 * @param {{ doc: Document, win: Window, features: readonly Feature[], services: Services }} options
 *   The first feature is the default page.
 */
export function startShell({ doc, win, features, services }) {
  if (features.length === 0) throw new Error('No features to show');
  const ids = features.map((feature) => feature.id);
  if (new Set(ids).size !== ids.length) throw new Error(`Duplicate feature ids: ${ids.join(', ')}`);

  const tabs = doc.getElementById('tabs');
  const pages = doc.getElementById('pages');
  const subtitle = doc.getElementById('subtitle');
  if (!tabs || !pages) throw new Error('Missing #tabs or #pages element');

  const entries = features.map((feature) => {
    const link = doc.createElement('a');
    link.href = `#${feature.id}`;
    link.textContent = feature.title;
    tabs.append(link);

    const root = doc.createElement('main');
    root.className = 'page';
    root.dataset.feature = feature.id;
    root.hidden = true;
    pages.append(root);

    return { feature, link, root, instance: /** @type {FeatureInstance | null} */ (null) };
  });

  function show() {
    const id = pageFromHash(win.location.hash, ids, ids[0]);
    for (const entry of entries) {
      const current = entry.feature.id === id;
      entry.root.hidden = !current;
      if (current) entry.link.setAttribute('aria-current', 'page');
      else entry.link.removeAttribute('aria-current');
    }

    const shown = entries.find((entry) => entry.feature.id === id);
    if (!shown) return;
    // Mount while the page is visible, so anything that measures its size gets real numbers.
    shown.instance ??= shown.feature.mount(shown.root, services) ?? {};
    if (subtitle) subtitle.textContent = shown.feature.subtitle;
    doc.title = `${shown.feature.title} · Smart Dice`;

    for (const entry of entries) {
      entry.instance?.setActive?.(entry === shown);
    }
  }

  win.addEventListener('hashchange', show);
  show();
}
