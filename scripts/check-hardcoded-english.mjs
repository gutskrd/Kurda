/**
 * No English left in the JSX.
 *
 * `check-i18n.mjs` catches a key that nothing renders. This catches the other
 * half of the same mistake, and the half that a reader actually notices: copy
 * written straight into a component, which no catalogue knows about and no
 * amount of translating will ever reach.
 *
 * Both halves have happened here. Settings was translated in nine languages
 * while the page went on rendering hardcoded English; later, "Blocked people"
 * was reported by the person using the app — three paragraphs of English under
 * a heading that was properly translated, which is exactly what this misses
 * when only the key side is checked.
 *
 * What counts as copy: a run of words inside JSX, and the string props a reader
 * or a screen reader is given — placeholder, title, aria-label, alt. What does
 * not: code, comments, single tokens, and the short list of deliberate
 * exceptions below, each of which has to say why.
 *
 * Runs inside `npm run lint --workspace @kurda/web`, beside the other check.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname, relative, sep } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Which app to read. `node check-hardcoded-english.mjs mobile` checks the phone.
 *
 * One gate rather than a copy per workspace: the phone had the same problem in
 * larger numbers and nothing was watching for it, and a second copy of this
 * file would have drifted from the first the way the locale lists did.
 */
const WORKSPACE = process.argv[2] ?? 'web';
const SRC = join(ROOT, WORKSPACE, 'src');

/**
 * Copy that is known, tolerated, and being worked through.
 *
 * A ratchet, not an amnesty. Anything listed here is English that is already in
 * the tree; anything *not* listed fails the build, so the debt cannot grow
 * while it is being paid down. And an entry that no longer matches anything is
 * itself an error — a line that has been fixed must leave the list, or the file
 * quietly becomes a list of things that used to be true.
 */
const DEBT_FILE = join(ROOT, 'scripts', 'i18n-debt', `${WORKSPACE}.txt`);
const debt = existsSync(DEBT_FILE)
  ? new Set(
      readFileSync(DEBT_FILE, 'utf8')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#')),
    )
  : new Set();

/**
 * Words that are the same in every language MyKurda speaks, or are not words.
 *
 * Each of these would otherwise be "translated" into itself nine times. Zêr is
 * the app's own currency and keeps its Kurmancî name everywhere, the way a
 * currency does.
 */
const NOT_COPY = new Set([
  'MyKurda',
  'Zêr',
  'XP',
  'iOS',
  'Android',
  'Hex',
  'RGB',
  'HSL',
  'Enter',
  'Sans',
  'Serif',
  'Slab',
  'Mono',
  'Premium',
]);

/**
 * Props whose value a reader or a screen reader is given.
 *
 * The last two are React Native's: the phone has no `aria-label`, it has
 * `accessibilityLabel`, and leaving them out would have let this gate report
 * "clean" over a screen whose every button announced itself in English.
 */
const READER_FACING =
  /\b(placeholder|aria-label|alt|title|accessibilityLabel|accessibilityHint)=(["'])((?:(?!\2).)*)\2/g;

function sources(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'i18n' || entry.name === 'test') continue;
      sources(p, out);
    } else if (/\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name)) {
      out.push(p);
    }
  }
  return out;
}

/**
 * Blank out comments so their prose is not mistaken for copy.
 *
 * This file is full of long explanatory comments by design, and they are the
 * single biggest source of false positives. Replacing them with spaces rather
 * than deleting keeps every line number honest.
 */
function withoutComments(src) {
  let out = '';
  let i = 0;
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  while (i < src.length) {
    if (src.startsWith('//', i)) {
      const end = src.indexOf('\n', i);
      const stop = end === -1 ? src.length : end;
      out += blank(src.slice(i, stop));
      i = stop;
    } else if (src.startsWith('/*', i)) {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      out += blank(src.slice(i, stop));
      i = stop;
    } else {
      out += src[i];
      i += 1;
    }
  }
  return out;
}

/** Is this a phrase a person reads, rather than an identifier or a fragment? */
function isCopy(value) {
  const text = value.trim();
  if (text.length < 4) return false;
  if (NOT_COPY.has(text)) return false;
  // must start like a sentence or a label
  if (!/^[A-Z]/.test(text)) return false;
  // at least two words, one of them more than a letter or two
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  // letters, spaces and ordinary punctuation only — no code
  if (!/^[A-Za-z\d\s.,!?;:'’“”"()&%–—-]+$/.test(text)) return false;
  // a type or an expression that happens to read like a phrase
  if (/\b(Promise|React|Record|Partial|void|const|return|string|number|boolean)\b/.test(text)) return false;
  return true;
}

const problems = [];

for (const file of sources(SRC)) {
  const src = withoutComments(readFileSync(file, 'utf8'));
  const lines = src.split(/\r?\n/);

  lines.forEach((line, index) => {
    let m;
    READER_FACING.lastIndex = 0;
    while ((m = READER_FACING.exec(line))) {
      if (isCopy(m[3])) problems.push({ file, line: index + 1, what: `${m[1]}="${m[3]}"` });
    }
  });

  /*
   * JSX text, which is what the multi-line paragraphs are.
   *
   * A tag's contents, taken across newlines, then judged as one phrase — the
   * paragraph in Blocked people was three lines of prose between <p> and </p>
   * and a line-at-a-time reading never saw a sentence.
   */
  const between = />([^<>{}]+)</g;
  let m;
  while ((m = between.exec(src))) {
    const value = m[1];
    if (!isCopy(value)) continue;
    const line = src.slice(0, m.index).split(/\r?\n/).length;
    // trimmed *after* the cut, not before: slicing a trimmed string can end on
    // a space, and a reported line that ends in whitespace is one nobody can
    // paste into the debt list and have match
    problems.push({ file, line, what: value.replace(/\s+/g, ' ').slice(0, 80).trim() });
  }
}

/** How a line is written in the debt file: path, then the copy itself. */
const entry = (p) => `${relative(ROOT, p.file).split(sep).join('/')}  ${p.what}`;

const fresh = problems.filter((p) => !debt.has(entry(p)));
const paid = [...debt].filter((d) => !problems.some((p) => entry(p) === d));

if (fresh.length > 0) {
  console.error(`\n${fresh.length} piece(s) of English written into the JSX:\n`);
  for (const p of fresh) {
    console.error(`  ${relative(ROOT, p.file).split(sep).join('/')}:${p.line}  ${p.what}`);
  }
  console.error('\nPut it in the catalogue, translate it, and render it with t().\n');
  process.exit(1);
}

if (paid.length > 0) {
  console.error(`\n${paid.length} line(s) in ${relative(ROOT, DEBT_FILE)} no longer exist:\n`);
  for (const d of paid) console.error(`  ${d}`);
  console.error('\nThey have been fixed — delete them, so the list stays true.\n');
  process.exit(1);
}

const owed = debt.size > 0 ? ` (${debt.size} known, being paid down)` : '';
console.log(`i18n: no new English in the ${WORKSPACE} JSX${owed}.`);
