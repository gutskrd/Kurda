/**
 * What the Hevalo book is made of, read from the files the course is seeded
 * from: the road's plan, its unit files, and the stories told at the end of
 * its chapters. Read once and kept: the files change only with a deploy.
 */
import { readFile, readdir } from 'node:fs/promises';
import { ROAD_DIR } from '../content/road-seed.js';
import type { BookPlan, BookStory, BookUnitDoc } from './road-book.js';

const STORIES_FILE = new URL('../../content/stories/road.json', import.meta.url);

export interface RoadBookSources {
  plan: BookPlan;
  /** each chapter's unit file, by chapter */
  docs: Map<number, BookUnitDoc>;
  stories: BookStory[];
}

let loaded: Promise<RoadBookSources> | null = null;

async function load(): Promise<RoadBookSources> {
  const plan = JSON.parse(await readFile(new URL('plan.json', ROAD_DIR), 'utf8')) as BookPlan;
  const docs = new Map<number, BookUnitDoc>();
  for (const name of (await readdir(ROAD_DIR)).filter((f) => /^unit-\d{2}\.json$/.test(f)).sort()) {
    docs.set(Number(name.slice(5, 7)), JSON.parse(await readFile(new URL(name, ROAD_DIR), 'utf8')) as BookUnitDoc);
  }
  let stories: BookStory[] = [];
  try {
    stories = (JSON.parse(await readFile(STORIES_FILE, 'utf8')) as { stories?: BookStory[] }).stories ?? [];
  } catch (err) {
    if ((err as { code?: string }).code !== 'ENOENT') throw err;
  }
  return { plan, docs, stories };
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
