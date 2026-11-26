import { describe, expect, it, vi } from 'vitest';
import { __test } from './worker';

interface FileSystem {
  readFileSync(file: URL, encoding?: 'utf8'): string;
}
// Read from disk wherever the suite runs from; the module name is a variable so the app's build leaves it alone.
const fileSystem = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ fileSystem)) as FileSystem;
const here = import.meta.url;

/**
 * What a search engine reads of the public site: every listed page has its own title, description and canonical; the
 * shell's head (which is the front page's) says what Hevalo is, with honest structured data; robots.txt opens the
 * public pages and closes the account and API paths; and the sitemap is well-formed and lists every public page.
 */
const { STATIC_PAGES, staticHead, sitemap } = __test;
const shell = readFileSync(new URL('../index.html', here), 'utf8');
const robots = readFileSync(new URL('../public/robots.txt', here), 'utf8');

describe('what a search engine reads of the public pages', () => {
  it('gives every listed page a title and a description of its own, in lengths a result shows whole', () => {
    const titles = new Set<string>();
    const descriptions = new Set<string>();
    for (const page of STATIC_PAGES) {
      expect(page.title.length, page.path).toBeGreaterThanOrEqual(10);
      expect(page.title.length, page.path).toBeLessThanOrEqual(70);
      expect(page.description.length, page.path).toBeGreaterThanOrEqual(50);
      expect(page.description.length, page.path).toBeLessThanOrEqual(200);
      titles.add(page.title);
      descriptions.add(page.description);
    }
    expect(titles.size).toBe(STATIC_PAGES.length);
    expect(descriptions.size).toBe(STATIC_PAGES.length);
  });

  it('names each listed page by its own address, without the query', () => {
    for (const page of STATIC_PAGES) {
      const url = `https://hevalo.app${page.path}`;
      const head = staticHead(page, url).join('');
      expect(head, page.path).toContain(`<link rel="canonical" href="${url}" />`);
      expect(head, page.path).toContain('<meta name="description"');
      expect(head, page.path).toContain('<title>');
    }
  });

  it('lists the front page, the pages about Hevalo, the legal pages and the public library pages', () => {
    const paths = STATIC_PAGES.map((p) => p.path);
    for (const path of ['/', '/about', '/faq', '/how-hevalo-teaches', '/privacy', '/terms', '/copyright', '/app/games', '/app/learn/stories', '/app/alphabet']) {
      expect(paths).toContain(path);
    }
  });

  it('heads the shell with a description, a canonical, a preview card and a picture', () => {
    expect(shell).toMatch(/<meta\s+name="description"\s+content="[^"]{50,}"/);
    expect(shell).toContain('<link rel="canonical" href="https://hevalo.app/" />');
    for (const tag of ['og:title', 'og:description', 'og:image', 'og:url', 'og:type']) expect(shell).toContain(`property="${tag}"`);
    expect(shell).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(readFileSync(new URL('../public/og.png', here)).length).toBeGreaterThan(1000);
  });

  it('describes the site and who makes it in structured data that claims only what is true', () => {
    const block = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(shell)?.[1];
    const data = JSON.parse(block!) as { '@graph': Array<Record<string, unknown>> };
    const types = data['@graph'].map((n) => n['@type']);
    expect(types).toEqual(expect.arrayContaining(['WebSite', 'WebApplication', 'Organization']));
    // no ratings, reviews, prices or store listings: the apps are not out
    expect(block).not.toMatch(/aggregateRating|review|offers|price|MobileApplication|downloadUrl|installUrl/i);
  });
});

describe('robots.txt', () => {
  const lines = robots.split('\n').map((l) => l.replace(/#.*/, '').trim()).filter(Boolean);
  const rule = (name: string): string[] => lines.filter((l) => l.toLowerCase().startsWith(`${name.toLowerCase()}:`)).map((l) => l.slice(name.length + 1).trim());

  it('is a well-formed file: every line a field it knows, for every crawler', () => {
    for (const line of lines) expect(line, line).toMatch(/^(User-agent|Allow|Disallow|Sitemap):\s*\S/i);
    expect(rule('User-agent')).toEqual(['*']);
  });

  it('opens the public pages and closes the account and API paths', () => {
    expect(rule('Allow')).toContain('/');
    const closed = rule('Disallow');
    for (const path of ['/api/', '/login', '/register', '/app/settings', '/app/messages']) expect(closed).toContain(path);
    for (const page of STATIC_PAGES) expect(closed.some((c) => page.path.startsWith(c)), page.path).toBe(false);
  });

  it('points to the sitemaps by their full addresses', () => {
    const maps = rule('Sitemap');
    expect(maps).toContain('https://hevalo.app/sitemap.xml');
    for (const url of maps) expect(url).toMatch(/^https:\/\/hevalo\.app\/[\w/]*sitemap\.xml$/);
  });
});

describe('the sitemap', () => {
  it('is well-formed XML listing every public page by its full address', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ posts: [] }), { status: 200 })));
    const xml = await (await sitemap('https://api.example', 'https://hevalo.app')).text();
    vi.unstubAllGlobals();
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    expect(doc.documentElement.getAttribute('xmlns')).toBe('http://www.sitemaps.org/schemas/sitemap/0.9');
    const locs = [...doc.getElementsByTagName('loc')].map((l) => l.textContent);
    for (const page of STATIC_PAGES) expect(locs).toContain(`https://hevalo.app${page.path}`);
  });
});
