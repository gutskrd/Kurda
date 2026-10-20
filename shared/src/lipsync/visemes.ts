/**
 * The mouth shapes a speaking character is drawn with.
 *
 * A mouth seen from the front only shows a handful of shapes, whatever the
 * language: lips pressed, lip on teeth, the tongue at the teeth, teeth with the
 * lips apart, and the vowels from wide open to rounded. Kurdish letters map onto
 * these closely (lipsync/letters.ts), so the characters' mouths are drawn once
 * per shape and the recording's timeline says which one shows when.
 *
 * The order is the order a character sheet shows them in.
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

export function isViseme(value: unknown): value is Viseme {
  return typeof value === 'string' && (VISEMES as readonly string[]).includes(value);
}
