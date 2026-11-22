/**
 * Three rules for every screen, on the website and the phone alike:
 *
 * - One face: a font family is the one token (`var(--font-sans)` on the website, `typography.fontFamily` on the phone).
 * - Two sizes: a text size is `var(--text)` or `var(--text-title)` on the website, `typography.sizes.text` or
 *   `typography.sizes.title` on the phone. A size handed down as a name (a component's `size`) is allowed; a number or
 *   sum written at the call is not. Either size may shrink, never grow, to fit a box that cannot grow with it.
 * - One accent, on the main button alone: only the main button's styles may name it (`--accent` in ui.css's
 *   `.btn-primary`, `colors.accent` in the phone's button and lesson-button tones), the road's own main button (the
 *   stop to do now and the card that starts its lesson), and the lesson's own (Check, at the foot of every exercise).
 *
 * Drawings keep their own type and colour: a letter's paper scales its writing with the sheet. Those files are listed
 * below with why. Runs inside `npm run lint` for the website (`web`) and the phone (`mobile`).
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

if (app === 'web') {
  /** A letter's paper is a drawn sheet: its writing and notes scale with the sheet, as a picture does. */
  const SIZE_EXEMPT = new Set(['letters/paper.css']);
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
    if (name !== 'styles/tokens.css') {
      for (const m of src.matchAll(/var\(--accent(?:-[a-z]+)?\)/g)) {
        const before = src.slice(0, m.index);
        const selector = before.slice(before.lastIndexOf('}') + 1, before.lastIndexOf('{')).trim();
        if (name === 'styles/ui.css' && /^\.btn-primary\b/.test(selector)) continue;
        // The road's main button: the stop to do now and the card it opens, where the lesson is started.
        if (name === 'learn/path.css' && /^(:root\[data-theme='light'\] )?\.lp-(pop\.is-go|node\.is-current)\b/.test(selector)) continue;
        // The lesson's main button: Check, the colours its bar hands to the one button it holds.
        if (name === 'styles/learn.css' && selector === '.lesson-bar') continue;
        wrong.push(`${name}:${lineOf(src, m.index)} the accent off the main button: ${selector}`);
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
    for (const m of src.matchAll(/var\(--(?:accent|font-display|text-(?:body|secondary|caption|section|tab|title-lg))\b[^)]*\)/g)) {
      wrong.push(`${rel(f)}:${lineOf(src, m.index)} off the rules: ${m[0]}`);
    }
  }
} else {
  /**
   * Drawings keep their own measure: a letter's paper scales its writing and notes with the sheet, and the note-size
   * picker shows a note's three sizes as three letters.
   */
  const SIZE_EXEMPT = new Set(['letters/PaperSheet.tsx', 'letters/LetterComposer.tsx']);
  /**
   * The main button (ClayButton), the lesson's Check (tileButtonTone) and an empty screen's way out: the only places the
   * accent is worn, with the road's own main button, the stop to do now and the card that starts its lesson.
   */
  const ACCENT_ALLOWED = new Set(['theme/glass.tsx', 'theme/tileTones.ts', 'theme/palette.ts', 'theme/EmptyState.tsx', 'coursemap/SkillNodeView.tsx', 'coursemap/StopCard.tsx']);
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
    for (const m of src.matchAll(/\bcolors\.accent\b/g)) {
      if (ACCENT_ALLOWED.has(name)) continue;
      wrong.push(`${name}:${lineOf(src, m.index)} the accent off the main button`);
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
  console.error(`design rules: ${wrong.length} place(s) break one face, two sizes or one accent:\n  ${wrong.join('\n  ')}`);
  process.exit(1);
}
console.log('design rules: one face, two sizes, and the accent on the main button alone.');
