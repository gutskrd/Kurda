/**
 * The book's sources, read from the course seed files: the road plan, its unit files, and the chapter-end stories; plus
 * the book's own beat tellings (book-beats.json), which the seeder ignores. Read once and cached, since the files
 * change only with a deploy.
 */
import { readFile, readdir } from 'node:fs/promises';
import { ROAD_DIR } from '../content/road-seed.js';
import { withBookBeats, type BookBeats, type BookPlan, type BookStory, type BookUnitDoc } from './road-book.js';

const STORIES_FILE = new URL('../../content/stories/road.json', import.meta.url);

/** The book's hand-written tellings of the beats, by lesson key: the book's alone, so the app's lessons keep the plan's beats. */
export const BOOK_BEATS_FILE = new URL('book-beats.json', ROAD_DIR);

export interface RoadBookSources {
  /** the road's plan, each lesson with the book's own telling of its beat beside the beat */
  plan: BookPlan;
  /** each chapter's unit file, by chapter */
  docs: Map<number, BookUnitDoc>;
  stories: BookStory[];
}

let loaded: Promise<RoadBookSources> | null = null;

/** A JSON file, or `fallback` when it is not there. */
async function readOptional<T>(file: URL, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch (err) {
    if ((err as { code?: string }).code !== 'ENOENT') throw err;
    return fallback;
  }
}

async function load(): Promise<RoadBookSources> {
  const plan = JSON.parse(await readFile(new URL('plan.json', ROAD_DIR), 'utf8')) as BookPlan;
  const docs = new Map<number, BookUnitDoc>();
  for (const name of (await readdir(ROAD_DIR)).filter((f) => /^unit-\d{2}\.json$/.test(f)).sort()) {
    docs.set(Number(name.slice(5, 7)), JSON.parse(await readFile(new URL(name, ROAD_DIR), 'utf8')) as BookUnitDoc);
  }
  const stories = (await readOptional<{ stories?: BookStory[] }>(STORIES_FILE, {})).stories ?? [];
  // without its own tellings the book still prints, from the plan's beats, as best it can fit them
  const beats = await readOptional<BookBeats>(BOOK_BEATS_FILE, {});
  return { plan: withBookBeats(plan, beats), docs, stories };
}

/** The book's sources, read on first use; a failed read is tried again next time. */
export function loadRoadBookSources(): Promise<RoadBookSources> {
  if (!loaded) {
    loaded = load();
    loaded.catch(() => {
      loaded = null;
    });
  }
  return loaded;
}
