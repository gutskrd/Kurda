import { PROVIDER, emailPictureTone, type EmailPicture } from '@kurda/shared';

/**
 * How every email from Hevalo and from Zagrosian looks: the sender's mark,
 * one drawn picture on a tile, a large heading, a few short lines, one thing
 * to press (or a code to type), and a quiet footer that says who wrote and
 * where to answer. Nothing else: an email that asks for one thing shows one
 * thing.
 *
 * This file only draws. What an email says is written once, as its plain
 * text (templates.ts), and read into blocks from there; an answer from the
 * support inbox hands its own blocks over (support-inbox.ts).
 *
 * Email programs draw a small, old part of HTML, each a different part:
 *   - the page is tables with every style written on the element, because
 *     some programs throw a stylesheet away;
 *   - pictures are images at an address (email draws no SVG), each with its
 *     size written on it so the page does not jump while they load, and its
 *     tile's colour behind it so a blocked image leaves a tile, not a hole;
 *   - a program in dark mode either reads the stylesheet's dark colours or
 *     turns the light page dark itself, and leaves images alone either way,
 *     which is why the mark and the picture sit on tiles of their own.
 *
 * Whatever is filled in (a username, a statement somebody wrote) is escaped
 * here and is never markup. A link is drawn only for an address this server
 * made: a button for an http(s) address, a link inside a sentence only for
 * an address on Hevalo itself. Anything else stays text.
 */

export type EmailBrand = 'hevalo' | 'zagrosian';

/** Where the images an email points at are served from: the website's own public folder. */
export const EMAIL_ASSET_ORIGIN = 'https://hevalo.app';

/** A piece of a sentence: words, an address to link, or an email address to write to. */
export type Inline = string | { link: string } | { mailto: string };

export type EmailBlock =
  /** a paragraph; `quiet` for the small print under the thing to press */
  | { kind: 'text'; parts: readonly Inline[]; quiet?: boolean }
  /** the one thing to press */
  | { kind: 'button'; label: string; href: string }
  /** a code to type in, large and spaced */
  | { kind: 'code'; code: string }
  /** lines kept as lines, in a panel: a list, a form's answers, somebody's statement */
  | { kind: 'details'; lines: readonly string[] }
  /** what somebody wrote, quoted under an answer to it */
  | { kind: 'quote'; caption: string; text: string };

export interface EmailDesign {
  brand: EmailBrand;
  /** the language it is written in, for `lang` */
  lang: string;
  /** the subject, for the page's title */
  title: string;
  /** the line an inbox shows after the subject */
  preheader?: string;
  picture?: EmailPicture;
  heading?: string;
  blocks: readonly EmailBlock[];
  /** short emails are set in the middle; long ones are read from the edge */
  align: 'center' | 'start';
  /** who signs it: "The Hevalo team" */
  signoff?: string;
  /** "Need a hand? Write to {email}." with the address to write to */
  help?: { text: string; email: string };
  /** "If the button doesn’t work, copy this link:" for the address the button opens */
  fallback?: string;
}

interface Brand {
  name: string;
  home: string;
  /** the mark, on its own tile */
  logo: string;
  /** the faces the name and the headings are set in */
  display: string;
  /** letter-spacing of the name beside the mark */
  tracking: string;
}

const SANS = "system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
const SERIF = "'Iowan Old Style','Palatino Linotype',Palatino,Georgia,'Times New Roman',serif";

const BRANDS: Readonly<Record<EmailBrand, Brand>> = {
  hevalo: { name: 'Hevalo', home: 'https://hevalo.app', logo: `${EMAIL_ASSET_ORIGIN}/logo.png`, display: SERIF, tracking: '0' },
  zagrosian: { name: 'Zagrosian', home: 'https://zagrosian.com', logo: 'https://zagrosian.com/icon-192.png', display: SANS, tracking: '-0.03em' },
};

/** The page's colours by day; the stylesheet below gives a program that asks for them the night's. */
const INK = '#111111';
const INK_2 = '#2f3033';
const INK_3 = '#5e6066';
const PAPER = '#ffffff';
const PANEL = '#f3f3f1';
const RULE = '#e6e6e3';

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** An address a button may open: http or https, and nothing else (never `javascript:` or `data:`). */
export function safeHref(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

/** An address a sentence may link to: one on Hevalo itself. Anybody else's stays text, however it got into the sentence. */
function ownHref(value: string): string | null {
  const href = safeHref(value);
  if (!href) return null;
  const host = new URL(href).hostname;
  return host === 'hevalo.app' || host.endsWith('.hevalo.app') || host === 'zagrosian.com' || host.endsWith('.zagrosian.com') ? href : null;
}

const MAILBOX = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;

/** Text somebody wrote, with its line breaks kept. */
function lines(text: string): string {
  return escapeHtml(text).replace(/\r?\n/g, '<br>');
}

function inline(parts: readonly Inline[]): string {
  return parts
    .map((part) => {
      // a line break somebody wrote is kept; nothing else in their words is markup
      if (typeof part === 'string') return lines(part);
      if ('link' in part) {
        const href = ownHref(part.link);
        return href ? `<a href="${escapeHtml(href)}" class="ink" style="color:${INK};text-decoration:underline;word-break:break-all;">${escapeHtml(part.link)}</a>` : escapeHtml(part.link);
      }
      return MAILBOX.test(part.mailto)
        ? `<a href="mailto:${escapeHtml(part.mailto)}" class="ink" style="color:${INK};text-decoration:underline;">${escapeHtml(part.mailto)}</a>`
        : escapeHtml(part.mailto);
    })
    .join('');
}

const row = (inner: string, align: string, pad: string): string => `<tr><td align="${align}" style="padding:${pad};">${inner}</td></tr>`;

function block(b: EmailBlock, align: 'center' | 'left'): string {
  switch (b.kind) {
    case 'text':
      return row(
        b.quiet
          ? `<p class="ink3" style="margin:0;font:400 14px/1.55 ${SANS};color:${INK_3};">${inline(b.parts)}</p>`
          : `<p class="ink2" style="margin:0;font:400 17px/1.55 ${SANS};color:${INK_2};">${inline(b.parts)}</p>`,
        align,
        b.quiet ? '0 0 10px' : '0 0 14px',
      );
    case 'button': {
      const href = safeHref(b.href);
      // an address that is not one a button may open is shown as it is, so nothing is lost and nothing is pressed
      if (!href) return row(`<p class="ink2" style="margin:0;font:400 15px/1.5 ${SANS};color:${INK_2};word-break:break-all;">${escapeHtml(b.href)}</p>`, align, '0 0 14px');
      return row(
        `<a href="${escapeHtml(href)}" class="btn" style="display:inline-block;background:${INK};color:${PAPER};font:600 17px/1 ${SANS};text-decoration:none;padding:17px 34px;border-radius:999px;">${escapeHtml(b.label)}</a>`,
        'center',
        '10px 0 24px',
      );
    }
    case 'code':
      return row(
        `<div class="panel ink" style="display:inline-block;background:${PANEL};color:${INK};font:700 34px/1 'SF Mono',ui-monospace,Menlo,Consolas,monospace;letter-spacing:8px;padding:20px 22px 20px 30px;border-radius:18px;">${escapeHtml(b.code)}</div>`,
        'center',
        '8px 0 22px',
      );
    case 'details':
      return row(
        `<div class="panel ink2" style="background:${PANEL};color:${INK_2};font:400 15px/1.6 ${SANS};padding:16px 18px;border-radius:14px;text-align:start;">${b.lines.map(lines).join('<br>')}</div>`,
        'left',
        '2px 0 16px',
      );
    case 'quote':
      return row(
        `<div class="rule" style="border-inline-start:3px solid ${RULE};padding:2px 0 2px 14px;text-align:start;">` +
          `<p class="ink3" style="margin:0 0 6px;font:400 13px/1.5 ${SANS};color:${INK_3};">${escapeHtml(b.caption)}</p>` +
          `<p class="ink3" style="margin:0;font:400 14px/1.55 ${SANS};color:${INK_3};">${lines(b.text)}</p></div>`,
        'left',
        '10px 0 16px',
      );
  }
}

/** The whole email as HTML. */
export function renderEmailHtml(design: EmailDesign): string {
  const brand = BRANDS[design.brand];
  const align = design.align === 'center' ? 'center' : 'left';
  const rows: string[] = [];

  // the sender's mark and name
  rows.push(
    row(
      `<a href="${brand.home}" style="text-decoration:none;">` +
        `<img src="${brand.logo}" width="40" height="40" alt="" style="display:inline-block;vertical-align:middle;border:0;border-radius:11px;">` +
        `<span class="ink" style="display:inline-block;vertical-align:middle;padding-inline-start:10px;font:700 23px/1 ${brand.display};letter-spacing:${brand.tracking};color:${INK};">${brand.name}</span></a>`,
      'center',
      '0 0 30px',
    ),
  );
  if (design.picture) {
    rows.push(
      row(
        `<img src="${EMAIL_ASSET_ORIGIN}/email/${design.picture}.png" width="168" height="168" alt="" style="display:block;border:0;border-radius:40px;background:${emailPictureTone(design.picture)};">`,
        'center',
        '0 0 28px',
      ),
    );
  }
  if (design.heading) {
    rows.push(row(`<h1 class="h1 ink" style="margin:0;font:700 31px/1.18 ${brand.display};letter-spacing:${brand.tracking};color:${INK};">${escapeHtml(design.heading)}</h1>`, 'center', '0 0 16px'));
  }
  for (const b of design.blocks) rows.push(block(b, align));

  // under a line: who signs it, where to write, and who the sender is
  const foot: string[] = [];
  if (design.signoff) foot.push(`<p class="ink2" style="margin:0 0 10px;font:600 14px/1.5 ${SANS};color:${INK_2};">${escapeHtml(design.signoff)}</p>`);
  if (design.fallback) {
    const button = design.blocks.find((b): b is Extract<EmailBlock, { kind: 'button' }> => b.kind === 'button');
    const href = button ? safeHref(button.href) : null;
    if (href) {
      foot.push(
        `<p class="ink3" style="margin:0 0 10px;font:400 13px/1.5 ${SANS};color:${INK_3};word-break:break-all;">${escapeHtml(design.fallback)} <a href="${escapeHtml(href)}" class="ink3" style="color:${INK_3};text-decoration:underline;">${escapeHtml(href)}</a></p>`,
      );
    }
  }
  if (design.help) {
    const [before, after = ''] = design.help.text.split('{email}');
    foot.push(`<p class="ink3" style="margin:0 0 10px;font:400 13px/1.5 ${SANS};color:${INK_3};">${inline([before ?? '', { mailto: design.help.email }, after])}</p>`);
  }
  foot.push(
    `<p class="ink3" style="margin:0;font:400 12px/1.5 ${SANS};color:${INK_3};">${escapeHtml(
      design.brand === 'hevalo' ? `${PROVIDER.brand} · ${PROVIDER.legalName}, ${PROVIDER.address} · KvK ${PROVIDER.kvk}` : `${PROVIDER.legalName}, ${PROVIDER.address} · KvK ${PROVIDER.kvk}`,
    )}</p>`,
  );
  rows.push(`<tr><td align="center" class="rule" style="padding:22px 0 0;border-top:1px solid ${RULE};">${foot.join('')}</td></tr>`);

  const preheader = design.preheader
    ? `<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;">${escapeHtml(design.preheader)}</div>`
    : '';
  return (
    `<!doctype html><html lang="${escapeHtml(design.lang)}" dir="ltr"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">` +
    `<title>${escapeHtml(design.title)}</title><style>` +
    `@media (prefers-color-scheme:dark){.bg{background:#0f1012!important}.ink{color:#ffffff!important}.ink2{color:#d9dadc!important}.ink3{color:#a0a2a8!important}` +
    `.btn{background:#f2f2f0!important;color:#111111!important}.panel{background:#1c1e22!important}.rule{border-color:#2b2d33!important}}` +
    `@media (max-width:480px){.h1{font-size:27px!important}.wrap{padding:28px 20px 32px!important}}` +
    `</style></head><body class="bg" style="margin:0;padding:0;background:${PAPER};-webkit-text-size-adjust:100%;">${preheader}` +
    `<table role="presentation" class="bg" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAPER};"><tr><td class="wrap" align="center" style="padding:40px 24px 44px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;">${rows.join('')}</table>` +
    `</td></tr></table></body></html>`
  );
}
