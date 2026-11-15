import * as FileSystem from 'expo-file-system/legacy';
import type { WidgetFeed } from '@kurda/shared';
import { refreshSeconds, widgetAuthorization, widgetImageSize, widgetImageUrl, widgetSkyAt, type WidgetConfig } from '../contract';
import { fetchWidgetFeed, type FeedAnswer, type FetchLike } from '../feed';
import { markWidgetTokenRejected, readWidgetConfig } from '../storage';
import type { WidgetShows } from './LetterWidget';

/**
 * What the Android widget shows, and the last of it kept for when the phone
 * is offline.
 *
 * Android asks the widget to update every half hour, and the app asks it when
 * a letter comes or a setting changes. Each time, this reads the token the app
 * left (storage.ts), and asks the server for the feed only when the last feed
 * said it was time to (its `refreshAfter`) or the app asked: a home screen
 * looked at fifty times a day is not fifty requests. The feed and the picture
 * for each size of widget on the home screen are kept in the app's own files,
 * so with no network the widget keeps showing the last letter it had, as the
 * iPhone widget keeps its last entry. They belong to one token: signing out,
 * or signing in as somebody else, never shows the last person's letter.
 */

const DIR = `${FileSystem.documentDirectory ?? ''}letter-widget/`;
const KEPT = `${DIR}feed.json`;

interface Kept {
  /** whose this is: a fingerprint of the token and the server, never the token itself */
  owner: string;
  feed: WidgetFeed;
  /** when the feed was fetched, in ms */
  fetchedAt: number;
  /** for each picture on disk (by its size), what it is a picture of: a letter's id, or the empty sill at a sky */
  images: Record<string, string>;
}

/** A short fingerprint of a string (FNV-1a), enough to tell one token from another without keeping it. */
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
    // kept for next time only; this time is drawn either way
  }
}

/** Forget the last letter and its pictures: what is drawn next is whatever the app has left now. */
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

/** What one widget on the home screen is, as the library reports it: its size in dp and the screen's density. */
export interface WidgetPlace {
  width: number;
  height: number;
  density: number;
}

export interface Loaded {
  shows: WidgetShows;
  /** the language the app left for the widget, or null when there is none (signed out) */
  locale: string | null;
}

/**
 * The picture for a widget of this size, as a data URI: fetched when what it
 * should show changed, else the one on disk. Null when there is none to show
 * that matches — a new letter's text over the last letter's paper would be
 * worse than the paper's plain colour.
 */
async function pictureFor(config: WidgetConfig, feed: WidgetFeed, place: WidgetPlace, kept: Kept, now: Date): Promise<string | null> {
  const size = widgetImageSize(place.width, place.height, place.density);
  const sky = widgetSkyAt(now.getHours());
  // the writer may choose another pigeon for a letter already sent, and the picture shows it
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

/**
 * What one widget should show now. `fresh` asks the server whatever the last
 * feed said (the widget was just added, or the app asked).
 */
export async function loadLetterWidget(place: WidgetPlace, opts: { fresh: boolean; now?: Date; fetchFn?: FetchLike }, retried = false): Promise<Loaded> {
  const now = opts.now ?? new Date();
  const config = await readWidgetConfig();
  if (!config) {
    await dropKept();
    return { shows: { kind: 'signedOut' }, locale: null };
  }
  const owner = fingerprint(`${config.apiBase} ${config.token}`);
  const before = await readKept();
  // somebody else's letter, from before a sign-out: not a word of it is shown, and its pictures go
  if (before && before.owner !== owner) await dropKept();
  let kept = before?.owner === owner ? before : null;
  const due = !kept || opts.fresh || now.getTime() >= kept.fetchedAt + refreshSeconds(kept.feed.refreshAfter) * 1000;
  if (due) {
    const answer = await askOnce(config, opts.fetchFn ?? fetch);
    if (answer.kind === 'rejected') {
      // the app may have made a new token while this one was being refused (it replaces the old as it starts): ask once more with it
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
  // offline, or asked too often: the last letter stays, as long as there is one
  if (!kept) return { shows: { kind: 'waiting' }, locale: config.locale };
  const image = await pictureFor(config, kept.feed, place, kept, now);
  const { feed } = kept;
  return {
    shows: feed.letter ? { kind: 'letter', letter: feed.letter, pinned: feed.pinned, showWords: feed.showWords, image } : { kind: 'empty', image },
    locale: config.locale,
  };
}
