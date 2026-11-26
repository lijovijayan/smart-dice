// Small DOM helpers shared by every page.

/**
 * Finds the elements marked `data-ref="name"` inside `root`, so a page can look up its own
 * elements without ids. Two pages can then use the same names without clashing.
 * Throws when one is missing, so a typo shows up straight away.
 * @template {string} Name
 * @param {ParentNode} root
 * @param {readonly Name[]} names
 * @returns {Record<Name, HTMLElement>}
 */
export function refsOf(root, names) {
  const refs = {};
  for (const name of names) {
    const node = root.querySelector(`[data-ref="${name}"]`);
    if (!node) throw new Error(`Missing [data-ref="${name}"] element`);
    refs[name] = node;
  }
  return refs;
}

/**
 * True when a key press came from somewhere the visitor is typing text, so page-wide
 * shortcuts should leave it alone.
 * @param {EventTarget | null | undefined} target
 */
export function isTypingTarget(target) {
  if (!target) return false;
  const { tagName, isContentEditable } = /** @type {HTMLElement} */ (target);
  return isContentEditable === true || /^(INPUT|TEXTAREA|SELECT)$/.test(tagName ?? '');
}

/** Restarts a CSS animation: remove the class, force a reflow, then add it back. */
export function restartClass(node, name) {
  node.classList.remove(name);
  void node.offsetWidth;
  node.classList.add(name);
}
