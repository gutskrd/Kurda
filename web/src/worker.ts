/**
 * What a Hevalo link looks like when it is pasted somewhere else.
 *
 * The app is a Vite SPA: the server sends one `index.html` for every path and
 * React fills it in. That is fine for a reader and useless for everything that
 * unfurls a link — WhatsApp, Telegram, iMessage, Slack, Twitter, Facebook — none
 * of which runs the JavaScript that would set the title. Every post shared out
 * of Hevalo arrived as the same grey card, whichever
 * post it was.
 *
 * So a post's URL gets its real title, its author, its first lines and its
 * picture written into the HTML head before the page leaves the edge. Everything
 * else is served exactly as before: static assets straight from the bundle, and
 * the SPA shell for every other path.
 *
 * Three rules hold this together, and all three matter:
 *
 *   1. Only two URL shapes are ever looked up, and only after the id parses as a
 *      UUID. The worker is not a proxy for whatever path someone asks for.
 *   2. Everything from the API is escaped on the way into the markup. A post is
 *      user-written text going into HTML attributes — it is the one place in
 *      this file where a mistake is a stored XSS.
 *   3. A slow or broken API costs the reader nothing: the shell goes out
 *      unchanged. A preview is a nicety; the page is not.
 */

/*
 * The two pieces of the Workers runtime this file uses, declared here rather
 * than pulled in from @cloudflare/workers-types.
 *
 * That package replaces the DOM lib rather than sitting beside it, and this is
 * one file in a sixty-file browser app that needs `document`. Two small
 * interfaces cost less than a global type conflict across all of it, and they
 * say exactly what is being relied on.
 */
interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

interface RewriterElement {
  remove(): void;
  append(content: string, options: { html: boolean }): void;
}

declare class HTMLRewriter {
  on(selector: string, handlers: { element: (element: RewriterElement) => void }): HTMLRewriter;
  transform(response: Response): Response;
}

interface Env {
  ASSETS: Fetcher;
  /** Origin of the API, e.g. https://kurda-api.onrender.com */
  API_ORIGIN?: string;
}

const DEFAULT_API = 'https://kurda-api.onrender.com';

/** How long the edge may reuse a rendered preview. */
const PREVIEW_TTL_SECONDS = 300;
/** A slow API must not hold the page up. */
const API_TIMEOUT_MS = 2_000;

/** Lengths that read well in an unfurled card rather than being truncated by it. */
const MAX_TITLE = 70;
const MAX_DESCRIPTION = 200;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The two kinds of post that have a page of their own. */
type PostRoute = { api: string; kind: 'library' | 'image' };

/**
 * Which post, if any, this path is.
 *
 * Deliberately a fixed table rather than anything derived from the path: the id
 * is the only part that varies, and it has to be a UUID before it is put in a
 * URL. Anything else falls through to the SPA, which is what it did before.
 */
function routeFor(pathname: string): PostRoute | null {
  const library = /^\/app\/library\/([^/]+)\/?$/.exec(pathname);
  if (library && UUID.test(library[1]!)) return { api: `/library/posts/${library[1]}`, kind: 'library' };

  const picture = /^\/app\/dimen\/([^/]+)\/?$/.exec(pathname);
  if (picture && UUID.test(picture[1]!)) return { api: `/images/${picture[1]}`, kind: 'image' };

  return null;
}

/** Escape for an HTML attribute value. Everything below is user-written. */
function attr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Collapse whitespace and cut on a word boundary, so a preview ends cleanly. */
function trim(value: string, max: number): string {
  const flat = value.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

interface Preview {
  title: string;
  description: string;
  image: string | null;
}

/** What a post says about itself, in the shape a link preview wants. */
function previewOf(post: Record<string, unknown>, kind: PostRoute['kind']): Preview | null {
  const author = post.author as { username?: string } | undefined;
  const by = typeof author?.username === 'string' ? author.username : null;

  const rawTitle = typeof post.title === 'string' ? post.title : '';
  const rawBody = typeof post.body === 'string' ? post.body : typeof post.caption === 'string' ? post.caption : '';

  // a picture usually has no title, so the byline becomes the headline
  const headline = rawTitle.trim() || (kind === 'image' ? 'A picture on Hevalo' : 'A post on Hevalo');
  const title = by ? `${trim(headline, MAX_TITLE)} · @${by}` : trim(headline, MAX_TITLE);

  const description = rawBody.trim()
    ? trim(rawBody, MAX_DESCRIPTION)
    : 'Read it on Hevalo — stories, poems and pictures in Kurdish.';

  const image = typeof post.imageUrl === 'string' && /^https:\/\//.test(post.imageUrl) ? post.imageUrl : null;

  if (!title) return null;
  return { title, description, image };
}

/** Ask the API for one post. Never throws, never waits long. */
async function fetchPost(apiOrigin: string, path: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${apiOrigin}${path}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
      // the post is public and the same for everyone, so the edge may keep it
      cf: { cacheTtl: PREVIEW_TTL_SECONDS, cacheEverything: true },
    } as RequestInit);
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Every tag this file writes, and therefore every tag it has to take out first.
 *
 * Appending without removing was the bug, and it was invisible from the markup:
 * the page ends up with two `og:title`s, the shell's generic one **first**, and
 * everything that unfurls a link reads the first. So a shared post carried the
 * site's own card — "Hevalo", the landing-page blurb, the home page's URL —
 * which is exactly the thing this worker was written to stop.
 *
 * A `<title>` was already being removed, which is why the browser tab looked
 * right and the card did not.
 */
const REPLACED = [
  'title',
  'link[rel="canonical"]',
  'meta[name="description"]',
  'meta[property="og:type"]',
  'meta[property="og:site_name"]',
  'meta[property="og:title"]',
  'meta[property="og:description"]',
  'meta[property="og:url"]',
  'meta[property="og:image"]',
  'meta[property="og:image:width"]',
  'meta[property="og:image:height"]',
  'meta[property="og:image:alt"]',
  'meta[name="twitter:card"]',
  'meta[name="twitter:title"]',
  'meta[name="twitter:description"]',
  'meta[name="twitter:image"]',
];

/**
 * Swap the shell's head for this page's.
 *
 * `HTMLRewriter` streams, so this costs nothing in memory and adds no round
 * trip. Anything the new tags cover is removed on the way past rather than
 * duplicated — a document with two of a tag is a document whose meaning is
 * whichever one the reader happens to take.
 */
function withHead(html: Response, tags: ReadonlyArray<string | ''>): Response {
  const rewriter = new HTMLRewriter();
  for (const selector of REPLACED) rewriter.on(selector, { element: (el) => el.remove() });
  return rewriter
    .on('head', { element: (el) => el.append(tags.filter(Boolean).join(''), { html: true }) })
    .transform(html);
}

/** What a post says about itself, as a head. */
function previewHead(preview: Preview, url: string): Array<string | ''> {
  return [
    `<title>${attr(preview.title)}</title>`,
    `<meta name="description" content="${attr(preview.description)}" />`,
    `<link rel="canonical" href="${attr(url)}" />`,
    `<meta property="og:type" content="article" />`,
    `<meta property="og:site_name" content="Hevalo" />`,
    `<meta property="og:title" content="${attr(preview.title)}" />`,
    `<meta property="og:description" content="${attr(preview.description)}" />`,
    `<meta property="og:url" content="${attr(url)}" />`,
    preview.image ? `<meta property="og:image" content="${attr(preview.image)}" />` : '',
    `<meta name="twitter:card" content="${preview.image ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${attr(preview.title)}" />`,
    `<meta name="twitter:description" content="${attr(preview.description)}" />`,
    preview.image ? `<meta name="twitter:image" content="${attr(preview.image)}" />` : '',
  ];
}

/**
 * The head a listed, non-post page should have had all along.
 *
 * The canonical is the reason this exists. `index.html` carries
 * `<link rel="canonical" href="https://hevalo.app/">` and the asset binding
 * hands that same file to every path, so **every URL on the site was telling
 * search engines it was a duplicate of the home page** — the library posts
 * included, which are the only pages here anyone would search for. A sitemap of
 * five URLs, four of which asked not to be indexed, and the fifth of which had
 * already been collapsed into the first.
 *
 * Only the paths that really are pages get one. An unknown path still gets the
 * shell, and the shell pointing at `/` is the right answer for it: a typo under
 * `/app/` is not a page, and a canonical of its own would invite a crawler to
 * collect them.
 */
function staticHead(page: { title: string; description: string }, url: string): Array<string | ''> {
  return [
    `<title>${attr(page.title)}</title>`,
    `<meta name="description" content="${attr(page.description)}" />`,
    `<link rel="canonical" href="${attr(url)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Hevalo" />`,
    `<meta property="og:url" content="${attr(url)}" />`,
    `<meta property="og:title" content="${attr(page.title)}" />`,
    `<meta property="og:description" content="${attr(page.description)}" />`,
    `<meta property="og:image" content="${attr(new URL('/og.png', url).toString())}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="Hevalo — Learn Kurdish. Play together." />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${attr(page.title)}" />`,
    `<meta name="twitter:description" content="${attr(page.description)}" />`,
    `<meta name="twitter:image" content="${attr(new URL('/og.png', url).toString())}" />`,
  ];
}

/** How long the edge may reuse the sitemap. It only changes when somebody publishes. */
const SITEMAP_TTL_SECONDS = 3_600;
/** Bounded: five pages of a hundred is five hundred posts, and a fixed cost. */
const SITEMAP_PAGES = 5;
const SITEMAP_PAGE_SIZE = 100;

/**
 * The paths worth submitting that are not a post, and what each one is.
 *
 * The shell says the same thing on all of them, because the shell is written
 * once and React fills in the rest — so a crawler, which does not run React,
 * read four copies of the landing page under four URLs. Search engines answer
 * that by keeping one and dropping the others, which is the correct response to
 * four identical pages and the wrong outcome for four different ones.
 *
 * The copy is English and stays English: this is the head a crawler gets, and a
 * crawler has no account and no locale to read one from. The app itself is
 * translated the moment it starts.
 */
const STATIC_PAGES: ReadonlyArray<{ path: string; title: string; description: string }> = [
  /*
   * The front door is the one page whose title is more than the name. It is the
   * result somebody looking for a way to learn Kurdish is shown, and "Hevalo" on
   * its own tells them nothing; see `usePageMeta`, which gives the rendered page
   * the same title in the reader's own language.
   */
  {
    path: '/',
    title: 'Hevalo — Learn Kurdish and Kurmanji with friends',
    description:
      'Learn Kurdish with your friends: Kurmanji word games, head-to-head challenges, a free Kurdish dictionary and a community. Free, in your browser.',
  },
  /*
   * The wall, described as what it is. It used to promise "short lessons" here
   * too, which the browser does not have — the lessons are in the phone app.
   */
  {
    path: '/app',
    title: 'Kurdish stories, poems and pictures · Hevalo',
    description:
      'Stories, poems and pictures in Kurmancî and Soranî, posted by the people learning and speaking Kurdish on Hevalo. Open to read, no account needed.',
  },
  {
    path: '/app/games',
    title: 'Kurdish word games · Hevalo',
    description:
      'Wordle, rhyming rounds and quizzes played in Kurdish, against a dictionary of hundreds of thousands of words.',
  },
  {
    path: '/app/rankings',
    title: 'Rankings · Hevalo',
    description: 'Who is furthest along on Hevalo this week — by XP, by streak and by game.',
  },
  {
    path: '/about',
    title: 'About Hevalo — Kurdish, learned together',
    description:
      'Why Hevalo exists, what it does today and what comes next: a place to learn Kurdish, Kurmanji first, through games, friends and a community.',
  },
  {
    path: '/faq',
    title: 'Questions about Hevalo · FAQ',
    description:
      'Is Hevalo free? Which Kurdish does it teach? How do you play with friends, and where are the lessons? Straight answers about learning Kurdish on Hevalo.',
  },
  {
    path: '/privacy',
    title: 'Privacy · Hevalo',
    description:
      'What Hevalo keeps, why, and what you control. No ads, no tracking across other apps and websites, and your data is never sold.',
  },
  {
    path: '/terms',
    title: 'Terms · Hevalo',
    description:
      'The rules for using Hevalo, in plain words: your account, how to treat other people, what you post, and how Zêr and gems work.',
  },
];

const STATIC_PATHS = STATIC_PAGES.map((p) => p.path);

/**
 * The sitemap, built from what is actually published.
 *
 * A static file would list the four paths above and nothing else, which misses
 * the only pages here worth finding: the library of Kurdish stories and poems.
 * Those are rows in a database, so the list has to come from the API —
 * `GET /library/posts` is public and returns only `status = 'published'`, which
 * is exactly the set that belongs in a sitemap.
 *
 * Bounded on purpose. An unbounded loop at the edge is a request that gets
 * slower every time somebody writes a poem.
 *
 * A failed fetch still returns a valid sitemap with the static paths in it: half
 * a sitemap is worth more than a 500, which a crawler can read as the whole site
 * being unavailable.
 */
async function sitemap(apiOrigin: string, origin: string): Promise<Response> {
  const urls: Array<{ loc: string; lastmod?: string }> = STATIC_PATHS.map((p) => ({ loc: origin + p }));

  for (let page = 0; page < SITEMAP_PAGES; page++) {
    const offset = page * SITEMAP_PAGE_SIZE;
    const body = await fetchPost(apiOrigin, `/library/posts?limit=${SITEMAP_PAGE_SIZE}&offset=${offset}`);
    const posts = Array.isArray((body as { posts?: unknown } | null)?.posts)
      ? (body as { posts: unknown[] }).posts
      : null;
    if (!posts || posts.length === 0) break;

    for (const raw of posts) {
      const post = raw as { id?: unknown; updatedAt?: unknown; publishedAt?: unknown };
      // the id goes straight into a URL, so it is a UUID or it is nothing
      if (typeof post.id !== 'string' || !UUID.test(post.id)) continue;
      const when = typeof post.updatedAt === 'string' ? post.updatedAt : post.publishedAt;
      urls.push({
        loc: `${origin}/app/library/${post.id}`,
        lastmod: typeof when === 'string' ? when.slice(0, 10) : undefined,
      });
    }

    // a short page is the last page
    if (posts.length < SITEMAP_PAGE_SIZE) break;
  }

  const entries = urls
    .map((u) => {
      const lastmod = u.lastmod ? `<lastmod>${attr(u.lastmod)}</lastmod>` : '';
      return `<url><loc>${attr(u.loc)}</loc>${lastmod}</url>`;
    })
    .join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</urlset>`;

  return new Response(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': `public, max-age=0, s-maxage=${SITEMAP_TTL_SECONDS}`,
    },
  });
}

/**
 * The published dictionary, which is files rather than a screen in the app —
 * one folder per language it is published in.
 *
 * `/ferheng/` is Kurmancî and `/dictionary/` is English. They are siblings
 * rather than one nested under the other because everything a level under them
 * is a letter or a range of words, named from the corpus, and both `ku` and
 * `en` are plausible range names. See web/scripts/ferheng-copy.ts.
 */
const DICTIONARIES = ['/ferheng', '/dictionary'] as const;

/** Which of them a path belongs to, or null if it belongs to neither. */
function dictionaryOf(pathname: string): string | null {
  return DICTIONARIES.find((d) => pathname.startsWith(`${d}/`)) ?? null;
}

/**
 * A dictionary address, answered as a dictionary address.
 *
 * Cloudflare serves the SPA shell for any path it has no file for, and
 * `public/_headers` applies the dictionary's policy by URL rather than by file.
 * So a stale /ferheng/ link got the app shell under `default-src 'none'`, the
 * shell's own bundle was refused, React never booted, and the reader was left
 * looking at nothing at all. Measured live on /ferheng/sa-sc/: "Loading the
 * script … violates the following Content Security Policy directive:
 * default-src 'none'". It was a 200, too, so a crawler was told the page was
 * fine.
 *
 * The shell is recognised by the one thing every real dictionary page has and
 * it does not: a link to the dictionary's own stylesheet. Reading the body is
 * affordable here — these pages carry a day of edge cache, so the Worker sees
 * them rarely, and an unmatched path reaches the Worker either way.
 */
async function ferheng(assets: Response, url: URL, env: Env, base: string): Promise<Response> {
  const html = await assets.text();
  if (html.includes(`${base}/ferheng.css`)) {
    // a real page; hand back exactly what the asset binding gave us
    return new Response(html, { status: assets.status, headers: assets.headers });
  }

  // the 404 of the language whose path was asked for, so a reader who typed a
  // dead /dictionary/ address is not answered in Kurmancî
  const page = await env.ASSETS.fetch(new Request(new URL(`${base}/404.html`, url.origin).toString()));
  return new Response(page.body, {
    status: 404,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    /*
     * Built here rather than shipped as a file in the bundle, because it has to
     * list what is published now — not what was published when the site was last
     * deployed. Answered before the asset binding is asked, so a stray
     * `public/sitemap.xml` could never shadow it.
     */
    if (request.method === 'GET' && url.pathname === '/sitemap.xml') {
      return sitemap(env.API_ORIGIN ?? DEFAULT_API, url.origin);
    }

    // the asset binding answers everything else; this only rewrites what comes back
    const assets = await env.ASSETS.fetch(request);

    if (request.method !== 'GET') return assets;

    // a path that resolved to a real file is left alone, whatever it looks like
    const type = assets.headers.get('content-type') ?? '';
    if (!type.includes('text/html')) return assets;

    const dictionary = dictionaryOf(url.pathname);
    if (dictionary) return ferheng(assets, url, env, dictionary);

    /*
     * A listed page: its own title, its own description, its own address. No
     * API call and nothing that can fail, so this needs no fallback — it is a
     * table lookup and a rewrite of markup already in hand.
     */
    const page = STATIC_PAGES.find((p) => p.path === url.pathname);
    if (page) {
      // the query string is not part of the page; a canonical carrying one
      // invites a crawler to index ?ref=… as a page of its own
      const clean = new URL(url.pathname, url.origin).toString();
      return withHead(assets, staticHead(page, clean));
    }

    const route = routeFor(url.pathname);
    if (!route) return assets;

    const post = await fetchPost(env.API_ORIGIN ?? DEFAULT_API, route.api);
    if (!post) return assets;

    const preview = previewOf(post, route.kind);
    if (!preview) return assets;

    const clean = new URL(url.pathname, url.origin).toString();
    const rewritten = withHead(assets, previewHead(preview, clean));
    // the preview is public and identical for everyone who opens this link
    rewritten.headers.set('cache-control', `public, max-age=0, s-maxage=${PREVIEW_TTL_SECONDS}`);
    return rewritten;
  },
};

// exported for the tests, which is the only reason these are not file-local
export const __test = {
  routeFor,
  attr,
  trim,
  previewOf,
  sitemap,
  staticHead,
  previewHead,
  STATIC_PAGES,
  REPLACED,
  ferheng,
  dictionaryOf,
};
