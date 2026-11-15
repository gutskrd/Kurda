import { describe, expect, it } from 'vitest';
import { AA_LARGE, AA_NORMAL, contrastRatio } from '../a11y/contrast';
import type { TileState } from '../theme/tileTones';
import { PORTRAIT_PALETTES, VALLEY, VALLEY_PALETTES, valleyButton, valleyTile } from './valley';

const STATES: TileState[] = ['idle', 'picked', 'right', 'wrong', 'spent', 'disabled'];

for (const scheme of ['light', 'dark'] as const) {
  const v = VALLEY[scheme];
  const p = VALLEY_PALETTES[scheme];

  describe(`the painted valley — ${scheme}`, () => {
    // whatever the lesson writes in its ink or its muted brown, on whatever it writes it on
    it('keeps the lesson’s words readable on every ground they are written on', () => {
      const grounds = { paper: v.paper, card: v.card, bar: v.bar, track: v.track, green: v.greenWash, wrong: v.wrongWash, chosen: v.redWash };
      for (const [name, ground] of Object.entries(grounds)) {
        expect(contrastRatio(v.ink, ground), `ink on ${name}`).toBeGreaterThanOrEqual(AA_NORMAL);
        expect(contrastRatio(v.muted, ground), `muted on ${name}`).toBeGreaterThanOrEqual(AA_NORMAL);
      }
    });

    // the lesson's name and its question sit over the hills as much as over the paper
    it('writes the lesson’s name in a red that reads on the paper and on every hill behind it', () => {
      for (const ground of [v.paper, v.card, ...v.hills]) {
        expect(contrastRatio(v.redText, ground), ground).toBeGreaterThanOrEqual(AA_NORMAL);
        expect(contrastRatio(v.ink, ground), ground).toBeGreaterThanOrEqual(AA_NORMAL);
      }
    });

    it('says a verdict in words that read on its own bar', () => {
      expect(contrastRatio(v.greenText, v.greenWash)).toBeGreaterThanOrEqual(AA_NORMAL);
      expect(contrastRatio(v.wrongText, v.wrongWash)).toBeGreaterThanOrEqual(AA_NORMAL);
      expect(contrastRatio(p.goldText, v.wrongWash)).toBeGreaterThanOrEqual(AA_NORMAL);
    });

    it('keeps an answer’s words readable in every state, and tells the states apart by their edges', () => {
      for (const state of STATES) {
        const { face, ink } = valleyTile(v, state);
        expect(contrastRatio(ink, face), state).toBeGreaterThanOrEqual(AA_NORMAL);
        expect(face, state).toMatch(/^#[0-9a-f]{6}$/i);
      }
      const edges = new Set(['idle', 'picked', 'right', 'wrong'].map((s) => valleyTile(v, s as TileState).edge));
      expect(edges.size).toBe(4);
      expect(valleyTile(v, 'spent').lip).toBeNull();
    });

    // Check and the verdicts' Continue, and Check while there is nothing to check, which still says what it is
    it('fills the lesson’s buttons with words that read, on an edge to press, and flattens Check while there is nothing to check', () => {
      for (const tone of ['primary', 'success', 'danger'] as const) {
        const on = valleyButton(v, tone, true);
        expect(contrastRatio(on.ink, on.face), tone).toBeGreaterThanOrEqual(AA_NORMAL);
        expect(on.lip).not.toBeNull();
      }
      const off = valleyButton(v, 'primary', false);
      expect(contrastRatio(off.ink, off.face)).toBeGreaterThanOrEqual(AA_NORMAL);
      expect(off.lip).toBeNull();
    });

    it('draws an answer’s number readable on its chip, and the marks of a verdict visible on theirs', () => {
      expect(contrastRatio(v.chipInk, v.chip)).toBeGreaterThanOrEqual(AA_NORMAL);
      expect(contrastRatio(v.onRed, v.red)).toBeGreaterThanOrEqual(AA_NORMAL);
      expect(contrastRatio(v.onGreen, v.green)).toBeGreaterThanOrEqual(AA_LARGE);
      expect(contrastRatio(v.onWrong, v.wrong)).toBeGreaterThanOrEqual(AA_LARGE);
    });

    // a sheet, a button or a key bar from elsewhere in the app, drawn inside a lesson in the valley's palette
    it('lays the valley over the app’s palette so what the app draws inside a lesson reads too', () => {
      for (const fill of [p.primary, p.success, p.danger]) expect(contrastRatio(p.textOnPrimary, fill), fill).toBeGreaterThanOrEqual(AA_NORMAL);
      for (const ground of [p.background, p.surface, p.controlTrack, p.barFill]) {
        expect(contrastRatio(p.textPrimary, ground), ground).toBeGreaterThanOrEqual(AA_NORMAL);
        expect(contrastRatio(p.textSecondary, ground), ground).toBeGreaterThanOrEqual(AA_NORMAL);
      }
      // gold words (a run of right answers, a letter that differs) are written on the paper, a card and the bar
      for (const ground of [p.background, p.surface, p.barFill]) expect(contrastRatio(p.goldText, ground), ground).toBeGreaterThanOrEqual(AA_NORMAL);
      expect(contrastRatio(p.success, p.successFill)).toBeGreaterThanOrEqual(AA_NORMAL);
      expect(contrastRatio(p.danger, p.dangerFill)).toBeGreaterThanOrEqual(AA_NORMAL);
      expect(p.scheme).toBe(scheme);
      expect(PORTRAIT_PALETTES[scheme].controlTrack).toBe(v.portrait);
    });
  });
}
