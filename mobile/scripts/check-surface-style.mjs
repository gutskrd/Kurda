/**
 * No frames, no frost, one radius scale.
 *
 * Two kinds of drift that nothing was watching for, both measured before this
 * was written:
 *
 *   Eighty-nine bordered surfaces existed in fifteen different shapes. Of the
 *   ones whose edge is only ever `colors.glassBorder` — a passive edge, there
 *   to separate a surface from the gradient behind it rather than to be seen —
 *   thirty-nine drew a hairline, twenty drew 1pt and three drew 2pt. On a 3×
 *   screen a hairline is one physical pixel and 1pt is three, so a feed card's
 *   edge was three times the weight of a settings row's, and an answer field's
 *   was six times, in the same app and often on the same screen.
 *
 *   That first version of this rule picked one weight and stopped there,
 *   which was answering the wrong question. Seventy-four of those edges sat
 *   round a surface that already had a fill, where the line says nothing the
 *   fill has not said and reads as a box drawn on glass. They are gone, and
 *   the rule is now that they stay gone: an edge that is always the same grey
 *   is a frame. An edge that changes — selected, wrong, live, gold — is a
 *   state, and a state is allowed to be seen.
 *
 *   And eight corners were written as numbers beside a radius scale that
 *   mirrors the website's `--r-*` tokens to the pixel: two sheets at 20 where
 *   the scale says 18, a row at 14 where it says 12, four that were already
 *   exactly a token but spelled as digits, and circles that said `20` on a 40pt
 *   box and `60` on a 120pt one — the same idea written twice, and wrong the
 *   moment either size changes.
 *
 * And nine dividers were drawn in the colour of an edge. The palette has both
 * and says which is which: `glassBorder` is "hairline edge — kept subtle" and
 * `separator` is "faint divider between rows inside a surface". In dark mode
 * they are rgba(255,255,255,0.14) and rgba(255,255,255,0.08), so the edge is
 * 1.75× the divider — and a chat screen had one of each, the nav bar line in
 * one grey and the composer line above the keyboard in the other.
 *
 * And nine text fields were 39pt tall: a hairline edge, `radii.md`, and 8pt of
 * padding around 16pt text. That is under the 44 a fingertip needs, and a miss
 * on a text field is worse than a miss on a button — it dismisses the keyboard
 * or focuses the one above.
 *
 * So: a surface has no passive edge and nothing blurred behind it, a corner
 * is a token, a border on one side only is a divider and takes
 * `colors.separator`, a colour has a width to draw it, and a style a
 * `TextInput` wears declares a minHeight.
 *
 * An edge that carries a colour is not passive and is not checked — the brand
 * on a selected option, danger on a live recording, the gold rim on a badge are
 * all meant to be seen at whatever weight they were given.
 *
 * Runs inside `npm run lint --workspace @kurda/mobile`.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname, relative, sep } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Apple HIG / WCAG, the same number `src/a11y/a11y.ts` exports — this file is
 * .mjs and cannot import a .ts module, so it is written once more here. */
const MIN_TOUCH_TARGET = 44;
const SRC = join(ROOT, 'src');

/**
 * Corners that are a measurement rather than a choice.
 *
 * Each has to say why. A number here is a geometric consequence — half of a
 * known size, a scale's own definition — not a decision somebody made about
 * how round a card should look.
 */
const ALLOWED_RAW_RADII = new Set([
  // the scale itself, where the numbers are the definition
  'theme/tokens.ts',
  // the tab bar island is a capsule of a known height; `TAB_BAR_HEIGHT / 2` is
  // the arithmetic, not a corner style
  'navigation/GlassTabBar.tsx',
]);

function sources(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) sources(p, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(p);
  }
  return out;
}

const rel = (f) => relative(SRC, f).split(sep).join('/');

/** Every `key: { … }` in a file's StyleSheet, brace-balanced. */
function styleObjects(src) {
  const out = [];
  const re = /\n  ([A-Za-z][A-Za-z\d]*): \{/g;
  let m;
  while ((m = re.exec(src))) {
    const i = src.indexOf('{', m.index);
    let depth = 0;
    for (let j = i; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') {
        depth--;
        if (depth === 0) {
          out.push({
            key: m[1],
            body: src.slice(i + 1, j).replace(/\s+/g, ' ').trim(),
            line: src.slice(0, m.index).split('\n').length + 1,
          });
          break;
        }
      }
    }
  }
  return out;
}

const problems = [];

for (const file of sources(SRC)) {
  const src = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const where = rel(file);

  // a corner written as a number, anywhere in the file
  if (!ALLOWED_RAW_RADII.has(where)) {
    src.split('\n').forEach((line, i) => {
      const m = /borderRadius:\s*(\d+)/.exec(line);
      if (m) problems.push(`${where}:${i + 1}  borderRadius: ${m[1]} — use a radii token (radii.pill for a circle or capsule)`);
    });
  }

  // the frost, which is the one thing here that is a single import away
  if (/from '(expo-blur|@react-native-community\/blur)'/.test(src)) {
    problems.push(`${where}  a backdrop blur — surfaces are clear now; the edge is LensRim, not frost`);
  }

  // a frame round a shape that already has one
  const body = src.split('const styles = StyleSheet.create(')[0];
  for (const s of styleObjects(src)) {
    const width = /borderWidth:\s*([^,}]+)/.exec(s.body)?.[1]?.trim();
    if (!width) continue;
    // a colour fixed in the style object is the author naming the edge; leave it
    if (/borderColor:/.test(s.body)) continue;

    const uses = [...body.matchAll(new RegExp(`styles\\.${s.key}\\b`, 'g'))];
    if (uses.length === 0) continue;

    // what every call site paints this edge
    const colours = new Set();
    for (const u of uses) {
      const near = body.slice(u.index, u.index + 400);
      for (const c of near.matchAll(/borderColor:\s*([^,}\n]+)/g)) colours.add(c[1].trim());
    }
    if (colours.size === 1 && [...colours][0] === 'colors.glassBorder') {
      problems.push(
        `${where}:${s.line}  ${s.key} — borderWidth: ${width} on an edge that is only ever glassBorder; a surface has a fill, not a frame`,
      );
    }
  }

  /*
   * A field you type into is a field you have to hit.
   *
   * Every style named in a `<TextInput>`'s own `style` prop has to say how
   * tall it is at least. A multi-line field declares a bigger one of its own,
   * which is why the rule asks for a minHeight rather than for the number.
   */
  for (const m of src.matchAll(/<TextInput[\s\S]{0,600}?\/>/g)) {
    const tag = m[0];
    const styleProp = /style=\{\[?([\s\S]*?)\]?\}/.exec(tag)?.[1] ?? '';
    for (const ref of styleProp.matchAll(/styles\.([A-Za-z][A-Za-z\d]*)/g)) {
      const s2 = styleObjects(src).find((o) => o.key === ref[1]);
      if (!s2 || /minHeight|\bheight:/.test(s2.body)) continue;
      if (!/fontSize|padding/.test(s2.body)) continue;
      problems.push(
        `${where}:${s2.line}  ${s2.key} — a TextInput wears this and it has no minHeight; fields are at least ${MIN_TOUCH_TARGET}`,
      );
    }
  }

  /*
   * A colour with nothing to draw it.
   *
   * Width and colour live in two places in this app — the width in the
   * StyleSheet, the colour at the call site — so removing one leaves the
   * other looking complete. Taking the frames out cost two states this way
   * before anyone noticed: the goal picker's selected ring and the gold rim
   * on a gift you have not opened, both reduced to a colour with no border.
   *
   * Nothing shows and nothing warns, so the question has to be asked of every
   * style array that names a colour: does anything in it have a width?
   */
  for (const m of src.matchAll(/style=\{(\(\{[^}]*\}\) =>\s*)?\[/g)) {
    const open = src.indexOf('[', m.index);
    let depth = 0;
    let close = -1;
    for (let j = open; j < src.length; j++) {
      if (src[j] === '[') depth++;
      else if (src[j] === ']' && --depth === 0) {
        close = j;
        break;
      }
    }
    if (close < 0) continue;
    const arr = src.slice(open, close + 1);
    if (!/borderColor:/.test(arr) || /borderWidth:/.test(arr)) continue;
    const names = [...arr.matchAll(/styles\.([A-Za-z][A-Za-z\d]*)/g)].map((x) => x[1]);
    const objs = styleObjects(src);
    const drawn = names.some((n) => /border(Top|Right|Bottom|Left)?Width:/.test(objs.find((o) => o.key === n)?.body ?? ''));
    if (drawn) continue;
    const line = src.slice(0, open).split('\n').length;
    problems.push(
      `${where}:${line}  [${names.join(', ')}] — a borderColor with no borderWidth behind it draws nothing`,
    );
  }

  // a line on one side only is a divider, and takes the divider colour
  src.split('\n').forEach((line, i) => {
    const m = /border(Top|Bottom|Left|Right)Color:\s*colors\.glassBorder/.exec(line);
    if (m) {
      problems.push(
        `${where}:${i + 1}  border${m[1]}Color: colors.glassBorder — a border on one side is a divider; use colors.separator`,
      );
    }
  });
}

if (problems.length > 0) {
  console.error(`\nsurfaces: ${problems.length} that do not match the rest of the app:\n`);
  for (const p of problems) console.error(`  ${p}`);
  console.error('\nA surface has a fill, not a frame, and nothing blurred behind it; a corner is a radii');
  console.error('token, a one-sided line is a separator, a colour has a width, and a field is 44 tall.');
  console.error('If a number here is a measurement rather than a choice, say so in ALLOWED_RAW_RADII.\n');
  process.exit(1);
}

console.log('surfaces: no frames, no frost, every colour drawn, every corner on the scale, every field tappable.');
