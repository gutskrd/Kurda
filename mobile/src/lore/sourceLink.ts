/**
 * The address a story's or riddle's source may be opened at, or null. The address is text an editor typed, and the
 * phone opens any kind of address it has an app for; the server checks it on save, but older rows could hold anything,
 * so only an https address becomes a link.
 */
export function openableSourceUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  // The scheme, a host, then only a path, query or fragment, with no spaces anywhere.
  return /^https:\/\/[^\s/?#]+(?:[/?#]\S*)?$/i.test(trimmed) ? trimmed : null;
}
