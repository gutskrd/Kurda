/**
 * HTML-escape, for text that came from strangers.
 *
 * The dictionary's definitions are Wiktionary text — written by anyone, and the
 * only thing on a public dictionary page that an attacker controls. This is the
 * first of the two things standing between that and a script running; the second
 * is `script-src 'none'` in `web/public/_headers`, which does not depend on this
 * function being right.
 *
 * Five characters, because these values land in element text *and* in attribute
 * values, and an attribute is what makes the quotes matter. Nothing on these
 * pages interpolates a definition anywhere else — not into a script, a style, or
 * a URL — which is deliberate: each of those needs a different escape, and the
 * way not to get one wrong is not to have one.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
