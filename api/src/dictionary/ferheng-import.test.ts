import { describe, expect, it } from 'vitest';
import { toLexicon } from '@kurda/shared';
import { validateLexicon } from './import.js';

/**
 * The seam between the converter and the importer.
 *
 * `toLexicon` moved to @kurda/shared when the public dictionary pages started
 * needing it too, and its own tests moved with it — they are about converting a
 * source row and have nothing to say about this API. This is the half that does:
 * whatever the converter produces, the importer's schema has to accept it.
 *
 * Two packages now read the same function, so the contract between them is
 * worth a test of its own rather than an assertion buried in the other package's
 * suite, where a change here would not be obviously relevant.
 */
describe('what the converter hands the importer', () => {
  const row = (over: Record<string, unknown>) => ({ word: 'x', pos: 'noun', glosses: ['g'], ...over });

  it('validates', () => {
    expect(validateLexicon(toLexicon([row({})])).ok).toBe(true);
  });

  /** The converter caps a definition at the importer's own limit, so it arrives capped. */
  it('validates a definition the converter had to truncate', () => {
    const entries = toLexicon([row({ glosses: ['x'.repeat(1500)] })]);
    expect(entries[0]!.senses[0]!.definitionKu).toHaveLength(1000);
    expect(validateLexicon(entries).ok).toBe(true);
  });

  it('validates a row carrying synonyms, which become cross-references', () => {
    const entries = toLexicon([row({ word: 'mezin', synonyms: ['gir', 'gewre'] })]);
    expect(entries[0]!.xrefs).toHaveLength(2);
    expect(validateLexicon(entries).ok).toBe(true);
  });
});
