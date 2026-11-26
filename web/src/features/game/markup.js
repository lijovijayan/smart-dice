// The page's HTML. Elements are marked data-ref so view.js can find them without ids.

export const GAME_MARKUP = `
  <section class="board-card">
    <div class="board" data-ref="board"></div>
    <div class="winner" data-ref="winner" role="status" hidden>
      <p class="winner-text" data-ref="winnerText"></p>
      <button type="button" data-ref="winnerAgain">Play again</button>
    </div>
  </section>

  <aside class="panel">
    <div class="card">
      <h2>Turn</h2>
      <div class="turn-row">
        <div class="die" data-ref="dieFace" role="img" aria-label="No roll yet"></div>
        <div>
          <p class="turn-text" data-ref="turnText" aria-live="polite"></p>
          <p class="note" data-ref="rollText"></p>
        </div>
      </div>
      <button class="primary" type="button" data-ref="roll">Roll</button>
      <div class="history" role="group" aria-label="Undo and redo">
        <button type="button" data-ref="undo" title="Undo the last move (Ctrl/Cmd + Z)">↶ Undo</button>
        <button type="button" data-ref="redo" title="Redo (Shift + Ctrl/Cmd + Z)">Redo ↷</button>
      </div>
      <p class="note" data-ref="hint"></p>
    </div>

    <div class="card">
      <h2>Players</h2>
      <ul class="players" data-ref="players"></ul>
      <p class="note">Click a name to rename it. Leave it empty to use the color.</p>
      <div class="setup">
        <span class="note">Players</span>
        <div class="count" data-ref="playerCount" role="group" aria-label="Number of players"></div>
      </div>
      <button class="wide" type="button" data-ref="newGame">New game</button>
      <button class="wide" type="button" data-ref="sound" aria-pressed="true">Sound: on</button>
    </div>

    <div class="card">
      <h2>Moves</h2>
      <ol class="moves" data-ref="moves"></ol>
      <p class="empty" data-ref="movesEmpty">Nothing rolled yet.</p>
    </div>
  </aside>
`;
