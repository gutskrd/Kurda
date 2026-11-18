/** Dictionary types, mirroring the server. */
import type { DictionaryAudio } from '@kurda/shared';

export type MatchType = 'exact' | 'prefix' | 'contains' | 'definition' | 'fuzzy';

export interface SearchHit {
  entryId: string;
  headword: string;
  dialect: string;
  pos: string | null;
  definitionEn: string | null;
  /** Most of an imported lexicon is defined in Kurdish alone, with no English at all. */
  definitionKu: string | null;
  matchType: MatchType;
}

export interface SearchResult {
  query: string;
  fuzzy: boolean;
  results: SearchHit[];
}

export interface Sense {
  id: string;
  position: number;
  pos: string;
  /** Null when the word is defined in Kurdish alone. */
  definitionEn: string | null;
  definitionKu: string | null;
  examples: Array<{ textKu: string; textEn: string | null }>;
}

export interface Entry {
  id: string;
  headword: string;
  dialect: string;
  senses: Sense[];
  /** Its pronunciations, each with who says it when an editor has chosen somebody. */
  audio: DictionaryAudio[];
  xrefs: Array<{ entryId: string; headword: string; relation: string }>;
  /** Whether the learner has bookmarked this entry. */
  saved?: boolean;
}

export interface SavedWord {
  entryId: string;
  headword: string;
  pos: string | null;
  definitionEn: string | null;
  definitionKu: string | null;
  savedAt: string;
}
