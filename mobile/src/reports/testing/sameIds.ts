/**
 * Character markup with whichever ids a drawing was given, the character's own or one web drawing's own
 * (`useDrawingIds`), written alike, so a test can compare what was drawn with the shared layers.
 */
const DRAWING_IDS = /\b(?:hv(?:hamo|xezo|hevalo)|dw-[a-z]+-[A-Za-z0-9]+)-/g;

export function sameIds<T>(value: T): T {
  if (typeof value === 'string') return value.replace(DRAWING_IDS, 'id-') as T;
  if (Array.isArray(value)) return value.map((v: unknown) => sameIds(v)) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sameIds(v)])) as T;
  return value;
}
