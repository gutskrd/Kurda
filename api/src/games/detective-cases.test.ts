/**
 * Detective's cases (api/content/games/detective), resolved against the course's conversations and stories as the
 * seeder does, must pass the case-file checks and the writing rules: three to six suspects, four to six three-option
 * questions, no option naming the culprit before the accusation, every card proving something, every player-facing text
 * in all nine languages, and a level matching the course units cited.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_LOCALE_CODES, DIFFICULTY_LEVELS, checkGameContent, learnGame, type GameDialect } from '@kurda/shared';
import { DETECTIVE_CASE_FILES, readCaseFile, resolveCase, type CaseConversation, type CaseStory, type DetectiveCase } from './detective-cases.js';

// the course's conversations as the seeder finds them in the database: each exercise with its payload
const conversations = new Map<string, CaseConversation>();
const road = new URL('../../content/lessons/road/', import.meta.url);
for (const name of readdirSync(road).filter((n) => /^unit-\d+\.json$/.test(n))) {
  const unit = JSON.parse(readFileSync(new URL(name, road), 'utf8')) as {
    units: Array<{ skills: Array<{ lessons: Array<{ exercises: Array<{ type: string; payload: { id?: string } }> }> }> }>;
  };
  for (const u of unit.units)
    for (const s of u.skills)
      for (const l of s.lessons)
        for (const e of l.exercises) if (e.type === 'conversation' && e.payload.id) conversations.set(e.payload.id, { exerciseId: `ex-${e.payload.id}`, payload: e.payload });
}

// the stories as published, by slug
const stories = new Map<string, CaseStory>();
for (const file of ['kurmanci', 'sorani', 'road']) {
  const read = JSON.parse(readFileSync(new URL(`../../content/stories/${file}.json`, import.meta.url), 'utf8')) as { stories: Array<{ slug: string; body: string }> };
  for (const s of read.stories) stories.set(s.slug, { id: `story-${s.slug}`, body: s.body });
}

/** The level a case's course units call for: units 1–2 beginner, then up a level every few units. */
const LEVEL_BY_UNIT = (unit: number): number => (unit <= 2 ? 1 : unit <= 4 ? 2 : unit <= 7 ? 3 : unit <= 10 ? 4 : 5);

/** The app's own characters, who are drawn as their portraits. */
const CHARACTERS: Readonly<Record<string, string>> = { hevalo: 'Hevalo', hamo: 'Hamo' };

const everyLanguage = (m: Record<string, string> | undefined, where: string): string[] =>
  APP_LOCALE_CODES.filter((code) => !m?.[code]?.trim()).map((code) => `${where}: no ${code}`);

describe.each(['kmr', 'ckb'] as GameDialect[])('the %s cases', (dialect) => {
  const read = readCaseFile(JSON.parse(readFileSync(DETECTIVE_CASE_FILES[dialect], 'utf8')));
  if (!read.ok) throw new Error(read.issues);
  const cases = read.file.cases.filter((c) => !c.retired);

  it('are each of this variety, with a slug of their own', () => {
    expect(cases.every((c) => c.dialect === dialect && c.slug.startsWith(`${dialect}-`))).toBe(true);
    expect(new Set(cases.map((c) => c.slug)).size).toBe(cases.length);
  });

  for (const kase of cases) {
    describe(kase.slug, () => {
      it('finds every line it names, and makes a case file that passes its checks', () => {
        const resolved = resolveCase(kase, conversations, stories);
        if (!resolved.ok) throw new Error(resolved.missing.join('\n'));
        const checked = checkGameContent('case_file', dialect, resolved.payload);
        if (!checked.ok) throw new Error(JSON.stringify(checked.issues));
      });

      it('has three to six suspects, the app’s own characters with their portraits', () => {
        expect(kase.suspects.length).toBeGreaterThanOrEqual(3);
        expect(kase.suspects.length).toBeLessThanOrEqual(6);
        for (const s of kase.suspects) if (CHARACTERS[s.id] === s.name) expect(s.portrait, s.id).toBe(s.id);
      });

      it('asks four to six questions of three options, none of which names the culprit', () => {
        expect(kase.steps.length).toBeGreaterThanOrEqual(4);
        expect(kase.steps.length).toBeLessThanOrEqual(6);
        const culprit = kase.suspects.find((s) => s.id === kase.culprit)!;
        for (const [i, step] of kase.steps.entries()) {
          expect(step.options, `step ${i}`).toHaveLength(3);
          for (const option of step.options) for (const text of Object.values(option)) expect(text.includes(culprit.name), `step ${i}: ${text}`).toBe(false);
        }
      });

      it('uses every card, in a question or named in the solution', () => {
        const used = new Set([...kase.steps.flatMap((s) => s.evidence), ...kase.background]);
        expect(kase.evidence.map((e) => e.id).filter((id) => !used.has(id))).toEqual([]);
        expect([...used].filter((id) => !kase.evidence.some((e) => e.id === id))).toEqual([]);
      });

      it('is written in all nine languages, its cards in every language but their own', () => {
        const missing = [
          ...everyLanguage(kase.title, 'title'),
          ...everyLanguage(kase.intro, 'intro'),
          ...everyLanguage(kase.solution, 'solution'),
          ...kase.suspects.flatMap((s) => everyLanguage(s.about, `suspect ${s.id}`)),
          ...kase.steps.flatMap((s, i) => [...everyLanguage(s.prompt, `step ${i}`), ...s.options.flatMap((o, j) => everyLanguage(o, `step ${i} option ${j}`))]),
          ...kase.hints.flatMap((h, i) => everyLanguage(h, `hint ${i}`)),
          ...kase.evidence.flatMap((e) =>
            everyLanguage({ ...(e.line.meanings ?? {}), en: e.line.en, [dialect === 'kmr' ? 'ku' : 'ckb']: 'the card itself' }, `card ${e.id}`),
          ),
        ];
        expect(missing).toEqual([]);
      });

      it('is at the level of the latest course unit it cites', () => {
        const units = kase.evidence.flatMap((e) => ('conversation' in e.line ? [Number(/^roadu(\d{2})/.exec(e.line.conversation)?.[1] ?? 0)] : []));
        if (units.length > 0) expect(kase.level).toBe(LEVEL_BY_UNIT(Math.max(...units)));
      });
    });
  }

  if (dialect === 'kmr') {
    it('offer each difficulty enough cases for the game to open at it', () => {
      for (const [difficulty, levels] of Object.entries(DIFFICULTY_LEVELS)) {
        const n = cases.filter((c) => (levels as readonly number[]).includes(c.level)).length;
        expect(n, difficulty).toBeGreaterThanOrEqual(learnGame('detective').minimum);
      }
    });
  }
});

describe('a case file', () => {
  it('may name its background cards, which a step need not prove', () => {
    const minimal = { cases: [] };
    expect(readCaseFile(minimal).ok).toBe(true);
    const one = readCaseFile({ cases: [{ slug: 'kmr-x', dialect: 'kmr', level: 1, title: {}, intro: {}, suspects: [], evidence: [], steps: [], culprit: 'a', solution: {} }] });
    expect(one.ok && (one.file.cases[0] as DetectiveCase).background).toEqual([]);
  });
});
