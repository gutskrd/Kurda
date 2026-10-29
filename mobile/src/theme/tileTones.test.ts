import { describe, expect, it } from 'vitest';
import { AA_NORMAL, contrastRatio } from '../a11y/contrast';
import { DARK, LIGHT } from './palette';
import { blend, tileButtonTone, tileTone, type TileState } from './tileTones';

const STATES: TileState[] = ['idle', 'picked', 'right', 'wrong', 'spent', 'disabled'];

for (const p of [LIGHT, DARK]) {
  describe(`the colours of a tile — ${p.scheme}`, () => {
    it('keeps its words readable in every state', () => {
      for (const state of STATES) {
        const { face, ink } = tileTone(p, state);
        expect(contrastRatio(ink, face), state).toBeGreaterThanOrEqual(AA_NORMAL);
      }
    });

    // the face is opaque, because the lip runs on under it
    it('draws every face solid, and a lip under each tile that can still be pressed', () => {
      for (const state of STATES) {
        const tone = tileTone(p, state);
        expect(tone.face, state).toMatch(/^#[0-9a-f]{6}$/i);
        expect(tone.lip === null, state).toBe(state === 'spent');
      }
    });

    it('tells the states apart by their edges, not only their fills', () => {
      const edges = new Set(['idle', 'picked', 'right', 'wrong'].map((s) => tileTone(p, s as TileState).edge));
      expect(edges.size).toBe(4);
    });

    it('fills a lesson button in its tone with readable words, and flattens it while there is nothing to press', () => {
      for (const tone of ['primary', 'success', 'danger'] as const) {
        const on = tileButtonTone(p, tone, true);
        expect(contrastRatio(on.ink, on.face), tone).toBeGreaterThanOrEqual(AA_NORMAL);
        expect(on.lip).not.toBeNull();
      }
      const off = tileButtonTone(p, 'primary', false);
      expect(off.lip).toBeNull();
      expect(contrastRatio(off.ink, off.face)).toBeGreaterThanOrEqual(AA_NORMAL);
    });
  });
}

describe('blending one colour over another', () => {
  it('lays a translucent fill over what is behind it, as one opaque colour', () => {
    expect(blend('rgba(255,255,255,0.5)', '#000000')).toBe('#808080');
    expect(blend('#ffffff', '#000000', 0.25)).toBe('#404040');
    expect(blend('#123456', '#abcdef', 1)).toBe('#123456');
  });
});
