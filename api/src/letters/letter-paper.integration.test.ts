/**
 * A letter's own paper and the letter widget, against real Postgres: the
 * paper, drawing and notes carried by every way a letter is sent, no drawing
 * on a first letter to a stranger, notes held to the letter's rules and its
 * word filter, the paper remembered for the next letter, a reported letter
 * kept whole for the case and a removed one keeping nothing, the data export
 * and erasure, and the widget: its tokens, the letter it may be pinned to,
 * the letter it shows, its picture and its hourly budget.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import pg from 'pg';
import sharp from 'sharp';
import {
  DEFAULT_PAPER,
  WIDGET_EXCERPT_MAX,
  WIDGET_HITS_PER_HOUR,
  WIDGET_TOKENS_MAX,
  type LetterDecor,
  type LetterThread,
  type LetterVisitor,
  type LettersHome,
  type VisitorAnswer,
  type WidgetFeed,
  type WidgetSettings,
} from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { bornYearsAgo } from '../test/age.js';
import { moderationKit, type Person } from '../test/moderation-kit.js';
import { GdprService, eraseAccountData } from '../gdpr/service.js';
import { hashWidgetToken } from './widget.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('letter paper and the letter widget (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const kit = moderationKit(() => app, () => pool, 'lp', 153);
  const { call } = kit;
  const people: Person[] = [];
  const adult = async (tag: string): Promise<Person> => {
    const p = await kit.person(tag, bornYearsAgo(30));
    people.push(p);
    return p;
  };
  const send = (method: 'PUT' | 'POST' | 'DELETE' | 'GET', url: string, headers: Record<string, string>, payload?: unknown): Promise<LightMyRequestResponse> =>
    app.inject({ method, url, headers, payload: payload as object | undefined, remoteAddress: kit.ip() });
  const asWidget = (token: string, url: string, method: 'GET' | 'DELETE' = 'GET', extra: Record<string, string> = {}) =>
    send(method, url, { authorization: `Widget ${token}`, ...extra });

  const paper = { style: 'grid', tone: 'night', ink: 'gold' } as const;
  const note = { text: 'Ji bo te!', x: 500, y: 300, size: 'm', color: 'sun', turn: -8 } as const;
  const drawn: LetterDecor = { paper: { style: 'margin', tone: 'rose', ink: 'crimson' }, strokes: [{ tool: 'brush', color: 'leaf', width: 30, points: [100, 400, 180, 460, 260, 400] }], notes: [note] };
  const firstDecor: LetterDecor = { paper, strokes: [], notes: [note] };
  const letter = 'Silav! Navê min Rojda ye. Tu çawa yî? Ez Kurdî hîn dibim.';

  const home = async (p: Person): Promise<LettersHome> => (await call('GET', '/letters', p.token)).json() as LettersHome;
  const out = (p: Person, decor?: unknown, body = letter) => call('POST', '/letters/out', p.token, { body, decor });
  const answer = (p: Person, decor?: unknown, body = 'Silav! Ez jî kurdî hîn dibim.') => call('POST', '/letters/visitor', p.token, { body, decor });
  const write = (p: Person, threadId: string, decor?: unknown, body = 'Spas ji bo nameya te!') => call('POST', `/letters/threads/${threadId}`, p.token, { body, decor });
  const thread = async (p: Person, threadId: string): Promise<LetterThread> => (await call('GET', `/letters/threads/${threadId}`, p.token)).json() as LetterThread;
  /** One sends a bird out, the other calls it and answers: the two are pen pals. */
  const meet = async (writer: Person, caller: Person, decors: { out?: unknown; answer?: unknown } = {}): Promise<VisitorAnswer> => {
    expect((await out(writer, decors.out)).statusCode).toBe(200);
    expect((await call('POST', '/letters/call', caller.token)).statusCode).toBe(200);
    const res = await answer(caller, decors.answer);
    expect(res.statusCode, res.body).toBe(200);
    return res.json() as VisitorAnswer;
  };
  const tokenFor = async (p: Person, replaces?: string): Promise<string> => {
    const res = await call('POST', '/letters/widget/tokens', p.token, replaces ? { replaces } : undefined);
    expect(res.statusCode, res.body).toBe(200);
    return (res.json() as { token: string }).token;
  };
  const putPrefs = (p: Person, body: unknown) => send('PUT', '/letters/widget/prefs', { authorization: `Bearer ${p.token}` }, body);
  const feed = async (token: string): Promise<WidgetFeed> => {
    const res = await asWidget(token, '/letters/widget/feed');
    expect(res.statusCode, res.body).toBe(200);
    return res.json() as WidgetFeed;
  };

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
  });

  // every scenario starts with no bird out anywhere and none at a window, so the bird called is the one the test sent
  beforeEach(async () => {
    await pool.query(`UPDATE letter_visits SET ended_at = now(), outcome = 'closed' WHERE ended_at IS NULL`);
    await pool.query(`UPDATE letters SET status = 'recalled' WHERE status = 'flying'`);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [people.map((p) => p.id)]);
    await pool.end();
    await app.close();
  });

  describe('the paper', () => {
    it('carries a letter’s paper, drawing and notes by every way a letter is sent, and remembers the paper for the next', async () => {
      const [a, b] = [await adult('rta'), await adult('rtb')];
      expect((await home(a)).paper).toEqual(DEFAULT_PAPER);
      // the first letter to a stranger: its paper and a note, which the one who calls the bird reads with it
      expect((await out(a, firstDecor)).statusCode).toBe(200);
      expect((await home(a)).paper).toEqual(paper);
      const { visitor } = (await call('POST', '/letters/call', b.token)).json() as { visitor: LetterVisitor };
      expect(visitor.letter.decor).toEqual(firstDecor);
      // the answer may draw
      const answered = await answer(b, drawn);
      expect(answered.statusCode, answered.body).toBe(200);
      const met = answered.json() as VisitorAnswer;
      expect(met.letter.decor).toEqual(drawn);
      expect((await home(b)).paper).toEqual(drawn.paper);
      // and so may every letter after, in a correspondence
      const later: LetterDecor = { paper: { style: 'dotted', tone: 'kraft', ink: 'sepia' }, strokes: [{ tool: 'pen', color: 'navy', width: 3, points: [10, 10] }], notes: [] };
      const replied = await write(a, met.threadId, later);
      expect(replied.statusCode, replied.body).toBe(200);
      expect((replied.json() as { letter: { decor: LetterDecor } }).letter.decor).toEqual(later);
      const seen = await thread(b, met.threadId);
      expect(seen.letters.map((l) => l.decor)).toEqual([firstDecor, drawn, later]);
      expect((await home(a)).paper).toEqual(later.paper);
      // a letter without a decor, or with nothing more than the default paper, is kept as none, and the paper chosen stays as it was
      const plain = await write(b, met.threadId, { paper: DEFAULT_PAPER, strokes: [], notes: [] });
      expect((plain.json() as { letter: { decor: unknown } }).letter.decor).toBeNull();
      expect((await home(b)).paper).toEqual(DEFAULT_PAPER);
      expect((await write(a, met.threadId)).statusCode).toBe(200);
      expect((await home(a)).paper).toEqual(later.paper);
      expect((await thread(a, met.threadId)).letters.at(-1)!.decor).toBeNull();
    });

    it('carries no drawing on a first letter to a stranger, and says why', async () => {
      const a = await adult('first');
      const res = await out(a, drawn);
      expect(res.statusCode).toBe(422);
      expect(res.json()).toMatchObject({ code: 'DECOR_DRAWING_NOT_HERE' });
      expect((await home(a)).out).toBeNull();
      // nor anything that is not a decor, or past its limits
      expect((await out(a, { paper: { style: 'wavy', tone: 'cream', ink: 'navy' } })).json()).toMatchObject({ code: 'DECOR_SHAPE' });
      expect((await out(a, { ...firstDecor, notes: Array.from({ length: 9 }, () => note) })).json()).toMatchObject({ code: 'DECOR_TOO_MANY_NOTES' });
    });

    it('holds notes to the letter’s rules, the words and notes read together, and masks the filtered words in them', async () => {
      const [a, b] = [await adult('nta'), await adult('ntb')];
      const withNote = (text: string): LetterDecor => ({ ...firstDecor, notes: [{ ...note, text }] });
      expect((await out(a, withNote('rojda@example.org'))).json()).toMatchObject({ code: 'DECOR_NOTE_CONTACT' });
      expect((await out(a, withNote('www.example.org'))).json()).toMatchObject({ code: 'DECOR_NOTE_LINK' });
      expect((await out(a, withNote('x'.repeat(81)))).json()).toMatchObject({ code: 'DECOR_NOTE_LONG' });
      // half a phone number in the letter and half on a note is still a phone number
      expect((await out(a, withNote('123 4567'), 'Silav! Hejmara min 0750')).json()).toMatchObject({ code: 'LETTER_CONTACT' });
      expect((await home(a)).out).toBeNull();
      // the word filter runs over the notes as over the words
      const met = await meet(a, b, { out: withNote('Silav fuck heval') });
      const first = (await thread(b, met.threadId)).letters[0]!;
      expect(first.decor!.notes[0]!.text).toContain('****');
      expect(first.decor!.notes[0]!.text).not.toContain('fuck');
    });

    it('keeps a reported letter whole for the case, and a letter taken down shows neither its drawing nor its notes', async () => {
      const [a, b] = [await adult('mda'), await adult('mdb')];
      const met = await meet(a, b, { answer: drawn });
      const theirs = (await thread(a, met.threadId)).letters.find((l) => !l.mine)!;
      const filed = await call('POST', '/reports', a.token, { targetType: 'letter', targetId: theirs.id, category: 'harassment' });
      expect(filed.statusCode, filed.body).toBe(201);
      const r = await pool.query<{ evidence: { decor: LetterDecor; context: Array<{ id: string; notes?: string[]; drawn?: boolean }> } }>(
        `SELECT evidence FROM reports WHERE target_type = 'letter' AND target_id = $1`,
        [theirs.id],
      );
      const evidence = r.rows[0]!.evidence;
      expect(evidence.decor).toEqual(drawn);
      expect(evidence.context.find((m) => m.id === theirs.id)).toMatchObject({ notes: [note.text], drawn: true });
      // taken down, as moderation takes a letter down: nothing of it is shown, its paper and notes with its words
      await pool.query(`UPDATE letters SET status = 'removed' WHERE id = $1`, [theirs.id]);
      for (const p of [a, b]) {
        const removed = (await thread(p, met.threadId)).letters.find((l) => l.id === theirs.id)!;
        expect(removed).toMatchObject({ removed: true, body: '', decor: null });
      }
      // the case still has what was reported
      expect((await pool.query(`SELECT evidence->'decor' AS d FROM reports WHERE target_id = $1`, [theirs.id])).rows[0].d).toEqual(drawn);
    });

    it('puts a letter’s paper, drawing and notes in its writer’s data, and takes them and the widgets with the account', async () => {
      const [a, b] = [await adult('gda'), await adult('gdb')];
      const met = await meet(a, b, { out: firstDecor, answer: drawn });
      const token = await tokenFor(b);
      expect((await putPrefs(b, { pinnedLetterId: (await thread(b, met.threadId)).letters[0]!.id, showWords: false })).statusCode).toBe(200);
      const doc = (await new GdprService(pool).buildExport(b.id)) as unknown as {
        lettersWritten: Array<{ body: string; decor: LetterDecor | null }>;
        letterPaper: { paper: unknown } | null;
        letterWidget: { prefs: { show_words: boolean } | null; phones: Array<Record<string, unknown>> };
      };
      expect(doc.lettersWritten.map((l) => l.decor)).toEqual([drawn]);
      expect(doc.letterPaper?.paper).toEqual(drawn.paper);
      expect(doc.letterWidget.prefs?.show_words).toBe(false);
      expect(doc.letterWidget.phones).toHaveLength(1);
      // what a phone holds is never in the export, nor its hash
      expect(JSON.stringify(doc)).not.toContain(token);
      expect(JSON.stringify(doc)).not.toContain(hashWidgetToken(token));
      await eraseAccountData(pool, b.id);
      for (const table of ['letter_prefs', 'letter_widget_tokens', 'letter_widget_prefs']) {
        expect((await pool.query(`SELECT 1 FROM ${table} WHERE user_id = $1`, [b.id])).rowCount, table).toBe(0);
      }
      expect((await pool.query(`SELECT 1 FROM letters WHERE sender_id = $1`, [b.id])).rowCount).toBe(0);
      expect((await asWidget(token, '/letters/widget/feed')).statusCode).toBe(401);
    });
  });

  describe('the widget', () => {
    it('reads with a token of its own, kept only as a hash, a few phones at most, each removable', async () => {
      const [a, b] = [await adult('tka'), await adult('tkb')];
      const token = await tokenFor(a);
      expect(token).toMatch(/^hvw_[A-Za-z0-9_-]{43}$/);
      const rows = await pool.query<{ token_hash: string }>(`SELECT token_hash FROM letter_widget_tokens WHERE user_id = $1`, [a.id]);
      expect(rows.rows.map((r) => r.token_hash)).toEqual([hashWidgetToken(token)]);
      expect(JSON.stringify(rows.rows)).not.toContain(token);
      expect((await asWidget(token, '/letters/widget/feed')).statusCode).toBe(200);

      // the widget token opens nothing else, and the session opens none of the widget's routes
      expect((await asWidget(token, '/letters')).statusCode).toBe(401);
      expect((await asWidget(token, '/letters/widget/prefs')).statusCode).toBe(401);
      expect((await call('GET', '/letters/widget/feed', a.token)).json()).toMatchObject({ code: 'WIDGET_UNAUTHORIZED' });
      expect((await asWidget(`${token.slice(0, -1)}x`, '/letters/widget/feed')).statusCode).toBe(401);
      expect((await send('GET', '/letters/widget/feed', { authorization: `Bearer ${token}` })).statusCode).toBe(401);

      // a phone handed a fresh token gives up its old one in the same step
      const fresh = await tokenFor(a, token);
      expect((await asWidget(token, '/letters/widget/feed')).statusCode).toBe(401);
      expect((await asWidget(fresh, '/letters/widget/feed')).statusCode).toBe(200);
      // another account’s token is not given up by naming it
      const theirs = await tokenFor(b);
      await tokenFor(a, theirs);
      expect((await asWidget(theirs, '/letters/widget/feed')).statusCode).toBe(200);

      // past the limit, the token longest unused makes way
      const many = [fresh];
      while (many.length < WIDGET_TOKENS_MAX + 1) many.push(await tokenFor(a));
      const left = await pool.query(`SELECT 1 FROM letter_widget_tokens WHERE user_id = $1`, [a.id]);
      expect(left.rowCount).toBe(WIDGET_TOKENS_MAX);
      expect((await asWidget(many.at(-1)!, '/letters/widget/feed')).statusCode).toBe(200);
      expect((((await call('GET', '/letters/widget/prefs', a.token)).json()) as WidgetSettings).widgets).toBe(WIDGET_TOKENS_MAX);

      // a widget removes itself when its phone signs out; the account can remove them all
      const last = many.at(-1)!;
      expect((await asWidget(last, '/letters/widget/tokens/current', 'DELETE')).statusCode).toBe(204);
      expect((await asWidget(last, '/letters/widget/feed')).statusCode).toBe(401);
      expect((await call('DELETE', '/letters/widget/tokens', a.token)).statusCode).toBe(204);
      expect((await pool.query(`SELECT 1 FROM letter_widget_tokens WHERE user_id = $1`, [a.id])).rowCount).toBe(0);
      expect((await asWidget(theirs, '/letters/widget/feed')).statusCode).toBe(200);

      // signing out everywhere, or a new password, ends the widgets with the sessions
      const after = await tokenFor(b);
      await pool.query(`UPDATE users SET token_version = token_version + 1 WHERE id = $1`, [b.id]);
      expect((await asWidget(after, '/letters/widget/feed')).statusCode).toBe(401);
    });

    it('may be pinned only to a letter a pen pal sent you, not taken down and not across a block', async () => {
      const [a, b, c, d] = [await adult('pna'), await adult('pnb'), await adult('pnc'), await adult('pnd')];
      const met = await meet(a, b, { out: firstDecor });
      const letters = (await thread(b, met.threadId)).letters;
      const received = letters.find((l) => !l.mine)!;
      const sent = letters.find((l) => l.mine)!;
      expect(((await call('GET', '/letters/widget/prefs', b.token)).json() as WidgetSettings)).toMatchObject({ pinnedLetterId: null, showWords: true, pinned: false });
      // his own letter, and a letter of somebody else’s correspondence, are not his to pin
      expect((await putPrefs(b, { pinnedLetterId: sent.id })).statusCode).toBe(404);
      expect((await putPrefs(c, { pinnedLetterId: received.id })).statusCode).toBe(404);
      expect((await putPrefs(b, { pinnedLetterId: '00000000-0000-4000-8000-000000000000' })).statusCode).toBe(404);
      expect((await putPrefs(b, { pinnedLetterId: 'nope' })).statusCode).toBe(400);
      // nor a stranger’s bird at his window, which is not his until he answers it
      expect((await out(d)).statusCode).toBe(200);
      const { visitor } = (await call('POST', '/letters/call', c.token)).json() as { visitor: LetterVisitor };
      expect((await putPrefs(c, { pinnedLetterId: visitor.letter.id })).statusCode).toBe(404);

      const pinned = await putPrefs(b, { pinnedLetterId: received.id });
      expect(pinned.statusCode, pinned.body).toBe(200);
      expect(pinned.json()).toMatchObject({ pinnedLetterId: received.id, showWords: true, pinned: true, letter: { id: received.id } });
      // either choice can change alone
      expect((await putPrefs(b, { showWords: false })).json()).toMatchObject({ pinnedLetterId: received.id, showWords: false });
      expect((await putPrefs(b, { pinnedLetterId: null })).json()).toMatchObject({ pinnedLetterId: null, showWords: false });

      // across a block, and once taken down, it cannot be pinned
      await pool.query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)`, [b.id, a.id]);
      expect((await putPrefs(b, { pinnedLetterId: received.id })).statusCode).toBe(404);
      await pool.query(`DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2`, [b.id, a.id]);
      await pool.query(`UPDATE letters SET status = 'removed' WHERE id = $1`, [received.id]);
      expect((await putPrefs(b, { pinnedLetterId: received.id })).json()).toMatchObject({ code: 'LETTER_REMOVED' });
    });

    it('shows the pinned letter while it may be shown, else the newest a pen pal sent, and never marks it read', async () => {
      const [a, b, c] = [await adult('fda'), await adult('fdb'), await adult('fdc')];
      const token = await tokenFor(b);
      // nothing yet: no pen pal has written, and a stranger’s bird at the window is not a letter to him
      expect(await feed(token)).toEqual({ letter: null, pinned: false, showWords: true, refreshAfter: 1800 });
      expect((await out(a, firstDecor)).statusCode).toBe(200);
      expect((await call('POST', '/letters/call', b.token)).statusCode).toBe(200);
      expect((await feed(token)).letter).toBeNull();
      const met = (await answer(b, drawn)).json() as VisitorAnswer;
      // her letter, answered, is the first a pen pal sent him; her next one is on its way, so the widget asks sooner
      const first = await feed(token);
      expect(first).toMatchObject({ pinned: false, showWords: true, letter: { threadId: met.threadId, from: { name: expect.any(String) }, excerpt: letter, paper, rtl: false, drawn: false } });
      expect(first.refreshAfter).toBe(900);
      const firstId = first.letter!.id;

      // her next letter, unread, takes its place, and is still unread after the widget showed it
      const long = 'Ev nameyeke dirêj e ku li ser rûpelê berdewam dike û hîn jî berdewam dike. '.repeat(6);
      expect((await write(a, met.threadId, drawn, long)).statusCode).toBe(200);
      const newest = await feed(token);
      expect(newest.letter!.id).not.toBe(firstId);
      // his turn now, and no bird of his out: nothing is on its way to him
      expect(newest.refreshAfter).toBe(1800);
      expect(newest.letter).toMatchObject({ drawn: true, paper: drawn.paper });
      expect([...newest.letter!.excerpt].length).toBeLessThanOrEqual(WIDGET_EXCERPT_MAX);
      expect(newest.letter!.excerpt.endsWith('…')).toBe(true);
      const unread = await pool.query(`SELECT read_at FROM letters WHERE id = $1`, [newest.letter!.id]);
      expect(unread.rows[0].read_at).toBeNull();

      // pinned, it stays whatever comes after; a pinned letter is asked about less often
      expect((await putPrefs(b, { pinnedLetterId: firstId })).statusCode).toBe(200);
      expect(await feed(token)).toMatchObject({ pinned: true, letter: { id: firstId }, refreshAfter: 3600 });
      // the words hidden: the paper and who it is from, sealed
      expect((await putPrefs(b, { showWords: false })).statusCode).toBe(200);
      expect(await feed(token)).toMatchObject({ showWords: false, letter: { id: firstId, excerpt: '' } });
      expect((await putPrefs(b, { showWords: true })).statusCode).toBe(200);

      // taken down, the pin no longer shows it, and the newest is shown instead
      await pool.query(`UPDATE letters SET status = 'removed' WHERE id = $1`, [firstId]);
      expect(await feed(token)).toMatchObject({ pinned: false, letter: { id: newest.letter!.id } });
      expect(((await call('GET', '/letters/widget/prefs', b.token)).json() as WidgetSettings).pinnedLetterId).toBeNull();

      // a block takes her letters off his widget altogether
      await pool.query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)`, [a.id, b.id]);
      expect((await feed(token)).letter).toBeNull();
      await pool.query(`DELETE FROM blocks WHERE blocker_id = $1`, [a.id]);
      // so does a goodbye, for the newest; another pen pal’s letter is shown then
      expect((await call('POST', `/letters/threads/${met.threadId}/end`, b.token)).statusCode).toBe(204);
      expect((await feed(token)).letter).toBeNull();
      const other = await meet(c, b);
      expect((await feed(token)).letter).toMatchObject({ threadId: other.threadId, from: { bird: expect.any(Number) } });
      // and the feed of one account says nothing of another’s
      const cToken = await tokenFor(c);
      expect((await feed(cToken)).letter?.threadId).toBe(other.threadId);
      expect((await feed(cToken)).letter?.id).not.toBe((await feed(token)).letter?.id);
    });

    it('tells which way a letter is written', async () => {
      const [a, b] = [await adult('rla'), await adult('rlb')];
      const token = await tokenFor(b);
      await meet(a, b);
      // the meeting letter is hers; the next is in Soranî
      const t = (await home(a)).penPals[0]!.threadId;
      expect((await write(a, t, undefined, 'سڵاو هاوڕێی خۆشەویستم، چۆنی؟')).statusCode).toBe(200);
      expect((await feed(token)).letter).toMatchObject({ rtl: true, excerpt: 'سڵاو هاوڕێی خۆشەویستم، چۆنی؟' });
    });

    it('draws its picture at the size asked, the letter’s or the empty sill, and says when nothing changed', async () => {
      const [a, b] = [await adult('ima'), await adult('imb')];
      const token = await tokenFor(b);
      const image = (q: string, extra: Record<string, string> = {}) => asWidget(token, `/letters/widget/image?${q}`, 'GET', extra);
      // no letter yet: his own pigeon on the windowsill
      const empty = await image('w=170&h=170&scale=2');
      expect(empty.statusCode, empty.body).toBe(200);
      expect(empty.headers['content-type']).toBe('image/png');
      expect(await sharp(empty.rawPayload).metadata()).toMatchObject({ format: 'png', width: 340, height: 340 });
      expect((await image('w=170&h=170&scale=2&sky=night')).headers.etag).not.toBe(empty.headers.etag);

      await meet(a, b, { answer: drawn });
      const t = (await home(a)).penPals[0]!.threadId;
      expect((await write(a, t, drawn)).statusCode).toBe(200);
      const medium = await image('w=364&h=170&scale=3');
      expect(medium.statusCode).toBe(200);
      expect(await sharp(medium.rawPayload).metadata()).toMatchObject({ format: 'png', width: 1092, height: 510 });
      expect(medium.headers['cache-control']).toBe('private, no-cache');
      expect(medium.headers.etag).not.toBe(empty.headers.etag);
      // the same letter at the same size: nothing to draw again
      const again = await image('w=364&h=170&scale=3', { 'if-none-match': String(medium.headers.etag) });
      expect(again.statusCode).toBe(304);
      expect(again.rawPayload.length).toBe(0);
      // no side larger than the widget could use, and no size that is not one
      expect(await sharp((await image('w=800&h=400&scale=4')).rawPayload).metadata()).toMatchObject({ width: 1600, height: 800 });
      expect((await image('w=10&h=170')).statusCode).toBe(400);
      expect((await image('w=170&h=170&scale=9')).statusCode).toBe(400);
      expect((await image('w=170')).statusCode).toBe(400);
      expect((await send('GET', '/letters/widget/image?w=170&h=170', {})).statusCode).toBe(401);
    });

    it('allows each widget so many requests an hour, and no more', async () => {
      const a = await adult('rate');
      const token = await tokenFor(a);
      for (let i = 0; i < WIDGET_HITS_PER_HOUR; i++) expect((await asWidget(token, '/letters/widget/feed')).statusCode).toBe(200);
      const over = await asWidget(token, '/letters/widget/feed');
      expect(over.statusCode).toBe(429);
      expect(over.json()).toMatchObject({ code: 'RATE_LIMITED' });
      expect(Number(over.headers['retry-after'])).toBeGreaterThan(0);
      // the budget is the widget’s: another phone of the same account has its own
      expect((await asWidget(await tokenFor(a), '/letters/widget/feed')).statusCode).toBe(200);
    });
  });
});
