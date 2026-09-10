/**
 * Every message key is read by something.
 *
 * A key that is translated nine times and rendered nowhere is not a
 * translation — it is nine strings of work that never reach a reader.
 * Twenty-nine of them had accumulated before anyone checked, including the
 * whole of Settings, which was translated in every language while the page went
 * on rendering hardcoded English.
 *
 * This lives in a script rather than in the test suite because it reads the
 * source tree, and `web` is a browser workspace with no Node types. It runs as
 * part of `npm run lint --workspace @kurda/web`, which is what CI already runs.
 *
 * A key counts as read if any file under `web/src` mentions it in quotes —
 * through `t('…')`, or through a record of `MessageKey`s that something else
 * looks up, or as a JSX attribute like `what="gate.what.course"`.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'web', 'src');

/** The catalogues themselves: every key is written there by definition. */
const CATALOGUE = /[/\\]i18n[/\\](en|ku|ckb|nl|de|es|fr|tr|ar)\.ts$/;

function sources(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sources(p));
    else if (/\.tsx?$/.test(entry.name) && !CATALOGUE.test(p)) out.push(p);
  }
  return out;
}

const english = readFileSync(join(SRC, 'i18n', 'en.ts'), 'utf8');
const keys = [...english.matchAll(/^ {2}'([^']+)':/gm)].map((m) => m[1]);
const code = sources(SRC)
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');

const unused = keys.filter((key) => !code.includes(`'${key}'`) && !code.includes(`"${key}"`));

if (unused.length > 0) {
  console.error(`\n${unused.length} message key(s) are translated but never read:\n`);
  for (const key of unused) console.error(`  ${key}`);
  console.error('\nWire them up, or delete them from all nine catalogues.\n');
  process.exit(1);
}

console.log(`i18n: all ${keys.length} keys are read by something.`);
