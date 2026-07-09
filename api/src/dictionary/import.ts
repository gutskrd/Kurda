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

const senseSchema = z.object({
  pos: z.enum(POS_VALUES),
  definitionEn: z.string().min(1).max(1000),
  definitionKu: z.string().max(1000).optional(),
  examples: z
    .array(z.object({ textKu: z.string().min(1).max(500), textEn: z.string().max(500).optional() }))
    .optional(),
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
  conflicts: ImportConflict[];
  issues: Array<{ index: number; message: string }>;
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
      } else if (match.definitionEn.trim().toLowerCase() === sense.definitionEn.trim().toLowerCase()) {
        result.duplicatesSkipped += 1;
      } else {
        // same headword + POS, different definition → manual review
        result.conflicts.push({
          headword: entry.headword,
          pos: sense.pos,
          existingDefinition: match.definitionEn,
          incomingDefinition: sense.definitionEn,
        });
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
