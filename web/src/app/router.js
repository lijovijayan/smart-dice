// Which page to show, taken from the URL hash.

/**
 * The page named by a URL hash such as "#dice". Anything unknown gives `fallback`,
 * so the app always has a page to show.
 * @param {string} hash
 * @param {readonly string[]} ids the page ids that exist
 * @param {string} fallback
 */
export function pageFromHash(hash, ids, fallback) {
  const name = hash.replace(/^#/, '');
  return ids.includes(name) ? name : fallback;
}
