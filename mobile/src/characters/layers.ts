import { VISEMES, characterArt, type CharacterBox, type SpeakerId, type Viseme } from '@kurda/shared';

/**
 * A speaking character as the phone draws it: each part its own small SVG in
 * the same frame, so the parts can be stacked one over the other and only the
 * one that changes is drawn again.
 *
 * Every part carries its own gradients and clip paths (`characterArt`), so a
 * mouth or a pair of eyes needs nothing from the layers beside it.
 */
export type CharacterCrop = 'bust' | 'full';

export interface CharacterLayers {
  /** the frame every layer shares, in the drawing's own units */
  frame: CharacterBox;
  /** where the head turns for a nod, as a share of the frame from its top left */
  pivot: { x: number; y: number };
  body: string;
  /** the head without its eyes or mouth */
  head: string;
  eyes: { open: string; closed: string };
  mouths: Record<Viseme, string>;
  /** what lies over the mouth (a moustache, a nose); '' when there is nothing */
  overlay: string;
}

const made = new Map<string, CharacterLayers>();

const box = (b: CharacterBox): string => `${b.x} ${b.y} ${b.w} ${b.h}`;

/** One character's layers for a crop, made the first time they are asked for and kept. */
export function characterLayers(speaker: SpeakerId, crop: CharacterCrop): CharacterLayers {
  const key = `${speaker}|${crop}`;
  const kept = made.get(key);
  if (kept) return kept;
  const art = characterArt(speaker);
  const frame = crop === 'bust' ? art.bust : art.viewBox;
  const svg = (inner: string): string => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box(frame)}">${inner}</svg>`;
  const layers: CharacterLayers = {
    frame,
    pivot: { x: (art.headPivot.x - frame.x) / frame.w, y: (art.headPivot.y - frame.y) / frame.h },
    body: svg(art.body),
    head: svg(art.head),
    eyes: { open: svg(art.eyes.open), closed: svg(art.eyes.closed) },
    mouths: Object.fromEntries(VISEMES.map((v) => [v, svg(art.mouths[v])])) as Record<Viseme, string>,
    overlay: art.overlay ? svg(art.overlay) : '',
  };
  made.set(key, layers);
  return layers;
}
