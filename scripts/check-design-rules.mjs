/**
 * The rules for every screen, on the website and the phone alike:
 *
 * - One face: a font family is the one token (`var(--font-sans)` on the website, `typography.fontFamily` on the phone).
 * - Two sizes: a text size is `var(--text)` or `var(--text-title)` on the website, `typography.sizes.text` or
 *   `typography.sizes.title` on the phone. A size handed down as a name (a component's `size`) is allowed; a number or
 *   sum written at the call is not. Either size may shrink, never grow, to fit a box that cannot grow with it.
 * - The base, one accent, gold for rewards and Hevalo+: the page and its surfaces and ink, one accent (`--accent*`,
 *   `colors.accent*`) and no second colour beside it (no `--secondary*`, `colors.secondary*`, nor a colour theme to
 *   switch); the chrome (the website's shell stylesheets, the phone's theme and navigation) takes every colour from
 *   the tokens rather than writing one with a hue of its own; and Hevalo+'s gold only on its button (`--plus-*` only in
 *   ui.css's `.btn-plus` rules and `.btn-plus` only in components/PlusButton.tsx, `PLUS_STYLE` only in
 *   theme/PlusButton.tsx). The reward gold (`--gold`, `colors.gold`) stays free for whatever is earned.
 *
 * Drawings keep their own type and colour: a letter's paper scales its writing with the sheet, and the road's units
 * wear their own colours. Those files are listed below with why. Runs inside `npm run lint` for the website (`web`)
 * and the phone (`mobile`).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = process.argv[2];
if (app !== 'web' && app !== 'mobile') throw new Error('usage: check-design-rules.mjs web|mobile');
const SRC = join(ROOT, app, 'src');

function files(dir, test, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) files(p, test, out);
    else if (test(entry.name)) out.push(p);
  }
  return out;
}
const rel = (f) => relative(SRC, f).split(sep).join('/');
const lineOf = (src, index) => src.slice(0, index).split('\n').length;
/** The source with its comments blanked, so a size in a comment is not taken for one in a style; lines keep their numbers. */
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');

const wrong = [];

/** A literal colour with a hue of its own (its channels spread by `MIN_CHROMA` or more), not a grey or a shadow. */
const MIN_CHROMA = 24;
function huedColours(src) {
  const out = [];
  for (const m of src.matchAll(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b|rgba?\((\d+),\s*(\d+),\s*(\d+)/g)) {
    const hex = m[1] && m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
    const [r, g, b] = hex ? [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) : [m[2], m[3], m[4]].map(Number);
    if (Math.max(r, g, b) - Math.min(r, g, b) >= MIN_CHROMA) out.push({ index: m.index, text: m[0] });
  }
  return out;
}
/** A second colour beside the accent, or a colour theme to switch, in either app. */
const SECOND = /--secondary\b|--secondary-[a-z]+|data-palette|dataset\.palette|\bsecondaryText\b|\btextOnSecondary\b|\bcolors\.secondary\b/g;

if (app === 'web') {
  /** A letter's paper is a drawn sheet: its writing and notes scale with the sheet, as a picture does. */
  const SIZE_EXEMPT = new Set(['letters/paper.css']);
  /** The shell's stylesheets: every colour in them comes from the tokens. */
  const CHROME = new Set(['styles/ui.css', 'styles/shell.css', 'styles/layout.css', 'styles/base.css', 'styles/settings.css', 'styles/filter.css', 'styles/reach.css', 'styles/glass.css', 'styles/motion.css']);
  for (const f of files(SRC, (n) => n.endsWith('.css'))) {
    const src = code(readFileSync(f, 'utf8'));
    const name = rel(f);
    for (const m of src.matchAll(/(?<![-\w])font-size:\s*([^;}]+)/g)) {
      const v = m[1].replace('!important', '').trim();
      if (['var(--text)', 'var(--text-title)', 'inherit'].includes(v)) continue;
      // One of the two sizes shrunk to fit a box that cannot grow; the script that sets the fit keeps it at or under 1.
      if (/^calc\(var\(--text(-title)?\) \* var\(--[a-z-]+-fit, 1\)\)$/.test(v)) continue;
      if (SIZE_EXEMPT.has(name)) continue;
      wrong.push(`${name}:${lineOf(src, m.index)} a third text size: font-size: ${v}`);
    }
    for (const m of src.matchAll(/font-family:\s*([^;}]+)/g)) {
      const v = m[1].trim();
      if (v === 'var(--font-sans)' || v === 'inherit') continue;
      wrong.push(`${name}:${lineOf(src, m.index)} a second face: font-family: ${v}`);
    }
    for (const m of src.matchAll(SECOND)) wrong.push(`${name}:${lineOf(src, m.index)} a second colour beside the accent: ${m[0]}`);
    if (CHROME.has(name)) {
      for (const c of huedColours(src)) wrong.push(`${name}:${lineOf(src, c.index)} a colour of the chrome's own, not from the tokens: ${c.text}`);
    }
    if (name !== 'styles/tokens.css') {
      for (const m of src.matchAll(/var\(--plus-[a-z-]+\)/g)) {
        const before = src.slice(0, m.index);
        const selector = before.slice(before.lastIndexOf('}') + 1, before.lastIndexOf('{')).trim();
        if (name === 'styles/ui.css' && /^\.btn-plus\b/.test(selector)) continue;
        wrong.push(`${name}:${lineOf(src, m.index)} Hevalo+'s gold off its button: ${selector}`);
      }
    }
  }
  for (const f of files(SRC, (n) => /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n))) {
    const src = code(readFileSync(f, 'utf8'));
    for (const m of src.matchAll(/fontSize:\s*([^,}\n]+)/g)) {
      const v = m[1].trim();
      if (v === "'var(--text)'" || v === "'var(--text-title)'") continue;
      // A choice between the two sizes, made in code.
      if (/^[^'"]*('var\(--text(-title)?\)'[^'"]*)+$/.test(v) && !/\d(px|rem|em)\b/.test(v)) continue;
      wrong.push(`${rel(f)}:${lineOf(src, m.index)} a third text size: fontSize: ${v}`);
    }
    for (const m of src.matchAll(/var\(--(?:plus|font-display|text-(?:body|secondary|caption|section|tab|title-lg))\b[^)]*\)/g)) {
      wrong.push(`${rel(f)}:${lineOf(src, m.index)} off the rules: ${m[0]}`);
    }
    for (const m of src.matchAll(SECOND)) wrong.push(`${rel(f)}:${lineOf(src, m.index)} a second colour beside the accent: ${m[0]}`);
    for (const m of src.matchAll(/\bbtn-plus\b/g)) {
      if (rel(f) === 'components/PlusButton.tsx') continue;
      wrong.push(`${rel(f)}:${lineOf(src, m.index)} Hevalo+'s button outside PlusButton`);
    }
  }
} else {
  /**
   * Drawings keep their own measure: a letter's paper scales its writing and notes with the sheet, and the note-size
   * picker shows a note's three sizes as three letters.
   */
  const SIZE_EXEMPT = new Set(['letters/PaperSheet.tsx', 'letters/LetterComposer.tsx']);
  /**
   * The chrome: the theme's parts and the navigation take every colour from the palette. The palette is where those
   * colours are written; an event's theme is its own art; the sign-in buttons draw the providers' marks in their own
   * colours, as their rules require; and the press outline is a development aid that is never shipped on.
   */
  const CHROME = (name) => /^(theme|navigation)\//.test(name);
  const CHROME_EXEMPT = new Set(['theme/palette.ts', 'theme/eventThemes.ts', 'theme/BrandMark.tsx', 'theme/Pressable.tsx']);
  for (const f of files(SRC, (n) => /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n))) {
    const src = code(readFileSync(f, 'utf8'));
    const name = rel(f);
    for (const m of src.matchAll(/fontSize:\s*([^,}\n]+)/g)) {
      const v = m[1].trim();
      if (/^typography\.sizes\.(text|title)$/.test(v) || /^number\b/.test(v)) continue;
      // The reader's own text size, applied to a size handed down by name.
      if (/^fontSize:\s*scaledFontSize\([A-Za-z_$][\w$.]*, [A-Za-z_$][\w$.]*\)/.test(src.slice(m.index))) continue;
      // One of the two sizes shrunk, never grown, to fit a box that cannot grow (tokens.ts `fitted`).
      if (/^fontSize:\s*fitted\(typography\.sizes\.(text|title), [A-Za-z_$][\w$.]*\)/.test(src.slice(m.index))) continue;
      // A size handed down by name, or the two sizes chosen between, is decided where it was named.
      if (/^[A-Za-z_$][\w$.]*(\[[\w$.'"]+\])?$/.test(v) && !/^\d/.test(v)) continue;
      if (/^[\w$.\s>=<!?:]+$/.test(v) && /typography\.sizes\.(text|title)/.test(v) && !/typography\.sizes\.(?!text\b|title\b)/.test(v)) continue;
      if (SIZE_EXEMPT.has(name)) continue;
      wrong.push(`${name}:${lineOf(src, m.index)} a third text size: fontSize: ${v}`);
    }
    for (const m of src.matchAll(/fontFamily:\s*([^,}\n]+)/g)) {
      if (m[1].trim() === 'typography.fontFamily' || name === 'theme/tokens.ts') continue;
      wrong.push(`${name}:${lineOf(src, m.index)} a second face: fontFamily: ${m[1].trim()}`);
    }
    for (const m of src.matchAll(SECOND)) wrong.push(`${name}:${lineOf(src, m.index)} a second colour beside the accent: ${m[0]}`);
    if (CHROME(name) && !CHROME_EXEMPT.has(name)) {
      for (const c of huedColours(src)) wrong.push(`${name}:${lineOf(src, c.index)} a colour of the chrome's own, not from the palette: ${c.text}`);
    }
    for (const m of src.matchAll(/\bPLUS_STYLE\b/g)) {
      if (name === 'theme/PlusButton.tsx') continue;
      wrong.push(`${name}:${lineOf(src, m.index)} Hevalo+'s gold off its button`);
    }
    for (const m of src.matchAll(/const [A-Z_]+ = (\d+(?:\.\d+)?);/g)) {
      // A size constant read as a text size elsewhere in the file is a third size under a name.
      const constName = src.slice(m.index + 6, src.indexOf(' =', m.index));
      if (new RegExp(`fontSize:\\s*${constName}\\b|display\\(${constName}\\)`).test(src) && !SIZE_EXEMPT.has(name)) {
        wrong.push(`${name}:${lineOf(src, m.index)} a third text size under a name: ${constName} = ${m[1]}`);
      }
    }
  }
}

if (wrong.length) {
  console.error(`design rules: ${wrong.length} place(s) break one face, two sizes, or the base, one accent, gold for rewards and Hevalo+:\n  ${wrong.join('\n  ')}`);
  process.exit(1);
}
console.log('design rules: one face, two sizes, and the base, one accent, gold for rewards and Hevalo+.');
