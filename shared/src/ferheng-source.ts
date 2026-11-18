/**
 * Where the Kurdish Wiktionary extraction is published (about 105 letter-bucketed JSON files and an `index.json` manifest)
 * and how to read it, so the command line and the admin read it alike. The data is licensed CC BY-SA 4.0 and GFDL, and
 * needs attribution wherever the dictionary is shown (docs/admin/dictionary-import.md).
 */
import type { Chunk, SourceEntry } from './ferheng.js';

const BASE = 'https://raw.githubusercontent.com/kurdish-tech/ferheng/main/public/data';

/** Their directory to the dialect we store. */
export const FERHENG_LANGS: Record<string, string> = { ku: 'kurmanji', sor: 'sorani', zza: 'zazaki' };

export interface Manifest {
  /** how many words the source says it has, for the progress line */
  totalWords: number | null;
  files: Chunk[];
}

interface RawManifest {
  total_words?: number;
  letters: Record<string, Chunk[]>;
}

/** Reads one file at a time; injectable so tests stay off the network and can run against a handful of words. */
export interface FerhengSource {
  manifest(lang: string): Promise<Manifest>;
  chunk(lang: string, file: string): Promise<SourceEntry[]>;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return (await res.json()) as T;
}

export const publishedFerheng: FerhengSource = {
  async manifest(lang) {
    const raw = await getJson<RawManifest>(`${BASE}/${lang}/index.json`);
    return {
      totalWords: raw.total_words ?? null,
      // The manifest groups files by letter; the import cares only about the order.
      files: Object.values(raw.letters).flat(),
    };
  },
  chunk(lang, file) {
    return getJson<SourceEntry[]>(`${BASE}/${lang}/${file}`);
  },
};
