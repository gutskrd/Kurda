/**
 * What a MyKurda link looks like when it is pasted somewhere else.
 *
 * The app is a Vite SPA: the server sends one `index.html` for every path and
 * React fills it in. That is fine for a reader and useless for everything that
 * unfurls a link — WhatsApp, Telegram, iMessage, Slack, Twitter, Facebook — none
 * of which runs the JavaScript that would set the title. Every post shared out
 * of MyKurda arrived as the same grey "MyKurda — Learn Kurdish" card, whichever
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
  const headline = rawTitle.trim() || (kind === 'image' ? 'A picture on MyKurda' : 'A post on MyKurda');
  const title = by ? `${trim(headline, MAX_TITLE)} · @${by}` : trim(headline, MAX_TITLE);

  const description = rawBody.trim()
    ? trim(rawBody, MAX_DESCRIPTION)
    : 'Read it on MyKurda — stories, poems and pictures in Kurdish.';

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
 * Replace the shell's head with this post's.
 *
 * `HTMLRewriter` streams, so this costs nothing in memory and adds no round
 * trip. The existing title and description are removed rather than duplicated —
 * a document with two `<title>`s is a document whose title is a coin toss.
 */
function withPreview(html: Response, preview: Preview, url: string): Response {
  const tags = [
    `<title>${attr(preview.title)}</title>`,
    `<meta name="description" content="${attr(preview.description)}" />`,
    `<meta property="og:type" content="article" />`,
    `<meta property="og:site_name" content="MyKurda" />`,
    `<meta property="og:title" content="${attr(preview.title)}" />`,
    `<meta property="og:description" content="${attr(preview.description)}" />`,
    `<meta property="og:url" content="${attr(url)}" />`,
    preview.image ? `<meta property="og:image" content="${attr(preview.image)}" />` : '',
    `<meta name="twitter:card" content="${preview.image ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${attr(preview.title)}" />`,
    `<meta name="twitter:description" content="${attr(preview.description)}" />`,
    preview.image ? `<meta name="twitter:image" content="${attr(preview.image)}" />` : '',
  ]
    .filter(Boolean)
    .join('');

  return new HTMLRewriter()
    .on('title', { element: (el) => el.remove() })
    .on('meta[name="description"]', { element: (el) => el.remove() })
    .on('head', { element: (el) => el.append(tags, { html: true }) })
    .transform(html);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // the asset binding answers everything; this only rewrites what comes back
    const assets = await env.ASSETS.fetch(request);

    if (request.method !== 'GET') return assets;

    const url = new URL(request.url);
    const route = routeFor(url.pathname);
    if (!route) return assets;

    // a post path that somehow resolved to a real file is left alone
    const type = assets.headers.get('content-type') ?? '';
    if (!type.includes('text/html')) return assets;

    const post = await fetchPost(env.API_ORIGIN ?? DEFAULT_API, route.api);
    if (!post) return assets;

    const preview = previewOf(post, route.kind);
    if (!preview) return assets;

    const rewritten = withPreview(assets, preview, url.toString());
    // the preview is public and identical for everyone who opens this link
    rewritten.headers.set('cache-control', `public, max-age=0, s-maxage=${PREVIEW_TTL_SECONDS}`);
    return rewritten;
  },
};

// exported for the tests, which is the only reason these are not file-local
export const __test = { routeFor, attr, trim, previewOf };
