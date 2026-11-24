import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

/*
 * The Android letter widget: what it draws for each state, and how it decides: the app's token, the feed fetched
 * only when due, the picture only when it would change, and the last letter kept for offline use.
 */

const disk = vi.hoisted(() => ({
  files: new Map<string, string>(),
  keystore: new Map<string, string>(),
  /** What the server answers a picture download with. */
  picture: { status: 200, body: 'PNG' },
  downloads: [] as Array<{ url: string; headers: Record<string, string> }>,
}));

vi.mock('react-native', () => import('react-native-web'));
// The widget library's components by the names its tree builder reads; this checks what is drawn, not how the library draws it.
vi.mock('react-native-android-widget', () => {
  const piece = (name: string) => Object.assign(() => null, { __name__: name });
  return {
    FlexWidget: piece('LinearLayoutWidget'),
    OverlapWidget: piece('FrameLayoutWidget'),
    TextWidget: piece('TextWidget'),
    ImageWidget: piece('ImageWidget'),
    SvgWidget: piece('SvgWidget'),
  };
});
vi.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => disk.keystore.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => void disk.keystore.set(key, value),
  deleteItemAsync: async (key: string) => void disk.keystore.delete(key),
}));
vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  EncodingType: { Base64: 'base64', UTF8: 'utf8' },
  getInfoAsync: async (uri: string) => ({ exists: disk.files.has(uri) }),
  readAsStringAsync: async (uri: string, opts?: { encoding?: string }) => {
    const text = disk.files.get(uri);
    if (text === undefined) throw new Error(`no file ${uri}`);
    return opts?.encoding === 'base64' ? `b64(${text})` : text;
  },
  writeAsStringAsync: async (uri: string, text: string) => void disk.files.set(uri, text),
  makeDirectoryAsync: async () => undefined,
  deleteAsync: async (uri: string) => {
    // A folder (ending in /) goes with everything in it; a file only itself.
    for (const key of [...disk.files.keys()]) if (key === uri || (uri.endsWith('/') && key.startsWith(uri))) disk.files.delete(key);
  },
  moveAsync: async ({ from, to }: { from: string; to: string }) => {
    disk.files.set(to, disk.files.get(from)!);
    disk.files.delete(from);
  },
  downloadAsync: async (url: string, to: string, opts: { headers: Record<string, string> }) => {
    disk.downloads.push({ url, headers: opts.headers });
    disk.files.set(to, disk.picture.body);
    return { status: disk.picture.status, uri: to, headers: {} };
  },
}));

import { WIDGET_KEYS } from './contract';
import { LetterWidget, familyOf, type WidgetShows } from './android/LetterWidget';
import { fingerprint, loadLetterWidget } from './android/load';

const LETTER = {
  id: 'l1',
  threadId: 't1',
  from: { name: 'Rojda', bird: 2 },
  excerpt: 'Silav heval! Îro li gund baran barî.',
  sentAt: '2026-11-14T10:00:00.000Z',
  paper: { style: 'lined' as const, tone: 'night' as const, ink: 'gold' as const },
  rtl: false,
  drawn: true,
};

interface Node {
  type: string;
  props: Record<string, unknown>;
  children: Node[];
}

/** The widget tree as the library reads it: our components called through to the library's. */
function expand(element: ReactElement): Node {
  let el = element as ReactElement<Record<string, unknown>> & { type: { (p: unknown): ReactElement; __name__?: string } };
  while (typeof el.type === 'function' && !el.type.__name__) el = el.type(el.props) as typeof el;
  const { children, ...props } = el.props as { children?: unknown };
  const kids = (Array.isArray(children) ? children.flat(2) : [children]).filter((c): c is ReactElement => !!c && typeof c === 'object');
  return { type: el.type.__name__ ?? String(el.type), props, children: kids.map(expand) };
}

function all(node: Node, type: string): Node[] {
  return [...(node.type === type ? [node] : []), ...node.children.flatMap((c) => all(c, type))];
}
const texts = (node: Node): string[] => all(node, 'TextWidget').map((t) => t.props.text as string);

function draw(shows: WidgetShows, size: [number, number] = [320, 160], locale = 'en'): Node {
  return expand(<LetterWidget shows={shows} width={size[0]} height={size[1]} locale={locale} rtlLocale={locale === 'ckb' || locale === 'ar'} now={new Date('2026-11-15T12:00:00Z')} />);
}

describe('the Android letter widget, drawn', () => {
  it('sizes itself as the iPhone widget does: small, medium, large', () => {
    expect(familyOf(150, 160)).toBe('small');
    expect(familyOf(320, 160)).toBe('medium');
    expect(familyOf(320, 380)).toBe('large');
  });

  it('shows who the letter is from and the start of it, in the writer’s ink over the paper, and opens the correspondence', () => {
    const tree = draw({ kind: 'letter', letter: LETTER, pinned: false, showWords: true, image: 'data:image/png;base64,AAA' });
    expect(texts(tree)).toEqual(['Rojda', LETTER.excerpt, expect.stringMatching(/14|Nov/)]);
    expect(tree.props.clickAction).toBe('OPEN_URI');
    expect(tree.props.clickActionData).toEqual({ uri: 'hevalo://app/letters/t1' });
    expect(all(tree, 'ImageWidget')[0]!.props.image).toBe('data:image/png;base64,AAA');
    // Gold ink on the night sheet is the light gold the shared colours give it.
    const name = all(tree, 'TextWidget')[0]!;
    expect((name.props.style as { color: string }).color).toBe('#f3d37c');
    expect(String(tree.props.accessibilityLabel)).toContain('Rojda');
  });

  it('lines a letter written right to left up on the right, the pin at the left end', () => {
    const tree = draw({ kind: 'letter', letter: { ...LETTER, rtl: true, excerpt: 'سڵاو هاوڕێ!' }, pinned: true, showWords: true, image: null });
    for (const t of all(tree, 'TextWidget').slice(0, 2)) expect((t.props.style as { textAlign: string }).textAlign).toBe('right');
    const row = all(tree, 'LinearLayoutWidget').find((n) => n.children.some((c) => c.type === 'SvgWidget'))!;
    expect(row.children[0]!.type).toBe('SvgWidget');
  });

  it('is sealed when the words are turned off: the paper and who it is from, no words of the letter', () => {
    const tree = draw({ kind: 'letter', letter: { ...LETTER, excerpt: '' }, pinned: false, showWords: false, image: null }, [150, 160], 'ku');
    expect(texts(tree)[0]).toBe('Nameyek ji Rojda');
    expect(texts(tree)).not.toContain(LETTER.excerpt);
  });

  it('marks a letter kept on the widget, in words for a screen reader too', () => {
    const tree = draw({ kind: 'letter', letter: LETTER, pinned: true, showWords: true, image: null });
    expect(all(tree, 'SvgWidget')).toHaveLength(1);
    expect(String(tree.props.accessibilityLabel)).toContain('Kept on your widget');
  });

  it('shows the empty sill with a word on it before any letter has come, more of it when there is room', () => {
    expect(texts(draw({ kind: 'empty', image: null }, [150, 160]))).toEqual(['No letter yet']);
    const medium = draw({ kind: 'empty', image: null }, [320, 160], 'ckb');
    expect(texts(medium)).toEqual(['هێشتا نامە نییە', 'کاتێک هاوڕێیەکی نامە دەنووسێت، نامەکەی لێرە دەردەکەوێت.']);
    expect((all(medium, 'TextWidget')[0]!.props.style as { textAlign: string }).textAlign).toBe('right');
    expect(medium.props.clickActionData).toEqual({ uri: 'hevalo://app/letters' });
  });

  it('says to open Hevalo when signed out, and opens the app', () => {
    const tree = draw({ kind: 'signedOut' }, [150, 160], 'de');
    expect(texts(tree)).toEqual(['Öffne Hevalo, um deine Briefe zu sehen']);
    expect(tree.props.clickActionData).toEqual({ uri: 'hevalo://' });
  });
});

describe('what the Android widget shows', () => {
  const place = { width: 320, height: 160, density: 3 };
  const at = (iso: string) => new Date(iso);

  function signIn(token = 'hvw_one') {
    disk.keystore.set(WIDGET_KEYS.token, token);
    disk.keystore.set(WIDGET_KEYS.apiBase, 'https://api.test');
    disk.keystore.set(WIDGET_KEYS.locale, 'ku');
  }

  function server(answers: Array<{ status: number; body?: unknown }>) {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fn = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const answer = answers.shift() ?? { status: 503 };
      return new Response(answer.body === undefined ? null : JSON.stringify(answer.body), { status: answer.status });
    });
    return { calls, fn };
  }

  const feed = (letter: typeof LETTER | null = LETTER) => ({ status: 200, body: { letter, pinned: false, showWords: true, refreshAfter: 1800 } });

  beforeEach(() => {
    disk.files.clear();
    disk.keystore.clear();
    disk.downloads.length = 0;
    disk.picture = { status: 200, body: 'PNG' };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is signed out when the app left no token, and keeps nothing of before', async () => {
    disk.files.set('file:///docs/letter-widget/feed.json', '{}');
    const loaded = await loadLetterWidget(place, { fresh: false, fetchFn: server([]).fn });
    expect(loaded.shows).toEqual({ kind: 'signedOut' });
    expect(disk.files.size).toBe(0);
  });

  it('asks for the feed with the widget’s own token, then for the picture at the widget’s size', async () => {
    signIn();
    const net = server([feed()]);
    const loaded = await loadLetterWidget(place, { fresh: false, now: at('2026-11-15T12:00:00'), fetchFn: net.fn });
    expect(net.calls[0]!.url).toBe('https://api.test/letters/widget/feed');
    expect((net.calls[0]!.init.headers as Record<string, string>).authorization).toBe('Widget hvw_one');
    expect(disk.downloads).toEqual([{ url: 'https://api.test/letters/widget/image?w=320&h=160&scale=3&sky=day', headers: { authorization: 'Widget hvw_one' } }]);
    expect(loaded).toEqual({ shows: { kind: 'letter', letter: LETTER, pinned: false, showWords: true, image: 'data:image/png;base64,b64(PNG)' }, locale: 'ku' });
  });

  it('does not ask again before the feed said to, unless the app asks', async () => {
    signIn();
    const net = server([feed(), feed()]);
    await loadLetterWidget(place, { fresh: false, now: at('2026-11-15T12:00:00'), fetchFn: net.fn });
    await loadLetterWidget(place, { fresh: false, now: at('2026-11-15T12:20:00'), fetchFn: net.fn });
    expect(net.calls).toHaveLength(1);
    // Nor the picture: it is of the same letter, at the same size.
    expect(disk.downloads).toHaveLength(1);
    await loadLetterWidget(place, { fresh: false, now: at('2026-11-15T12:31:00'), fetchFn: net.fn });
    expect(net.calls).toHaveLength(2);
    await loadLetterWidget(place, { fresh: true, now: at('2026-11-15T12:32:00'), fetchFn: net.fn });
    expect(net.calls).toHaveLength(3);
    expect(disk.downloads).toHaveLength(1);
  });

  it('keeps the last letter when the phone is offline, and waits when there is none to keep', async () => {
    signIn();
    const offline = vi.fn(async () => {
      throw new TypeError('Network request failed');
    });
    expect((await loadLetterWidget(place, { fresh: true, fetchFn: offline })).shows).toEqual({ kind: 'waiting' });
    await loadLetterWidget(place, { fresh: true, now: at('2026-11-15T12:00:00'), fetchFn: server([feed()]).fn });
    const kept = await loadLetterWidget(place, { fresh: true, now: at('2026-11-15T13:00:00'), fetchFn: offline });
    expect(kept.shows).toMatchObject({ kind: 'letter', letter: { id: 'l1' }, image: 'data:image/png;base64,b64(PNG)' });
  });

  it('shows the paper’s plain colour rather than the last letter’s picture when a new picture cannot be had', async () => {
    signIn();
    await loadLetterWidget(place, { fresh: true, now: at('2026-11-15T12:00:00'), fetchFn: server([feed()]).fn });
    disk.picture = { status: 503, body: 'nope' };
    const next = await loadLetterWidget(place, { fresh: true, now: at('2026-11-15T12:40:00'), fetchFn: server([feed({ ...LETTER, id: 'l2' })]).fn });
    expect(next.shows).toMatchObject({ kind: 'letter', letter: { id: 'l2' }, image: null });
  });

  it('draws the empty sill at the sky of the phone’s hour, fetched again when the sky turns', async () => {
    signIn();
    const net = server([feed(null), feed(null)]);
    const evening = await loadLetterWidget(place, { fresh: true, now: at('2026-11-15T18:00:00'), fetchFn: net.fn });
    expect(evening.shows).toEqual({ kind: 'empty', image: 'data:image/png;base64,b64(PNG)' });
    expect(disk.downloads[0]!.url).toContain('sky=dusk');
    await loadLetterWidget(place, { fresh: false, now: at('2026-11-15T20:05:00'), fetchFn: net.fn });
    expect(disk.downloads[1]!.url).toContain('sky=night');
  });

  it('says to open Hevalo when the server refuses the token, and tells the app so', async () => {
    signIn();
    await loadLetterWidget(place, { fresh: true, now: at('2026-11-15T12:00:00'), fetchFn: server([feed()]).fn });
    const refused = await loadLetterWidget(place, { fresh: true, fetchFn: server([{ status: 401, body: { code: 'WIDGET_UNAUTHORIZED' } }]).fn });
    expect(refused.shows).toEqual({ kind: 'signedOut' });
    expect(disk.keystore.get(WIDGET_KEYS.rejected)).toBe('1');
    expect([...disk.files.keys()]).toEqual([]);
  });

  it('says calmly that letters are off when a parent turned them off, shows none, and keeps the token', async () => {
    signIn();
    await loadLetterWidget(place, { fresh: true, now: at('2026-11-15T12:00:00'), fetchFn: server([feed()]).fn });
    const off = await loadLetterWidget(place, {
      fresh: true,
      fetchFn: server([{ status: 403, body: { code: 'PARENTAL_BLOCKED', message: 'switched off', details: { control: 'letters' } } }]).fn,
    });
    expect(off.shows).toEqual({ kind: 'off' });
    expect(disk.keystore.has(WIDGET_KEYS.rejected)).toBe(false);
    expect([...disk.files.keys()]).toEqual([]);
  });

  it('asks once more with the new token when the app replaced the old one meanwhile', async () => {
    signIn('hvw_old');
    const net = server([{ status: 401 }, feed()]);
    const fetchFn = vi.fn(async (url: string, init: RequestInit) => {
      // The app makes its new token while the old one is being refused.
      if (net.calls.length === 0) disk.keystore.set(WIDGET_KEYS.token, 'hvw_new');
      return net.fn(url, init);
    });
    const loaded = await loadLetterWidget(place, { fresh: true, fetchFn });
    expect(loaded.shows).toMatchObject({ kind: 'letter' });
    expect((net.calls[1]!.init.headers as Record<string, string>).authorization).toBe('Widget hvw_new');
    expect(disk.keystore.has(WIDGET_KEYS.rejected)).toBe(false);
  });

  it('never shows the last account’s letter after somebody else signs in', async () => {
    signIn('hvw_one');
    await loadLetterWidget(place, { fresh: true, now: at('2026-11-15T12:00:00'), fetchFn: server([feed()]).fn });
    signIn('hvw_two');
    const offline = vi.fn(async () => {
      throw new TypeError('Network request failed');
    });
    expect((await loadLetterWidget(place, { fresh: false, fetchFn: offline })).shows).toEqual({ kind: 'waiting' });
    // What is stored on disk identifies the owner without holding the token itself.
    expect(fingerprint('a')).toMatch(/^[0-9a-f]{8}$/);
    expect([...disk.files.values()].join(' ')).not.toContain('hvw_');
  });
});
