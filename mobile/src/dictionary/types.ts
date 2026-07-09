/** Dictionary contract — mirrors the server (KUR-044/043). */

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
}
