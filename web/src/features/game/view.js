// The snake and ladder page: turn flow, the die, the side panel and the win celebration.
// Rolls arrive from the shared dice service (the real board, or the demo keys) or from the
// Roll button. This file is the only part of the feature that knows about the page.

import { FACE_PIPS, faceColor, isFaceNumber } from '../../dice/faces.js';
import { isTypingTarget, refsOf, restartClass } from '../../shared/dom.js';
import { createBoardView } from './board.js';
import { canRedo, canUndo, record, redo, startHistory, undo } from './history.js';
import { GAME_MARKUP } from './markup.js';
import { MAX_NAME_LENGTH, customNameFor, defaultCustomNames, displayNames } from './players.js';
import { MAX_PLAYERS, MIN_PLAYERS, PLAYER_COLORS, PLAYER_NAMES, START_SQUARE, createGame, describeMove, moveRecord, playTurn } from './rules.js';
import { createGameStore } from './storage.js';
import { createSound } from './sound.js';

const TUMBLE_STEPS = 7;
const TUMBLE_STEP_MS = 70;
const LADDER_PAUSE_MS = 200;
const SNAKE_PAUSE_MS = 90;
const REDUCED_MOTION_MAX_MS = 40;
const MAX_MOVES = 8;
const DEFAULT_PLAYERS = 2;
const CONFETTI_COUNT = 90;
const CONFETTI_COLORS = Object.freeze([...PLAYER_COLORS, '#ffd166', '#f2f2f2']);

const GAME_HINT_DEMO = 'Press Roll, or keys 1–6 to choose the number.';
const GAME_HINT_LIVE = 'Roll your Smart Dice, or press Roll.';

const REF_NAMES = [
  'board',
  'winner',
  'winnerText',
  'winnerAgain',
  'dieFace',
  'turnText',
  'rollText',
  'roll',
  'undo',
  'redo',
  'hint',
  'players',
  'playerCount',
  'newGame',
  'sound',
  'moves',
  'movesEmpty',
];

/**
 * Fills `root` with the game and starts listening to the dice.
 * @param {HTMLElement} root
 * @param {import('../../dice/service.js').DiceService} dice
 * @returns {import('../../shared/contracts.js').FeatureInstance}
 */
export function mountGame(root, dice, store = createGameStore()) {
  const doc = root.ownerDocument;
  root.innerHTML = GAME_MARKUP;
  const refs = refsOf(root, REF_NAMES);

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const pause = (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, reduceMotion.matches ? Math.min(ms, REDUCED_MOTION_MAX_MS) : ms);
    });

  const sound = createSound();
  const board = createBoardView(refs.board, sound);

  let game = createGame(DEFAULT_PLAYERS);
  let playerCount = DEFAULT_PLAYERS;
  // Newest first. Each is a move record; `describeMove` turns it into text with the current names.
  let moves = [];
  // The last roll as { player, face }, kept so a resumed game can show it.
  let lastRoll = null;
  // Undo and redo. Its present state is always what `game`, `moves` and `lastRoll` hold,
  // except while a move is animating (it already holds the move's outcome by then).
  let history = startHistory({ game, moves, lastRoll });
  // What the visitor typed for each color ('' means use the color's own name).
  let customNames = defaultCustomNames();
  let names = displayNames(customNames);
  let busy = false;
  let active = true;
  let live = false;
  // Bumped when a new game starts, so a move that is still animating knows to stop.
  let session = 0;
  // Set once the winner has been celebrated, so re-renders do not fire confetti again.
  let celebrated = false;
  // True only for the render right after a move is recorded, so just the new entry animates.
  let freshMove = false;
  let lastTurnKey = null;

  // The die: nine cells, with pips lit for the number shown.
  const pipCells = Array.from({ length: 9 }, () => {
    const cell = doc.createElement('span');
    refs.dieFace.append(cell);
    return cell;
  });

  function showDie(face) {
    const lit = isFaceNumber(face) ? FACE_PIPS[face].map(([col, row]) => row * 3 + col) : [];
    pipCells.forEach((cell, index) => cell.classList.toggle('on', lit.includes(index)));
    refs.dieFace.style.setProperty('--c', faceColor(face));
    refs.dieFace.setAttribute('aria-label', isFaceNumber(face) ? `Rolled ${face}` : 'No roll yet');
  }

  // Player count buttons.
  const countButtons = [];
  for (let count = MIN_PLAYERS; count <= MAX_PLAYERS; count += 1) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'chip';
    button.textContent = String(count);
    button.setAttribute('aria-label', `${count} players`);
    button.addEventListener('click', () => {
      startGame(count);
    });
    refs.playerCount.append(button);
    countButtons.push(button);
  }

  /** Bursts confetti from the middle of the win overlay. Each piece falls, spins and fades. */
  function celebrate() {
    if (reduceMotion.matches) return;
    for (let i = 0; i < CONFETTI_COUNT; i += 1) {
      const piece = doc.createElement('i');
      piece.className = 'confetti';
      piece.style.setProperty('--c', CONFETTI_COLORS[i % CONFETTI_COLORS.length]);
      refs.winner.append(piece);

      const sideways = (Math.random() - 0.5) * 520;
      const fall = 380 + Math.random() * 360;
      const spin = (Math.random() - 0.5) * 900;
      const animation = piece.animate(
        [
          { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
          {
            transform: `translate(${sideways * 0.7}px, ${fall * 0.4}px) rotate(${spin * 0.5}deg)`,
            opacity: 1,
            offset: 0.4,
          },
          { transform: `translate(${sideways}px, ${fall}px) rotate(${spin}deg)`, opacity: 0 },
        ],
        {
          duration: 1800 + Math.random() * 1400,
          delay: Math.random() * 350,
          easing: 'cubic-bezier(0.2, 0.6, 0.4, 1)',
          fill: 'backwards',
        },
      );
      animation.onfinish = () => piece.remove();
    }
  }

  function render() {
    const over = game.winner !== null;
    const player = over ? game.winner : game.turn;
    const name = names[player];
    const color = PLAYER_COLORS[player];

    refs.turnText.textContent = over ? `${name} wins!` : `${name}'s turn`;
    refs.turnText.style.setProperty('--player', color);
    const turnKey = over ? 'over' : String(game.turn);
    if (turnKey !== lastTurnKey) {
      restartClass(refs.turnText, 'pop');
      lastTurnKey = turnKey;
    }
    refs.roll.textContent = busy ? 'Moving…' : over ? 'Game over' : `Roll for ${name}`;
    refs.roll.disabled = busy || over;
    refs.hint.textContent = live ? GAME_HINT_LIVE : GAME_HINT_DEMO;

    refs.winner.hidden = !over;
    refs.winnerText.textContent = over ? `${name} wins!` : '';
    refs.winnerText.style.setProperty('--player', color);
    if (over && !celebrated) {
      celebrated = true;
      celebrate();
      sound.play('win');
    }

    if (playerRows.length !== game.positions.length) buildPlayerRows(game.positions.length);
    playerRows.forEach((row, index) => {
      const square = game.positions[index];
      if (!over && index === game.turn) row.item.setAttribute('aria-current', 'true');
      else row.item.removeAttribute('aria-current');
      // Never rewrite a name while it is being typed.
      if (doc.activeElement !== row.input) row.input.value = names[index];
      row.where.textContent =
        over && index === game.winner ? 'Winner' : square === START_SQUARE ? 'Start' : `Square ${square}`;
    });

    countButtons.forEach((button, index) => {
      button.setAttribute('aria-pressed', String(MIN_PLAYERS + index === playerCount));
    });

    const fresh = freshMove;
    freshMove = false;
    refs.moves.replaceChildren(
      ...moves.map((move, index) => {
        const item = doc.createElement('li');
        item.textContent = describeMove(move, names);
        if (fresh && index === 0) item.className = 'fresh';
        return item;
      }),
    );
    refs.movesEmpty.hidden = moves.length > 0;

    refs.undo.disabled = busy || !canUndo(history);
    refs.redo.disabled = busy || !canRedo(history);
    if (!busy) refs.rollText.textContent = rollLabel();

    refs.sound.textContent = sound.enabled ? 'Sound: on' : 'Sound: off';
    refs.sound.setAttribute('aria-pressed', String(sound.enabled));

    board.setActive(over ? null : game.turn);
  }

  function rollLabel() {
    return lastRoll ? `${names[lastRoll.player]} rolled ${lastRoll.face}` : '';
  }

  function showRoll() {
    showDie(lastRoll ? lastRoll.face : null);
    refs.rollText.textContent = rollLabel();
  }

  /** Puts the game, the board and the side panel in the history's present state, without any animation. */
  function setState(nextHistory, saved) {
    history = nextHistory;
    const state = history.present;
    session += 1;
    game = state.game;
    playerCount = game.positions.length;
    moves = state.moves;
    lastRoll = state.lastRoll;
    busy = false;
    // A game that was already won is not celebrated again when it is opened.
    celebrated = game.winner !== null && saved;
    freshMove = false;
    lastTurnKey = null;
    board.reset(game.positions);
    showRoll();
    refs.winner.querySelectorAll('.confetti').forEach((piece) => piece.remove());
    render();
  }

  /** Saves the state at once, so a reload in the middle of a move still shows where it ended. */
  function persist() {
    store.save({ ...history.present, past: history.past, future: history.future, names: customNames });
  }

  function startGame(count) {
    setState(startHistory({ game: createGame(count), moves: [], lastRoll: null }), false);
    persist();
  }

  /** Steps through the history: -1 undoes the last move, 1 redoes one. Not while a move is animating. */
  function stepHistory(direction) {
    if (!active || busy) return;
    const next = direction < 0 ? undo(history) : redo(history);
    if (next === history) return;

    history = next;
    ({ game, moves, lastRoll } = history.present);
    celebrated = false;
    freshMove = false;
    lastTurnKey = null;
    refs.winner.querySelectorAll('.confetti').forEach((piece) => piece.remove());
    sound.play(direction < 0 ? 'undo' : 'redo');
    showRoll();
    void board.glideTo(game.positions);
    persist();
    render();
  }

  function setCustomName(index, typed) {
    customNames[index] = customNameFor(index, typed);
    names = displayNames(customNames);
    board.setNames(names);
    persist();
    render();
  }

  /** The player list: one row per player, with a name field that can be edited in place. */
  let playerRows = [];
  function buildPlayerRows(count) {
    playerRows = Array.from({ length: count }, (_, index) => {
      const item = doc.createElement('li');
      item.className = 'player';
      item.style.setProperty('--player', PLAYER_COLORS[index]);

      const dot = doc.createElement('i');
      dot.className = 'player-dot';

      const input = doc.createElement('input');
      input.type = 'text';
      input.className = 'player-name';
      input.maxLength = MAX_NAME_LENGTH;
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.title = 'Click to rename';
      input.setAttribute('aria-label', `Name for ${PLAYER_NAMES[index]}`);
      input.addEventListener('input', () => setCustomName(index, input.value));
      input.addEventListener('blur', () => {
        input.value = names[index];
      });
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === 'Escape') input.blur();
      });

      const where = doc.createElement('span');
      where.className = 'player-square';
      item.append(dot, input, where);
      return { item, input, where };
    });
    refs.players.replaceChildren(...playerRows.map((row) => row.item));
  }

  async function play(roll, tumble) {
    if (!active || busy || game.winner !== null) return;
    const { game: next, move } = playTurn(game, roll);
    if (!move) return;

    const run = session;
    const stale = () => run !== session;

    // The outcome is already decided, so save it now. If the page is closed during the
    // animation, the game comes back where the move ended.
    const nextMoves = [moveRecord(move), ...moves].slice(0, MAX_MOVES);
    const nextRoll = { player: move.player, face: roll };
    history = record(history, { game: next, moves: nextMoves, lastRoll: nextRoll });
    persist();

    busy = true;
    sound.play(tumble ? 'roll' : 'click');
    render();

    if (tumble && !reduceMotion.matches) {
      restartClass(refs.dieFace, 'tumbling');
      for (let i = 0; i < TUMBLE_STEPS; i += 1) {
        showDie(1 + Math.floor(Math.random() * 6));
        await pause(TUMBLE_STEP_MS);
        if (stale()) return;
      }
    }
    showDie(roll);
    refs.rollText.textContent = `${names[move.player]} rolled ${roll}`;

    if (move.kind === 'blocked') {
      await board.bump(move.player);
    } else {
      await board.walk(move.player, move.steps);
      if (stale()) return;
      if (move.kind === 'ladder') {
        await pause(LADDER_PAUSE_MS);
        if (stale()) return;
        await board.climb(move.player, move.landed, move.to);
      } else if (move.kind === 'snake') {
        await pause(SNAKE_PAUSE_MS);
        if (stale()) return;
        await board.slide(move.player, move.landed, move.to);
      }
    }
    if (stale()) return;

    game = next;
    moves = nextMoves;
    lastRoll = nextRoll;
    busy = false;
    freshMove = true;
    render();
  }

  refs.roll.addEventListener('click', () => {
    void play(1 + Math.floor(Math.random() * 6), true);
  });
  refs.undo.addEventListener('click', () => stepHistory(-1));
  refs.redo.addEventListener('click', () => stepHistory(1));
  // Ctrl or Cmd + Z undoes, with Shift (or Ctrl + Y) it redoes. Typing in a name field keeps its own undo.
  window.addEventListener('keydown', (event) => {
    if (!active || isTypingTarget(event.target)) return;
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === 'z') {
      event.preventDefault();
      stepHistory(event.shiftKey ? 1 : -1);
    } else if (key === 'y') {
      event.preventDefault();
      stepHistory(1);
    }
  });
  refs.sound.addEventListener('click', () => {
    sound.setEnabled(!sound.enabled);
    render();
  });
  refs.newGame.addEventListener('click', () => {
    startGame(playerCount);
  });
  refs.winnerAgain.addEventListener('click', () => {
    startGame(playerCount);
  });

  // Pick up the saved game if there is one; otherwise start a new one.
  const saved = store.load();
  if (saved) {
    customNames = saved.names;
    names = displayNames(customNames);
    board.setNames(names);
    const { past, future, names: _names, ...present } = saved;
    setState({ past, present, future }, true);
  } else {
    startGame(DEFAULT_PLAYERS);
  }

  // A roll from the board looks like a throw (the die tumbles). A demo key press does not.
  dice.onRoll(({ face, fromDevice }) => {
    void play(face, fromDevice);
  });
  dice.subscribe(({ connected }) => {
    if (connected === live) return;
    live = connected;
    render();
  });

  return {
    setActive(next) {
      active = next;
    },
  };
}
