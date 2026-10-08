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
import { SOURCES, SOURCE_ORDER } from './teaching/sources';

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

  /** The pages about Hevalo itself are pages a search engine should find. */
  it('lists About, the FAQ, the alphabet, Privacy and Terms', async () => {
    vi.stubGlobal('fetch', serving([[]]));
    const xml = await xmlOf(await sitemap('https://api.test', ORIGIN));
    for (const path of ['/about', '/faq', '/app/alphabet', '/privacy', '/terms']) {
      expect(xml, path).toContain(`<loc>https://hevalo.app${path}</loc>`);
    }
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
    // the static paths plus the one good post
    expect(xml.match(/<url>/g)).toHaveLength(__test.STATIC_PAGES.length + 1);
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
    expect(xml.match(/<url>/g)).toHaveLength(__test.STATIC_PAGES.length);
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

/**
 * How Hevalo teaches, as a crawler and a link preview read it: its own head,
 * and an Article whose citations are the studies the page itself cites.
 */
describe('the teaching page, for a search engine', () => {
  const { staticHead, jsonLd, STATIC_PAGES } = __test;
  const URL_ = 'https://hevalo.app/how-hevalo-teaches';
  const page = STATIC_PAGES.find((p) => p.path === '/how-hevalo-teaches')!;
  const head = () => staticHead(page, URL_).filter(Boolean).join('');
  interface Citation {
    '@type': string;
    url: string;
    author: unknown[];
    datePublished: string;
    pagination?: string;
    isPartOf: unknown;
  }
  interface ArticleLd {
    '@context': string;
    '@type': string;
    url: string;
    isPartOf: unknown;
    publisher: unknown;
    citation: Citation[];
  }
  const article = (): ArticleLd => {
    const m = /<script type="application\/ld\+json">(.*?)<\/script>/s.exec(head());
    expect(m, 'no JSON-LD in the head').not.toBeNull();
    return JSON.parse(m![1]!) as ArticleLd;
  };
  const cited = (url: string): Citation => article().citation.find((c) => c.url === url)!;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is a listed page with a head of its own', () => {
    expect(page).toBeDefined();
    const written = head();
    expect(written).toContain('<title>How Hevalo teaches — and the research behind it</title>');
    expect(written).toContain(`<link rel="canonical" href="${URL_}" />`);
    expect(written).toContain('<meta property="og:type" content="article" />');
    expect(written).toContain('what it does not claim, and the studies to read');
  });

  it('is in the sitemap', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ posts: [] }))));
    const xml = await (await __test.sitemap('https://api.test', 'https://hevalo.app')).text();
    expect(xml).toContain(`<loc>${URL_}</loc>`);
  });

  it('describes itself as an article that cites every study on the page, in the page’s order', () => {
    const a = article();
    expect(a['@context']).toBe('https://schema.org');
    expect(a['@type']).toBe('Article');
    expect(a.url).toBe(URL_);
    expect(a.isPartOf).toEqual({ '@id': 'https://hevalo.app/#website' });
    expect(a.publisher).toEqual({ '@id': 'https://zagrosian.com/#organization' });
    expect(a.citation.map((c) => c.url)).toEqual(SOURCE_ORDER.map((id) => SOURCES[id].url));
    for (const c of a.citation) {
      expect(c['@type']).toBe('ScholarlyArticle');
      expect(c.author.length).toBeGreaterThan(0);
      expect(c.datePublished).toMatch(/^\d{4}$/);
    }
  });

  it('nests a journal paper in its issue, volume and journal', () => {
    const roediger = cited(SOURCES.roediger2006.url);
    expect(roediger.pagination).toBe('249–255');
    expect(roediger.isPartOf).toEqual({
      '@type': 'PublicationIssue',
      issueNumber: '3',
      isPartOf: {
        '@type': 'PublicationVolume',
        volumeNumber: '17',
        isPartOf: { '@type': 'Periodical', name: 'Psychological Science' },
      },
    });
    expect(roediger.author[0]).toEqual({ '@type': 'Person', familyName: 'Roediger', name: 'H. L. Roediger' });
  });

  it('does not call conference proceedings a journal', () => {
    const settles = cited(SOURCES.settlesMeeder2016.url);
    expect(settles.isPartOf).toEqual({ '@type': 'CreativeWork', name: 'Proceedings of ACL 2016' });
  });

  it('claims no date it does not have', () => {
    expect(article()).not.toHaveProperty('datePublished');
  });

  /** JSON is not HTML: a string holding </script> must not end the block early. */
  it('cannot be closed from inside a string', () => {
    const hostile = { name: '</script><script>alert(1)</script> & <!--' };
    const block = jsonLd(hostile);
    expect(block.indexOf('</script>')).toBe(block.length - '</script>'.length);
    expect(block).not.toContain('<!--');
    const body = block.slice('<script type="application/ld+json">'.length, -'</script>'.length);
    expect(JSON.parse(body)).toEqual(hostile);
  });

  it('leaves every other page a website with no data block of its own', () => {
    for (const p of STATIC_PAGES.filter((x) => x !== page)) {
      const written = staticHead(p, `https://hevalo.app${p.path}`).filter(Boolean).join('');
      expect(written, p.path).toContain('<meta property="og:type" content="website" />');
      expect(written, p.path).not.toContain('application/ld+json');
    }
  });
});

/**
 * The blank page.
 *
 * Cloudflare answers a path it has no file for with the SPA shell, and
 * `public/_headers` applies the dictionary's policy by URL rather than by file.
 * So a stale /ferheng/ link was served the app shell under `default-src
 * 'none'`, the shell's own bundle was refused, and the reader got nothing at
 * all — with a 200 on it, so a crawler was told the page was fine.
 *
 * Stale links are the normal case, not the odd one: page boundaries follow how
 * the words divide, so a re-import moves every range URL the last build had.
 */
describe('a dictionary address with no page behind it', () => {
  const { ferheng } = __test;

  const shell = '<!doctype html><html><body><div id="root"></div><script src="/assets/index-x.js"></script></body></html>';
  const page = '<!doctype html><html lang="ku"><head><link rel="stylesheet" href="/ferheng/ferheng.css"></head><body>sêv</body></html>';
  const url = new URL('https://hevalo.app/ferheng/sa-sc/');
  const env = {
    ASSETS: { fetch: vi.fn(async () => new Response('<p>Ev rûpel nehat dîtin.</p>', { status: 200 })) },
  } as unknown as Parameters<typeof ferheng>[2];

  it('answers with the dictionary’s own 404, not the app shell', async () => {
    const res = await ferheng(new Response(shell, { status: 200 }), url, env, '/ferheng');
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('nehat dîtin');
  });

  it('leaves a real dictionary page exactly as it found it', async () => {
    const res = await ferheng(new Response(page, { status: 200 }), url, env, '/ferheng');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(page);
  });

  /**
   * The dictionary is published once per language, at sibling paths. A dead
   * /dictionary/ address must not be answered in Kurmancî, and an English page
   * must not be mistaken for the shell because it links a different stylesheet.
   */
  it('answers each language from its own folder', async () => {
    const english = page.replace('/ferheng/ferheng.css', '/dictionary/ferheng.css').replace('lang="ku"', 'lang="en"');
    const enUrl = new URL('https://hevalo.app/dictionary/sa-sc/');

    const kept = await ferheng(new Response(english, { status: 200 }), enUrl, env, '/dictionary');
    expect(kept.status).toBe(200);
    expect(await kept.text()).toBe(english);

    const missing = await ferheng(new Response(shell, { status: 200 }), enUrl, env, '/dictionary');
    expect(missing.status).toBe(404);
    expect(vi.mocked(env.ASSETS.fetch).mock.calls.at(-1)?.[0]).toMatchObject({
      url: 'https://hevalo.app/dictionary/404.html',
    });
  });

  /** A path that is neither belongs to the app, and is left alone. */
  it('claims only the dictionary paths', () => {
    const { dictionaryOf } = __test;
    expect(dictionaryOf('/ferheng/se/')).toBe('/ferheng');
    expect(dictionaryOf('/dictionary/se/')).toBe('/dictionary');
    expect(dictionaryOf('/app/library/abc')).toBeNull();
    // the bare path is the app's own route, not a page in either dictionary
    expect(dictionaryOf('/dictionary')).toBeNull();
  });
});
