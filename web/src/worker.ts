/**
 * The edge Worker in front of the SPA. Link previews (chat apps, social networks) do not run JavaScript, so shared
 * posts, invitations, wins and listed pages get their own title, description, picture and canonical written into the
 * shell's head here. It also builds the sitemap, answers dead dictionary addresses and scanner probes with real 404s,
 * and passes everything else through from the asset binding.
 *
 * Rules: only fixed URL shapes are looked up, and only after an id parses as a UUID; everything from the API is
 * escaped into the markup, since post text in an attribute is where a mistake becomes stored XSS; and a slow or broken
 * API costs nothing, as the shell then goes out unchanged.
 */

import { SOURCES, SOURCE_ORDER, type Source } from './teaching/sources';
// The one file, not the package, whose index would pull all of @kurda/shared into the edge script.
import { isScannerProbe } from '@kurda/shared/src/scanner-paths';
import { parseJoinLink, type JoinLink, type JoinLinkGame } from '@kurda/shared/src/join-link';
import { GAME_NAMES } from '@kurda/shared/src/games/names';
import { parseWinLink, winCardPath, winLinkLocale, winLinkUrl, type WinLink } from '@kurda/shared/src/win-link';
import { winWords } from '@kurda/shared/src/win-words';
import type { AppLocale } from '@kurda/shared/src/locales';

/*
 * The two Workers runtime types this file uses, declared here because @cloudflare/workers-types replaces the DOM lib
 * that the rest of the app needs.
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
  /** Origin of the API, e.g. https://kurda-api.onrender.com. */
  API_ORIGIN?: string;
}

const DEFAULT_API = 'https://kurda-api.onrender.com';

/** How long the edge may reuse a rendered preview. */
const PREVIEW_TTL_SECONDS = 300;
/** A slow API must not hold the page up. */
const API_TIMEOUT_MS = 2_000;

/** Lengths that read well in an unfurled card rather than being cut by it. */
const MAX_TITLE = 70;
const MAX_DESCRIPTION = 200;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The two kinds of post that have a page of their own. */
type PostRoute = { api: string; kind: 'library' | 'image' };

/** Which post, if any, this path is: a fixed table, with the id checked as a UUID before it goes into a URL. */
function routeFor(pathname: string): PostRoute | null {
  const library = /^\/app\/library\/([^/]+)\/?$/.exec(pathname);
  if (library && UUID.test(library[1]!)) return { api: `/library/posts/${library[1]}`, kind: 'library' };

  const picture = /^\/app\/dimen\/([^/]+)\/?$/.exec(pathname);
  if (picture && UUID.test(picture[1]!)) return { api: `/images/${picture[1]}`, kind: 'image' };

  return null;
}

/** Escapes an HTML attribute value; everything below is user-written. */
function attr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Collapses whitespace and cuts on a word boundary, so a preview ends cleanly. */
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

  // A picture usually has no title, so the byline becomes the headline.
  const headline = rawTitle.trim() || (kind === 'image' ? 'A picture on Hevalo' : 'A post on Hevalo');
  const title = by ? `${trim(headline, MAX_TITLE)} · @${by}` : trim(headline, MAX_TITLE);

  const description = rawBody.trim()
    ? trim(rawBody, MAX_DESCRIPTION)
    : 'Read it on Hevalo — stories, poems and pictures in Kurdish.';

  const image = typeof post.imageUrl === 'string' && /^https:\/\//.test(post.imageUrl) ? post.imageUrl : null;

  if (!title) return null;
  return { title, description, image };
}

/** Asks the API for one post; never throws, never waits long. */
async function fetchPost(apiOrigin: string, path: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${apiOrigin}${path}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
      // The post is public and the same for everyone, so the edge may keep it.
      cf: { cacheTtl: PREVIEW_TTL_SECONDS, cacheEverything: true },
    } as RequestInit);
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Every tag this file writes, and so every tag it removes first: with two `og:title`s, link previews read the shell's
 * generic first one.
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

/** Swaps the shell's head for this page's, streaming through `HTMLRewriter` and removing whatever the new tags replace. */
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
 * Each game's name on an invitation card: its Kurmancî name, the same for every reader (shared games/names.ts). The rest
 * of this file's words are English, since a link preview does not say who will read it.
 */
const INVITE_GAME: Record<JoinLinkGame, string> = {
  'wordle-battle': GAME_NAMES['wordle-battle'],
  'rhyme-match': GAME_NAMES['rhyme-match'],
  stories: 'a Kurdish story game',
  'last-letter': GAME_NAMES['last-letter'],
  impostor: GAME_NAMES.impostor,
  'who-am-i': GAME_NAMES['who-am-i'],
};

/** Games with their own card (api/scripts/generate-invite-art.ts); the rest show the site's. */
const INVITE_CARDS: ReadonlySet<JoinLinkGame> = new Set(['wordle-battle', 'rhyme-match', 'last-letter', 'impostor', 'who-am-i']);

/**
 * An invitation as a head: the game's name, its picture and the code. Nothing is looked up, since the link's game and
 * code are read by a strict pattern (shared/src/join-link.ts), so it cannot fail and reveals no codes. Who shared it is
 * not shown, since a name from an address is never put into markup.
 */
function inviteHead(invite: JoinLink, url: string): Array<string | ''> {
  const title = `You’re invited to play ${INVITE_GAME[invite.game]} on Hevalo`;
  const code = `${invite.code.slice(0, 3)} ${invite.code.slice(3)}`;
  const description = `Tap to join the game. Or open Games → Join with a code and type ${code}.`;
  const image = new URL(INVITE_CARDS.has(invite.game) ? `/invite/${invite.game}.png` : '/og.png', url).toString();
  return [
    `<title>${attr(title)}</title>`,
    `<meta name="description" content="${attr(description)}" />`,
    `<link rel="canonical" href="${attr(url)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Hevalo" />`,
    `<meta property="og:url" content="${attr(url)}" />`,
    `<meta property="og:title" content="${attr(title)}" />`,
    `<meta property="og:description" content="${attr(description)}" />`,
    `<meta property="og:image" content="${attr(image)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${attr(`${INVITE_GAME[invite.game]} on Hevalo`)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${attr(title)}" />`,
    `<meta name="twitter:description" content="${attr(description)}" />`,
    `<meta name="twitter:image" content="${attr(image)}" />`,
  ];
}

/**
 * A shared win as a head: what was done, cheerfully, in the sender's language (shared/src/win-words.ts), and its
 * postcard (shared art/share-card.ts, drawn by api/scripts/generate-share-art.ts). The link's kind, single detail and
 * language are read by strict patterns (shared/src/win-link.ts) and never say whose, so nothing is looked up and only a
 * count, a league name or a score reaches the markup.
 */
function winHead(win: WinLink, url: string, locale: AppLocale | null = null): Array<string | ''> {
  const { title, description } = winWords(win, locale ?? undefined);
  const image = new URL(winCardPath(win), url).toString();
  return [
    `<title>${attr(title)}</title>`,
    `<meta name="description" content="${attr(description)}" />`,
    `<link rel="canonical" href="${attr(url)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Hevalo" />`,
    `<meta property="og:url" content="${attr(url)}" />`,
    `<meta property="og:title" content="${attr(title)}" />`,
    `<meta property="og:description" content="${attr(description)}" />`,
    `<meta property="og:image" content="${attr(image)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${attr('A postcard from Hevalo: Hamo and the deer Hevalo on a hillside, and a bird flying off with a letter.')}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${attr(title)}" />`,
    `<meta name="twitter:description" content="${attr(description)}" />`,
    `<meta name="twitter:image" content="${attr(image)}" />`,
  ];
}

/**
 * The head for a listed page that is not a post. Its own canonical matters most: index.html's points at `/`, and the
 * asset binding serves that file for every path, so without this every page told search engines it duplicated the home
 * page. Unknown paths keep the shell's, which is right for a typo.
 */
function staticHead(page: StaticPage, url: string): Array<string | ''> {
  return [
    `<title>${attr(page.title)}</title>`,
    `<meta name="description" content="${attr(page.description)}" />`,
    `<link rel="canonical" href="${attr(url)}" />`,
    `<meta property="og:type" content="${page.structuredData ? 'article' : 'website'}" />`,
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
    page.structuredData ? jsonLd(page.structuredData(page, url)) : '',
  ];
}

/**
 * A schema.org data block for the head. Never executed, so `script-src 'self'` does not apply, but `</script>` in a
 * string would end it early, so every character that could open or close markup is JSON-escaped.
 */
function jsonLd(data: Record<string, unknown>): string {
  const json = JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return `<script type="application/ld+json">${json}</script>`;
}

/**
 * A study as schema.org has it: a ScholarlyArticle in its issue, volume and journal, as far as the reference goes.
 * Conference proceedings are not a Periodical, so they are only named.
 */
function scholarlyArticle(s: Source): Record<string, unknown> {
  let container: Record<string, unknown> =
    s.kind === 'journal' ? { '@type': 'Periodical', name: s.venue } : { '@type': 'CreativeWork', name: s.venue };
  if (s.kind === 'journal' && s.volume) {
    container = { '@type': 'PublicationVolume', volumeNumber: s.volume, isPartOf: container };
    if (s.issue) container = { '@type': 'PublicationIssue', issueNumber: s.issue, isPartOf: container };
  }
  return {
    '@type': 'ScholarlyArticle',
    headline: s.title,
    name: s.title,
    // "et al." has no schema.org form, so the authors the reference names are listed.
    author: s.authors.map(([family, initials]) => ({ '@type': 'Person', familyName: family, name: `${initials} ${family}` })),
    datePublished: String(s.year),
    ...(s.pages ? { pagination: s.pages } : {}),
    isPartOf: container,
    url: s.url,
  };
}

/**
 * "How Hevalo teaches" as an article by Hevalo's maker citing the page's own reference list (teaching/sources.ts), in its
 * order. It points at the shell's site, app and organisation by `@id`, and carries no date, since none is worth asserting.
 */
function teachingArticle(page: StaticPage, url: string): Record<string, unknown> {
  const site = new URL('/', url).toString();
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    '@id': `${url}#article`,
    headline: 'How Hevalo teaches',
    name: page.title,
    description: page.description,
    url,
    mainEntityOfPage: url,
    inLanguage: 'en',
    isPartOf: { '@id': `${site}#website` },
    author: { '@id': 'https://zagrosian.com/#organization' },
    publisher: { '@id': 'https://zagrosian.com/#organization' },
    citation: SOURCE_ORDER.map((id) => scholarlyArticle(SOURCES[id])),
  };
}

/** How long the edge may reuse the sitemap; it only changes when somebody publishes. */
const SITEMAP_TTL_SECONDS = 3_600;
/** Five pages of a hundred posts: a fixed cost. */
const SITEMAP_PAGES = 5;
const SITEMAP_PAGE_SIZE = 100;

/**
 * The listed paths that are not posts, each with its own head, since crawlers do not run React and would otherwise read
 * the landing page under every URL. English, as a crawler has no locale; the app translates itself on start.
 */
interface StaticPage {
  path: string;
  title: string;
  description: string;
  /** Schema.org for the head, for a page that is more than a page of the site. */
  structuredData?: (page: StaticPage, url: string) => Record<string, unknown>;
}

const STATIC_PAGES: ReadonlyArray<StaticPage> = [
  /* The front page's title says more than the name, since it is what someone searching for Kurdish lessons sees (`usePageMeta` matches it). */
  {
    path: '/',
    title: 'Hevalo — Learn Kurdish and Kurmanji with friends',
    description:
      'Learn Kurdish with your friends: Kurmanji word games, head-to-head challenges, a free Kurdish dictionary and a community. Free, in your browser.',
  },
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
      'Peyvok, rhyming rounds and quizzes played in Kurdish, against a dictionary of hundreds of thousands of words.',
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
  /* The page readers check Hevalo against, with its studies as the Article's citations (`teachingArticle`). */
  {
    path: '/how-hevalo-teaches',
    title: 'How Hevalo teaches — and the research behind it',
    description:
      'What research on memory and language learning has found, what Hevalo does about each finding, what it does not claim, and the studies to read.',
    structuredData: teachingArticle,
  },
  {
    path: '/app/alphabet',
    title: 'The Kurdish alphabet: Kurmanji and Sorani letters · Hevalo',
    description:
      'Every Kurmanji and Sorani letter, what it sounds like next to sounds you already know, and a word to remember it by. Free, no account.',
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
  /* Where a rights holder without an account sends a copyright notice. */
  {
    path: '/copyright',
    title: 'Copyright · Hevalo',
    description:
      'Tell Hevalo about a post that copies your work — no account needed — and what to do if your own post was taken down.',
  },
];

const STATIC_PATHS = STATIC_PAGES.map((p) => p.path);

/**
 * The sitemap from what is published: the static pages plus library posts from the public `GET /library/posts`, which
 * returns only published ones. Bounded, so it does not slow with every new post, and a failed fetch still returns the
 * static paths, since a 500 can read as the whole site being down.
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
      // The id goes straight into a URL, so it is a UUID or nothing.
      if (typeof post.id !== 'string' || !UUID.test(post.id)) continue;
      const when = typeof post.updatedAt === 'string' ? post.updatedAt : post.publishedAt;
      urls.push({
        loc: `${origin}/app/library/${post.id}`,
        lastmod: typeof when === 'string' ? when.slice(0, 10) : undefined,
      });
    }

    // A short page is the last page.
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

/** The published dictionary's folders: `/ferheng/` in Kurmancî and `/dictionary/` in English (web/scripts/ferheng-copy.ts). */
const DICTIONARIES = ['/ferheng', '/dictionary'] as const;

/** Which of them a path belongs to, or null. */
function dictionaryOf(pathname: string): string | null {
  return DICTIONARIES.find((d) => pathname.startsWith(`${d}/`)) ?? null;
}

/**
 * Answers a dictionary address. For paths without a file Cloudflare serves the app shell, but `_headers` applies the
 * dictionary's `default-src 'none'` by URL, so the shell loaded nothing and showed a blank 200. The shell is recognised by
 * lacking the dictionary stylesheet link; these pages are edge-cached for a day, so reading the body is cheap.
 */
async function ferheng(assets: Response, url: URL, env: Env, base: string): Promise<Response> {
  const html = await assets.text();
  if (html.includes(`${base}/ferheng.css`)) {
    // A real page: return exactly what the asset binding gave.
    return new Response(html, { status: assets.status, headers: assets.headers });
  }

  // The 404 in the language of the path asked for.
  const page = await env.ASSETS.fetch(new Request(new URL(`${base}/404.html`, url.origin).toString()));
  // A response made here gets none of `_headers`, so the dictionary's policy (CSP, framing, nosniff) is copied from the
  // asset binding's answer, but not its caching or validators, which described the shell.
  const headers = new Headers(assets.headers);
  for (const name of ['cache-control', 'etag', 'last-modified', 'content-length']) headers.delete(name);
  headers.set('content-type', 'text/html; charset=utf-8');
  return new Response(page.body, { status: 404, headers });
}

/**
 * A plain 404 for scanner probes (/wp-login.php, /.env and the like; @kurda/shared scanner-paths.ts), which the asset
 * binding answered with the shell and a 200. Real files are served before this script runs.
 */
function notFound(): Response {
  return new Response('Not found\n', {
    status: 404,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=86400',
      'x-content-type-options': 'nosniff',
      'x-robots-tag': 'noindex',
    },
  });
}

/**
 * The site's security headers, as `public/_headers` gives them to every path (`/*`); a test keeps the two equal.
 * Cloudflare applies that file to static assets but documents it as not applying to what a Worker returns, so each
 * one a response from here lacks is added, and one already there is left as it is.
 */
const SITE_HEADERS: ReadonlyArray<readonly [string, string]> = [
  [
    'content-security-policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self'; media-src 'self' blob: https:; connect-src 'self' https://kurda-api.onrender.com wss://kurda-api.onrender.com; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; upgrade-insecure-requests",
  ],
  ['x-frame-options', 'DENY'],
  ['x-content-type-options', 'nosniff'],
  ['referrer-policy', 'strict-origin-when-cross-origin'],
  ['strict-transport-security', 'max-age=63072000; includeSubDomains; preload'],
  ['permissions-policy', 'camera=(), microphone=(self), geolocation=(), payment=(), usb=()'],
  ['cross-origin-opener-policy', 'same-origin'],
];

/** `res` with every site header it lacks. */
function withSiteHeaders(res: Response): Response {
  const missing = SITE_HEADERS.filter(([name]) => !res.headers.has(name));
  if (missing.length === 0) return res;
  const out = new Response(res.body, res);
  for (const [name, value] of missing) out.headers.set(name, value);
  return out;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return withSiteHeaders(await respond(request, env));
  },
};

async function respond(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (isScannerProbe(url.pathname, url.search)) return notFound();

  /* Built here, not shipped as a file, so it lists what is published now, and answered first so no stray sitemap.xml can shadow it. */
  if (request.method === 'GET' && url.pathname === '/sitemap.xml') {
    return sitemap(env.API_ORIGIN ?? DEFAULT_API, url.origin);
  }

  // The asset binding answers everything else; this only rewrites what comes back.
  const assets = await env.ASSETS.fetch(request);

  if (request.method !== 'GET') return assets;

  // A path that resolved to a real file is left alone, whatever it looks like.
  const type = assets.headers.get('content-type') ?? '';
  if (!type.includes('text/html')) return assets;

  const dictionary = dictionaryOf(url.pathname);
  if (dictionary) return ferheng(assets, url, env, dictionary);

  /* A listed page: its own title, description and address, from a table, so nothing can fail. */
  const page = STATIC_PAGES.find((p) => p.path === url.pathname);
  if (page) {
    // The canonical drops the query, which would otherwise invite indexing ?ref=… as its own page.
    const clean = new URL(url.pathname, url.origin).toString();
    return withHead(assets, staticHead(page, clean));
  }

  /* An invitation: the game's own card from the link alone, kept out of search results, its canonical without the sharer. */
  const invite = parseJoinLink(url.pathname, url.search);
  if (invite) {
    const clean = new URL(url.pathname.replace(/\/$/, ''), url.origin).toString();
    const invited = withHead(assets, inviteHead(invite, clean));
    invited.headers.set('x-robots-tag', 'noindex');
    return invited;
  }

  /* A shared win: its kind's postcard from the link alone, in the language it names, kept out of search results, its canonical as read. */
  const win = parseWinLink(url.pathname);
  if (win) {
    const locale = winLinkLocale(url.search);
    const shared = withHead(assets, winHead(win, winLinkUrl(url.origin, win, locale), locale));
    shared.headers.set('x-robots-tag', 'noindex');
    return shared;
  }

  const route = routeFor(url.pathname);
  if (!route) return assets;

  const post = await fetchPost(env.API_ORIGIN ?? DEFAULT_API, route.api);
  if (!post) return assets;

  const preview = previewOf(post, route.kind);
  if (!preview) return assets;

  const clean = new URL(url.pathname, url.origin).toString();
  const rewritten = withHead(assets, previewHead(preview, clean));
  // The preview is public and the same for everyone who opens this link.
  rewritten.headers.set('cache-control', `public, max-age=0, s-maxage=${PREVIEW_TTL_SECONDS}`);
  return rewritten;
}

// Exported for the tests, the only reason these are not file-local.
export const __test = {
  routeFor,
  attr,
  trim,
  previewOf,
  sitemap,
  staticHead,
  previewHead,
  inviteHead,
  winHead,
  jsonLd,
  teachingArticle,
  STATIC_PAGES,
  REPLACED,
  ferheng,
  dictionaryOf,
  notFound,
  SITE_HEADERS,
};
