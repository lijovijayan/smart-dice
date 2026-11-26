// The page's HTML. Elements are marked data-ref so the code can find them without ids.

export const DASHBOARD_MARKUP = `
  <section class="view" data-ref="view">
    <span class="badge" data-ref="mode">Demo</span>
    <p class="hint" data-ref="hint"></p>
  </section>

  <aside class="panel">
    <div class="card">
      <h2>Upper face</h2>
      <div class="face-row">
        <p class="big" data-ref="face" aria-live="polite">–</p>
        <p class="pill" data-ref="stable" data-kind="moving">Moving</p>
      </div>
      <div class="faces" data-ref="faces" role="group" aria-label="Faces"></div>
    </div>

    <div class="card">
      <h2>Accelerometer (g)</h2>
      <div class="axes">
        <div class="axis" data-axis="x">
          <span class="axis-name">X</span>
          <span class="bar"><i data-ref="barAx"></i></span>
          <span class="axis-value" data-ref="ax">0.00</span>
        </div>
        <div class="axis" data-axis="y">
          <span class="axis-name">Y</span>
          <span class="bar"><i data-ref="barAy"></i></span>
          <span class="axis-value" data-ref="ay">0.00</span>
        </div>
        <div class="axis" data-axis="z">
          <span class="axis-name">Z</span>
          <span class="bar"><i data-ref="barAz"></i></span>
          <span class="axis-value" data-ref="az">1.00</span>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>Recent rolls</h2>
      <div class="history" data-ref="history"></div>
      <p class="empty" data-ref="historyEmpty">Rolls show up here once the die settles.</p>
    </div>
  </aside>
`;
