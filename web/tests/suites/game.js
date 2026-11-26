// The snake and ladder feature: the rules, and the curves behind the board animation.

import { assertClose, assertEqual, assertTrue } from '../assert.js';
import { snakeCurve } from '../../src/features/game/board.js';
import { cruise, easeInOutCubic, easeInOutSine, easeOutBack, easeOutCubic, hopHeight, hopShape, lerp } from '../../src/features/game/easing.js';
import { MAX_HISTORY, canRedo, canUndo, record, redo, startHistory, undo } from '../../src/features/game/history.js';
import { MAX_NAME_LENGTH, cleanName, customNameFor, defaultCustomNames, displayNames } from '../../src/features/game/players.js';
import { STORAGE_KEY, STORAGE_VERSION, createGameStore } from '../../src/features/game/storage.js';
import { SOUND_CUES, createSound } from '../../src/features/game/sound.js';
import { mountGame } from '../../src/features/game/view.js';
import {
  BOARD_SIZE,
  LADDERS,
  LAST_SQUARE,
  MAX_PLAYERS,
  MIN_PLAYERS,
  SNAKES,
  createGame,
  describeMove,
  jumpTarget,
  moveRecord,
  playTurn,
  squareCell,
} from '../../src/features/game/rules.js';

export const tests = [
  // Rules
  [
    'squareCell zigzags: bottom row runs right, the next runs left, 100 is top left',
    () => {
      assertEqual(squareCell(1), { col: 0, row: 0 });
      assertEqual(squareCell(10), { col: 9, row: 0 });
      assertEqual(squareCell(11), { col: 9, row: 1 });
      assertEqual(squareCell(20), { col: 0, row: 1 });
      assertEqual(squareCell(100), { col: 0, row: 9 });
    },
  ],
  [
    'every square has its own cell on the board',
    () => {
      const cells = new Set();
      for (let square = 1; square <= LAST_SQUARE; square += 1) {
        const { col, row } = squareCell(square);
        assertTrue(col >= 0 && col < BOARD_SIZE && row >= 0 && row < BOARD_SIZE, `square ${square}`);
        cells.add(`${col},${row}`);
      }
      assertEqual(cells.size, LAST_SQUARE);
    },
  ],
  [
    'ladders go up, snakes go down, and no square has two jumps or a jump from 100',
    () => {
      for (const [from, to] of Object.entries(LADDERS)) assertTrue(to > Number(from), `ladder ${from}`);
      for (const [from, to] of Object.entries(SNAKES)) assertTrue(to < Number(from), `snake ${from}`);
      const starts = [...Object.keys(LADDERS), ...Object.keys(SNAKES)];
      assertEqual(new Set(starts).size, starts.length);
      assertTrue(!starts.includes(String(LAST_SQUARE)), 'jump from the last square');
      const ends = [...Object.values(LADDERS), ...Object.values(SNAKES)].map(String);
      assertTrue(
        ends.every((end) => !starts.includes(end)),
        'a jump ends where another one starts',
      );
    },
  ],
  [
    'jumpTarget follows ladders and snakes and leaves other squares alone',
    () => {
      assertEqual(jumpTarget(4), 14);
      assertEqual(jumpTarget(16), 6);
      assertEqual(jumpTarget(5), 5);
    },
  ],
  [
    'createGame starts everyone off the board and clamps the player count',
    () => {
      assertEqual(createGame(3), { positions: [0, 0, 0], turn: 0, winner: null });
      assertEqual(createGame(1).positions.length, MIN_PLAYERS);
      assertEqual(createGame(9).positions.length, MAX_PLAYERS);
      assertEqual(createGame(Number.NaN).positions.length, MIN_PLAYERS);
    },
  ],
  [
    'playTurn walks the player forward and passes the turn on',
    () => {
      const { game, move } = playTurn(createGame(2), 2);
      assertEqual(game, { positions: [2, 0], turn: 1, winner: null });
      assertEqual(move, {
        player: 0,
        roll: 2,
        from: 0,
        steps: [1, 2],
        landed: 2,
        to: 2,
        kind: 'none',
        won: false,
      });
    },
  ],
  [
    'playTurn climbs a ladder and slides down a snake',
    () => {
      const up = playTurn({ positions: [2, 0], turn: 0, winner: null }, 2);
      assertEqual(up.move.kind, 'ladder');
      assertEqual([up.move.landed, up.move.to], [4, 14]);
      assertEqual(up.game.positions[0], 14);

      const down = playTurn({ positions: [0, 13], turn: 1, winner: null }, 3);
      assertEqual(down.move.kind, 'snake');
      assertEqual([down.move.landed, down.move.to], [16, 6]);
      assertEqual(down.game.positions[1], 6);
      assertEqual(down.game.turn, 0);
    },
  ],
  [
    'playTurn needs an exact roll to finish and wastes a roll that goes past 100',
    () => {
      const stuck = playTurn({ positions: [98, 0], turn: 0, winner: null }, 4);
      assertEqual(stuck.move.kind, 'blocked');
      assertEqual(stuck.move.steps, []);
      assertEqual(stuck.game, { positions: [98, 0], turn: 1, winner: null });

      const won = playTurn({ positions: [97, 0], turn: 0, winner: null }, 3);
      assertEqual(won.move.won, true);
      assertEqual(won.game, { positions: [100, 0], turn: 0, winner: 0 });
    },
  ],
  [
    'a ladder that ends on 100 wins the game',
    () => {
      const { game, move } = playTurn({ positions: [77, 0], turn: 0, winner: null }, 3);
      assertEqual([move.kind, move.won], ['ladder', true]);
      assertEqual(game.winner, 0);
    },
  ],
  [
    'playTurn ignores bad rolls and finished games',
    () => {
      const start = createGame(2);
      for (const roll of [0, 7, 2.5, Number.NaN]) assertEqual(playTurn(start, roll), { game: start, move: null });
      const over = { positions: [100, 5], turn: 0, winner: 0 };
      assertEqual(playTurn(over, 3), { game: over, move: null });
    },
  ],
  [
    'playTurn never changes the game it was given',
    () => {
      const start = createGame(2);
      playTurn(start, 6);
      assertEqual(start, { positions: [0, 0], turn: 0, winner: null });
    },
  ],
  [
    'describeMove says what happened',
    () => {
      assertEqual(describeMove(playTurn(createGame(2), 2).move), 'Red rolled 2: start to 2.');
      assertTrue(
        describeMove(playTurn({ positions: [0, 13], turn: 1, winner: null }, 3).move).includes('down a snake to 6'),
        'snake text',
      );
      assertTrue(
        describeMove(playTurn({ positions: [98, 0], turn: 0, winner: null }, 4).move).includes('needs exactly 2'),
        'blocked text',
      );
    },
  ],

  // Animation
  [
    'easing curves start and end at the right values',
    () => {
      assertClose(easeInOutCubic(0), 0);
      assertClose(easeInOutCubic(1), 1);
      assertClose(easeInOutCubic(0.5), 0.5);
      assertClose(easeOutCubic(0), 0);
      assertClose(easeOutCubic(1), 1);
      assertTrue(easeOutCubic(0.5) > 0.5, 'ease out should be ahead at the midpoint');
      assertEqual(easeOutCubic(2), 1);
    },
  ],
  [
    'hopHeight is 0 at both ends, 1 at the top of the arc, and clamped outside 0 to 1',
    () => {
      assertClose(hopHeight(0), 0);
      assertClose(hopHeight(1), 0);
      assertClose(hopHeight(0.5), 1);
      assertClose(hopHeight(-3), 0);
    },
  ],
  ['lerp moves between two numbers', () => assertClose(lerp(2, 6, 0.25), 3)],
  [
    'snakeCurve runs from the head square to the tail square',
    () => {
      const points = snakeCurve(16, 6);
      assertClose(points[0].x, 270);
      assertClose(points[0].y, 510);
      const last = points[points.length - 1];
      assertClose(last.x, 330);
      assertClose(last.y, 570);
    },
  ],
  [
    'cruise starts and ends at rest, covers the distance, and holds a steady speed in the middle',
    () => {
      assertClose(cruise(0), 0);
      assertClose(cruise(1), 1);
      assertClose(cruise(0.5), 0.5);
      // Never goes backward, and is continuous where the ramps meet the cruise.
      let previous = 0;
      for (let i = 1; i <= 100; i += 1) {
        const value = cruise(i / 100);
        assertTrue(value >= previous, 'should never go backward');
        previous = value;
      }
      const step = (t) => cruise(t + 0.01) - cruise(t);
      assertClose(step(0.4), step(0.5), 1e-9);
      assertTrue(step(0) < step(0.4) / 4, 'should start slowly');
      assertTrue(step(0.98) < step(0.4) / 4, 'should end slowly');
    },
  ],
  [
    'easeInOutSine and easeOutBack start at 0 and end at 1, and the back curve overshoots',
    () => {
      assertClose(easeInOutSine(0), 0);
      assertClose(easeInOutSine(0.5), 0.5);
      assertClose(easeInOutSine(1), 1);
      assertClose(easeOutBack(0), 0);
      assertClose(easeOutBack(1), 1);
      assertTrue(easeOutBack(0.7) > 1, 'ease out back should overshoot before it settles');
    },
  ],
  [
    'hopShape flattens at takeoff and landing and stretches in the air, without a jump between',
    () => {
      const takeoff = hopShape(0);
      const air = hopShape(0.5);
      assertTrue(takeoff.sy < 1 && takeoff.sx > 1, 'should be squashed at the start');
      assertTrue(hopShape(1).sy < 1, 'should be squashed on landing');
      assertTrue(air.sy > 1 && air.sx < 1, 'should be stretched in the air');
      assertTrue(Math.abs(hopShape(0.14).sy - 1) < 0.05, 'should be smooth where squash gives way to stretch');
    },
  ],

  // Saving and resuming
  [
    'a saved game comes back exactly as it was saved',
    () => {
      const store = createGameStore(fakeStorage());
      const saved = {
        game: { positions: [14, 0, 57], turn: 2, winner: null },
        moves: [ladderMove()],
        lastRoll: { player: 0, face: 4 },
        past: [{ game: createGame(3), moves: [], lastRoll: null }],
        future: [
          {
            game: { positions: [14, 0, 57], turn: 0, winner: null },
            moves: [ladderMove()],
            lastRoll: { player: 2, face: 3 },
          },
        ],
        names: ['', 'Asha', '', 'Sam'],
      };
      assertTrue(store.save(saved), 'saving should work');
      assertEqual(store.load(), saved);
    },
  ],
  [
    'loading finds nothing when nothing was saved, and clear forgets a saved game',
    () => {
      const store = createGameStore(fakeStorage());
      assertEqual(store.load(), null);
      store.save({ game: createGame(2), moves: [], lastRoll: null });
      store.clear();
      assertEqual(store.load(), null);
    },
  ],
  [
    'damaged or tampered saves are dropped instead of loaded',
    () => {
      const base = { version: STORAGE_VERSION, game: createGame(2), moves: [], lastRoll: null };
      const bad = [
        'not json',
        '[]',
        JSON.stringify({ ...base, version: 99 }),
        JSON.stringify({ ...base, game: { ...base.game, positions: [0] } }),
        JSON.stringify({ ...base, game: { ...base.game, positions: [0, 0, 0, 0, 0] } }),
        JSON.stringify({ ...base, game: { ...base.game, positions: [0, 101] } }),
        JSON.stringify({ ...base, game: { ...base.game, positions: [0, 1.5] } }),
        JSON.stringify({ ...base, game: { ...base.game, turn: 2 } }),
        JSON.stringify({ ...base, game: { ...base.game, winner: 0 } }),
        JSON.stringify({ ...base, game: { positions: [100, 3], turn: 0, winner: null } }),
      ];
      for (const text of bad) {
        const storage = fakeStorage({ [STORAGE_KEY]: text });
        assertEqual(createGameStore(storage).load(), null, `should reject ${text}`);
      }
    },
  ],
  [
    'a finished game loads with its winner, and stray fields are cleaned up',
    () => {
      const text = JSON.stringify({
        version: STORAGE_VERSION,
        game: { positions: [100, 40], turn: 0, winner: 0 },
        moves: [ladderMove(), 'old text', { player: 9, roll: 4 }, ladderMove({ kind: 'sideways' })],
        lastRoll: { player: 5, face: 3 },
        extra: 'ignored',
      });
      const loaded = createGameStore(fakeStorage({ [STORAGE_KEY]: text })).load();
      assertEqual(loaded.game.winner, 0);
      assertEqual(loaded.moves, [ladderMove()]);
      assertEqual(loaded.lastRoll, null);
      assertTrue(!('extra' in loaded), 'unknown fields should be dropped');
    },
  ],
  [
    'storage that is missing, full or blocked never throws',
    () => {
      const none = createGameStore(null);
      assertEqual(none.load(), null);
      assertEqual(none.save({ game: createGame(2), moves: [], lastRoll: null }), false);
      none.clear();

      const broken = createGameStore({
        getItem() {
          throw new Error('blocked');
        },
        setItem() {
          throw new Error('quota');
        },
        removeItem() {
          throw new Error('blocked');
        },
      });
      assertEqual(broken.load(), null);
      assertEqual(broken.save({ game: createGame(2), moves: [], lastRoll: null }), false);
      broken.clear();
    },
  ],
  [
    'the page resumes a saved game and saves every roll',
    () => {
      const store = createGameStore(fakeStorage());
      store.save({
        game: { positions: [14, 3], turn: 1, winner: null },
        moves: [ladderMove()],
        lastRoll: { player: 0, face: 4 },
      });

      const root = document.createElement('main');
      document.body.append(root);
      try {
        let onRoll = () => {};
        const dice = {
          onRoll(listener) {
            onRoll = listener;
            return () => {};
          },
          subscribe(listener) {
            listener({ connected: false });
            return () => {};
          },
        };
        mountGame(root, dice, store);

        const text = (name) => root.querySelector(`[data-ref="${name}"]`).textContent;
        assertEqual(text('turnText'), "Blue's turn");
        assertEqual(text('rollText'), 'Red rolled 4');
        assertTrue(text('players').includes('Square 14') && text('players').includes('Square 3'), 'positions are shown');
        assertEqual(root.querySelectorAll('.token').length, 2);

        // Blue rolls a 2 from square 3: 5. The result is saved before the animation ends.
        onRoll({ face: 2, fromDevice: false });
        const after = store.load();
        assertEqual(after.game.positions, [14, 5]);
        assertEqual(after.game.turn, 0);
        assertEqual(after.lastRoll, { player: 1, face: 2 });
        assertEqual(after.moves.length, 2);
        assertEqual(after.past.length, 1, 'the move before can be undone after a reload');
      } finally {
        root.remove();
      }
    },
  ],

  // Undo and redo
  [
    'history records, undoes and redoes, and a new move forgets what was undone',
    () => {
      let h = startHistory('a');
      assertTrue(!canUndo(h) && !canRedo(h), 'a new history has nothing to undo or redo');
      assertTrue(undo(h) === h && redo(h) === h, 'undo and redo do nothing when there is nowhere to go');

      h = record(record(h, 'b'), 'c');
      assertEqual(h, { past: ['a', 'b'], present: 'c', future: [] });
      h = undo(undo(h));
      assertEqual(h, { past: [], present: 'a', future: ['b', 'c'] });
      h = redo(h);
      assertEqual(h, { past: ['a'], present: 'b', future: ['c'] });
      h = record(h, 'x');
      assertEqual(h, { past: ['a', 'b'], present: 'x', future: [] });
    },
  ],
  [
    'history never changes the history it was given, and keeps only the latest steps',
    () => {
      const first = startHistory(0);
      const second = record(first, 1);
      assertEqual(first, { past: [], present: 0, future: [] });
      undo(second);
      assertEqual(second, { past: [0], present: 1, future: [] });

      let long = startHistory(0);
      for (let i = 1; i <= MAX_HISTORY + 20; i += 1) long = record(long, i);
      assertEqual(long.past.length, MAX_HISTORY);
      assertEqual(long.past[long.past.length - 1], MAX_HISTORY + 19);
      assertEqual(long.present, MAX_HISTORY + 20);
    },
  ],
  [
    'the page undoes and redoes with the buttons and the keyboard, and saves the result',
    () => {
      const store = createGameStore(fakeStorage());
      const before = { game: createGame(2), moves: [], lastRoll: null };
      const after = {
        game: { positions: [14, 0], turn: 1, winner: null },
        moves: [ladderMove()],
        lastRoll: { player: 0, face: 4 },
      };
      store.save({ ...after, past: [before], future: [] });

      const page = mountForTest(store);
      try {
        assertTrue(!page.ref('undo').disabled, 'there is a move to undo');
        assertTrue(page.ref('redo').disabled, 'there is nothing to redo yet');
        assertEqual(page.text('turnText'), "Blue's turn");

        page.ref('undo').click();
        assertEqual(page.text('turnText'), "Red's turn");
        assertEqual(page.text('rollText'), '');
        assertEqual(page.root.querySelectorAll('.moves li').length, 0);
        assertTrue(page.ref('undo').disabled && !page.ref('redo').disabled, 'buttons follow the history');
        assertEqual(store.load().game.positions, [0, 0]);
        assertEqual(store.load().future.length, 1);

        page.ref('redo').click();
        assertEqual(page.text('turnText'), "Blue's turn");
        assertEqual(page.text('rollText'), 'Red rolled 4');
        assertEqual(page.root.querySelectorAll('.moves li').length, 1);
        assertEqual(store.load().game.positions, [14, 0]);

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
        assertEqual(page.text('turnText'), "Red's turn");
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true }));
        assertEqual(page.text('turnText'), "Blue's turn");
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true }));
        assertEqual(page.text('turnText'), "Blue's turn");
      } finally {
        page.root.remove();
      }
    },
  ],
  [
    'rolling while a move is undone forgets the redo, and a new game starts a clean history',
    () => {
      const store = createGameStore(fakeStorage());
      const before = { game: createGame(2), moves: [], lastRoll: null };
      store.save({
        game: { positions: [14, 0], turn: 1, winner: null },
        moves: [ladderMove()],
        lastRoll: { player: 0, face: 4 },
        past: [before],
        future: [],
      });

      const page = mountForTest(store);
      try {
        page.ref('undo').click();
        assertEqual(store.load().future.length, 1);
        page.roll(3);
        assertEqual(store.load().future, []);
        assertEqual(store.load().past.length, 1);
        assertEqual(store.load().game.positions, [3, 0]);

        page.ref('newGame').click();
        const fresh = store.load();
        assertEqual(fresh.past, []);
        assertEqual(fresh.future, []);
        assertTrue(page.ref('undo').disabled && page.ref('redo').disabled, 'a new game has nothing to undo');
      } finally {
        page.root.remove();
      }
    },
  ],
  [
    'saved layout 1 games still open, with no history and no custom names',
    () => {
      const text = JSON.stringify({
        version: 1,
        game: { positions: [14, 3], turn: 1, winner: null },
        moves: ['Red rolled 4: start to 4, then up a ladder to 14.'],
        lastRoll: { player: 0, face: 4 },
      });
      const loaded = createGameStore(fakeStorage({ [STORAGE_KEY]: text })).load();
      assertEqual(loaded.game.positions, [14, 3]);
      assertEqual(loaded.moves, []);
      assertEqual(loaded.lastRoll, { player: 0, face: 4 });
      assertEqual(loaded.past, []);
      assertEqual(loaded.future, []);
      assertEqual(loaded.names, defaultCustomNames());
    },
  ],
  [
    'a damaged history is dropped without losing the game itself',
    () => {
      const state = (positions) => ({ game: { positions, turn: 0, winner: null }, moves: [], lastRoll: null });
      const base = { version: STORAGE_VERSION, ...state([5, 0]), past: [], future: [] };
      const cases = [
        { ...base, past: [state([1, 0]), state([1, 0, 0])] },
        { ...base, past: [state([1, 101])] },
        { ...base, past: 'nope' },
        { ...base, future: [null] },
      ];
      for (const raw of cases) {
        const loaded = createGameStore(fakeStorage({ [STORAGE_KEY]: JSON.stringify(raw) })).load();
        assertEqual(loaded.game.positions, [5, 0]);
        assertEqual(loaded.past, []);
        assertEqual(loaded.future, []);
      }
    },
  ],

  // Player names
  [
    'cleanName trims, collapses spaces, strips control characters and limits the length',
    () => {
      assertEqual(cleanName('  Asha   Rao '), 'Asha Rao');
      assertEqual(cleanName('a\tb\nc'), 'a b c');
      assertEqual(cleanName(null), '');
      assertEqual(cleanName('x'.repeat(40)).length, MAX_NAME_LENGTH);
      assertEqual(cleanName('é'.repeat(40)), 'é'.repeat(MAX_NAME_LENGTH));
    },
  ],
  [
    'a name that is empty or just the color means "use the color"',
    () => {
      assertEqual(customNameFor(0, ''), '');
      assertEqual(customNameFor(0, '   '), '');
      assertEqual(customNameFor(0, 'red'), '');
      assertEqual(customNameFor(1, ' Blue '), '');
      assertEqual(customNameFor(0, 'Blue'), 'Blue', 'another color name is still a custom name');
      assertEqual(customNameFor(2, 'Asha'), 'Asha');
    },
  ],
  [
    'displayNames fills in the color for every player without a name',
    () => {
      assertEqual(displayNames(defaultCustomNames()), ['Red', 'Blue', 'Green', 'Amber']);
      assertEqual(displayNames(['', 'Asha']), ['Red', 'Asha', 'Green', 'Amber']);
      assertEqual(displayNames(undefined), ['Red', 'Blue', 'Green', 'Amber']);
    },
  ],
  [
    'describeMove uses the names it is given, and falls back to the color',
    () => {
      const { move } = playTurn(createGame(2), 2);
      assertEqual(describeMove(move, ['Asha', 'Ben']), 'Asha rolled 2: start to 2.');
      assertEqual(describeMove(move, ['', 'Ben']), 'Red rolled 2: start to 2.');
      assertEqual(describeMove(move), 'Red rolled 2: start to 2.');
      const win = playTurn({ positions: [96, 0], turn: 0, winner: null }, 4).move;
      assertTrue(describeMove(win, ['Asha']).endsWith('Asha wins!'), 'the winner is named');
    },
  ],
  [
    'moveRecord keeps what the move list needs and leaves out the squares walked over',
    () => {
      const { move } = playTurn({ positions: [0, 13], turn: 1, winner: null }, 3);
      const kept = moveRecord(move);
      assertTrue(!('steps' in kept), 'steps are dropped');
      assertEqual(kept, { player: 1, roll: 3, from: 13, landed: 16, to: 6, kind: 'snake', won: false });
    },
  ],
  [
    'names are saved, cleaned when loaded, and ignored if they are not text',
    () => {
      const raw = {
        version: STORAGE_VERSION,
        game: createGame(2),
        moves: [],
        lastRoll: null,
        names: ['  Asha  ', 7, null, 'z'.repeat(50), 'fifth'],
      };
      const loaded = createGameStore(fakeStorage({ [STORAGE_KEY]: JSON.stringify(raw) })).load();
      assertEqual(loaded.names, ['Asha', '', '', 'z'.repeat(MAX_NAME_LENGTH)]);
    },
  ],
  [
    'the page shows custom names everywhere, lets a name be edited, and goes back to the color when it is cleared',
    () => {
      const store = createGameStore(fakeStorage());
      store.save({
        game: { positions: [14, 3], turn: 1, winner: null },
        moves: [ladderMove()],
        lastRoll: { player: 0, face: 4 },
        names: ['Asha', '', '', ''],
      });

      const page = mountForTest(store);
      try {
        const inputs = [...page.root.querySelectorAll('.player-name')];
        assertEqual(
          inputs.map((input) => input.value),
          ['Asha', 'Blue'],
        );
        assertEqual(page.text('rollText'), 'Asha rolled 4');
        assertEqual(page.root.querySelector('.moves li').textContent, 'Asha rolled 4: start to 4, then up a ladder to 14.');

        const rename = (index, value) => {
          inputs[index].value = value;
          inputs[index].dispatchEvent(new Event('input', { bubbles: true }));
        };

        rename(1, '  Ben  ');
        assertEqual(page.text('turnText'), "Ben's turn");
        assertEqual(page.ref('roll').textContent, 'Roll for Ben');
        assertEqual(store.load().names, ['Asha', 'Ben', '', '']);
        assertEqual(page.root.querySelectorAll('.player-name').length, 2, 'rows are kept while typing');

        rename(1, '');
        assertEqual(page.text('turnText'), "Blue's turn");
        assertEqual(store.load().names, ['Asha', '', '', '']);

        // A name belongs to the color, so it stays for the next game and is not part of undo.
        page.ref('newGame').click();
        assertEqual(page.text('turnText'), "Asha's turn");
        assertEqual(store.load().names, ['Asha', '', '', '']);
      } finally {
        page.root.remove();
      }
    },
  ],
  [
    'sound can be turned off, makes nothing while off, and remembers the choice',
    () => {
      const storage = fakeStorage();
      const calls = { count: 0 };
      const createContext = () => fakeAudioContext(calls);
      const sound = createSound({ storage, createContext });
      sound.setEnabled(false);
      sound.play('step');
      sound.play('swallow');
      assertEqual(calls.count, 0, 'nothing should be made while sound is off');
      assertEqual(createSound({ storage }).enabled, false, 'the off choice should be remembered');
      sound.setEnabled(true);
      assertEqual(createSound({ storage }).enabled, true, 'the on choice should be remembered');
    },
  ],
  [
    'every sound cue is made through the audio graph, and unknown names are ignored',
    () => {
      const calls = { count: 0 };
      const sound = createSound({ storage: fakeStorage(), createContext: () => fakeAudioContext(calls) });
      for (const name of SOUND_CUES) {
        const before = calls.count;
        sound.play(name);
        assertTrue(calls.count > before, `${name} should make sound`);
      }
      const before = calls.count;
      sound.play('no-such-cue');
      sound.play('constructor');
      assertEqual(calls.count, before, 'unknown cues should do nothing');
    },
  ],
  [
    'sound stays silent without an audio context, and never throws',
    () => {
      const sound = createSound({ storage: fakeStorage(), createContext: () => null });
      sound.play('win');
      sound.setEnabled(true);
      assertEqual(sound.enabled, true);
    },
  ],
];

/** A move for the saved-game tests: Red rolls a 4 from the start and takes the ladder to 14. */
function ladderMove(changes = {}) {
  return { player: 0, roll: 4, from: 0, landed: 4, to: 14, kind: 'ladder', won: false, ...changes };
}

/** Puts the game page in the document, with a dice service that does nothing but hand over rolls. */
function mountForTest(store) {
  const root = document.createElement('main');
  document.body.append(root);
  let onRoll = () => {};
  const dice = {
    onRoll(listener) {
      onRoll = listener;
      return () => {};
    },
    subscribe(listener) {
      listener({ connected: false });
      return () => {};
    },
  };
  mountGame(root, dice, store);
  const ref = (name) => root.querySelector(`[data-ref="${name}"]`);
  return {
    root,
    ref,
    text: (name) => ref(name).textContent,
    roll: (face) => onRoll({ face, fromDevice: false }),
  };
}

/** A stand-in for localStorage that keeps everything in memory. */
function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => {
      data.set(key, String(value));
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

/**
 * A stand-in for the Web Audio context. Every node it makes can be connected, configured and
 * started, and each `create...` call is counted in `calls.count`.
 */
function fakeAudioContext(calls) {
  const node = () => {
    const self = new Proxy(function () {}, {
      get: (_target, key) => (key === 'then' ? undefined : self),
      set: () => true,
      apply: () => self,
    });
    return self;
  };
  return new Proxy(
    {},
    {
      get: (_target, key) => {
        if (key === 'currentTime') return 0;
        if (key === 'sampleRate') return 44100;
        if (key === 'state') return 'running';
        if (typeof key === 'string' && key.startsWith('create')) {
          return () => {
            calls.count += 1;
            return node();
          };
        }
        return node();
      },
    },
  );
}
