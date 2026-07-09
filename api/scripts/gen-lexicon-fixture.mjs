/**
 * Generate a structurally-valid lexicon fixture for STAGING scale/perf
 * testing (KUR-048). These are NOT real Kurmanji definitions — they exist to
 * load ≥5,000 entries so search/index performance can be validated. The real
 * curated lexicon is supplied by the content team and loaded via the same
 * `dict:import` pipeline.
 *
 *   node scripts/gen-lexicon-fixture.mjs [count] > fixture.json
 */
const count = Number(process.argv[2] ?? 5000);

// Kurmanji-ish syllable stock so headwords look plausible + fold nicely.
const onsets = ['b', 'c', 'ç', 'd', 'f', 'g', 'h', 'k', 'l', 'm', 'n', 'p', 'r', 's', 'ş', 't', 'v', 'x', 'z'];
const vowels = ['a', 'e', 'ê', 'i', 'î', 'o', 'u', 'û'];
const codas = ['', 'n', 'r', 'v', 'ş', 'k', 'l', 'm', 't'];
const pos = ['noun', 'verb', 'adjective', 'adverb'];

// Mixed-radix mapping index → unique two-syllable headword (no collisions,
// so we never loop; capacity is (onset*vowel*coda)^2 ≈ 1.8M >> 5000).
const radices = [onsets, vowels, codas, onsets, vowels, codas];

function headwordFor(index) {
  let n = index;
  let word = '';
  for (const stock of radices) {
    word += stock[n % stock.length];
    n = Math.floor(n / stock.length);
  }
  return word;
}

const entries = [];
for (let i = 0; i < count; i++) {
  const headword = headwordFor(i);
  entries.push({
    headword,
    dialect: 'kurmanji',
    senses: [{ pos: pos[i % pos.length], definitionEn: `[fixture] sense for ${headword}` }],
  });
}

process.stdout.write(JSON.stringify(entries));
