/**
 * How an icon's parts are painted: the part says what it is (the metal, its
 * shaded face, an accent, snow, a cut line), this decides the colour and the
 * light. Shared by the badges and by the season mark on the rank emblems, so a
 * snowflake is the same snowflake on both.
 *
 * A glyph is the brightest thing on its badge — it is lit from within, the
 * metal's highlight at the top running to its light tone at the bottom. Parts
 * are not outlined: each is cut out of what lies beneath by a thin gap in the
 * field's own deep colour, the way a sticker sheet or an enamel cloisonné
 * separates its colours, and the whole glyph floats over its own shadow.
 */
import type { Part } from './icons.js';
import { ACCENT, STONE } from './palette.js';
import type { Field, Metal } from './palette.js';
import { metalBox, metalBoxDark } from './paint.js';
import type { Drawing } from './svg.js';
import { linearBox, n2 } from './svg.js';

export interface IconPaint {
  dr: Drawing;
  metal: Metal;
  /** the ground the glyph sits on: its deep tone cuts the parts apart */
  field: Field;
  small: boolean;
  locked: boolean;
}

/** The icon's parts, painted for this metal, field and size. */
export function paintIcon(parts: readonly Part[], p: IconPaint): string {
  const { dr, metal, field, small, locked } = p;
  const gap = small ? 3 : 2.2;
  const shown = parts.filter((part) => !(small && 'fine' in part && part.fine));
  const tf = (part: Part): string => (part.tf ? ` transform="${part.tf}"` : '');

  if (locked) {
    const g = STONE.mid;
    return shown
      .filter((part) => part.k !== 'h')
      .map((part) => {
        switch (part.k) {
          case 'k':
            return '';
          case 'd':
            return `<path d="${part.d}" fill="none" stroke="${g}" stroke-width="${n2((part.w ?? 1.6) * (small ? 1.3 : 1))}" stroke-opacity="0.5" stroke-linecap="round" stroke-linejoin="round"${tf(part)}/>`;
          case 'l':
            return `<path d="${part.d}" fill="none" stroke="${g}" stroke-width="${n2((part.w ?? 3) + (small ? 1 : 0))}" stroke-linecap="round" stroke-linejoin="round"${tf(part)}/>`;
          default:
            return `<path d="${part.d}" fill="${g}" fill-opacity="${part.k === 'a' ? '0.55' : '0.8'}"${tf(part)}/>`;
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
      [1, '#e4ecff'],
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

  const raised = (part: Part): boolean => part.k === 'f' || part.k === 'a' || part.k === 'w' || part.k === 'c' || part.k === 'l';

  // the glyph's shadow on the field: every raised part, dropped, in the field's deep tone
  const shadow = shown
    .filter(raised)
    .map((part) =>
      part.k === 'l'
        ? `<path d="${part.d}" fill="none" stroke="${field.deep}" stroke-width="${n2((part.w ?? 3) + gap)}" stroke-linecap="round" stroke-linejoin="round"${tf(part)}/>`
        : `<path d="${part.d}" fill="${field.deep}" stroke="${field.deep}" stroke-width="${n2(gap)}" stroke-linejoin="round"${tf(part)}/>`,
    )
    .join('');

  const cut = (part: Part, d: string): string =>
    `<path d="${d}" fill="none" stroke="${field.deep}" stroke-width="${n2(gap)}" stroke-linejoin="round"${tf(part)}/>`;
  const fillOf = (part: Part): string => {
    switch (part.k) {
      case 'f':
        return `url(#${light})`;
      case 'a':
        return `url(#${dark})`;
      case 'w':
        return `url(#${snow})`;
      case 'c':
        return accent(part.c);
      default:
        return 'none';
    }
  };

  const body = shown
    .map((part) => {
      switch (part.k) {
        case 'f':
        case 'a':
        case 'w':
        case 'c':
          return cut(part, part.d) + `<path d="${part.d}" fill="${fillOf(part)}"${tf(part)}/>`;
        case 'k':
          return `<path d="${part.d}" fill="${field.mid}"${tf(part)}/>`;
        case 'd':
          return `<path d="${part.d}" fill="none" stroke="${field.mid}" stroke-width="${n2((part.w ?? 1.6) * (small ? 1.3 : 1))}" stroke-linecap="round" stroke-linejoin="round"${tf(part)}/>`;
        case 'l': {
          const w = part.w ?? 3;
          const colour = part.c ? ACCENT[part.c][0] : metal.hi;
          return (
            `<path d="${part.d}" fill="none" stroke="${field.deep}" stroke-width="${n2(w + gap)}" stroke-linecap="round" stroke-linejoin="round"${tf(part)}/>` +
            `<path d="${part.d}" fill="none" stroke="${colour}" stroke-width="${n2(w)}" stroke-linecap="round" stroke-linejoin="round"${tf(part)}/>`
          );
        }
        case 'h':
          return `<path d="${part.d}" fill="#ffffff" fill-opacity="${n2(part.o ?? 0.5)}"${tf(part)}/>`;
      }
      return '';
    })
    .join('');
  return `<g opacity="0.6" transform="translate(0 2.4)">${shadow}</g>${body}`;
}
