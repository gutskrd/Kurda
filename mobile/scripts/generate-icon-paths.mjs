/**
 * Generate the phone's icon path data from Phosphor — the same family, at the
 * same weight, that the browser renders.
 *
 * The phone used to carry a hand-drawn set: ~35 filled silhouettes written by
 * hand, which is exactly what `web/src/components/icons.tsx` says the browser
 * gave up for the same reasons — every new screen needed another one drawn, and
 * they drifted in weight and optical size. The browser imports Phosphor as a
 * package; React Native cannot, without adding a dependency that ships ~1500
 * glyphs to a phone. So the path data for the ones we name is extracted here
 * and committed, which gives the phone identical artwork and no new dependency.
 *
 * Run from the repo root after changing MAP:
 *
 *   node mobile/scripts/generate-icon-paths.mjs
 *
 * It reads `@phosphor-icons/react` out of node_modules — the very copy the
 * browser builds against — so the two cannot drift to different versions of the
 * same glyph without this being re-run and the diff showing up.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// from this file, not from cwd: npm runs a workspace's scripts with cwd set to
// that workspace, so `--check` from mobile/ has to find the repo root anyway
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFS = path.join(ROOT, 'node_modules/@phosphor-icons/react/dist/defs');
const OUT = path.join(ROOT, 'mobile/src/theme/icon-paths.ts');

/**
 * What each name in the app is drawn as.
 *
 * Where the browser already names an icon for the same job, this uses the same
 * glyph it does — the comment says which, so a change on one side is visibly a
 * change on the other. `weight` defaults to regular, which is what
 * `ICON_WEIGHT` in the browser's façade is set to.
 */
const MAP = {
  // --- the shell, matched to the browser's nav one destination at a time ---
  wall: { glyph: 'Newspaper', note: "web WallIcon — Civak, a page of what everyone wrote" },
  book: { glyph: 'BookOpen', note: 'web BookIcon — Learn' },
  play: { glyph: 'PuzzlePiece', note: 'web GameIcon — word games, not a console' },
  text: { glyph: 'TextAa', note: 'web TextIcon — the dictionary' },
  people: { glyph: 'Users', note: 'web UsersIcon — friends, a group' },
  person: { glyph: 'User', note: 'web UserIcon — one person, an account, you' },
  home: { glyph: 'House', note: 'web HomeIcon — the tab bar falls back to it' },
  search: { glyph: 'MagnifyingGlass', note: 'web SearchIcon — one field for people, words, lessons and games' },
  tray: { glyph: 'Tray', note: 'the inbox — chats, requests and alerts in one place; a bell would mean only the alerts' },

  // --- the rest of the browser's façade, same glyph, same job ---
  chat: { glyph: 'ChatCircle', note: 'web ChatsIcon' },
  bell: { glyph: 'Bell', note: 'web BellIcon' },
  gear: { glyph: 'Gear', note: 'web GearIcon' },
  'sign-out': { glyph: 'SignOut', note: 'web SignOutIcon — leaving, not a person' },
  trash: { glyph: 'Trash', note: 'web TrashIcon — throw away, always behind a confirm' },
  download: { glyph: 'DownloadSimple', note: 'a copy of your data, coming to you' },
  translate: { glyph: 'Translate', note: 'the language the interface is in' },
  close: { glyph: 'X', note: 'web CloseIcon' },
  plus: { glyph: 'Plus', weight: 'bold', note: 'web PlusIcon, which it renders bold — add something, saying nothing about what' },
  heart: { glyph: 'Heart', note: 'web HeartIcon' },
  'heart-fill': { glyph: 'Heart', weight: 'fill', note: 'web HeartIcon at fill — already liked' },
  repost: { glyph: 'Repeat', note: 'web RepostIcon — putting it on your own wall' },
  share: { glyph: 'ShareNetwork', note: 'web ShareIcon — not the iOS box-and-arrow, which means nothing off iOS' },
  link: { glyph: 'LinkSimple', note: 'web LinkIcon — the address of a thing, for copying' },
  send: { glyph: 'PaperPlaneTilt', note: 'web SendIcon — sending, to a person' },
  image: { glyph: 'Image', note: 'web PhotoIcon' },
  coin: { glyph: 'Coin', note: 'web CoinIcon — Zêr' },
  gem: { glyph: 'DiamondsFour', note: 'web GemIcon — the harder currency' },
  cart: { glyph: 'Storefront', note: 'web ShopIcon' },
  trophy: { glyph: 'Trophy', note: 'web TrophyIcon' },
  speaker: { glyph: 'Waveform', note: 'web WaveformIcon — hear it said' },
  moon: { glyph: 'Moon', note: 'web MoonIcon' },
  eye: { glyph: 'Eye', note: 'web EyeIcon' },
  'eye-off': { glyph: 'EyeSlash', note: 'web EyeIcon off' },
  'chevron-right': { glyph: 'CaretRight', note: 'web ChevronIcon' },
  bookmark: { glyph: 'BookmarkSimple', note: 'web BookmarkIcon — Saved, and a word you keep' },
  'bookmark-fill': { glyph: 'BookmarkSimple', weight: 'fill', note: 'the same bookmark, already kept' },

  // --- gifts in the chat, and keeping people safe (reports, account standing) ---
  gift: { glyph: 'Gift', note: 'web GiftIcon — a present, in the chat and in the shop; the gem stood in for it' },
  more: { glyph: 'DotsThree', weight: 'bold', note: 'more things you can do with this — report, block — behind one quiet button' },
  shield: { glyph: 'ShieldCheck', note: 'your account standing: what is limited, why, and asking for a review' },
  lifebuoy: { glyph: 'Lifebuoy', note: 'help, shown first when someone may hurt themselves' },
  block: { glyph: 'Prohibit', note: 'block someone — ends it for you, tells nobody' },

  // --- named here, because the browser has no counterpart yet ---
  'chevron-left': { glyph: 'CaretLeft', note: 'back, the mirror of ChevronIcon' },
  'chevron-down': { glyph: 'CaretDown', note: 'a section that opens' },
  check: { glyph: 'Check', note: 'done, chosen, claimed' },
  star: { glyph: 'Star', note: 'tags and badges, the daily puzzle, handing a club over' },
  bolt: { glyph: 'Lightning', note: 'speed — the race, and a quick game' },
  flame: { glyph: 'Flame', note: 'a streak' },
  ice: { glyph: 'Snowflake', note: 'a streak freeze' },
  palette: { glyph: 'Palette', note: 'appearance' },
  globe: { glyph: 'Globe', note: 'the world, on the league and onboarding screens' },
  mail: { glyph: 'Envelope', note: 'sign in with an email address' },
  'mail-fill': { glyph: 'Envelope', weight: 'fill', note: 'the sign-in row, where a hairline outline sits oddly beside two solid brand marks' },
  alert: { glyph: 'Warning', note: 'something went wrong' },
  apple: { glyph: 'AppleLogo', note: 'sign in with Apple' },

  // --- so that four games do not all look like the same game ---
  grid: { glyph: 'GridFour', note: 'Wordle — a board of letter squares, which is what the game is' },
  lightbulb: { glyph: 'Lightbulb', note: 'a grammar tip; a sparkle said something nice was coming and not what' },

  // --- typing, rating Hevalo, and writing a post ---
  keyboard: { glyph: 'Keyboard', note: 'keyboard settings and the guide to adding a Kurdish keyboard' },
  backspace: { glyph: 'Backspace', note: 'delete a letter — the Wordle key drew an ✕, which reads as "close"' },
  'key-return': { glyph: 'KeyReturn', note: 'Enter on the Wordle keyboard: send this guess' },
  'star-fill': { glyph: 'Star', weight: 'fill', note: 'a star chosen in the rating box' },
  pencil: { glyph: 'PencilSimple', note: 'edit your own post' },
  'text-t': { glyph: 'TextT', note: 'give a post a title' },
  quotes: { glyph: 'Quotes', note: 'source / credit — where a quote or a picture came from' },

  // --- the way in to everywhere the tab bar has no room for ---
  menu: { glyph: 'List', note: 'the side panel; three lines, which is what every app uses and what the recording used' },

  // --- the typographic glyphs that four screens drew instead of icons ---
  stop: { glyph: 'Stop', weight: 'fill', note: 'stop recording — the square the speaking exercise typed as U+25A0' },
  record: { glyph: 'Record', weight: 'fill', note: 'start recording — the dot it typed as U+25CF, which is not even round in every font' },
  flag: { glyph: 'Flag', note: 'report this to a moderator; the screens used U+2690, a flag outline most fonts do not have' },
  microphone: { glyph: 'Microphone', note: 'record a voice note — the emoji renders as a whole illustration beside monochrome icons' },
  google: { glyph: 'GoogleLogo', note: 'sign in with Google' },

  // --- Stories, and playing with friends ---
  story: { glyph: 'BookOpenText', note: 'Stories — a page with lines on it, so it is not Learn’s open book' },
  headphones: { glyph: 'Headphones', note: 'a story someone has read aloud, every sentence of it' },
  'audio-play': { glyph: 'Play', weight: 'fill', note: 'play a recording — `play` is the games’ puzzle piece' },
  'audio-pause': { glyph: 'Pause', weight: 'fill', note: 'pause a recording' },
  'skip-back': { glyph: 'SkipBack', note: 'the sentence before' },
  'skip-forward': { glyph: 'SkipForward', note: 'the sentence after' },
  timer: { glyph: 'Timer', note: 'a question with a clock, and extra time' },
  'user-plus': { glyph: 'UserPlus', note: 'invite a friend to play' },
  crown: { glyph: 'Crown', note: 'the host of a game' },

  // --- Game Ranks, leagues and badges (contract 4) ---
  mountains: { glyph: 'Mountains', note: 'Game Ranks: the climb from Deşt to Lûtke' },
  medal: { glyph: 'Medal', note: 'badges' },
  handshake: { glyph: 'Handshake', note: 'a Friendly game: played for fun, ranks stay as they are' },
  'move-up': { glyph: 'CaretDoubleUp', weight: 'bold', note: 'the league’s promotion zone, said in words beside it too' },
  'move-down': { glyph: 'CaretDoubleDown', weight: 'bold', note: 'the league’s demotion zone, said in words beside it too' },
  'seal-check': { glyph: 'SealCheck', weight: 'fill', note: 'safe this week: the weekly goal is met' },
  lock: { glyph: 'LockSimple', note: 'a badge tier not reached yet' },
  question: { glyph: 'Question', note: 'a rank still settling (the "?" beside the points)' },
  sparkle: { glyph: 'Sparkle', weight: 'fill', note: 'a celebration: a new division, tier or badge' },
  calendar: { glyph: 'CalendarBlank', note: 'when a week or a season ends, in local time' },
  'shield-fill': { glyph: 'ShieldCheck', weight: 'fill', note: 'a rank shield still covering a game' },
};

/** Every shape in one weight of one glyph, in the order Phosphor draws them. */
function shapes(glyph, weight) {
  const file = path.join(DEFS, `${glyph}.es.js`);
  if (!fs.existsSync(file)) throw new Error(`${glyph}: no such glyph in @phosphor-icons/react`);
  const src = fs.readFileSync(file, 'utf8');

  const at = src.indexOf(`"${weight}"`);
  if (at < 0) throw new Error(`${glyph}: no ${weight} weight`);
  // up to the start of the next weight entry, so one weight's shapes cannot
  // bleed into the next
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

/**
 * The whole generated file, as text.
 *
 * Exported rather than written straight to disk so the test can build it and
 * compare — a hand-edit to a file that says "do not edit by hand" should fail
 * CI rather than survive until somebody regenerates and wonders what changed.
 */
export function buildIconPaths() {
  const rows = [];
  const problems = [];
  for (const [name, { glyph, weight = 'regular', note }] of Object.entries(MAP)) {
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
      const head = `  /** Phosphor ${glyph}${weight === 'regular' ? '' : ` (${weight})`} — ${note} */`;
      const value = paths.length === 1 ? `[${quote(paths[0])}]` : `[\n    ${paths.map(quote).join(',\n    ')},\n  ]`;
      return `${head}\n  ${key}: ${value},`;
    })
    .join('\n');

  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules/@phosphor-icons/react/package.json'), 'utf8'));

  // The glyphs are Phosphor's work under the MIT licence, which asks that its
  // notice travel with every copy — and this file is a copy. Read from the
  // package rather than typed out, so it is the notice that came with them.
  const licence = fs
    .readFileSync(path.join(ROOT, 'node_modules/@phosphor-icons/react/LICENSE'), 'utf8')
    .replace(/\r\n/g, '\n')
    .trim()
    .split('\n')
    .map((line) => (line ? ` * ${line}` : ' *'))
    .join('\n');

  const file = `/**
 * GENERATED — do not edit by hand.
 *
 * Phosphor ${pkg.version} glyph data, extracted by
 * \`mobile/scripts/generate-icon-paths.mjs\` from the same package the browser
 * renders, so the two apps draw the same artwork. Change the mapping in that
 * script and run it again.
 *
 * The viewBox is Phosphor's own 256×256, not 24×24.
 *
 * Phosphor Icons are used under the MIT licence:
 *
${licence}
 */

/** The size of the box every path below is drawn in. */
export const ICON_VIEWBOX = 256;

export const ICON_PATHS = {
${body}
} as const;

export type IconName = keyof typeof ICON_PATHS;
`;

  return file;
}

export const ICON_PATHS_FILE = OUT;

/**
 * Compare without line endings in the way.
 *
 * The file is stored LF and checked out CRLF on Windows (core.autocrlf), so
 * the bytes on disk differ by platform while the content does not. Comparing
 * them raw passed on my machine and failed on the Linux runner, which is the
 * least useful way for a gate to behave.
 */
const sameContent = (a, b) => a.replace(/\r\n/g, '\n') === b.replace(/\r\n/g, '\n');

/**
 * Only when run as a script.
 *
 * Importing this module must not touch the disk — the earlier version wrote
 * the file on import, so merely importing it (to read `ICON_PATHS_FILE`)
 * rewrote the thing the caller was about to inspect.
 */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const built = buildIconPaths();
  if (process.argv.includes('--check')) {
    const onDisk = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (!sameContent(built, onDisk)) {
      console.error(
        `icons: ${path.relative(ROOT, OUT)} is not what the generator produces.\n` +
          '       Edit MAP in mobile/scripts/generate-icon-paths.mjs and run:\n' +
          '         node mobile/scripts/generate-icon-paths.mjs',
      );
      process.exit(1);
    }
    console.log(`icons: ${Object.keys(MAP).length} glyphs match Phosphor.`);
  } else {
    fs.writeFileSync(OUT, built);
    console.log(`wrote ${Object.keys(MAP).length} icons to ${path.relative(ROOT, OUT)}`);
  }
}
