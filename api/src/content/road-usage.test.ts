/**
 * Guards the road's Kurdish usage where the course once disagreed with
 * itself: each rule here was settled once for the whole road (the oblique of
 * a masculine noun, the agent of a past transitive verb, one spelling of a
 * word), and a line written later in the old way would quietly undo it. The
 * checks read every string of the plan and the unit files, so the place a
 * line breaks a rule is named in the failure.
 *
 * It also holds the road's plan to the owner's wish for Hamo's family: they
 * are marked as family, so the book can leave them off its people pages, and
 * the chapter summaries the book prints on its openers do not name them.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ROAD_PLAN_FILE, loadRoadPlan, roadUnitFile, roadUnitNumbers } from './road-check.js';

/** Every string in a JSON value, with the path that leads to it. */
function stringsIn(value: unknown, path: string, out: Array<{ path: string; text: string }> = []): Array<{ path: string; text: string }> {
  if (typeof value === 'string') out.push({ path, text: value });
  else if (Array.isArray(value)) value.forEach((v, i) => stringsIn(v, `${path}[${i}]`, out));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) stringsIn(v, `${path}.${k}`, out);
  return out;
}

const plan = loadRoadPlan();
const texts = [
  ...stringsIn(JSON.parse(readFileSync(ROAD_PLAN_FILE, 'utf8')).units, 'plan'),
  ...roadUnitNumbers().flatMap((n) => stringsIn(JSON.parse(readFileSync(roadUnitFile(n), 'utf8')), `unit-${String(n).padStart(2, '0')}`)),
];

/** The places where a pattern turns up, so a failure lists each line to mend. */
const found = (pattern: RegExp): string[] => texts.filter((t) => pattern.test(t.text)).map((t) => `${t.path}: ${t.text}`);

describe('the road’s Kurdish usage', () => {
  it('writes the past of tune as one word, tunebû', () => {
    expect(found(/\btune bûn?\b/u)).toEqual([]);
  });

  it('gives the masculine wêne its own oblique, wêneyî, when no owner follows', () => {
    // wêneyê is right only as a link to an owner (wêneyê me, wêneyê bavê min), never on its own after a word of place or as an object
    expect(found(/(^|[\s“"])(li ser|li pişt|li|nîvê) wêneyê(?=[\s]*([.,!?;:”"]|$|dinêre|li |di |ye\b|kî\b|çêlekek|soza))/iu)).toEqual([]);
    expect(found(/^Wêneyê bide/u)).toEqual([]);
  });

  it('puts the roof and the horse in their masculine oblique, banî and hespî', () => {
    expect(found(/\bser banê(?=\s*([.,!?”"]|$|ye\b|keşk|berdewam))/u)).toEqual([]);
    expect(found(/\bli hespê siwar\b/u)).toEqual([]);
  });

  it('makes Dapîr the agent of a past transitive verb in the oblique, Dapîrê', () => {
    // got followed by its colon or by ku is the Kurdish verb, not the English “Dapîr got up”
    expect(found(/\bDapîr (got(:| ku\b)|dew çêkir|li ber meşkê guhdarî kir|çepik lêxist)/u)).toEqual([]);
  });

  it('agrees the past of çepik lêxistin with its plural object everywhere', () => {
    expect(found(/\bçepik lêxist(?!in)/u)).toEqual([]);
  });

  it('links the feminine defter with -a', () => {
    expect(found(/\bdefterê xwe\b/u)).toEqual([]);
  });

  it('gives Xezal, who is the one leaving, the leaver’s goodbye', () => {
    expect(found(/\bew dibêje: oxir be\b/iu)).toEqual([]);
  });
});

describe('Hamo’s family in the plan', () => {
  const family = plan.names.filter((n) => /^Hamo’s (father|mother|(\p{L}+ )?(brother|sister))\b/u.test(n.en));

  it('marks each of them as family, so the people pages can leave them out', () => {
    expect(family.map((n) => n.name).sort()).toEqual(['Cîhan', 'Edûl', 'Evdila', 'Ibrahîm', 'Lorîn']);
    for (const n of family) expect(n.kind, n.name).toBe('family');
  });

  it('names none of them in the summaries the book prints on the chapter 2 and chapter 12 openers', () => {
    for (const number of [2, 12]) {
      const story = plan.units.find((u) => u.number === number)!.story;
      for (const n of family) expect(story, `chapter ${number}: ${n.name}`).not.toContain(n.name);
    }
  });
});
