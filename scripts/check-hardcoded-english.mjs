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
 * What counts as copy: a run of words inside JSX, the string props a reader or
 * a screen reader is given — placeholder, title, aria-label, alt, and a React
 * Native button's `label` — and a quoted phrase anywhere in a component file,
 * because `{won ? 'Correct!' : 'Out of tries'}` is copy that no amount of
 * reading tag text will ever find. What does not: code, comments, single
 * tokens, and the short list of deliberate exceptions below, each of which has
 * to say why.
 *
 * Those last two were added after this reported the phone clean enough to
 * delete its debt file, over a Wordle screen still offering "Daily puzzle" and
 * "Out of tries" to nine languages. A gate is only worth the blind spots it
 * does not have.
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
  // a football club, on a sticker, beside Kurdistan and Zilan
  'Amed Spor',
  // the header on a shared Wordle grid. A share text is pasted into somebody
  // else's chat, where the sharer's language is not the reader's, so it stays
  // one recognisable name — the grid underneath is the content.
  'MyKurda Wordle',
]);

/**
 * Props whose value a reader or a screen reader is given.
 *
 * `accessibilityLabel` and `accessibilityHint` are React Native's: the phone has
 * no `aria-label`, and leaving them out would have let this gate report "clean"
 * over a screen whose every button announced itself in English.
 *
 * The last five are this codebase's own components. A React Native button has no
 * children — its copy arrives as `label="Daily puzzle"` — so a list that stopped
 * at the HTML and accessibility props read the phone's Wordle screen as clean
 * while it offered "Daily puzzle", "Out of tries" and "Save to vocabulary" to
 * nine languages. A prop that a person reads belongs here whoever defined it.
 */
const READER_FACING =
  /\b(placeholder|aria-label|alt|title|accessibilityLabel|accessibilityHint|label|heading|message|caption|hint)=(["'])((?:(?!\2).)*)\2/g;

/**
 * The same props, written as a template literal.
 *
 * `accessibilityLabel={`Insert ${key}`}` is a sentence a screen reader reads
 * out, and the pattern above cannot see it: it wants a quote and finds a
 * brace. Twenty of these were fixed by hand, one screen at a time.
 */
const READER_FACING_TEMPLATE =
  /\b(placeholder|aria-label|alt|title|accessibilityLabel|accessibilityHint|label|heading|message|caption|hint)=\{`(.*?)`\}/g;

/**
 * What is left of a template literal once the values are taken out.
 *
 * The words around the holes are the copy; the holes are data. A label that
 * opens with one — `${name} avatar` — leaves "avatar", a lone lowercase word,
 * and is waved through: that is the limit of reading these without a parser,
 * and it is still better than reading none of them.
 */
function templateWords(raw) {
  return raw
    .replace(/\$\{[^{}]*\}/g, ' ')
    .replace(/[`${}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Values that read like a phrase but are not one.
 *
 * SVG path data is the whole list so far, and it is unmistakable: a path
 * command letter followed by an actual coordinate. The icon set is one file of
 * it, and without this the gate would report every icon in the app as
 * untranslated English.
 *
 * The number matters. A first draft accepted any separator after the command
 * letter, which made "A title and some text are required." an SVG path — `A`,
 * then a space — and quietly excused every sentence that opens with the
 * article "A ".
 */
const NOT_LITERAL = [
  /^[MmLlHhVvCcSsQqTtAaZz]\s*-?[\d.]/,
  // a CSS font stack. "Georgia, "Times New Roman", serif" reads like a phrase
  // and is a machine instruction; the generic family at the end, or the word
  // Emoji in a system font's name, is what gives it away
  /(^|,\s*)(serif|sans-serif|monospace|cursive|fantasy|system-ui)$/,
  /\bEmoji$/,
];

/**
 * Files whose strings have no reader whose language we know.
 *
 * The Cloudflare Worker renders link previews for crawlers and chat apps. It
 * runs before anyone signs in, has no account to read a locale from, and its
 * output is consumed by Slack and WhatsApp rather than by the app. Translating
 * it would mean guessing, so it says one thing in English on purpose.
 */
const NOT_READER_FACING = [/[\\/]worker\.ts$/];

/**
 * Where a capitalised phrase is code rather than copy.
 *
 * A module specifier, a comparison against a literal, and a catalogue key —
 * `t('Something')` is the fix, not the problem. Each is matched on the 24
 * characters in front of the string, which is enough for all three and cheap.
 */
const NOT_COPY_CONTEXT = [
  /(from|import|require\()\s*$/,
  /[=!]==?\s*$/,
  /\bt\(\s*$/,
  /*
   * A font family name.
   *
   * "Iowan Old Style" is three capitalised English words and nobody reads it —
   * it names a typeface to the OS. The stack form is already excused by the
   * generic family at its end (see NOT_LITERAL), but React Native takes a
   * single family with nothing to give it away, so the key has to say so.
   * Deliberately narrow: the key must end in `Font` or be `fontFamily`.
   */
  /(\bfontFamily|[A-Za-z]Font)\s*:\s*$/,
];

function sources(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'i18n' || entry.name === 'test') continue;
      sources(p, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
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
    // A string first, copied out whole. Without this the // in a URL starts
    // a comment, the comment eats the closing quote, and every literal after
    // it in the file pairs with the wrong neighbour — which is how
    // 'http://localhost:3000' was reported as the phrase "http: staging:".
    const q = src[i];
    if (q === "'" || q === '"' || q === '`') {
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === '\\') {
          j += 2;
          continue;
        }
        if (src[j] === q) {
          j++;
          break;
        }
        if (q !== '`' && src[j] === '\n') break; // unterminated; leave it be
        j++;
      }
      out += src.slice(i, j);
      i = j;
    } else if (src.startsWith('//', i)) {
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
function isCopy(value, minWords = 2) {
  const text = value.trim();
  // Two characters, not four. Four was hiding the To that sits directly
  // under the From of the quiet-hours range — translating one of a pair is
  // worse than translating neither — along with Buy and Add. Nothing below
  // two characters is a word, and nothing between two and four turned out
  // to be anything but copy.
  if (text.length < 2) return false;
  if (NOT_COPY.has(text)) return false;
  // must start like a sentence or a label
  if (!/^[A-Z]/.test(text)) return false;
  // How many words it takes to be copy is the one thing the three passes
  // disagree about, and the disagreement is measured rather than guessed.
  // Reading the phone with the floor at one word: the tag-text pass found 36
  // strings and not one false positive, while the bare-literal pass found an
  // extra hundred that were HTTP verbs, route names and league tiers. A word
  // between tags is read by a person; a word on its own in a file is not.
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < minWords) return false;
  // Letters, spaces and ordinary punctuation only — no code. Anything this
  // class does not list is treated as an identifier and waved through, so a
  // missing character is a hole, not a false positive: the ellipsis was
  // absent and hid eleven strings, every placeholder in the lesson player
  // among them. Add the character rather than loosening the rule.
  if (!/^[A-Za-z\d\s.,!?;:'’“”"()&%…+·–—-]+$/.test(text)) return false;
  // a type or an expression that happens to read like a phrase
  if (/\b(Promise|React|Record|Partial|void|const|return|string|number|boolean)\b/.test(text)) return false;
  return true;
}

/**
 * The stripper is the one piece of this file that can fail silently: when it
 * mistook the // in a URL for a comment it ate the closing quote and every
 * literal after it in the file paired with the wrong neighbour. Nothing went
 * red — the gate just stopped seeing that file, and did so in 29 of them.
 *
 * There is no test runner in scripts/, so the check lives here and runs on
 * every invocation. Three strings is cheaper than the silence was.
 */
function selfTest() {
  const cases = [
    ['const a = \'http://x.dev\'; const b = \'Hello there\';', 'Hello there'],
    ['// just a comment\nconst b = \'Hello there\';', 'Hello there'],
    ['const u = `https://x.dev/${id}`; const b = \'Hello there\';', 'Hello there'],
  ];
  for (const [src, expected] of cases) {
    if (!withoutComments(src).includes(expected)) {
      throw new Error(`withoutComments lost ${JSON.stringify(expected)} in ${JSON.stringify(src)}`);
    }
  }
  if (withoutComments('// gone\n').trim() !== '') throw new Error('withoutComments stopped stripping comments');

  // what a template literal is left saying once the values come out
  const words = [
    ['Insert ${key}', 'Insert'],
    ['Read ${item.title}', 'Read'],
    ['Claim ${n} Zêr daily reward', 'Claim Zêr daily reward'],
    // a label that opens with a value keeps only a lowercase word, and is
    // waved through — the documented limit of reading these without a parser
    ['${name} avatar', 'avatar'],
  ];
  for (const [raw, expected] of words) {
    const got = templateWords(raw);
    if (got !== expected) throw new Error(`templateWords(${JSON.stringify(raw)}) gave ${JSON.stringify(got)}`);
  }
  if (isCopy(templateWords('${name} avatar'), 1)) {
    throw new Error('a lone lowercase word became copy; the capital-letter rule moved');
  }
}
selfTest();
const problems = [];

for (const file of sources(SRC)) {
  if (NOT_READER_FACING.some((re) => re.test(file))) continue;
  const src = withoutComments(readFileSync(file, 'utf8'));
  const lines = src.split(/\r?\n/);
  const asProp = new Set();

  lines.forEach((line, index) => {
    let m;

    READER_FACING_TEMPLATE.lastIndex = 0;
    while ((m = READER_FACING_TEMPLATE.exec(line))) {
      const words = templateWords(m[2]);
      if (isCopy(words, 1)) {
        problems.push({ file, line: index + 1, what: `${m[1]}={\`${m[2]}\`}` });
        // no asProp entry: the pass below reads quoted literals, never
        // backticks, so there is nothing there to report a second time
      }
    }

    READER_FACING.lastIndex = 0;
    while ((m = READER_FACING.exec(line))) {
      // Same floor as the tag text below, for the same reason: a prop a
      // person reads is copy at one word. 25 of them were in English,
      // eight being the Back a screen reader announces.
      if (isCopy(m[3], 1)) {
        problems.push({ file, line: index + 1, what: `${m[1]}="${m[3]}"` });
        // so the literal pass below does not report the same words a second
        // time, under a second spelling that also has to be paid off
        asProp.add(`${index + 1}|${m[3]}`);
      }
    }
  });

  /*
   * JSX text, which is what the multi-line paragraphs are.
   *
   * A tag's contents, taken across newlines, then judged as one phrase — the
   * paragraph in Blocked people was three lines of prose between <p> and </p>
   * and a line-at-a-time reading never saw a sentence.
   */
  // The `>` must actually close a tag. Without the lookbehind the `>` of an
  // arrow function opens a run of "tag text" that ends at the next `<` —
  // usually a generic — so `(u) => row(\n u,\n <View` was reported as the
  // English phrase "row( u,". Only the capital-letter rule was keeping that
  // out of the report, and a rule that hides one bug behind another is not
  // a rule anyone should be relying on.
  const between = /(?<![=!<>-])>([^<>{}]+)</g;
  let m;
  while ((m = between.exec(src))) {
    const value = m[1];
    // One word between tags is still a sentence to whoever reads it: the
    // screen titled Settings, the button that says Send, the chip that
    // says Locked. Thirty-six of them were sitting in English behind this.
    if (!isCopy(value, 1)) continue;
    const line = src.slice(0, m.index).split(/\r?\n/).length;
    // trimmed *after* the cut, not before: slicing a trimmed string can end on
    // a space, and a reported line that ends in whitespace is one nobody can
    // paste into the debt list and have match
    problems.push({ file, line, what: value.replace(/\s+/g, ' ').slice(0, 80).trim() });
  }

  /*
   * Copy inside an expression, which is where the rest of it turned out to be.
   *
   * The two checks above read a tag's text and a tag's props. Neither can see
   * `{won ? 'Correct!' : 'Out of tries'}` or `{note ?? 'Finding a match…'}`,
   * because the JSX-text pattern deliberately stops at `{`. That is where most
   * of the phone's remaining English was hiding while its debt file sat empty
   * and the app claimed to speak nine languages.
   *
   * So: every quoted literal in the file, judged as copy, minus the contexts
   * where a capitalised phrase is not something anybody reads. Reading the
   * whole file rather than only the JSX is deliberate — a string handed to
   * `setError` three functions up is read by exactly the same person.
   */
  const literal = /(['"])((?:(?!\1)[^\\]|\\.)*)\1/g;
  let lit;
  while ((lit = literal.exec(src))) {
    const value = lit[2];
    if (!isCopy(value) || NOT_LITERAL.some((re) => re.test(value))) continue;
    const before = src.slice(Math.max(0, lit.index - 24), lit.index);
    if (NOT_COPY_CONTEXT.some((re) => re.test(before))) continue;
    const line = src.slice(0, lit.index).split(/\r?\n/).length;
    if (asProp.has(`${line}|${value}`)) continue;
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
