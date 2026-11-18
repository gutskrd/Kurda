/**
 * The address a story's or a riddle's source may be opened at, or null.
 *
 * A source's address comes from the server as text an editor typed, and what
 * the app opens is handed to the phone, which opens any kind of address it
 * has an app for. The server checks an address when a source is saved, but a
 * row stored before that check could hold anything; so the app makes a link
 * only of an https address, and shows any other source as plain text.
 */
export function openableSourceUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  // the scheme, then a host, then nothing but a path, query or fragment: no spaces anywhere
  return /^https:\/\/[^\s/?#]+(?:[/?#]\S*)?$/i.test(trimmed) ? trimmed : null;
}
