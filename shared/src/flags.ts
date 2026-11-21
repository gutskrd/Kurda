/**
 * Country flags as small vector pictures in 3:2, drawn by Hevalo itself so they are crisp at any size and no outside
 * service learns who looked at a profile. The states' flags come from an open-licensed set; Kurdistan's, which no
 * state-based set has, is drawn here. Kept out of the package index so the server never loads it.
 */
import * as STATES from 'country-flag-icons/string/3x2';

/** The width and height every flag here is drawn at, in its own units. */
const W = 513;
const H = 342;

/** Red, white and green, with the golden sun of twenty-one rays in the middle. */
function kurdistan(): string {
  const cx = W / 2;
  const cy = H / 2;
  const n = 21;
  const tip = 52;
  const foot = 28;
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    // One ray points straight up; each is a narrow triangle whose base meets the next one's at the disc.
    const a = (i / n) * 2 * Math.PI - Math.PI / 2;
    const half = Math.PI / n;
    const at = (r: number, t: number): string => `${(cx + r * Math.cos(t)).toFixed(1)} ${(cy + r * Math.sin(t)).toFixed(1)}`;
    pts.push(`M${at(foot, a - half)}L${at(tip, a)}L${at(foot, a + half)}Z`);
  }
  const band = H / 3;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">` +
    `<path fill="#ED2024" d="M0 0h${W}v${band}H0z"/>` +
    `<path fill="#FFF" d="M0 ${band}h${W}v${band}H0z"/>` +
    `<path fill="#278E43" d="M0 ${band * 2}h${W}v${band}H0z"/>` +
    `<g fill="#FEBD11"><circle cx="${cx}" cy="${cy}" r="${foot + 1}"/><path d="${pts.join('')}"/></g>` +
    `</svg>`
  );
}

const OWN: Record<string, string> = { KU: kurdistan() };
const ALL = STATES as unknown as Record<string, string | undefined>;

/** A country's flag as SVG markup, or null for a code that has none. */
export function flagSvg(code: string): string | null {
  const key = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(key)) return null;
  return OWN[key] ?? ALL[key] ?? null;
}

/** The flag as a picture address, for an image element. */
export function flagDataUrl(code: string): string | null {
  const svg = flagSvg(code);
  return svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : null;
}
