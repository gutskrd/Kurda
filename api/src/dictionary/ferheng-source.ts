/**
 * Where the Wîkîferheng extraction is published, and how to read it.
 *
 * The Ferheng project ships the Kurdish Wiktionary extraction as ~105
 * letter-bucketed JSON files plus an `index.json` manifest. This is the only
 * place that knows that, so the command line and the admin panel read it the
 * same way rather than each keeping its own copy of the URL and the shape.
 *
 * Licence: the data is Wiktionary's, CC BY-SA 4.0 + GFDL. Attribution belongs
 * wherever the dictionary is shown — see docs/admin/dictionary-import.md.
 */
import type { Chunk, SourceEntry } from './ferheng.js';

const BASE = 'https://raw.githubusercontent.com/kurdish-tech/kurdish-tech.github.io/main/public/data';

/** Their directory → the dialect we store. */
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

/**
 * Reading one file at a time, injectable so a test does not reach the network
 * and the runner can be exercised against a handful of words.
 */
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
      // the manifest groups files by letter; the import cares only about the order
      files: Object.values(raw.letters).flat(),
    };
  },
  chunk(lang, file) {
    return getJson<SourceEntry[]>(`${BASE}/${lang}/${file}`);
  },
};
