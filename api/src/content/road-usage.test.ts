/**
 * Guards the road's Kurdish usage where the course once disagreed with itself: each rule was settled once for the whole
 * road (masculine oblique, past-transitive agent, one spelling per word), and a later line in the old style would undo
 * it. The checks read every string in the plan and unit files, naming where a line breaks a rule.
 *
 * Also holds the plan to the owner's wish for Hamo's family: none of them is named anywhere, so no name for them is in
 * the lexicon, and any line naming one fails the road check as an unknown word.
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

  it('gives Xezo, who is the one leaving, the leaver’s goodbye', () => {
    expect(found(/\bew dibêje: oxir be\b/iu)).toEqual([]);
  });
});

describe('Hamo’s family in the plan', () => {
  it('names none of them: the road calls them only by who they are to him, and the lexicon knows no name for them', () => {
    expect(plan.names.filter((n) => n.kind === 'family')).toEqual([]);
    expect(plan.names.filter((n) => /^Hamo’s (father|mother|(\p{L}+ )?(brother|sister))\b/u.test(n.en))).toEqual([]);
  });
});
