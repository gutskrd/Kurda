/**
 * How an icon's parts are painted: the part says what it is (the metal, the
 * darker metal, an accent, snow, an ink line), this decides the colour, the
 * outline weight and the shadow it casts. Shared by the badges and by the
 * season plaque on the rank emblems, so a snowflake is the same snowflake on
 * both.
 */
import type { Part } from './icons.js';
import { ACCENT, INK, STONE } from './palette.js';
import type { Metal } from './palette.js';
import { metalBox, metalBoxDark } from './paint.js';
import type { Drawing } from './svg.js';
import { linearBox, n2 } from './svg.js';

export interface IconPaint {
  dr: Drawing;
  metal: Metal;
  small: boolean;
  locked: boolean;
}

/** The icon's parts, painted for this metal and size. */
export function paintIcon(parts: readonly Part[], p: IconPaint): string {
  const { dr, metal, small, locked } = p;
  const line = small ? 2.9 : 2.2;
  const shown = parts.filter((part) => !(small && 'fine' in part && part.fine));
  const tf = (part: Part): string => (part.tf ? ` transform="${part.tf}"` : '');

  if (locked) {
    const g = STONE.mid;
    return shown
      .filter((part) => part.k !== 'h')
      .map((part) => {
        switch (part.k) {
          case 'k':
            return `<path d="${part.d}" fill="${g}"${tf(part)}/>`;
          case 'd':
            return `<path d="${part.d}" fill="none" stroke="${g}" stroke-width="${n2((part.w ?? 1.6) * (small ? 1.3 : 1))}" stroke-linecap="round" stroke-linejoin="round"${tf(part)}/>`;
          case 'l':
            return `<path d="${part.d}" fill="none" stroke="${g}" stroke-width="${n2((part.w ?? 3) + (small ? 1 : 0.4))}" stroke-linecap="round" stroke-linejoin="round"${tf(part)}/>`;
          default:
            return `<path d="${part.d}" fill="${g}" fill-opacity="0.16" stroke="${g}" stroke-width="${n2(line * 0.85)}" stroke-linejoin="round"${tf(part)}/>`;
        }
      })
      .join('');
  }

  const light = metalBox(dr, metal);
  const dark = metalBoxDark(dr, metal);
  const snow = dr.id('n');
  dr.def(
    linearBox(snow, [
      [0, '#ffffff'],
      [1, '#d9e3ee'],
    ]),
  );
  const accents = new Map<string, string>();
  const accent = (name: keyof typeof ACCENT): string => {
    let id = accents.get(name);
    if (!id) {
      id = dr.id('a');
      const [a, b] = ACCENT[name];
      dr.def(
        linearBox(id, [
          [0, a],
          [1, b],
        ]),
      );
      accents.set(name, id);
    }
    return `url(#${id})`;
  };

  // the shadow every raised part casts on the enamel
  const shadow = shown
    .filter((part) => part.k === 'f' || part.k === 'a' || part.k === 'w' || part.k === 'c' || part.k === 'l')
    .map((part) =>
      part.k === 'l'
        ? `<path d="${part.d}" fill="none" stroke="#000000" stroke-width="${n2((part.w ?? 3) + line + 0.4)}" stroke-linecap="round" stroke-linejoin="round"${tf(part)}/>`
        : `<path d="${part.d}" fill="#000000" stroke="#000000" stroke-width="${n2(line)}" stroke-linejoin="round"${tf(part)}/>`,
    )
    .join('');

  const body = shown
    .map((part) => {
      switch (part.k) {
        case 'f':
          return `<path d="${part.d}" fill="url(#${light})" stroke="${INK}" stroke-width="${n2(line)}" stroke-linejoin="round"${tf(part)}/>`;
        case 'a':
          return `<path d="${part.d}" fill="url(#${dark})" stroke="${INK}" stroke-width="${n2(line)}" stroke-linejoin="round"${tf(part)}/>`;
        case 'w':
          return `<path d="${part.d}" fill="url(#${snow})" stroke="${INK}" stroke-width="${n2(line)}" stroke-linejoin="round"${tf(part)}/>`;
        case 'c':
          return `<path d="${part.d}" fill="${accent(part.c)}" stroke="${INK}" stroke-width="${n2(line)}" stroke-linejoin="round"${tf(part)}/>`;
        case 'k':
          return `<path d="${part.d}" fill="${INK}"${tf(part)}/>`;
        case 'd':
          return `<path d="${part.d}" fill="none" stroke="${INK}" stroke-width="${n2((part.w ?? 1.6) * (small ? 1.3 : 1))}" stroke-linecap="round" stroke-linejoin="round"${tf(part)}/>`;
        case 'l': {
          const w = part.w ?? 3;
          const colour = part.c ? ACCENT[part.c][0] : metal.light;
          return (
            `<path d="${part.d}" fill="none" stroke="${INK}" stroke-width="${n2(w + line)}" stroke-linecap="round" stroke-linejoin="round"${tf(part)}/>` +
            `<path d="${part.d}" fill="none" stroke="${colour}" stroke-width="${n2(w)}" stroke-linecap="round" stroke-linejoin="round"${tf(part)}/>`
          );
        }
        case 'h':
          return `<path d="${part.d}" fill="#ffffff" fill-opacity="${n2(part.o ?? 0.5)}"${tf(part)}/>`;
      }
      return '';
    })
    .join('');
  return `<g opacity="0.38" transform="translate(0 1.9)">${shadow}</g>${body}`;
}
