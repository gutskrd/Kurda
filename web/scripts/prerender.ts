/**
 * Writes the front page into the built shell (dist/index.html), so `/` answers with its real headings, words and links
 * even to a reader that never runs the app, and gives it the front page's own title. The shell is also what every other
 * address is answered with, so the edge Worker (src/worker.ts) empties the page again for those; the app draws each page
 * over whatever it finds. The page is rendered through Vite, in a browser-like document, as a first visit in English
 * signed out; the build fails if what comes out is not a page (one h1, a title, a description and a canonical).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { __test as worker } from '../src/worker';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const shellPath = join(web, 'dist', 'index.html');

/** A browser's globals for the render: a document at the front page, nothing stored, motion and wide screens unknown. */
function browserLike(): void {
  const dom = new JSDOM('<!doctype html><html lang="en"><body><div id="root"></div></body></html>', { url: 'https://hevalo.app/', pretendToBeVisual: true });
  const win = dom.window as unknown as Window & typeof globalThis;
  const g = globalThis as Record<string, unknown>;
  for (const key of ['window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'location', 'history', 'HTMLElement', 'Element', 'Node', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'DOMParser']) {
    try {
      g[key] = (win as unknown as Record<string, unknown>)[key];
    } catch {
      // a global Node already has, such as navigator, stays as it is
    }
  }
}

/** The front page's head, from the Worker's table, so the two can never say different things. */
function frontHead(shell: string): string {
  const page = worker.STATIC_PAGES.find((p) => p.path === '/');
  if (!page) throw new Error('prerender: the Worker lists no front page');
  const esc = worker.attr;
  return shell
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(page.title)}</title>`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(page.title)}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${esc(page.title)}$2`);
}

/**
 * The page without the weight of its characters' drawings: each large picture keeps its frame, so nothing moves, and is
 * drawn in when the app starts. They are hidden from readers and say nothing to a search engine.
 */
function lean(html: string): string {
  return html.replace(/(<svg\b[^>]*>)([\s\S]*?)(<\/svg>)/g, (whole, open: string, inner: string, close: string) => (inner.length > 12_000 ? open + close : whole));
}

/** Refuses a page that is not one: a single h1, and the head a search engine reads. */
function check(html: string): void {
  const h1s = html.match(/<h1[\s>]/g) ?? [];
  if (h1s.length !== 1) throw new Error(`prerender: the front page has ${h1s.length} h1 headings, not one`);
  for (const [what, pattern] of [
    ['title', /<title>[^<]{10,}<\/title>/],
    ['description', /<meta\s+name="description"\s+content="[^"]{50,}"/],
    ['canonical', /<link rel="canonical" href="https:\/\/hevalo\.app\/"/],
  ] as const) {
    if (!pattern.test(html)) throw new Error(`prerender: the front page has no ${what}`);
  }
}

async function main(): Promise<void> {
  browserLike();
  const vite = await createServer({ root: web, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  try {
    const mod = (await vite.ssrLoadModule('/src/prerender/front.tsx')) as { renderFront: () => string };
    const body = lean(mod.renderFront());
    const shell = readFileSync(shellPath, 'utf8');
    if (!shell.includes('<div id="root"></div>')) throw new Error('prerender: the shell has no empty root to fill');
    const page = frontHead(shell).replace('<div id="root"></div>', `<div id="root" data-prerendered="/"><!--front-->${body}<!--/front--></div>`);
    check(page);
    writeFileSync(shellPath, page);
    console.log(`prerender: the front page, ${(body.length / 1024).toFixed(0)} kB of HTML, written into dist/index.html`);
  } finally {
    await vite.close();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
