import { z } from 'zod';
import { DictionaryRepository, normalizedHeadword, type XrefRelation } from './repository.js';

/**
 * Deduplicating lexicon importer (KUR-048). Source data (JSON array of
 * entries) is validated, then imported de-duplicating by NORMALIZED headword
 * + part of speech:
 *
 *  - new headword          → create the entry + its senses
 *  - same headword, new POS → add the sense under the existing entry
 *  - same headword + POS, same definition → skip (duplicate)
 *  - same headword + POS, DIFFERENT definition → conflict: flagged for manual
 *    review, never silently merged
 *
 * Dry-run writes nothing and returns the full conflict report.
 */

const POS_VALUES = [
  'noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition',
  'conjunction', 'particle', 'numeral', 'phrase', 'other',
] as const;
const RELATIONS = ['synonym', 'antonym', 'root', 'derived', 'related'] as const;

/**
 * A sense needs *a* definition, not an English one.
 *
 * `definitionEn` was required, which assumed every source explains Kurdish in
 * English. Wîkîferheng — the largest Kurdish lexicon there is — explains
 * Kurmancî in Kurmancî, so its 447,000 glosses are Kurdish and were unimportable
 * without writing them into an English field and lying about them.
 */
const senseSchema = z
  .object({
    pos: z.enum(POS_VALUES),
    definitionEn: z.string().min(1).max(1000).optional(),
    definitionKu: z.string().min(1).max(1000).optional(),
    examples: z
      .array(z.object({ textKu: z.string().min(1).max(500), textEn: z.string().max(500).optional() }))
      .optional(),
  })
  .refine((s) => s.definitionEn !== undefined || s.definitionKu !== undefined, {
    message: 'a sense needs definitionEn or definitionKu',
    path: ['definitionEn'],
  });

const lexiconEntrySchema = z.object({
  headword: z.string().min(1).max(200),
  dialect: z.string().max(40).optional(),
  senses: z.array(senseSchema).min(1),
  audio: z.array(z.string().min(1).max(2000)).optional(),
  xrefs: z.array(z.object({ headword: z.string().min(1).max(200), relation: z.enum(RELATIONS) })).optional(),
});

export const lexiconSchema = z.array(lexiconEntrySchema);
export type LexiconEntry = z.infer<typeof lexiconEntrySchema>;

export interface ImportConflict {
  headword: string;
  pos: string;
  existingDefinition: string;
  incomingDefinition: string;
}

export interface LexiconImportResult {
  dryRun: boolean;
  entriesCreated: number;
  sensesAdded: number;
  duplicatesSkipped: number;
  /** senses that gained the definition they were missing, from the other language */
  definitionsFilled: number;
  conflicts: ImportConflict[];
  issues: Array<{ index: number; message: string }>;
}

const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * What to do with an incoming sense that matches an existing one's part of speech.
 *
 * Compared per language, which is the whole point. An existing English
 * definition and an incoming Kurdish one are not two answers to the same
 * question — they are two halves of one entry, and treating them as a conflict
 * would report every word twice over when two sources are imported in turn.
 */
type Verdict =
  | { kind: 'duplicate' }
  | { kind: 'fill'; side: 'en' | 'ku'; text: string }
  | { kind: 'conflict'; existing: string; incoming: string };

export function reconcile(
  existing: { definitionEn: string | null; definitionKu: string | null },
  incoming: { definitionEn?: string; definitionKu?: string },
): Verdict {
  // same language on both sides is the only case where they can disagree
  if (existing.definitionEn && incoming.definitionEn) {
    return same(existing.definitionEn, incoming.definitionEn)
      ? { kind: 'duplicate' }
      : { kind: 'conflict', existing: existing.definitionEn, incoming: incoming.definitionEn };
  }
  if (existing.definitionKu && incoming.definitionKu) {
    return same(existing.definitionKu, incoming.definitionKu)
      ? { kind: 'duplicate' }
      : { kind: 'conflict', existing: existing.definitionKu, incoming: incoming.definitionKu };
  }
  // one side has what the other lacks
  if (!existing.definitionEn && incoming.definitionEn) {
    return { kind: 'fill', side: 'en', text: incoming.definitionEn };
  }
  if (!existing.definitionKu && incoming.definitionKu) {
    return { kind: 'fill', side: 'ku', text: incoming.definitionKu };
  }
  // the incoming sense says nothing the entry does not already say
  return { kind: 'duplicate' };
}

export function validateLexicon(raw: unknown): { ok: true; entries: LexiconEntry[] } | { ok: false; issues: Array<{ index: number; message: string }> } {
  const parsed = lexiconSchema.safeParse(raw);
  if (parsed.success) return { ok: true, entries: parsed.data };
  return {
    ok: false,
    issues: parsed.error.issues.map((i) => ({
      index: typeof i.path[0] === 'number' ? i.path[0] : -1,
      message: `${i.path.join('.')}: ${i.message}`,
    })),
  };
}

export async function importLexicon(
  repo: DictionaryRepository,
  raw: unknown,
  options: { dryRun?: boolean } = {},
): Promise<LexiconImportResult> {
  const validation = validateLexicon(raw);
  const result: LexiconImportResult = {
    dryRun: options.dryRun ?? false,
    entriesCreated: 0,
    sensesAdded: 0,
    duplicatesSkipped: 0,
    definitionsFilled: 0,
    conflicts: [],
    issues: [],
  };
  if (!validation.ok) {
    result.issues = validation.issues;
    return result;
  }

  for (const entry of validation.entries) {
    const dialect = entry.dialect ?? 'kurmanji';
    const normalized = normalizedHeadword(entry.headword);
    const existing = await repo.findEntryByNormalized(normalized, dialect);

    if (!existing) {
      if (!options.dryRun) {
        const entryId = await repo.createEntry(entry.headword, dialect);
        await writeSenses(repo, entryId, entry, 0);
        for (const url of entry.audio ?? []) await repo.addAudio(entryId, url, dialect);
      }
      result.entriesCreated += 1;
      result.sensesAdded += entry.senses.length;
      continue;
    }

    // entry exists — reconcile each incoming sense by POS
    let nextPosition = Math.max(0, ...existing.senses.map((s) => s.position)) + 1;
    for (const sense of entry.senses) {
      const match = existing.senses.find((s) => s.pos === sense.pos);
      if (!match) {
        // new POS under an existing headword → add it
        if (!options.dryRun) await writeSense(repo, existing.id, sense, nextPosition);
        nextPosition += 1;
        result.sensesAdded += 1;
      } else {
        const verdict = reconcile(match, sense);
        if (verdict.kind === 'duplicate') {
          result.duplicatesSkipped += 1;
        } else if (verdict.kind === 'fill') {
          /*
           * The two sources describe this word in different languages, so the
           * second completes the first. This is what makes importing Wîkîferheng
           * (Kurdish glosses) and then English Wiktionary give one entry with
           * both, rather than a conflict report the length of the dictionary.
           */
          if (!options.dryRun) await repo.fillSenseDefinition(match.id, verdict.side, verdict.text);
          result.definitionsFilled += 1;
        } else {
          // same headword, same POS, same language, different words → for a person
          result.conflicts.push({
            headword: entry.headword,
            pos: sense.pos,
            existingDefinition: verdict.existing,
            incomingDefinition: verdict.incoming,
          });
        }
      }
    }
  }

  // cross-references (best-effort): resolve target headwords that now exist
  if (!options.dryRun) {
    for (const entry of validation.entries) {
      if (!entry.xrefs?.length) continue;
      const from = await repo.findEntryByNormalized(normalizedHeadword(entry.headword), entry.dialect ?? 'kurmanji');
      if (!from) continue;
      for (const xref of entry.xrefs) {
        const to = await repo.findEntryByNormalized(normalizedHeadword(xref.headword), entry.dialect ?? 'kurmanji');
        if (to && to.id !== from.id) await repo.addXref(from.id, to.id, xref.relation as XrefRelation);
      }
    }
  }

  return result;
}

async function writeSenses(repo: DictionaryRepository, entryId: string, entry: LexiconEntry, base: number): Promise<void> {
  for (let i = 0; i < entry.senses.length; i++) await writeSense(repo, entryId, entry.senses[i]!, base + i + 1);
}

async function writeSense(repo: DictionaryRepository, entryId: string, sense: LexiconEntry['senses'][number], position: number): Promise<void> {
  const senseId = await repo.addSense(entryId, position, sense.pos, sense.definitionEn, sense.definitionKu);
  const examples = sense.examples ?? [];
  for (let i = 0; i < examples.length; i++) await repo.addExample(senseId, i + 1, examples[i]!.textKu, examples[i]!.textEn);
}
