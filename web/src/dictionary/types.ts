import type { DictionaryAudio } from '@kurda/shared';

/** The dictionary API's shapes, as the server sends them and the phone app uses them. */

type MatchType = 'exact' | 'prefix' | 'contains' | 'definition' | 'fuzzy';

export interface SearchHit {
  entryId: string;
  headword: string;
  dialect: string;
  pos: string | null;
  definitionEn: string | null;
  /** Most of the imported lexicon is defined in Kurdish alone, with no English. */
  definitionKu: string | null;
  matchType: MatchType;
}

export interface SearchResult {
  query: string;
  /** True when nothing matched exactly and these are the closest words instead. */
  fuzzy: boolean;
  results: SearchHit[];
}

interface Sense {
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
  /** Its pronunciations, each with its character when an editor chose one. */
  audio: DictionaryAudio[];
  xrefs: Array<{ entryId: string; headword: string; relation: string }>;
  /** Whether the reader has bookmarked this entry. */
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
