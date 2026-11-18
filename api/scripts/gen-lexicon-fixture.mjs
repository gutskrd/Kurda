/**
 * Generates a structurally valid lexicon fixture for scale testing on staging. The entries are not real Kurmanji; the
 * curated lexicon is loaded through the same `dict:import` pipeline.
 *
 *   node scripts/gen-lexicon-fixture.mjs [count] > fixture.json
 */
const count = Number(process.argv[2] ?? 5000);

// Kurmanji-ish syllable stock so headwords look plausible + fold nicely.
const onsets = ['b', 'c', 'ç', 'd', 'f', 'g', 'h', 'k', 'l', 'm', 'n', 'p', 'r', 's', 'ş', 't', 'v', 'x', 'z'];
const vowels = ['a', 'e', 'ê', 'i', 'î', 'o', 'u', 'û'];
const codas = ['', 'n', 'r', 'v', 'ş', 'k', 'l', 'm', 't'];
const pos = ['noun', 'verb', 'adjective', 'adverb'];

// A mixed-radix index gives each entry a unique two-syllable headword, so there are no collisions (capacity about 1.8M).
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
