/**
 * The mouth shapes a speaking character is drawn with: the handful a mouth shows from the front, in any language. Kurdish
 * letters map onto them (letters.ts), so each mouth is drawn once per shape. Ordered as a character sheet shows them.
 */
export const VISEMES = [
  /** at rest: lips together and relaxed — silence, and the end of every line */
  'rest',
  /** lips pressed together: b, m, p */
  'mbp',
  /** the lower lip tucked under the top teeth: f, v */
  'fv',
  /** lips apart, the tongue tip up behind the teeth: l, n, t, d */
  'l',
  /** teeth nearly together, lips a little apart: s, z, ş, j, c, ç, k, g, q, r, x, h, y and the rest */
  'etc',
  /** the jaw dropped, mouth wide open: a */
  'a',
  /** open, the corners a little spread: e, ê */
  'e',
  /** spread, teeth close, near a smile: i, î */
  'i',
  /** rounded and open: o */
  'o',
  /** rounded and small, the lips pushed forward: u, û, w */
  'u',
] as const;

export type Viseme = (typeof VISEMES)[number];
