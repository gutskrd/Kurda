/**
 * No frames, no frost, one radius scale.
 *
 * - A surface has no passive edge: a border that is always `colors.glassBorder` around a surface with a fill says
 *   nothing the fill does not and reads as a box drawn on glass. An edge that changes (selected, wrong, live, gold) is
 *   a state and is allowed. An edge carrying another colour is not passive and is not checked.
 * - Nothing is blurred behind a surface.
 * - A corner is a radius token (the scale mirrors the web's `--r-*` tokens to the pixel), unless it is a listed
 *   geometric consequence.
 * - A border on one side only is a divider and takes `colors.separator`, not the edge colour: the palette has
 *   both, and
 *   in dark mode the edge is 1.75× the divider.
 * - A colour has a width to draw it.
 * - A style a `TextInput` wears declares a minHeight, since a 39 pt field is under the 44 a fingertip needs and a
 *   missed
 *   field dismisses the keyboard or focuses the one above.
 *
 * Runs inside `npm run lint --workspace @kurda/mobile`.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname, relative, sep } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Apple HIG and WCAG minimum, the number `src/a11y/a11y.ts` exports, repeated because this .mjs file cannot import a .ts module. */
const MIN_TOUCH_TARGET = 44;
const SRC = join(ROOT, 'src');

/**
 * Corners that are measurements rather than choices: each says why, as a geometric consequence (half a known
 * size, a scale's own definition).
 */
const ALLOWED_RAW_RADII = new Set([
  // The scale itself, where the numbers are the definition.
  'theme/tokens.ts',
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

  // A corner written as a number, anywhere in the file.
  if (!ALLOWED_RAW_RADII.has(where)) {
    src.split('\n').forEach((line, i) => {
      const m = /borderRadius:\s*(\d+)/.exec(line);
      if (m) problems.push(`${where}:${i + 1}  borderRadius: ${m[1]} — use a radii token (radii.pill for a circle or capsule)`);
    });
  }

  // The frost, which is the one thing here that is a single import away.
  if (/from '(expo-blur|@react-native-community\/blur)'/.test(src)) {
    problems.push(`${where}  a backdrop blur — surfaces are clear now; the edge is LensRim, not frost`);
  }

  // A frame round a shape that already has one.
  const body = src.split('const styles = StyleSheet.create(')[0];
  for (const s of styleObjects(src)) {
    const width = /borderWidth:\s*([^,}]+)/.exec(s.body)?.[1]?.trim();
    if (!width) continue;
    // A colour fixed in the style object is the author naming the edge; leave it.
    if (/borderColor:/.test(s.body)) continue;

    const uses = [...body.matchAll(new RegExp(`styles\\.${s.key}\\b`, 'g'))];
    if (uses.length === 0) continue;

    // What every call site paints this edge.
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
   * A field you type into is a field you have to hit: every style in a `<TextInput>`'s own `style` prop must
   * state a minimum height. A multi-line field declares a bigger one, so the rule asks for a minHeight rather
   * than a number.
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
   * A colour with nothing to draw it. Width lives in the StyleSheet and colour at the call site, so removing one
   * leaves the other looking complete, and nothing shows or warns. So every style array naming a colour is asked
   * whether anything in it has a width.
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

  // A line on one side only is a divider, and takes the divider colour.
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
