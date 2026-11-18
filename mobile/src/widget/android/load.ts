import * as FileSystem from 'expo-file-system/legacy';
import type { WidgetFeed } from '@kurda/shared';
import { refreshSeconds, widgetAuthorization, widgetImageSize, widgetImageUrl, widgetSkyAt, type WidgetConfig } from '../contract';
import { fetchWidgetFeed, type FeedAnswer, type FetchLike } from '../feed';
import { markWidgetTokenRejected, readWidgetConfig } from '../storage';
import type { WidgetShows } from './LetterWidget';

/**
 * What the Android widget shows, with the last result kept for offline use.
 *
 * Android updates the widget every half hour, and the app asks when a letter arrives or a setting changes. Each
 * time this reads the app's token (storage.ts) and fetches the feed only when the last feed's `refreshAfter` has
 * passed or the app asked, so a frequently viewed home screen does not mean frequent requests. The feed and each
 * widget size's picture are cached in the app's files, so offline the widget keeps its last letter, as the iPhone
 * widget keeps its last entry. The cache belongs to one token: signing out or switching account never shows the
 * previous letter.
 */

const DIR = `${FileSystem.documentDirectory ?? ''}letter-widget/`;
const KEPT = `${DIR}feed.json`;

interface Kept {
  /** Whose this is: a fingerprint of the token and the server, never the token itself. */
  owner: string;
  feed: WidgetFeed;
  /** When the feed was fetched, in ms. */
  fetchedAt: number;
  /** For each cached picture (by size), what it shows: a letter's id, or the empty sill at a given sky. */
  images: Record<string, string>;
}

/** A short fingerprint of a string (FNV-1a), enough to tell tokens apart without storing one. */
export function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

async function readKept(): Promise<Kept | null> {
  try {
    const info = await FileSystem.getInfoAsync(KEPT);
    if (!info.exists) return null;
    const kept = JSON.parse(await FileSystem.readAsStringAsync(KEPT)) as Kept;
    return kept && typeof kept.owner === 'string' && kept.feed ? { ...kept, images: kept.images ?? {} } : null;
  } catch {
    return null;
  }
}

async function writeKept(kept: Kept): Promise<void> {
  try {
    await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
    await FileSystem.writeAsStringAsync(KEPT, JSON.stringify(kept));
  } catch {
    // Kept for next time only; this time is drawn either way.
  }
}

/** Forget the last letter and its pictures, so what is drawn next is whatever the app has left now. */
export async function dropKept(): Promise<void> {
  try {
    await FileSystem.deleteAsync(DIR, { idempotent: true });
  } catch {
    // nothing kept
  }
}

/** One feed request at a time for a token, however many widgets are updating at once. */
let asking: { token: string; answer: Promise<FeedAnswer> } | null = null;

function askOnce(config: WidgetConfig, fetchFn: FetchLike): Promise<FeedAnswer> {
  if (asking?.token === config.token) return asking.answer;
  const answer = fetchWidgetFeed(config.apiBase, config.token, fetchFn).finally(() => {
    if (asking?.answer === answer) asking = null;
  });
  asking = { token: config.token, answer };
  return answer;
}

/** One widget on the home screen as the library reports it: its size in dp and the screen density. */
export interface WidgetPlace {
  width: number;
  height: number;
  density: number;
}

export interface Loaded {
  shows: WidgetShows;
  /** The language the app left for the widget, or null when there is none (signed out). */
  locale: string | null;
}

/**
 * The picture for a widget of this size, as a data URI: fetched when its subject changed, else the cached one.
 * Null when none matches, since new text over the last letter's paper is worse than the paper's plain colour.
 */
async function pictureFor(config: WidgetConfig, feed: WidgetFeed, place: WidgetPlace, kept: Kept, now: Date): Promise<string | null> {
  const size = widgetImageSize(place.width, place.height, place.density);
  const sky = widgetSkyAt(now.getHours());
  // The writer may choose another pigeon for a letter already sent, and the picture shows it.
  const subject = feed.letter ? `letter:${feed.letter.id}:${feed.letter.from.bird}` : `empty:${sky}`;
  const key = `${size.w}x${size.h}@${size.scale}`;
  const file = `${DIR}picture-${key}.png`;
  try {
    const onDisk = (await FileSystem.getInfoAsync(file)).exists;
    if (!onDisk || kept.images[key] !== subject) {
      const part = `${file}.part`;
      await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
      const got = await FileSystem.downloadAsync(widgetImageUrl(config.apiBase, size, sky), part, { headers: { authorization: widgetAuthorization(config.token) } });
      if (got.status === 200) {
        await FileSystem.deleteAsync(file, { idempotent: true });
        await FileSystem.moveAsync({ from: part, to: file });
        kept.images = { ...kept.images, [key]: subject };
        await writeKept(kept);
      } else {
        await FileSystem.deleteAsync(part, { idempotent: true });
      }
    }
    if (kept.images[key] !== subject) return null;
    const base64 = await FileSystem.readAsStringAsync(file, { encoding: FileSystem.EncodingType.Base64 });
    return `data:image/png;base64,${base64}`;
  } catch {
    return null;
  }
}

/** What one widget should show now. `fresh` fetches regardless of the last feed (the widget was just added, or the app asked). */
export async function loadLetterWidget(place: WidgetPlace, opts: { fresh: boolean; now?: Date; fetchFn?: FetchLike }, retried = false): Promise<Loaded> {
  const now = opts.now ?? new Date();
  const config = await readWidgetConfig();
  if (!config) {
    await dropKept();
    return { shows: { kind: 'signedOut' }, locale: null };
  }
  const owner = fingerprint(`${config.apiBase} ${config.token}`);
  const before = await readKept();
  // Somebody else's letter, from before a sign-out: not a word of it is shown, and its pictures go.
  if (before && before.owner !== owner) await dropKept();
  let kept = before?.owner === owner ? before : null;
  const due = !kept || opts.fresh || now.getTime() >= kept.fetchedAt + refreshSeconds(kept.feed.refreshAfter) * 1000;
  if (due) {
    const answer = await askOnce(config, opts.fetchFn ?? fetch);
    if (answer.kind === 'rejected') {
      // The app may have made a new token while this one was refused (it replaces the old at startup), so try once more with it.
      const current = await readWidgetConfig();
      if (!retried && current && current.token !== config.token) return loadLetterWidget(place, { ...opts, fresh: true }, true);
      await markWidgetTokenRejected();
      await dropKept();
      return { shows: { kind: 'signedOut' }, locale: config.locale };
    }
    if (answer.kind === 'feed') {
      kept = { owner, feed: answer.feed, fetchedAt: now.getTime(), images: kept?.images ?? {} };
      await writeKept(kept);
    }
  }
  // Offline, or asked too often: the last letter stays, as long as there is one.
  if (!kept) return { shows: { kind: 'waiting' }, locale: config.locale };
  const image = await pictureFor(config, kept.feed, place, kept, now);
  const { feed } = kept;
  return {
    shows: feed.letter ? { kind: 'letter', letter: feed.letter, pinned: feed.pinned, showWords: feed.showWords, image } : { kind: 'empty', image },
    locale: config.locale,
  };
}
