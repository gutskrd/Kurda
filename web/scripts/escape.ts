/**
 * HTML-escapes strangers' text: the Wiktionary definitions are the only attacker-controlled content on the dictionary
 * pages. The second wall is the pages' Content-Security-Policy in `web/public/_headers`. Five characters, because values
 * land in element text and attributes; nothing interpolates a definition into a script, style or URL, each of which
 * would need its own escape.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
