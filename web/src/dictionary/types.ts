/**
 * Dictionary contract — mirrors the server (KUR-043/044/047), and deliberately
 * the same shape the phone uses. One API, one set of names for what it returns.
 */

export type MatchType = 'exact' | 'prefix' | 'definition' | 'fuzzy';

export interface SearchHit {
  entryId: string;
  headword: string;
  dialect: string;
  pos: string | null;
  definitionEn: string | null;
  matchType: MatchType;
}

export interface SearchResult {
  query: string;
  /** true when nothing matched exactly and these are the closest words instead */
  fuzzy: boolean;
  results: SearchHit[];
}

export interface Sense {
  id: string;
  position: number;
  pos: string;
  definitionEn: string;
  definitionKu: string | null;
  examples: Array<{ textKu: string; textEn: string | null }>;
}

export interface Entry {
  id: string;
  headword: string;
  dialect: string;
  senses: Sense[];
  audio: Array<{ url: string; dialect: string }>;
  xrefs: Array<{ entryId: string; headword: string; relation: string }>;
  /** whether the reader has bookmarked this entry (KUR-047) */
  saved?: boolean;
}

export interface SavedWord {
  entryId: string;
  headword: string;
  pos: string | null;
  definitionEn: string | null;
  savedAt: string;
}
