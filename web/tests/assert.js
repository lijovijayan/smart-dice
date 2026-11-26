// Tiny assertion helpers shared by the test suites.

export class AssertionError extends Error {}

export function assertEqual(actual, expected, message = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new AssertionError(`${message ? `${message}: ` : ''}expected ${e}, got ${a}`);
}

export function assertTrue(value, message) {
  if (!value) throw new AssertionError(message);
}

export function assertClose(actual, expected, tolerance = 1e-9) {
  assertTrue(Math.abs(actual - expected) <= tolerance, `expected ${expected}, got ${actual}`);
}

/** Runs `fn` and checks that it throws. */
export function assertThrows(fn, message) {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  assertTrue(threw, message);
}
