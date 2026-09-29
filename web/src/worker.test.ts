/**
 * What goes into the head of a shared post.
 *
 * The risky half of this file is `attr`: a post is user-written text on its way
 * into an HTML attribute, so a miss there is a stored XSS that fires in every
 * chat app that unfurls the link. The rest is about a preview reading well —
 * ending on a word, naming the author, not claiming a picture it does not have.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { __test } from './worker';

const { routeFor, attr, trim, previewOf, sitemap } = __test;

describe('which paths get a preview', () => {
  it('recognises a post and a picture', () => {
    const id = '11111111-2222-4333-8444-555555555555';
    expect(routeFor(`/app/library/${id}`)).toEqual({ api: `/library/posts/${id}`, kind: 'library' });
    expect(routeFor(`/app/dimen/${id}`)).toEqual({ api: `/images/${id}`, kind: 'image' });
    expect(routeFor(`/app/library/${id}/`)).not.toBeNull();
  });

  it('looks nothing up for a path that is not a post', () => {
    // the worker is not a proxy for whatever someone puts in the URL
    for (const path of ['/', '/app/civak', '/app/users/x', '/assets/index.js', '/app/library']) {
      expect(routeFor(path), path).toBeNull();
    }
  });

  it('refuses an id that is not a UUID, however it is dressed up', () => {
    for (const bad of [
      '../../etc/passwd',
      'not-a-uuid',
      '11111111-2222-4333-8444-555555555555%20extra',
      '..%2f..%2fadmin',
      '11111111222243338444555555555555',
    ]) {
      expect(routeFor(`/app/library/${bad}`), bad).toBeNull();
    }
  });
});

describe('escaping', () => {
  it('closes every way out of an attribute', () => {
    expect(attr('"><script>alert(1)</script>')).toBe(
      '&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;',
    );
    expect(attr("' onmouseover='alert(1)")).toBe('&#39; onmouseover=&#39;alert(1)');
    // & first, or the escapes themselves become a way back out
    expect(attr('&lt;script&gt;')).toBe('&amp;lt;script&amp;gt;');
  });

  it('leaves ordinary Kurdish text alone', () => {
    expect(attr('Çîrokek bi kurdî — helbest û gotin')).toBe('Çîrokek bi kurdî — helbest û gotin');
    expect(attr('چیرۆکێک بە کوردی')).toBe('چیرۆکێک بە کوردی');
  });
});

describe('trimming', () => {
  it('leaves a short line as it is', () => {
    expect(trim('A short title', 70)).toBe('A short title');
  });

  it('collapses the line breaks a poem is full of', () => {
    expect(trim('Lines break\n  where the poet\n\nput them', 70)).toBe('Lines break where the poet put them');
  });

  it('ends on a whole word, not mid-word', () => {
    const source = 'the quick brown fox jumps over the lazy dog';
    const out = trim(source, 20);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(21);

    // what is left must be a run of whole words from the start of the source —
    // "the quick brown fox", never "the quick brown f"
    const kept = out.slice(0, -1);
    expect(source.startsWith(kept)).toBe(true);
    expect(source[kept.length]).toBe(' ');
  });

  it('still cuts when there is no word boundary to cut on', () => {
    const out = trim('a'.repeat(60), 20);
    expect(out).toHaveLength(21); // 20 + the ellipsis
  });
});

describe('what a preview says', () => {
  const author = { username: 'rojîn' };

  it('names the post and who wrote it', () => {
    const p = previewOf({ title: 'Helbesta çiya', body: 'Çiya bilind in.', author }, 'library')!;
    expect(p.title).toBe('Helbesta çiya · @rojîn');
    expect(p.description).toBe('Çiya bilind in.');
  });

  it('falls back to the byline for a picture, which usually has no title', () => {
    const p = previewOf({ caption: 'Li Hewlêrê', author, imageUrl: 'https://cdn.test/a.webp' }, 'image')!;
    expect(p.title).toBe('A picture on Hevalo · @rojîn');
    expect(p.description).toBe('Li Hewlêrê');
    expect(p.image).toBe('https://cdn.test/a.webp');
  });

  it('says something rather than nothing when a post has no words', () => {
    const p = previewOf({ title: 'Wêne', author }, 'image')!;
    expect(p.description).toContain('Hevalo');
  });

  it('claims no picture it cannot vouch for', () => {
    // an http:// or javascript: value in og:image is not a picture, it is a
    // request made by whoever opens the preview
    for (const bad of ['http://cdn.test/a.webp', 'javascript:alert(1)', '/relative.webp', '']) {
      expect(previewOf({ title: 'x', author, imageUrl: bad }, 'image')!.image, bad).toBeNull();
    }
  });

  it('survives a post that is missing everything', () => {
    const p = previewOf({}, 'library')!;
    expect(p.title).toBe('A post on Hevalo');
    expect(p.description).toContain('Hevalo');
    expect(p.image).toBeNull();
  });

  it('keeps a long title inside what a card will show', () => {
    const p = previewOf({ title: 'x'.repeat(200), author }, 'library')!;
    // the ellipsis and the byline are the only things past the cut
    expect(p.title.length).toBeLessThan(90);
    expect(p.title.endsWith('· @rojîn')).toBe(true);
  });
});

describe('the sitemap', () => {
  const ORIGIN = 'https://hevalo.app';
  const ID = '11111111-2222-4333-8444-555555555555';
  const ID2 = '99999999-2222-4333-8444-555555555555';

  const serving = (pages: unknown[][]) => {
    let call = 0;
    return vi.fn(async () => {
      const posts = pages[call++] ?? [];
      return new Response(JSON.stringify({ posts }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
  };

  const xmlOf = async (res: Response) => await res.text();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists the static paths and every published post', async () => {
    vi.stubGlobal('fetch', serving([[{ id: ID, updatedAt: '2026-09-28T10:00:00.000Z' }]]));
    const xml = await xmlOf(await sitemap('https://api.test', ORIGIN));

    expect(xml).toContain('<loc>https://hevalo.app/</loc>');
    expect(xml).toContain('<loc>https://hevalo.app/app/games</loc>');
    expect(xml).toContain(`<loc>https://hevalo.app/app/library/${ID}</loc>`);
    // a date, not a timestamp: a sitemap lastmod is a day
    expect(xml).toContain('<lastmod>2026-09-28</lastmod>');
  });

  it('is well-formed XML with the right content type', async () => {
    vi.stubGlobal('fetch', serving([[]]));
    const res = await sitemap('https://api.test', ORIGIN);

    expect(res.headers.get('content-type')).toContain('application/xml');
    const xml = await xmlOf(res);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
    expect(xml.endsWith('</urlset>')).toBe(true);
  });

  /**
   * The id goes straight into a URL. Anything that is not a UUID is dropped
   * rather than escaped, because there is no reason for it to be there and no
   * safe rendering of a guess.
   */
  it('drops anything whose id is not a UUID', async () => {
    vi.stubGlobal(
      'fetch',
      serving([[{ id: '../../etc/passwd' }, { id: 42 }, { id: null }, { id: ID }]]),
    );
    const xml = await xmlOf(await sitemap('https://api.test', ORIGIN));

    expect(xml).not.toContain('passwd');
    expect(xml).toContain(`/app/library/${ID}`);
    // four static paths plus the one good post
    expect(xml.match(/<url>/g)).toHaveLength(5);
  });

  it('stops at a short page rather than asking for another', async () => {
    const fetchMock = serving([[{ id: ID }]]);
    vi.stubGlobal('fetch', fetchMock);
    await sitemap('https://api.test', ORIGIN);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never asks for more than its page limit', async () => {
    const full = Array.from({ length: 100 }, () => ({ id: ID }));
    const fetchMock = serving([full, full, full, full, full, full, full]);
    vi.stubGlobal('fetch', fetchMock);
    await sitemap('https://api.test', ORIGIN);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  /*
   * Half a sitemap beats a 500, which a crawler can read as the whole site being
   * unavailable — and the four paths that need no API are still true.
   */
  it('still answers when the API does not', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    const res = await sitemap('https://api.test', ORIGIN);

    expect(res.status).toBe(200);
    const xml = await xmlOf(res);
    expect(xml).toContain('<loc>https://hevalo.app/</loc>');
    expect(xml.match(/<url>/g)).toHaveLength(4);
  });

  it('omits lastmod rather than inventing one', async () => {
    vi.stubGlobal('fetch', serving([[{ id: ID2 }]]));
    const xml = await xmlOf(await sitemap('https://api.test', ORIGIN));
    expect(xml).toContain(`<url><loc>https://hevalo.app/app/library/${ID2}</loc></url>`);
  });
});

describe('what a page tells a search engine it is', () => {
  const { staticHead, previewHead, STATIC_PAGES, REPLACED } = __test;
  const head = (tags: ReadonlyArray<string | ''>) => tags.filter(Boolean).join('');

  /**
   * The bug this whole section exists for. `index.html` carries one canonical
   * pointing at `/`, and the asset binding serves that same file for every
   * path — so every URL in the sitemap was asking not to be indexed, and the
   * library posts, the only pages worth finding, were asking loudest.
   */
  it('gives a page its own address, not the shell', () => {
    const url = 'https://hevalo.app/app/games';
    expect(head(staticHead(STATIC_PAGES[1]!, url))).toContain(`<link rel="canonical" href="${url}" />`);

    const post = 'https://hevalo.app/app/library/abc';
    const preview = { title: 'Helbest', description: 'Rêzek', image: null };
    expect(head(previewHead(preview, post))).toContain(`<link rel="canonical" href="${post}" />`);
  });

  /**
   * Appending without removing is invisible in the markup and decisive in the
   * result: everything that unfurls a link reads the *first* og:title, and the
   * shell's generic one comes first. A shared post carried the site's own card.
   */
  it('replaces every tag it writes, so nothing is said twice', () => {
    const preview = { title: 'Helbest', description: 'Rêzek', image: 'https://cdn.test/a.jpg' };
    // every meta the two heads write, whichever attribute names it
    const written = head(previewHead(preview, 'https://hevalo.app/app/library/abc'))
      + head(staticHead(STATIC_PAGES[0]!, 'https://hevalo.app/'));
    for (const [, kind, name] of written.matchAll(/(property|name)="([^"]+)"/g)) {
      expect(REPLACED, `${name} is written but never removed`).toContain(`meta[${kind}="${name}"]`);
    }
    expect(REPLACED).toContain('title');
    expect(REPLACED).toContain('link[rel="canonical"]');
  });

  /** Four URLs in the sitemap that said the same thing were four duplicates. */
  it('says something different on each listed page', () => {
    const titles = STATIC_PAGES.map((p) => p.title);
    const descriptions = STATIC_PAGES.map((p) => p.description);
    expect(new Set(titles).size).toBe(STATIC_PAGES.length);
    expect(new Set(descriptions).size).toBe(STATIC_PAGES.length);
    for (const p of STATIC_PAGES) {
      expect(p.description.length, p.path).toBeGreaterThan(50);
      expect(p.description.length, p.path).toBeLessThanOrEqual(160);
    }
  });

  it('escapes a title into the tags it builds', () => {
    const preview = { title: 'a "quote" & <tag>', description: 'x', image: null };
    const written = head(previewHead(preview, 'https://hevalo.app/app/library/abc'));
    expect(written).not.toContain('<tag>');
    expect(written).toContain('&quot;quote&quot;');
  });
});
