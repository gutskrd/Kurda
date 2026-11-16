/**
 * What goes into the head of a shared post.
 *
 * The risky half of this file is `attr`: a post is user-written text on its way
 * into an HTML attribute, so a miss there is a stored XSS that fires in every
 * chat app that unfurls the link. The rest is about a preview reading well —
 * ending on a word, naming the author, not claiming a picture it does not have.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { winCardName, winCardNames, winCards, winLinkUrl } from '@kurda/shared';
import worker, { __test } from './worker';
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
  it('lists About, the FAQ, the alphabet, Privacy, Terms and Copyright', async () => {
    vi.stubGlobal('fetch', serving([[]]));
    const xml = await xmlOf(await sitemap('https://api.test', ORIGIN));
    for (const path of ['/about', '/faq', '/app/alphabet', '/privacy', '/terms', '/copyright']) {
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

  it('keeps the dictionary’s security headers on its 404', async () => {
    // what the asset binding answers for a /ferheng/ address carries that path's `_headers` rules
    const served = new Response(shell, {
      status: 200,
      headers: {
        'content-type': 'text/html',
        'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
        'x-frame-options': 'DENY',
        'x-content-type-options': 'nosniff',
        'cache-control': 'public, max-age=3600',
        etag: '"shell"',
      },
    });
    const res = await ferheng(served, url, env, '/ferheng');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-security-policy')).toBe("default-src 'none'; frame-ancestors 'none'");
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    // the shell's caching and validators are not this page's
    expect(res.headers.get('cache-control')).toBeNull();
    expect(res.headers.get('etag')).toBeNull();
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

/**
 * A scanner asking for a PHP script or a secrets file is told nothing lives
 * there, without the asset binding being asked: the app shell with a 200 was
 * what made /wp-login.php look like a page worth another try.
 */
describe('a scanner’s probe', () => {
  const assets = vi.fn(async () => new Response('<!doctype html><div id="root"></div>', { status: 200, headers: { 'content-type': 'text/html' } }));
  const env = { ASSETS: { fetch: assets } } as unknown as Parameters<typeof worker.fetch>[1];
  const get = (path: string, method = 'GET') => worker.fetch(new Request(`https://hevalo.app${path}`, { method }), env);

  afterEach(() => assets.mockClear());

  it('is answered "not found" before the asset binding is asked', async () => {
    for (const path of ['/wp-login.php', '/.env', '/vendor/phpunit/src/Util/PHP/eval-stdin.php', '/index.php?s=x', '/cgi-bin/php-cgi', '/?-d+allow_url_include%3d1']) {
      const res = await get(path);
      expect(res.status, path).toBe(404);
      expect(res.headers.get('x-robots-tag'), path).toBe('noindex');
      expect(await res.text(), path).not.toContain('root');
    }
    expect((await get('/xmlrpc.php', 'POST')).status).toBe(404);
    expect(assets).not.toHaveBeenCalled();
  });

  it('leaves the app’s own addresses to the asset binding', async () => {
    for (const path of ['/app/library', '/ferheng', '/.well-known/assetlinks.json', '/app/civak?tab=friends']) {
      await get(path);
    }
    expect(assets).toHaveBeenCalledTimes(4);
  });
});

describe('an invitation to a game', () => {
  const { inviteHead, REPLACED } = __test;
  const head = (tags: ReadonlyArray<string | ''>) => tags.filter(Boolean).join('');
  const url = 'https://hevalo.app/join/impostor/KVXV5E';

  it('wears the game’s own card: its name, its picture, and the code said once more', () => {
    const tags = head(inviteHead({ game: 'impostor', code: 'KVXV5E', from: null }, url));
    expect(tags).toContain('<meta property="og:title" content="You’re invited to play Xapînok on Hevalo" />');
    expect(tags).toContain('<meta property="og:image" content="https://hevalo.app/invite/impostor.png" />');
    expect(tags).toContain('type KVX V5E.');
    expect(tags).toContain(`<link rel="canonical" href="${url}" />`);
    expect(tags).toContain('<meta name="twitter:card" content="summary_large_image" />');
  });

  it('shows the site’s card for a game with no picture of its own', () => {
    const tags = head(inviteHead({ game: 'stories', code: 'ABC234', from: null }, 'https://hevalo.app/join/stories/ABC234'));
    expect(tags).toContain('<meta property="og:image" content="https://hevalo.app/og.png" />');
    expect(tags).toContain('a Kurdish story game');
  });

  it('puts nothing of who shared it on the card', () => {
    const from = '0b1e2d3c-4a5f-4c6d-8e7f-9a0b1c2d3e4f';
    expect(head(inviteHead({ game: 'who-am-i', code: 'ABC234', from }, 'https://hevalo.app/join/who-am-i/ABC234'))).not.toContain(from);
  });

  it('writes no tag the shell’s copy of is left standing beside it', () => {
    const written = [...head(inviteHead({ game: 'impostor', code: 'KVXV5E', from: null }, url)).matchAll(/<(title|meta|link)\b[^>]*?(?:property|name|rel)?="?([^" >]*)"?/g)];
    expect(written.length).toBeGreaterThan(10);
    for (const selector of ['title', 'link[rel="canonical"]', 'meta[property="og:title"]', 'meta[property="og:image"]', 'meta[name="twitter:image"]', 'meta[name="description"]']) {
      expect(REPLACED).toContain(selector);
    }
  });
});

/**
 * A win somebody shared (shared: win-link.ts): the link under their line is
 * drawn as the postcard of that kind of win, and says nothing of whose it is.
 */
describe('a shared win', () => {
  const { winHead, REPLACED } = __test;
  const head = (tags: ReadonlyArray<string | ''>) => tags.filter(Boolean).join('');
  // kept in a name of its own: written inline, the bundler takes the address for a file to pack
  const here = import.meta.url;
  const cards = new URL('../public/share/', here);

  it('wears the postcard of its kind, and says what was done', () => {
    const url = 'https://hevalo.app/win/lesson';
    const tags = head(winHead({ kind: 'lesson' }, url));
    expect(tags).toContain('<meta property="og:title" content="One more Kurdish lesson done" />');
    expect(tags).toContain('<meta property="og:image" content="https://hevalo.app/share/lesson.png" />');
    expect(tags).toContain('<meta property="og:image:width" content="1200" />');
    expect(tags).toContain('<meta property="og:image:height" content="630" />');
    expect(tags).toContain(`<link rel="canonical" href="${url}" />`);
    expect(tags).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(tags).toContain('<meta name="twitter:image" content="https://hevalo.app/share/lesson.png" />');
  });

  it('says a streak’s days and a league’s own name, on the card that has them', () => {
    const streak = head(winHead({ kind: 'streak', days: 30 }, 'https://hevalo.app/win/streak/30'));
    expect(streak).toContain('content="30 days of Kurdish in a row"');
    expect(streak).toContain('https://hevalo.app/share/streak-30.png');
    const league = head(winHead({ kind: 'league', tier: 'cem' }, 'https://hevalo.app/win/league/cem'));
    expect(league).toContain('content="A good week in the Çem League"');
    expect(league).toContain('https://hevalo.app/share/league-cem.png');
  });

  it('says less where there is less to say: no days, one day, a streak with no card of its own, no league', () => {
    for (const days of [null, 1]) {
      const tags = head(winHead({ kind: 'streak', days }, 'https://hevalo.app/win/streak'));
      expect(tags, String(days)).toContain('content="A Kurdish streak, kept alive"');
      expect(tags, String(days)).toContain('https://hevalo.app/share/streak.png');
    }
    // 31 days are said, and drawn with the fire alone: only the days a streak is shared on have their figures drawn
    const odd = head(winHead({ kind: 'streak', days: 31 }, 'https://hevalo.app/win/streak/31'));
    expect(odd).toContain('content="31 days of Kurdish in a row"');
    expect(odd).toContain('https://hevalo.app/share/streak.png');
    const league = head(winHead({ kind: 'league', tier: null }, 'https://hevalo.app/win/league'));
    expect(league).toContain('content="A good week in the league"');
    expect(league).toContain('https://hevalo.app/share/league.png');
  });

  it('names the word game and not how it went: the same link is under a game that was lost', () => {
    const tags = head(winHead({ kind: 'peyvok' }, 'https://hevalo.app/win/peyvok'));
    expect(tags).toContain('content="Peyvok: the day’s Kurdish word"');
    expect(tags).not.toMatch(/solved|won|\d\/6/i);
  });

  it('has a title and a line for every win, short enough to be shown whole', () => {
    for (const win of winCards()) {
      const tags = head(winHead(win, winLinkUrl('https://hevalo.app', win)));
      const title = /<meta property="og:title" content="([^"]*)"/.exec(tags)?.[1] ?? '';
      const line = /<meta property="og:description" content="([^"]*)"/.exec(tags)?.[1] ?? '';
      expect(title.length, winCardName(win)).toBeGreaterThan(8);
      expect(title.length, winCardName(win)).toBeLessThanOrEqual(60);
      expect(line.length, winCardName(win)).toBeGreaterThan(20);
      expect(line.length, winCardName(win)).toBeLessThanOrEqual(120);
      expect(tags, winCardName(win)).toContain(`<title>${title}</title>`);
    }
  });

  /*
   * The pictures are read from the disk, as the files the site will serve. A
   * test runs on a machine with files, while this workspace's types are the
   * browser's: the two things asked of that machine are described here in
   * full, so nothing else of it becomes something the app could reach for.
   */
  interface FileSystem {
    readFileSync(file: URL): Uint8Array;
    readdirSync(folder: URL): string[];
  }
  const fileSystem = 'node:fs';

  it('has the picture of every card in the site’s public folder, at the size the head says', async () => {
    const { readFileSync } = (await import(/* @vite-ignore */ fileSystem)) as FileSystem;
    for (const name of winCardNames()) {
      const png = readFileSync(new URL(`${name}.png`, cards));
      // a PNG says what it is in its first bytes, and its width and height in its first chunk, each as four bytes
      expect(String.fromCharCode(...png.subarray(1, 4)), name).toBe('PNG');
      const sizes = new DataView(png.buffer, png.byteOffset, png.byteLength);
      expect([sizes.getUint32(16), sizes.getUint32(20)], name).toEqual([1200, 630]);
      // light enough for a phone to fetch in the middle of a conversation
      expect(png.byteLength, name).toBeLessThan(120_000);
    }
  });

  it('keeps no picture nobody’s link is drawn with', async () => {
    const { readdirSync } = (await import(/* @vite-ignore */ fileSystem)) as FileSystem;
    expect(readdirSync(cards).sort()).toEqual(winCardNames().map((name) => `${name}.png`).sort());
  });

  it('writes no tag the shell’s copy of is left standing beside it', () => {
    const written = [...head(winHead({ kind: 'badge' }, 'https://hevalo.app/win/badge')).matchAll(/<(?:meta|link)\b[^>]*?(property|name|rel)="([^"]*)"/g)];
    expect(written.length).toBeGreaterThan(10);
    for (const [, by, what] of written) {
      const selector = by === 'rel' ? `link[rel="${what}"]` : `meta[${by}="${what}"]`;
      expect(REPLACED, selector).toContain(selector);
    }
    expect(REPLACED).toContain('title');
  });

  describe('through the edge script', () => {
    /** The runtime's rewriter, as much of it as the script uses: what would be taken out of the head, and what is put in. */
    class Rewriter {
      private readonly asked: Array<[string, { element: (el: { remove(): void; append(content: string, options: { html: boolean }): void }) => void }]> = [];
      on(selector: string, handlers: { element: (el: { remove(): void; append(content: string, options: { html: boolean }): void }) => void }): this {
        this.asked.push([selector, handlers]);
        return this;
      }
      transform(response: Response): Response {
        let written = '';
        for (const [selector, handlers] of this.asked) {
          if (selector === 'head') handlers.element({ remove: () => undefined, append: (content) => void (written += content) });
        }
        return new Response(written, { status: response.status, headers: response.headers });
      }
    }
    const shell = '<!doctype html><head><title>Hevalo</title></head><div id="root"></div>';
    const assets = vi.fn(async () => new Response(shell, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }));
    const env = { ASSETS: { fetch: assets } } as unknown as Parameters<typeof worker.fetch>[1];
    const get = (path: string) => worker.fetch(new Request(`https://hevalo.app${path}`), env);

    afterEach(() => {
      assets.mockClear();
      vi.unstubAllGlobals();
    });

    it('gives a win’s address the win’s head, and keeps the page out of search', async () => {
      vi.stubGlobal('HTMLRewriter', Rewriter);
      const res = await get('/win/streak/30');
      const tags = await res.text();
      expect(res.status).toBe(200);
      expect(res.headers.get('x-robots-tag')).toBe('noindex');
      expect(tags).toContain('<meta property="og:image" content="https://hevalo.app/share/streak-30.png" />');
      expect(tags).toContain('<link rel="canonical" href="https://hevalo.app/win/streak/30" />');
    });

    it('calls a win by its own address, whatever was added to it or mistyped after it', async () => {
      vi.stubGlobal('HTMLRewriter', Rewriter);
      for (const [path, canonical] of [
        ['/win/lesson?ref=chat', '/win/lesson'],
        ['/win/lesson/', '/win/lesson'],
        ['/win/streak/many', '/win/streak'],
        ['/win/league/gold', '/win/league'],
        ['/win/badge/anything', '/win/badge'],
      ] as const) {
        const tags = await (await get(path)).text();
        expect(tags, path).toContain(`<link rel="canonical" href="https://hevalo.app${canonical}" />`);
        expect(tags, path).toContain(`<meta property="og:url" content="https://hevalo.app${canonical}" />`);
      }
    });

    it('leaves an address that is no win’s to the app, untouched', async () => {
      // no rewriter is there to be asked: reaching for one would throw
      for (const path of ['/win', '/win/', '/win/profile', '/win/lesson/a/b', '/winner/lesson', '/app/win/lesson']) {
        const res = await get(path);
        expect(await res.text(), path).toBe(shell);
        expect(res.headers.get('x-robots-tag'), path).toBeNull();
      }
    });

    it('rewrites nothing that is not a page: a picture at a win’s address stays a picture', async () => {
      assets.mockImplementationOnce(async () => new Response('png', { status: 200, headers: { 'content-type': 'image/png' } }));
      expect(await (await get('/win/lesson')).text()).toBe('png');
    });
  });
});
