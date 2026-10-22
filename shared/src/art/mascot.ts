/**
 * Hevalo for the badges: the app's deer drawn again as a flat illustration —
 * the same deer as the speaking character, from his dark antlers to the
 * freckles on his cheeks, but in a handful of flat tones with hard-edged
 * shade, big glossy eyes and a face that can laugh, wink, gasp or look
 * proud, so each badge can show him doing what it is for: reading the book,
 * holding up the gem, carrying the lantern.
 *
 * He is drawn in his own units round the middle of his head, about a hundred
 * across it, facing out, and placed on a badge by a transform. His parts come
 * back in layers — what stands behind him, his body, his head, and his
 * forelegs — so a badge can set what he holds between his chest and his
 * hooves.
 */
import type { Drawing } from './svg.js';
import { n, n2 } from './svg.js';

export type Mood = 'happy' | 'laugh' | 'wow' | 'proud' | 'wink' | 'focus' | 'dream';
/** What his forelegs do: hang out of sight, hold something at his chest, raise one high, or both. */
export type Arms = 'down' | 'hold' | 'raise' | 'cheer';

/** What he can wear for a badge. */
export type Wear = 'glasses' | 'sunglasses' | 'headband' | 'headphones' | 'flowers' | 'scarf';

export interface DeerPose {
  mood: Mood;
  arms: Arms;
  /** how far his head leans, in degrees; positive leans to his left (the viewer's right) */
  tilt?: number;
  wear?: readonly Wear[];
}

/** His colours: the speaking character's, a shade brighter for a badge. */
export const DEER = {
  fur: '#cf8749',
  furLight: '#e3a565',
  furShade: '#ad6633',
  furDeep: '#7a4220',
  bridge: '#eab673',
  muzzle: '#f6dcae',
  muzzleShade: '#e6bf86',
  cream: '#f8e4bf',
  creamShade: '#e9c995',
  earIn: '#f7d9ae',
  freckle: '#f6cf98',
  blush: '#f28b7d',
  antler: '#5b3527',
  antlerLight: '#7a4d3f',
  ink: '#33190f',
  eyeShade: '#e4dbea',
  mouth: '#5c1c1c',
  tongue: '#f27f8c',
  hoof: '#4a2a1c',
  nose: '#3a2016',
  iris: '#4d2b1b',
  pupil: '#1c0e08',
} as const;

export type DeerColours = { readonly [K in keyof typeof DEER]: string };

/** The same deer in quiet greys, for a badge not yet earned: each colour's lightness kept, its colour taken out. */
export function greyDeer(toGrey: (hex: string) => string): DeerColours {
  return Object.fromEntries(Object.entries(DEER).map(([k, v]) => [k, toGrey(v)])) as DeerColours;
}

export interface DeerArt {
  /** the antlers and ears, behind the head */
  back: string;
  /** neck, chest and shoulders */
  body: string;
  /** the head and face, turned by the pose's tilt */
  head: string;
  /** the forelegs, over whatever he holds */
  arms: string;
  /** where his hooves meet, for what he holds; and where a raised hoof is, for what he holds up */
  hold: { x: number; y: number };
  raised: { x: number; y: number };
}

/** The head's outline: broad across the brow, round at the cheeks, narrowing to the muzzle. */
const HEAD = 'M0,-44C27,-44 47,-30 49,-6C51,16 40,34 27,46C18,54 -18,54 -27,46C-40,34 -51,16 -49,-6C-47,-30 -27,-44 0,-44Z';
const BODY = 'M-25,36C-34,52 -45,70 -49,94C-51,108 -50,124 -48,134H48C50,124 51,108 49,94C45,70 34,52 25,36Z';

/** One ear, the right; the left is its mirror. */
const EAR = 'M36,-30C50,-48 76,-54 97,-44C88,-24 66,-12 43,-14Z';
const EAR_IN = 'M44,-28C57,-41 75,-46 89,-42C81,-28 64,-20 47,-19Z';
const EAR_SHADE = 'M43,-14C66,-12 88,-24 97,-44C90,-32 74,-22 52,-18Z';

/** One antler, the right, as the centre lines of its beam and tines. */
const ANTLER = 'M13,-37C14,-55 22,-70 36,-84M21,-58C31,-61 40,-60 48,-55M29,-72C29,-82 32,-91 38,-99';

const dot = (x: number, y: number, r: number): string => `M${n(x - r)},${n(y)}a${n2(r)},${n2(r)} 0 1 0 ${n2(r * 2)},0a${n2(r)},${n2(r)} 0 1 0 -${n2(r * 2)},0Z`;
const ellipse = (x: number, y: number, rx: number, ry: number): string =>
  `M${n(x - rx)},${n(y)}a${n2(rx)},${n2(ry)} 0 1 0 ${n2(rx * 2)},0a${n2(rx)},${n2(ry)} 0 1 0 -${n2(rx * 2)},0Z`;

/** An eye, open: the big white of it, the brown iris looking a little inward, and two lights. */
function openEye(C: DeerColours, cx: number, inward: number, big: boolean): string {
  const ix = cx - inward * 2;
  const r = big ? 1.12 : 1;
  return (
    `<path d="${ellipse(cx, 0, 14, 15.5)}" fill="#ffffff"/>` +
    `<path d="M${n(cx - 14)},2A14,15.5 0 0 0 ${n(cx + 14)},2A14,10 0 0 1 ${n(cx - 14)},2Z" fill="${C.eyeShade}"/>` +
    `<path d="${ellipse(ix, 2, 9.6 * r, 11 * r)}" fill="${C.iris}"/>` +
    `<path d="${ellipse(ix, 3, 6 * r, 7.4 * r)}" fill="${C.pupil}"/>` +
    `<path d="${dot(ix - 3.6, -3.2, 3.8 * r)}${dot(ix + 3.2, 6.2, 1.7)}" fill="#ffffff"/>`
  );
}

/** An eye shut in a smile: an arc bowed upward. */
const smileEye = (cx: number): string => `M${n(cx - 10)},3Q${n(cx)},-9 ${n(cx + 10)},3`;
/** An eye shut softly: an arc bowed downward, lashes and all. */
const dreamEye = (cx: number): string => `M${n(cx - 10)},-1Q${n(cx)},8 ${n(cx + 10)},-1`;

/** The two eyes and brows for a mood; `side` 1 is his left (the viewer's right). */
function eyes(C: DeerColours, mood: Mood): string {
  const out: string[] = [];
  const stroke = (d: string, w: number): string => `<path d="${d}" fill="none" stroke="${C.ink}" stroke-width="${n2(w)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  for (const side of [-1, 1] as const) {
    const cx = side * 21;
    const inward = side;
    const shut = mood === 'happy' || mood === 'laugh' || (mood === 'wink' && side === 1);
    if (shut) out.push(stroke(smileEye(cx), 3.8));
    else if (mood === 'dream') out.push(stroke(dreamEye(cx), 3.4));
    else {
      out.push(openEye(C, cx, inward, mood === 'wow'));
      if (mood === 'proud' || mood === 'focus') {
        // the upper lid lowered: proud is calm and half shut, focus a little narrowed
        const lid = mood === 'proud' ? -1 : -6;
        out.push(`<path d="M${n(cx - 15)},${lid}C${n(cx - 12)},-19 ${n(cx + 12)},-19 ${n(cx + 15)},${lid}V-20H${n(cx - 15)}Z" fill="${C.fur}"/>`);
        out.push(stroke(`M${n(cx - 14)},${lid}C${n(cx - 8)},${lid - 3} ${n(cx + 8)},${lid - 3} ${n(cx + 14)},${lid}`, 2.6));
      }
    }
    // the brows say the rest
    const brow =
      mood === 'focus'
        ? `M${n(cx + side * 10)},-25L${n(cx - side * 8)},-20`
        : mood === 'wow'
          ? `M${n(cx - 8)},-27Q${n(cx)},-32 ${n(cx + 8)},-27`
          : mood === 'proud' && side === -1
            ? `M${n(cx - 8)},-27Q${n(cx)},-31 ${n(cx + 8)},-26`
            : `M${n(cx - 7)},-23Q${n(cx)},-27 ${n(cx + 7)},-23`;
    out.push(stroke(brow, 3.4));
  }
  if (mood === 'wow') {
    // a glint of delight in each eye
    out.push(`<path d="${spark(-25, -3, 4.2)}${spark(17, -3, 4.2)}" fill="#ffffff"/>`);
  }
  return out.join('');
}

/** A four-pointed glint. */
function spark(x: number, y: number, r: number): string {
  const w = r * 0.26;
  return `M${n(x)},${n(y - r)}Q${n(x + w)},${n(y - w)} ${n(x + r)},${n(y)}Q${n(x + w)},${n(y + w)} ${n(x)},${n(y + r)}Q${n(x - w)},${n(y + w)} ${n(x - r)},${n(y)}Q${n(x - w)},${n(y - w)} ${n(x)},${n(y - r)}Z`;
}

/** The mouth for a mood, under the nose. */
function mouth(C: DeerColours, mood: Mood): string {
  if (mood === 'laugh' || mood === 'happy' || mood === 'wink') {
    const w = mood === 'laugh' ? 12 : 9.5;
    const d = mood === 'laugh' ? 17 : 13;
    return (
      `<path d="M${n(-w)},38Q0,41 ${n(w)},38C${n(w - 1)},${38 + d * 0.75} 5,${38 + d} 0,${38 + d}C-5,${38 + d} ${n(-w + 1)},${38 + d * 0.75} ${n(-w)},38Z" fill="${C.mouth}"/>` +
      `<path d="M${n(-w * 0.55)},${n(38 + d * 0.78)}C-3,${n(38 + d * 0.5)} 3,${n(38 + d * 0.5)} ${n(w * 0.55)},${n(38 + d * 0.78)}C3,${n(38 + d * 1.02)} -3,${n(38 + d * 1.02)} ${n(-w * 0.55)},${n(38 + d * 0.78)}Z" fill="${C.tongue}"/>`
    );
  }
  if (mood === 'wow') return `<path d="${ellipse(0, 44, 5.5, 6.5)}" fill="${C.mouth}"/><path d="${ellipse(0, 47.5, 3.4, 2.4)}" fill="${C.tongue}"/>`;
  // a deer's small smile, the line under the nose dividing it
  return `<path d="M0,34V39M-9,39Q-4.5,45 0,39Q4.5,45 9,39" fill="none" stroke="${C.ink}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/** A foreleg as a thick rounded stroke from the shoulder, its dark hoof at the end. */
function leg(C: DeerColours, d: string, hoof: { x: number; y: number }, angle: number): string {
  const a = (angle * Math.PI) / 180;
  const [ux, uy] = [Math.cos(a), Math.sin(a)];
  const at = (s: number, o: number): string => `${n(hoof.x + ux * s - uy * o)},${n(hoof.y + uy * s + ux * o)}`;
  const cap = `M${at(-3, -7.6)}C${at(4, -9)} ${at(9, -4)} ${at(9, 0)}C${at(9, 4)} ${at(4, 9)} ${at(-3, 7.6)}Z`;
  return (
    `<path d="${d}" fill="none" stroke="${C.furShade}" stroke-width="16.5" stroke-linecap="round"/>` +
    `<path d="${d}" fill="none" stroke="${C.fur}" stroke-width="13" stroke-linecap="round"/>` +
    `<path d="${cap}" fill="${C.hoof}"/>`
  );
}

/**
 * What he wears, drawn on his head (`head`, turning with it) or round his
 * neck (`neck`, under his chin). Grey for a badge not yet earned.
 */
function worn(wear: readonly Wear[], where: 'head' | 'neck', grey: boolean): string {
  const g = (hex: string): string => (grey ? '#9aa1ad' : hex);
  const out: string[] = [];
  for (const w of wear) {
    if (where === 'neck' && w === 'scarf') {
      out.push(
        `<path d="M-31,38C-20,52 20,52 31,38L34,52C21,66 -21,66 -34,52Z" fill="${g('#e8384f')}"/>` +
          `<path d="M12,55L17,86L29,83L27,52Z" fill="${g('#c92440')}"/>` +
          `<path d="M-31,45C-20,58 20,58 31,45M14,68L27,66M15,76L28,74" fill="none" stroke="${g('#ffd84a')}" stroke-width="2.6" stroke-linecap="round"/>`,
      );
    }
    if (where !== 'head') continue;
    if (w === 'glasses') {
      out.push(
        `<path d="${ellipse(-21, 1, 16.5, 16.5)}${ellipse(21, 1, 16.5, 16.5)}" fill="#ffffff" fill-opacity="0.14" stroke="${g('#2b1d4a')}" stroke-width="3.4"/>` +
          `<path d="M-5,-1Q0,-6 5,-1M-37.5,-2L-47,-7M37.5,-2L47,-7" fill="none" stroke="${g('#2b1d4a')}" stroke-width="3.2" stroke-linecap="round"/>`,
      );
    } else if (w === 'sunglasses') {
      const lens = (cx: number): string => `M${n(cx - 17)},-6C${n(cx - 17)},-11 ${n(cx - 13)},-12 ${n(cx - 8)},-12H${n(cx + 8)}C${n(cx + 13)},-12 ${n(cx + 17)},-11 ${n(cx + 17)},-6V3C${n(cx + 17)},11 ${n(cx + 10)},15 ${n(cx)},15C${n(cx - 10)},15 ${n(cx - 17)},11 ${n(cx - 17)},3Z`;
      out.push(
        `<path d="${lens(-21)}${lens(21)}" fill="${g('#24204a')}"/>` +
          `<path d="M-33,-6L-24,-9L-31,6ZM9,-6L18,-9L11,6Z" fill="#ffffff" fill-opacity="0.45"/>` +
          `<path d="M-4,-8Q0,-11 4,-8M-38,-8L-47,-11M38,-8L47,-11" fill="none" stroke="${g('#24204a')}" stroke-width="3.4" stroke-linecap="round"/>`,
      );
    } else if (w === 'headband') {
      out.push(
        `<path d="M-45,-27C-28,-38 28,-38 45,-27L46,-18C28,-29 -28,-29 -46,-18Z" fill="${g('#ff4d6d')}"/>` +
          `<path d="M-45.5,-22.5C-28,-33.5 28,-33.5 45.5,-22.5" fill="none" stroke="#ffffff" stroke-width="2.2"/>` +
          `<path d="M44,-23L58,-12L55,-6ZM44,-23L61,-24L60,-17Z" fill="${g('#e0284f')}"/>`,
      );
    } else if (w === 'headphones') {
      const cup = (x: number): string => `M${n(x - 8)},-14C${n(x - 8)},-18 ${n(x - 5)},-20 ${n(x)},-20C${n(x + 5)},-20 ${n(x + 8)},-18 ${n(x + 8)},-14V12C${n(x + 8)},16 ${n(x + 5)},18 ${n(x)},18C${n(x - 5)},18 ${n(x - 8)},16 ${n(x - 8)},12Z`;
      out.push(
        `<path d="M-49,-6C-49,-40 -28,-58 0,-58C28,-58 49,-40 49,-6" fill="none" stroke="${g('#3b2a78')}" stroke-width="7" stroke-linecap="round"/>` +
          `<path d="${cup(-49)}${cup(49)}" fill="${g('#7c4dff')}"/>` +
          `<path d="M-52,-12V8M46,-12V8" fill="none" stroke="#ffffff" stroke-opacity="0.45" stroke-width="2.4" stroke-linecap="round"/>`,
      );
    } else if (w === 'flowers') {
      const petals = (x: number, y: number): string => [0, 72, 144, 216, 288].map((a) => dot(x + Math.cos(((a - 90) * Math.PI) / 180) * 5, y + Math.sin(((a - 90) * Math.PI) / 180) * 5, 4.4)).join('');
      const at: [number, number, string][] = [
        [-35, -28, '#ff8cc0'],
        [-19, -39, '#ffffff'],
        [0, -43, '#ff6fa8'],
        [19, -39, '#ffffff'],
        [35, -28, '#ff8cc0'],
      ];
      out.push(`<path d="M-42,-20C-30,-40 30,-40 42,-20" fill="none" stroke="${g('#4caf50')}" stroke-width="3.4" stroke-linecap="round"/>`);
      for (const [x, y, c] of at) out.push(`<path d="${petals(x, y)}" fill="${g(c)}"/><path d="${dot(x, y, 3)}" fill="${g('#ffd23f')}"/>`);
    }
  }
  return out.join('');
}

/** Hevalo in a pose, as layers in his own units; `C` recolours him (grey, for a badge not yet earned). */
export function deer(dr: Drawing, pose: DeerPose, C: DeerColours = DEER): DeerArt {
  const tilt = pose.tilt ?? 0;
  const turn = tilt === 0 ? '' : ` transform="rotate(${n(tilt)} 0 40)"`;

  // behind: antlers, then ears, both sides
  const antlers = `<path d="${ANTLER}" fill="none" stroke="${C.antler}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path d="${ANTLER}" transform="translate(-1.3 -1)" fill="none" stroke="${C.antlerLight}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`;
  const ear = `<path d="${EAR}" fill="${C.fur}"/><path d="${EAR_IN}" fill="${C.earIn}"/><path d="${EAR_SHADE}" fill="${C.furShade}"/>`;
  const side = (art: string): string => `${art}<g transform="scale(-1 1)">${art}</g>`;
  const back = `<g${turn}>${side(antlers)}${side(ear)}</g>`;

  // the body: neck and shoulders, a cream chest, the far side in shade
  const bodyClip = dr.clip(BODY);
  const grey = C !== DEER;
  const body =
    `<path d="${BODY}" fill="${C.fur}"/>` +
    `<g clip-path="url(#${bodyClip})"><path d="M18,30C34,60 38,100 30,140H70V30Z" fill="${C.furShade}"/><path d="M-14,46C-22,64 -25,96 -21,140H21C25,96 22,64 14,46Z" fill="${C.cream}"/><path d="M8,46C14,70 15,104 12,140H21C25,96 22,64 14,46Z" fill="${C.creamShade}"/></g>` +
    worn(pose.wear ?? [], 'neck', grey);

  // the head: fur, a light blaze down the brow, the far cheek in shade, the cream muzzle
  const headClip = dr.clip(HEAD);
  const muzzle = 'M0,12C16,12 27,21 27,33C27,46 15,53 0,53C-15,53 -27,46 -27,33C-27,21 -16,12 0,12Z';
  const head =
    `<g${turn}>` +
    `<path d="${HEAD}" fill="${C.fur}"/>` +
    `<g clip-path="url(#${headClip})">` +
    `<path d="M0,-46C11,-46 15,-30 13,-10C11,6 7,14 0,17C-7,14 -11,6 -13,-10C-15,-30 -11,-46 0,-46Z" fill="${C.bridge}"/>` +
    `<path d="M16,-60C38,-28 40,14 12,62H70V-60Z" fill="${C.furShade}"/>` +
    `<path d="${muzzle}" fill="${C.muzzle}"/>` +
    `<path d="M14,15C26,22 30,40 18,50C10,54 4,54 0,53C15,53 27,46 27,33C27,24 22,17 14,15Z" fill="${C.muzzleShade}"/>` +
    `</g>` +
    // freckles and a blush on each cheek
    `<path d="${dot(-36, 13, 2.3)}${dot(-31, 19.5, 2)}${dot(-39, 21, 1.8)}${dot(36, 13, 2.3)}${dot(31, 19.5, 2)}${dot(39, 21, 1.8)}" fill="${C.freckle}"/>` +
    `<path d="${ellipse(-33, 25, 7.5, 4.2)}${ellipse(33, 25, 7.5, 4.2)}" fill="${C.blush}" fill-opacity="${pose.mood === 'laugh' || pose.mood === 'happy' ? 0.55 : 0.35}"/>` +
    eyes(C, pose.mood) +
    mouth(C, pose.mood) +
    // the nose over the top of the mouth, with its shine
    `<path d="M0,17C8.5,17 13,20.5 13,25C13,31 5.5,35 0,35C-5.5,35 -13,31 -13,25C-13,20.5 -8.5,17 0,17Z" fill="${C.nose}"/>` +
    `<path d="${ellipse(-4.5, 21.6, 4, 2.2)}" fill="#ffffff" fill-opacity="0.65"/>` +
    worn(pose.wear ?? [], 'head', grey) +
    `</g>`;

  // the forelegs
  const hold = { x: 0, y: 76 };
  const raised = { x: 56, y: 4 };
  let arms = '';
  if (pose.arms === 'hold' || pose.arms === 'raise') {
    arms += leg(C, 'M-34,58C-46,74 -34,82 -14,79', { x: -11, y: 78.5 }, 0);
    if (pose.arms === 'hold') arms += leg(C, 'M34,58C46,74 34,82 14,79', { x: 11, y: 78.5 }, 180);
  }
  if (pose.arms === 'raise' || pose.arms === 'cheer') arms += leg(C, 'M34,58C50,52 56,32 56,10', { x: 56, y: 6 }, -90);
  if (pose.arms === 'cheer') arms += leg(C, 'M-34,58C-50,52 -56,34 -57,12', { x: -57, y: 8 }, -90);
  return { back, body, head, arms, hold, raised };
}
