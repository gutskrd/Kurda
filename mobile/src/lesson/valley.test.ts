import { describe, expect, it } from 'vitest';
import { AA_LARGE, AA_NORMAL, contrastRatio } from '../a11y/contrast';
import { DARK, LIGHT } from '../theme/palette';
import { PORTRAIT_PALETTES, VALLEY } from './valley';

for (const scheme of ['light', 'dark'] as const) {
  const v = VALLEY[scheme];
  const p = scheme === 'light' ? LIGHT : DARK;

  describe(`a lesson’s colours — ${scheme}`, () => {
    it('are Hevalo’s own: its page, cards and ink, the ink for what is chosen, green and red only for right and wrong', () => {
      expect(v.paper).toBe(p.background);
      expect(v.card).toBe(p.surface);
      expect(v.ink).toBe(p.textPrimary);
      expect(v.muted).toBe(p.textSecondary);
      expect(v.red).toBe(p.primary);
      expect(v.green).toBe(p.success);
      expect(v.wrong).toBe(p.danger);
      expect(v.bar).toBe(p.background);
    });

    // Everything the lesson writes in its ink or secondary ink, on every ground it writes on.
    it('keeps the lesson’s words readable on every ground they are written on', () => {
      const grounds = { paper: v.paper, card: v.card, bar: v.bar, track: v.track, green: v.greenWash, wrong: v.wrongWash, chosen: v.redWash };
      for (const [name, ground] of Object.entries(grounds)) {
        expect(contrastRatio(v.ink, ground), `ink on ${name}`).toBeGreaterThanOrEqual(AA_NORMAL);
        expect(contrastRatio(v.muted, ground), `muted on ${name}`).toBeGreaterThanOrEqual(AA_NORMAL);
      }
    });

    // The lesson's name and question sit over the ridges as well as the page.
    it('writes the lesson’s name so it reads on the page and on every ridge behind it', () => {
      for (const ground of [v.paper, v.card, ...v.hills]) {
        expect(contrastRatio(v.redText, ground), ground).toBeGreaterThanOrEqual(AA_NORMAL);
        expect(contrastRatio(v.ink, ground), ground).toBeGreaterThanOrEqual(AA_NORMAL);
      }
    });

    it('says a verdict in words that read on its own bar', () => {
      expect(contrastRatio(v.greenText, v.greenWash)).toBeGreaterThanOrEqual(AA_NORMAL);
      expect(contrastRatio(v.wrongText, v.wrongWash)).toBeGreaterThanOrEqual(AA_NORMAL);
      expect(contrastRatio(v.greenInk, v.greenWash)).toBeGreaterThanOrEqual(AA_NORMAL);
      expect(contrastRatio(v.wrongInk, v.wrongWash)).toBeGreaterThanOrEqual(AA_NORMAL);
    });

    it('draws an answer’s number readable on its chip, and the marks of a verdict visible on theirs', () => {
      expect(contrastRatio(v.chipInk, v.chip)).toBeGreaterThanOrEqual(AA_NORMAL);
      expect(contrastRatio(v.onRed, v.red)).toBeGreaterThanOrEqual(AA_NORMAL);
      expect(contrastRatio(v.onGreen, v.green)).toBeGreaterThanOrEqual(AA_LARGE);
      expect(contrastRatio(v.onWrong, v.wrong)).toBeGreaterThanOrEqual(AA_LARGE);
    });

    it('stands the ridges barely off the page, the nearest closest to it', () => {
      const [far, mid, near] = v.hills.map((h) => contrastRatio(h, v.paper));
      expect(far!).toBeGreaterThan(mid!);
      expect(mid!).toBeGreaterThan(near!);
      expect(far!).toBeLessThan(1.5);
    });

    it('draws Hevalo’s portrait on its own ground, a step off the page', () => {
      expect(PORTRAIT_PALETTES[scheme].controlTrack).toBe(v.portrait);
      expect(PORTRAIT_PALETTES[scheme].scheme).toBe(scheme);
      expect(v.portrait).not.toBe(v.paper);
    });
  });
}
