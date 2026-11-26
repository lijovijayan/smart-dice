// The app shell and the helpers pages share: routing, mounting pages, and element lookup.

import { assertEqual, assertThrows, assertTrue } from '../assert.js';
import { pageFromHash } from '../../src/app/router.js';
import { startShell } from '../../src/app/shell.js';
import { FEATURES } from '../../src/app/features.js';
import { refsOf } from '../../src/shared/dom.js';

/** A page with its own document and a fake window, so the real page is left alone. */
function makeApp(hash = '') {
  const doc = document.implementation.createHTMLDocument('test');
  doc.body.innerHTML = '<nav id="tabs"></nav><p id="subtitle"></p><div id="pages"></div>';
  const listeners = {};
  const win = {
    location: { hash },
    addEventListener: (type, fn) => {
      listeners[type] = fn;
    },
  };
  const goTo = (next) => {
    win.location.hash = next;
    listeners.hashchange();
  };
  return { doc, win, goTo };
}

/** A page that records what the shell does with it. */
function makeFeature(id, log) {
  return {
    id,
    title: id.toUpperCase(),
    subtitle: `${id} subtitle`,
    mount: (root) => {
      log.push(`mount ${id}`);
      root.textContent = id;
      return { setActive: (active) => log.push(`${id} ${active}`) };
    },
  };
}

export const tests = [
  // Router
  [
    'pageFromHash picks the page named in the hash and falls back for anything else',
    () => {
      const ids = ['game', 'dice'];
      assertEqual(pageFromHash('#dice', ids, 'game'), 'dice');
      assertEqual(pageFromHash('#game', ids, 'game'), 'game');
      assertEqual(pageFromHash('', ids, 'game'), 'game');
      assertEqual(pageFromHash('#', ids, 'game'), 'game');
      assertEqual(pageFromHash('#nonsense', ids, 'game'), 'game');
      assertEqual(pageFromHash('#toString', ids, 'game'), 'game');
    },
  ],

  // Shell
  [
    'the shell opens the first page by default and builds a tab for each page',
    () => {
      const { doc, win } = makeApp();
      const log = [];
      startShell({ doc, win, features: [makeFeature('a', log), makeFeature('b', log)], services: {} });

      const links = [...doc.querySelectorAll('#tabs a')];
      assertEqual(
        links.map((link) => [link.textContent, link.getAttribute('href')]),
        [
          ['A', '#a'],
          ['B', '#b'],
        ],
      );
      assertEqual(links.map((link) => link.getAttribute('aria-current')), ['page', null]);
      const mains = [...doc.querySelectorAll('#pages main')];
      assertEqual(mains.map((main) => main.hidden), [false, true]);
      assertEqual(doc.getElementById('subtitle').textContent, 'a subtitle');
      assertEqual(doc.title, 'A · Smart Dice');
    },
  ],
  [
    'the shell mounts a page only when it is first opened, and only once',
    () => {
      const { doc, win, goTo } = makeApp();
      const log = [];
      startShell({ doc, win, features: [makeFeature('a', log), makeFeature('b', log)], services: {} });
      assertEqual(log, ['mount a', 'a true']);

      goTo('#b');
      goTo('#a');
      goTo('#b');
      assertEqual(log.filter((entry) => entry.startsWith('mount')), ['mount a', 'mount b']);
    },
  ],
  [
    'the shell tells pages when they are shown or hidden',
    () => {
      const { doc, win, goTo } = makeApp();
      const log = [];
      startShell({ doc, win, features: [makeFeature('a', log), makeFeature('b', log)], services: {} });
      log.length = 0;
      goTo('#b');
      assertEqual(log, ['mount b', 'a false', 'b true']);
      log.length = 0;
      goTo('#a');
      assertEqual(log, ['a true', 'b false']);
    },
  ],
  [
    'the shell opens the page named in the URL, and the default for an unknown one',
    () => {
      const first = makeApp('#b');
      const log = [];
      startShell({
        doc: first.doc,
        win: first.win,
        features: [makeFeature('a', log), makeFeature('b', log)],
        services: {},
      });
      assertEqual(log, ['mount b', 'b true']);

      const second = makeApp('#nowhere');
      startShell({
        doc: second.doc,
        win: second.win,
        features: [makeFeature('a', []), makeFeature('b', [])],
        services: {},
      });
      assertEqual(second.doc.getElementById('subtitle').textContent, 'a subtitle');
    },
  ],
  [
    'the shell gives each page its own root and the shared services',
    () => {
      const { doc, win } = makeApp();
      const received = [];
      const feature = (id) => ({
        id,
        title: id,
        subtitle: id,
        mount: (root, services) => {
          received.push([id, root.dataset.feature, services.marker]);
        },
      });
      startShell({ doc, win, features: [feature('a')], services: { marker: 'shared' } });
      assertEqual(received, [['a', 'a', 'shared']]);
    },
  ],
  [
    'the shell refuses an empty or duplicated page list',
    () => {
      const { doc, win } = makeApp();
      assertThrows(() => startShell({ doc, win, features: [], services: {} }), 'empty list');
      const log = [];
      const twin = makeFeature('a', log);
      assertThrows(() => startShell({ doc, win, features: [twin, twin], services: {} }), 'duplicate ids');
    },
  ],
  [
    'the registered pages have unique ids, titles and a snake and ladder default',
    () => {
      const ids = FEATURES.map((feature) => feature.id);
      assertEqual(new Set(ids).size, ids.length);
      assertEqual(ids[0], 'game');
      assertTrue(ids.includes('dice'), 'dice page missing');
      for (const feature of FEATURES) {
        assertTrue(feature.title && feature.subtitle, `${feature.id} needs a title and subtitle`);
        assertEqual(typeof feature.mount, 'function');
      }
    },
  ],

  // Shared DOM helpers
  [
    'refsOf finds marked elements inside a root and ignores the same names elsewhere',
    () => {
      const doc = document.implementation.createHTMLDocument('test');
      doc.body.innerHTML =
        '<div id="one"><b data-ref="title">one</b></div><div id="two"><b data-ref="title">two</b></div>';
      const { title } = refsOf(doc.getElementById('two'), ['title']);
      assertEqual(title.textContent, 'two');
    },
  ],
  [
    'refsOf throws when an element is missing',
    () => {
      const doc = document.implementation.createHTMLDocument('test');
      assertThrows(() => refsOf(doc.body, ['nothing']), 'missing ref');
    },
  ],
];
