/**
 * The App Store listing fits the store.
 *
 * App Store Connect refuses a field that is too long only when somebody pastes
 * it in, on the day of submitting, one language at a time. This reads every
 * language in docs/app-store/listing.md and says, before that day, which field
 * of which language would be refused: the name and the subtitle are 30
 * characters, the promotional text 170, the description and what's new
 * 4,000, and the keywords 100 bytes with no space after a comma. Bytes, not
 * letters: an Arabic letter, or a Turkish ö, takes two of the keywords' 100.
 *
 * Run it after changing the listing: `node scripts/check-listing.mjs`.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'app-store', 'listing.md');

/** What the store allows in each field, in characters. */
const LIMITS = { Name: 30, Subtitle: 30, 'Promotional text': 170, Keywords: 100, 'What’s new': 4000, Description: 4000 };

const text = readFileSync(FILE, 'utf8');
// a language is a second-level heading; everything up to the next one is its listing
const sections = text.split(/^## /m).slice(1);
const problems = [];
let languages = 0;

for (const section of sections) {
  const language = section.split('\n', 1)[0].replace(/,.*$/, '').trim();
  if (language === 'Screenshots') continue;
  languages += 1;
  const fields = {};
  for (const m of section.matchAll(/^\*\*([^*]+?)\*\*(?: \(\d+\))?: (.+)$/gm)) fields[m[1]] = m[2].trim();
  const description = /\*\*Description\*\*:\s*```text\n([\s\S]*?)```/.exec(section);
  if (description) fields.Description = description[1].trim();

  for (const [field, limit] of Object.entries(LIMITS)) {
    const value = fields[field];
    if (value === undefined) {
      problems.push(`${language}: no ${field}`);
      continue;
    }
    // characters as a person counts them, not UTF-16 units: an Arabic or Turkish letter is one
    const length = [...value].length;
    if (length > limit) problems.push(`${language}: ${field} is ${length} characters, the store allows ${limit}`);
  }
  const keywords = fields.Keywords ?? '';
  const bytes = Buffer.byteLength(keywords, 'utf8');
  if (bytes > 100) problems.push(`${language}: Keywords are ${bytes} bytes, the store allows 100`);
  if (/,\s/.test(keywords)) problems.push(`${language}: a space after a comma in the keywords is a character spent on nothing`);
  const words = keywords.split(',');
  if (new Set(words).size !== words.length) problems.push(`${language}: a keyword is listed twice`);
}

if (problems.length > 0) {
  console.error(`listing: ${problems.length} field(s) the store would refuse:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`listing: ${languages} languages, every field within the store's limits.`);
