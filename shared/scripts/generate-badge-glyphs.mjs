/**
 * Generate the badges' glyphs from Phosphor — the same family the browser and
 * the phone draw their icons in, in its filled weight.
 *
 * A badge is one calm shape in one colour with one symbol set into it
 * (art/badges.ts), and the symbol has to read at 44 pixels as surely as at
 * 168. The filled glyphs are drawn for exactly that: one silhouette each, at
 * one optical weight, so sixty badges look like one set. The path data for the
 * ones named here is extracted and committed, as the phone's icons are
 * (`mobile/scripts/generate-icon-paths.mjs`), so the art needs no dependency
 * at run time and a change of glyph is a diff someone reads.
 *
 * Run from the repo root after changing MAP:
 *
 *   node shared/scripts/generate-badge-glyphs.mjs
 *
 * `--check` (part of shared's lint) fails when the committed file is not what
 * this produces.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// from this file, not from cwd: npm runs a workspace's scripts with cwd set to that workspace
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFS = path.join(ROOT, 'node_modules/@phosphor-icons/react/dist/defs');
const OUT = path.join(ROOT, 'shared/src/art/badge-glyphs.ts');

/**
 * What each badge shows: the glyph, and why that one. A badge of the
 * catalogue with no line here is drawn by hand in art/badges.ts (the
 * pomegranate of Yalda night, the pearl), and the art's tests say which.
 */
const MAP = {
  // learning
  ders: { glyph: 'BookOpen', note: 'lessons: the open book Learn is drawn as' },
  'peyven-min': { glyph: 'TextAa', note: 'my words: letters, as the dictionary is drawn' },
  bekemasi: { glyph: 'SealCheck', note: 'flawless: a seal with its tick' },
  dubare: { glyph: 'ArrowsClockwise', note: 'review: round again' },
  cirokbej: { glyph: 'Feather', note: 'the storyteller’s quill' },
  rewi: { glyph: 'Compass', note: 'the traveller’s compass' },
  ferheng: { glyph: 'Books', note: 'the dictionary: books on a shelf' },
  zengil: { glyph: 'Bell', note: 'the bell: what was heard and said' },
  penus: { glyph: 'PenNib', note: 'the pen: what was written out' },
  belur: { glyph: 'DiamondsFour', note: 'crystal: a cluster of facets' },
  gencine: { glyph: 'TreasureChest', note: 'treasure: the words kept' },
  // habit
  agir: { glyph: 'Fire', note: 'the fire a streak keeps burning' },
  hefte: { glyph: 'CalendarCheck', note: 'a week’s goal, met' },
  roj: { glyph: 'Sun', note: 'days: roj is the day and the sun' },
  vegera: { glyph: 'HandWaving', note: 'the return: a wave of welcome back' },
  pela: { glyph: 'Waves', note: 'the wave of the highest league' },
  cay: { glyph: 'Coffee', note: 'tea: the day’s glass, steaming' },
  'gula-hefte': { glyph: 'Flower', note: 'the flower of a full week' },
  'heyva-cardehe': { glyph: 'MoonStars', note: 'the moon of a full month' },
  // games
  peyvzan: { glyph: 'GridFour', note: 'the word-knower: the grid of Peyvok' },
  helbestvan: { glyph: 'Guitar', note: 'the poet: verse is sung to strings' },
  bilez: { glyph: 'Lightning', note: 'fast' },
  rastnivis: { glyph: 'Keyboard', note: 'the accurate writer, in the typing race' },
  guhdar: { glyph: 'Headphones', note: 'the listener' },
  hemereng: { glyph: 'Palette', note: 'all colours: every game tried' },
  dilpak: { glyph: 'Handshake', note: 'pure-hearted: fair play' },
  mamik: { glyph: 'PuzzlePiece', note: 'the riddle of the day' },
  bilbil: { glyph: 'MusicNote', note: 'the nightingale’s song' },
  elmas: { glyph: 'Diamond', note: 'the diamond' },
  // ranked
  'rank-dest': { glyph: 'Grains', note: 'the plain: wheat' },
  'rank-gir': { glyph: 'Tree', note: 'the hill: a tree on it' },
  'rank-zozan': { glyph: 'Tent', note: 'the high pasture: the summer tent' },
  'rank-ciya': { glyph: 'Mountains', note: 'the mountain' },
  'rank-lutke': { glyph: 'Flag', note: 'the summit: a flag planted' },
  'rank-sterk': { glyph: 'Star', note: 'the star' },
  hilkiser: { glyph: 'Steps', note: 'the climber' },
  cihgirti: { glyph: 'MapPin', note: 'placed: a place on the map' },
  // friends
  heval: { glyph: 'UsersThree', note: 'friends' },
  diyari: { glyph: 'Gift', note: 'the gift' },
  mevandar: { glyph: 'DoorOpen', note: 'the host: an open door' },
  name: { glyph: 'Envelope', note: 'the letter' },
  dilgerm: { glyph: 'Heart', note: 'warm-hearted' },
  // events
  newroz: { glyph: 'Campfire', note: 'the fire of Newroz' },
  'roja-ziman': { glyph: 'Scroll', note: 'Kurdish Language Day: the written word' },
  'zimane-dayike': { glyph: 'ChatsCircle', note: 'the mother language: spoken between two' },
  sersal: { glyph: 'Confetti', note: 'the new year' },
  zivistan: { glyph: 'Snowflake', note: 'winter' },
  bihar: { glyph: 'FlowerTulip', note: 'spring' },
  havin: { glyph: 'SunHorizon', note: 'summer' },
  payiz: { glyph: 'Leaf', note: 'autumn' },
  mehane: { glyph: 'CalendarStar', note: 'the month’s challenge' },
  // secrets
  'tire-rast': { glyph: 'Target', note: 'the straight arrow, in the middle' },
  'ji-nu-ve': { glyph: 'Plant', note: 'anew: a shoot' },
  'kewe-ciye': { glyph: 'Bird', note: 'the mountain partridge' },
  'deste-zerin': { glyph: 'Hand', note: 'the golden hand' },
  'mevane-agir': { glyph: 'FireSimple', note: 'the guest of the fire' },
  'kaniya-zanine': { glyph: 'Drop', note: 'the spring of knowledge' },
  'pisika-wane': { glyph: 'Cat', note: 'the cat of Van' },
  perperok: { glyph: 'Butterfly', note: 'the butterfly' },
  'sterka-siqiti': { glyph: 'ShootingStar', note: 'the shooting star' },
  // not a badge of the catalogue: what a secret shows until it is found
  secret: { glyph: 'Question', weight: 'bold', note: 'a secret not yet found' },
};

/** Every shape in one weight of one glyph, in the order Phosphor draws them. */
function shapes(glyph, weight) {
  const file = path.join(DEFS, `${glyph}.es.js`);
  if (!fs.existsSync(file)) throw new Error(`${glyph}: no such glyph in @phosphor-icons/react`);
  const src = fs.readFileSync(file, 'utf8');
  const at = src.indexOf(`"${weight}"`);
  if (at < 0) throw new Error(`${glyph}: no ${weight} weight`);
  // up to the start of the next weight entry, so one weight's shapes cannot bleed into the next
  const next = src.indexOf('\n  [\n    "', at);
  const block = src.slice(at, next < 0 ? src.length : next);
  const out = [];
  const re = /createElement\(\s*"(\w+)"\s*,\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(block))) {
    const [, tag, attrs] = m;
    const d = /\bd:\s*"([^"]+)"/.exec(attrs)?.[1];
    if (tag === 'path' && d) out.push(d);
    else out.push({ tag, attrs: attrs.trim() });
  }
  return out;
}

/** The whole generated file, as text. */
export function buildBadgeGlyphs() {
  const rows = [];
  const problems = [];
  for (const [name, { glyph, weight = 'fill', note }] of Object.entries(MAP)) {
    const found = shapes(glyph, weight);
    const odd = found.filter((s) => typeof s !== 'string');
    if (odd.length) problems.push(`${name} (${glyph}/${weight}): ${odd.map((o) => o.tag).join(', ')}`);
    rows.push({ name, glyph, weight, note, paths: found.filter((s) => typeof s === 'string') });
  }
  if (problems.length) throw new Error('these glyphs are not made of paths alone:\n  ' + problems.join('\n  '));

  const quote = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  const body = rows
    .map(({ name, glyph, weight, note, paths }) => {
      const key = /^[a-z][a-zA-Z\d]*$/.test(name) ? name : `'${name}'`;
      const head = `  /** Phosphor ${glyph}${weight === 'fill' ? '' : ` (${weight})`} — ${note} */`;
      const value = paths.length === 1 ? `[${quote(paths[0])}]` : `[\n    ${paths.map(quote).join(',\n    ')},\n  ]`;
      return `${head}\n  ${key}: ${value},`;
    })
    .join('\n');

  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules/@phosphor-icons/react/package.json'), 'utf8'));
  // the licence asks that its notice travel with every copy, and this file is a copy: read from the package, not typed out
  const licence = fs
    .readFileSync(path.join(ROOT, 'node_modules/@phosphor-icons/react/LICENSE'), 'utf8')
    .replace(/\r\n/g, '\n')
    .trim()
    .split('\n')
    .map((line) => (line ? ` * ${line}` : ' *'))
    .join('\n');

  return `/**
 * GENERATED — do not edit by hand.
 *
 * Phosphor ${pkg.version} glyph data, filled weight, extracted by
 * \`shared/scripts/generate-badge-glyphs.mjs\`: the one symbol each badge
 * shows (art/badges.ts). Change the mapping in that script and run it again.
 *
 * The viewBox is Phosphor's own 256×256.
 *
 * Phosphor Icons are used under the MIT licence:
 *
${licence}
 */

/** The size of the box every path below is drawn in. */
export const GLYPH_VIEWBOX = 256;

export const BADGE_GLYPHS: Readonly<Record<string, readonly string[]>> = {
${body}
};
`;
}

/** Compare without line endings in the way: the file is stored LF and may be checked out CRLF. */
const sameContent = (a, b) => a.replace(/\r\n/g, '\n') === b.replace(/\r\n/g, '\n');

// only when run as a script: importing this module must not touch the disk
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const built = buildBadgeGlyphs();
  if (process.argv.includes('--check')) {
    const onDisk = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (!sameContent(built, onDisk)) {
      console.error(
        `badge glyphs: ${path.relative(ROOT, OUT)} is not what the generator produces.\n` +
          '              Edit MAP in shared/scripts/generate-badge-glyphs.mjs and run:\n' +
          '                node shared/scripts/generate-badge-glyphs.mjs',
      );
      process.exit(1);
    }
    console.log(`badge glyphs: ${Object.keys(MAP).length} match Phosphor.`);
  } else {
    fs.writeFileSync(OUT, built);
    console.log(`wrote ${Object.keys(MAP).length} badge glyphs to ${path.relative(ROOT, OUT)}`);
  }
}
