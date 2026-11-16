/**
 * Which drawing goes with what in the Hevalo book (pictures.ts): a word's
 * picture and no guesses, a person's emblem, each chapter's colour and
 * emblem, a lesson's beat told in a line or two, and the scene composed from
 * it. Checked on small examples, and then held against every lesson of the
 * road as the course files have it.
 */
import {
  BOOK_PAINTS,
  BOOK_POSES,
  BOOK_SETTINGS,
  BOOK_SPOTS,
  HUES,
  HUE_NAMES,
  PATH_LANDMARKS,
  WORD_PICTURES,
  type CharacterId,
} from '@kurda/shared';
import { describe, expect, it } from 'vitest';
import { CHAPTER_HUES, chapterEmblem, chapterHue, hueDistance, pictureForName, pictureForWord, sceneFor, sentencesOf, tellBeat, type BookPicture } from './pictures.js';
import { chapterWords, roadBookCast, roadBookChapters } from './road-book.js';
import { INK } from './sheet.js';
import { loadRoadBookSources } from './sources.js';

const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const word = (ku: string, en: string, pos: string | null = 'noun', picture: string | null = null): Parameters<typeof pictureForWord>[0] => ({ ku, en, pos, picture });

/** Whether there is a drawing behind a picture's name. */
function drawable(p: BookPicture): boolean {
  if (p.kind === 'word') return Object.hasOwn(WORD_PICTURES, p.id);
  if (p.kind === 'spot') return BOOK_SPOTS.includes(p.spot);
  if (p.kind === 'paint') return BOOK_PAINTS.includes(p.colour);
  if (p.kind === 'landmark') return PATH_LANDMARKS.includes(p.landmark);
  if (p.kind === 'cast') return Object.hasOwn(BOOK_POSES, p.who) && (BOOK_POSES[p.who] as readonly string[]).includes(p.pose);
  if (p.kind === 'figure') return /^\d+(st|nd)?$/.test(p.text);
  return p.kind === 'sapling';
}

describe('a word’s picture', () => {
  it('is the one the lessons show for it, before any other', () => {
    expect(pictureForWord(word('sêv', 'apple', 'noun', 'apple'))).toEqual({ kind: 'word', id: 'apple' });
    // even for a word the catalogue files under another: the lesson's own card is the picture the learner knows
    expect(pictureForWord(word('pez', 'sheep', 'noun', 'ewe'))).toEqual({ kind: 'word', id: 'ewe' });
    // a card that names no drawing is no picture
    expect(pictureForWord(word('tişt', 'thing', 'noun', 'banana'))).toBeNull();
    expect(pictureForWord(word('tişt', 'thing', 'noun', 'toString'))).toBeNull();
  });

  it('is the word picture drawn for that very word', () => {
    expect(pictureForWord(word('çay', 'tea'))).toEqual({ kind: 'word', id: 'tea' });
    expect(pictureForWord(word('ker', 'donkey'))).toEqual({ kind: 'word', id: 'donkey' });
    // by the Kurdish word, not by a meaning that only sounds alike
    expect(pictureForWord(word('def', 'frame drum'))).toBeNull();
    expect(pictureForWord(word('bihar', 'spring'))).toBeNull();
  });

  it('is a number’s figure, a colour’s paint, or one of the things drawn for the book', () => {
    expect(pictureForWord(word('sê', 'three', 'num'))).toEqual({ kind: 'figure', text: '3' });
    expect(pictureForWord(word('hezar', 'a thousand', 'num'))).toEqual({ kind: 'figure', text: '1000' });
    expect(pictureForWord(word('yekem', 'first', 'num'))).toEqual({ kind: 'figure', text: '1st' });
    expect(pictureForWord(word('sor', 'red', 'adj'))).toEqual({ kind: 'paint', colour: 'red' });
    expect(pictureForWord(word('spî', 'white', 'adj'))).toEqual({ kind: 'paint', colour: 'white' });
    expect(pictureForWord(word('simbêl', 'moustache'))).toEqual({ kind: 'spot', spot: 'moustache' });
    expect(pictureForWord(word('bajar', 'town, city'))).toEqual({ kind: 'spot', spot: 'town' });
    expect(pictureForWord(word('bazar', 'market'))).toEqual({ kind: 'landmark', landmark: 'bazaar' });
    expect(pictureForWord(word('şitil', 'sapling'))).toEqual({ kind: 'sapling' });
    // the road's teacher is Xezal, and its friend is the deer whose name means "friend"
    expect(pictureForWord(word('mamoste', 'teacher'))).toEqual({ kind: 'cast', who: 'xezo', pose: 'smiling' });
    expect(pictureForWord(word('heval', 'friend'))).toEqual({ kind: 'cast', who: 'hevalo', pose: 'pleased' });
  });

  it('is nothing at all rather than a guess', () => {
    expect(pictureForWord(word('spas', 'thank you', 'interj'))).toBeNull();
    // a number or a colour is one only as the plan teaches it: "red" the noun is not paint, and a made-up number has no figure
    expect(pictureForWord(word('sorahî', 'red', 'noun'))).toBeNull();
    expect(pictureForWord(word('gelek', 'many', 'num'))).toBeNull();
    expect(pictureForWord(word('constructor', 'toString', 'num'))).toBeNull();
    expect(pictureForWord(word('toString', 'constructor', 'adj'))).toBeNull();
    expect(pictureForWord(word('hasOwnProperty', 'valueOf'))).toBeNull();
  });

  it('names only drawings that exist, for every word of the road, and gives every chapter some', async () => {
    const { plan, docs, stories } = await loadRoadBookSources();
    const chapters = roadBookChapters(plan, docs, stories, ALL);
    const counts = chapters.map((c) => {
      const pictures = chapterWords(c).map((w) => pictureForWord(w)).filter((p): p is BookPicture => p !== null);
      for (const p of pictures) expect(drawable(p), JSON.stringify(p)).toBe(true);
      return pictures.length;
    });
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(4);
    expect(counts.reduce((a, b) => a + b, 0)).toBeGreaterThan(120);
    // every picture a lesson shows for one of its words is the one the book shows for it
    for (const c of chapters) for (const w of chapterWords(c)) if (w.picture) expect(pictureForWord(w), w.ku).toEqual({ kind: 'word', id: w.picture });
  });
});

describe('the people of the road', () => {
  it('shows the three friends as themselves, and the others by the thing the road knows them by', async () => {
    expect(pictureForName('Hamo')).toEqual({ kind: 'cast', who: 'hamo', pose: 'proud' });
    expect(pictureForName('Xezal')).toEqual({ kind: 'cast', who: 'xezo', pose: 'smiling' });
    expect(pictureForName('Hevalo')).toEqual({ kind: 'cast', who: 'hevalo', pose: 'caught' });
    expect(pictureForName('Ibrahîm')).toEqual({ kind: 'spot', spot: 'flute' });
    expect(pictureForName('Bozo')).toEqual({ kind: 'word', id: 'donkey' });
    expect(pictureForName('Nobody')).toBeNull();
    expect(pictureForName('toString')).toBeNull();
    const { plan, docs, stories } = await loadRoadBookSources();
    const cast = roadBookCast(plan, roadBookChapters(plan, docs, stories, ALL));
    const emblems = cast.map((who) => pictureForName(who.name));
    for (const p of emblems) if (p) expect(drawable(p), JSON.stringify(p)).toBe(true);
    // nearly everyone has one; a brother and a sister met only in a photo do without
    expect(emblems.filter((p) => p === null).length).toBeLessThanOrEqual(2);
  });
});

describe('a chapter’s colour and emblem', () => {
  it('gives each of the twelve chapters one of the app’s hues, and uses all nine families', () => {
    expect(CHAPTER_HUES).toHaveLength(12);
    for (const hue of CHAPTER_HUES) expect(HUE_NAMES).toContain(hue);
    expect(new Set(CHAPTER_HUES).size).toBe(HUE_NAMES.length);
    expect(ALL.map(chapterHue)).toEqual(CHAPTER_HUES);
    expect(chapterHue(1)).toBe('blue');
    expect(chapterHue(12)).toBe('violet');
  });

  it('never gives a chapter the hue of the one before it, nor the hue beside that one', () => {
    for (let n = 1; n < 12; n++) expect(hueDistance(chapterHue(n), chapterHue(n + 1)), `chapters ${n} and ${n + 1}`).toBeGreaterThanOrEqual(2);
    // and a longer road starts the colours again without a clash where they join
    expect(chapterHue(13)).toBe(chapterHue(1));
    expect(hueDistance(chapterHue(12), chapterHue(13))).toBeGreaterThanOrEqual(2);
    expect(chapterHue(0)).toBe(chapterHue(12));
    expect(chapterHue(3.9)).toBe(chapterHue(3));
  });

  it('measures how far apart two hues sit on the wheel', () => {
    expect(hueDistance('blue', 'blue')).toBe(0);
    expect(hueDistance('blue', 'teal')).toBe(1);
    expect(hueDistance('teal', 'blue')).toBe(1);
    // the wheel joins end to end: pink sits beside violet
    expect(hueDistance('pink', 'violet')).toBe(1);
    expect(hueDistance('violet', 'green')).toBe(4);
    for (const a of HUE_NAMES) for (const b of HUE_NAMES) expect(hueDistance(a, b)).toBeLessThanOrEqual(4);
  });

  it('knows a chapter by its landmark beside the lesson path, and the sixth by Kobanî', () => {
    expect(chapterEmblem(1)).toEqual({ kind: 'landmark', landmark: 'gate' });
    expect(chapterEmblem(4)).toEqual({ kind: 'landmark', landmark: 'bazaar' });
    expect(chapterEmblem(6)).toEqual({ kind: 'spot', spot: 'town' });
    expect(chapterEmblem(12)).toEqual({ kind: 'landmark', landmark: PATH_LANDMARKS[11] });
    expect(chapterEmblem(13)).toEqual(chapterEmblem(1));
    for (const n of ALL) expect(drawable(chapterEmblem(n))).toBe(true);
  });

  it('keeps every text colour readable on the paper, and each chapter’s ink readable on its own wash and tint', () => {
    const channel = (v: number): number => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const luminance = (hex: string): number => {
      const v = parseInt(hex.slice(1), 16);
      return 0.2126 * channel(((v >> 16) & 255) / 255) + 0.7152 * channel(((v >> 8) & 255) / 255) + 0.0722 * channel((v & 255) / 255);
    };
    const contrast = (a: string, b: string): number => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
      return (hi + 0.05) / (lo + 0.05);
    };
    // the reading ink is far above what small type needs; the quiet ink and the app's violet are above it too
    expect(contrast(INK.ink, INK.paper)).toBeGreaterThan(12);
    for (const colour of [INK.soft, INK.violet]) expect(contrast(colour, INK.paper), colour).toBeGreaterThanOrEqual(4.5);
    expect(contrast(INK.ink, INK.card)).toBeGreaterThan(12);
    for (const name of new Set(CHAPTER_HUES)) {
      const hue = HUES.light[name];
      for (const ground of [hue.wash, hue.tint, INK.paper, INK.card]) expect(contrast(hue.deep, ground), `${name} deep on ${ground}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(INK.ink, hue.wash), `ink on ${name} wash`).toBeGreaterThanOrEqual(7);
      expect(contrast(INK.soft, hue.wash), `quiet ink on ${name} wash`).toBeGreaterThanOrEqual(4.5);
      expect(contrast('#ffffff', hue.deep), `white on ${name} deep`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('a beat told in a line or two', () => {
  const beat = 'Hamo counts the apples in the basket, one by one, with great care and a pencil. There should be ten of them. There are nine. “Kî sêv xwar? Tu?” he asks the hens. Hevalo looks at the sky.';

  it('reads a beat as its sentences, and keeps what is said inside a quotation in the sentence it is said in', () => {
    expect(sentencesOf(beat)).toEqual([
      'Hamo counts the apples in the basket, one by one, with great care and a pencil.',
      'There should be ten of them.',
      'There are nine.',
      '“Kî sêv xwar? Tu?” he asks the hens.',
      'Hevalo looks at the sky.',
    ]);
    // a closing quote belongs to the sentence it ends
    expect(sentencesOf('Hamo shows you round: “Ev mala min e. Ew derî ye.” The gate creaks.')).toEqual(['Hamo shows you round: “Ev mala min e. Ew derî ye.”', 'The gate creaks.']);
    // an ellipsis in the middle of a sentence does not end it
    expect(sentencesOf('One, two… but the hens will not stand still. Dapîr counts again.')).toHaveLength(2);
    expect(sentencesOf('  ')).toEqual([]);
  });

  it('tells all of a beat that is short enough', () => {
    expect(tellBeat(beat, 300)).toBe(beat);
    expect(tellBeat(beat, beat.length)).toBe(beat);
    expect(tellBeat('', 80)).toBe('');
  });

  it('tells how it opens and how it ends, with an ellipsis where it leaves something out', () => {
    // the ending is too short to stand alone, so it takes what leads up to it along
    expect(tellBeat(beat, 160)).toBe('Hamo counts the apples in the basket, one by one, with great care and a pencil. … “Kî sêv xwar? Tu?” he asks the hens. Hevalo looks at the sky.');
    // less room: the opening is cut where a clause ends, and the telling trails off there, with no second ellipsis
    expect(tellBeat(beat, 130)).toBe('Hamo counts the apples in the basket, one by one… “Kî sêv xwar? Tu?” he asks the hens. Hevalo looks at the sky.');
    expect(tellBeat(beat, 90)).toBe('Hamo counts the apples in the basket, one by one… Hevalo looks at the sky.');
    // too little room for any ending: the beat as far as it goes
    expect(tellBeat(beat, 60)).toBe('Hamo counts the apples in the basket, one by one…');
    expect(tellBeat(beat, 40)).toBe('Hamo counts the apples in the basket…');
  });

  it('ends on what Hevalo does, coming in on his clause when his whole sentence is too long', () => {
    const tray = 'Hamo sits you down under the oldest apple tree and comes back with a tray: a glass of tea, warm bread, and a bowl of milk for the deer. You drink your tea, Hamo eats his bread, and Hevalo drinks his milk, loudly, and then pushes his nose into everything else in case it is an apple.';
    expect(tellBeat(tray, 170)).toBe('Hamo sits you down under the oldest apple tree… and Hevalo drinks his milk, loudly, and then pushes his nose into everything else in case it is an apple.');
    // the last thing said of him, not the last thing said
    const supper = 'Supper with everyone at Hamo’s, and bread for all. Meanwhile Hevalo eats the bread you were holding. Dapîr wants to know where you are from, so Hamo asks you for her, and then tells you his own answer twice.';
    expect(tellBeat(supper, 120)).toBe('Supper with everyone at Hamo’s, and bread for all. Meanwhile Hevalo eats the bread you were holding.');
  });

  it('never leaves a quotation or a bracket open, puts in no word of its own, and keeps to its length, for every lesson of the road', async () => {
    const { plan } = await loadRoadBookSources();
    const count = (text: string, mark: string): number => text.split(mark).length - 1;
    const problems: string[] = [];
    let lessons = 0;
    let his = 0;
    let withHim = 0;
    for (const unit of plan.units) {
      for (const skill of unit.skills) {
        for (const lesson of skill.lessons) {
          const told = lesson.beat ?? '';
          const whole = sentencesOf(told).join(' ');
          lessons += 1;
          // nothing of a beat is lost in reading it as sentences
          if (whole !== told.trim().replace(/\s+/g, ' ')) problems.push(`${lesson.key}: sentences lose text`);
          for (let max = 90; max <= 260; max += 10) {
            const short = tellBeat(told, max);
            const where = `${lesson.key} at ${max}`;
            if (short.length > max) problems.push(`${where}: ${short.length} long`);
            if (short.trim() === '') problems.push(`${where}: empty`);
            if (count(short, '“') !== count(short, '”') || count(short, '(') !== count(short, ')')) problems.push(`${where}: left open: ${short}`);
            if (/… …|……/.test(short)) problems.push(`${where}: two ellipses together`);
            if (!whole.startsWith(short.split('…')[0]!.trimEnd())) problems.push(`${where}: does not open as the beat does`);
            for (const piece of short.split(/\s*…\s*/).filter(Boolean)) if (!whole.includes(piece)) problems.push(`${where}: not the beat’s own words: ${piece}`);
          }
          // where the beat goes on to say what Hevalo did, the telling at the book's measure says so too
          if (/Hevalo|the deer/.test(sentencesOf(told).slice(1).join(' '))) {
            his += 1;
            if (/Hevalo|the deer/.test(tellBeat(told, 168))) withHim += 1;
          }
        }
      }
    }
    expect(problems).toEqual([]);
    expect(lessons).toBe(192);
    expect(his).toBeGreaterThan(50);
    expect(withHim / his).toBeGreaterThan(0.9);
  });
});

describe('a lesson’s scene', () => {
  const apple = word('sêv', 'apple', 'noun', 'apple');

  it('sets it by day, by night or in the snow, as the beat says', () => {
    expect(sceneFor('Hamo pours the tea.').setting).toBe('day');
    expect(sceneFor('Night falls on Sêvan, and Hamo pours the tea.').setting).toBe('night');
    expect(sceneFor('The stars come out. Hamo pours the tea.').setting).toBe('night');
    expect(sceneFor('Dapîr bakes bread in the tenûr while the snow falls on the roof.').setting).toBe('snow');
    // snow at night is still snow: it is what the scene looks like
    expect(sceneFor('A knock at midnight, in deep snow.').setting).toBe('snow');
    for (const setting of ['day', 'night', 'snow'] as const) expect(BOOK_SETTINGS).toContain(setting);
  });

  it('puts in it who the beat names: Hamo on the left, the deer or Xezal on the right, and Hamo alone when it names nobody', () => {
    expect(sceneFor('Hevalo trots up the lane, and Hamo opens the gate.').cast.map((c) => c.who)).toEqual(['hamo', 'hevalo']);
    expect(sceneFor('At the school Xezal is teaching the children a song, and Hamo listens at the window.').cast).toEqual([
      { who: 'hamo', pose: 'doubtful' },
      { who: 'xezo', pose: 'telling' },
    ]);
    expect(sceneFor('The hens are in the yard.').cast).toEqual([{ who: 'hamo', pose: 'plain' }]);
    expect(sceneFor('The deer drinks from the spring.').cast.map((c) => c.who)).toEqual(['hevalo']);
    // never more than two: the first two the beat names, as it names them
    expect(sceneFor('Xezal waves to Hevalo, and then Hamo arrives.').cast.map((c) => c.who)).toEqual(['xezo', 'hevalo']);
  });

  it('shows how each of them takes it', () => {
    const pose = (beat: string, who: CharacterId): string | undefined => sceneFor(beat).cast.find((c) => c.who === who)?.pose;
    expect(pose('Hamo counts his apples: there are nine. Hevalo looks at the sky.', 'hevalo')).toBe('innocent');
    expect(pose('Hevalo eats the bread you were holding.', 'hevalo')).toBe('caught');
    expect(pose('Hevalo sniffs every marble.', 'hevalo')).toBe('curious');
    expect(pose('Hevalo hops round the tree.', 'hevalo')).toBe('pleased');
    expect(pose('Hevalo trots beside you.', 'hevalo')).toBe('pleased');
    expect(pose('Hevalo stands by the gate.', 'hevalo')).toBe('plain');
    expect(pose('Hamo laughs until he cries.', 'hamo')).toBe('laughing');
    expect(pose('Hamo gives his moustache a proud little lift.', 'hamo')).toBe('proud');
    expect(pose('Hamo jumps up: he forgot the tea!', 'hamo')).toBe('shocked');
    expect(pose('Hamo tells the old tale again.', 'hamo')).toBe('telling');
    // what is said of one is not how the other takes it
    expect(pose('Hamo laughs. Hevalo looks away.', 'hevalo')).toBe('innocent');
    expect(pose('Hamo laughs. Hevalo looks away.', 'hamo')).toBe('laughing');
  });

  it('shows the things the beat names in the order it names them, and then the lesson’s own pictured words', () => {
    expect(sceneFor('The hens are in the yard with the goat and the donkey, and the cat watches from the roof of the house.').props).toEqual([
      { kind: 'word', id: 'hen' },
      { kind: 'word', id: 'goat' },
      { kind: 'word', id: 'donkey' },
    ]);
    expect(sceneFor('Hamo pours the tea.', [apple]).props).toEqual([
      { kind: 'word', id: 'tea' },
      { kind: 'word', id: 'apple' },
    ]);
    // one thing only between two people, where there is little room
    expect(sceneFor('Hamo pours the tea and cuts the bread, and Hevalo hops about.', [apple]).props).toEqual([{ kind: 'word', id: 'tea' }]);
    // each thing once, however often it is named
    expect(sceneFor('Tea, more tea, and then tea.').props).toEqual([{ kind: 'word', id: 'tea' }]);
    // a word with no drawing, or one that is a person or a figure, adds nothing
    expect(sceneFor('Hamo waits.', [word('spas', 'thank you', 'interj'), word('sê', 'three', 'num'), word('heval', 'friend')]).props).toEqual([]);
  });

  it('draws no second apple beside a deer who has one in his mouth, or whose core lies beside him', () => {
    expect(sceneFor('Hevalo eats the bread, the cheese and the yoghurt.', [apple])).toEqual({
      setting: 'day',
      cast: [{ who: 'hevalo', pose: 'caught' }],
      props: [
        { kind: 'word', id: 'bread' },
        { kind: 'word', id: 'cheese' },
        { kind: 'word', id: 'yoghurt' },
      ],
    });
    expect(sceneFor('Hamo counts his apples. Hevalo looks at the sky.', [apple]).props).toEqual([]);
    expect(sceneFor('Hamo counts his apples. Hevalo hops about.', [apple]).props).toEqual([{ kind: 'word', id: 'apple' }]);
  });

  it('reads Kurdish letters as letters: the hill Miştenûr is not a tenûr', () => {
    const tenur: BookPicture = { kind: 'word', id: 'tenur' };
    expect(sceneFor('From the roof you can see Miştenûr.').props).not.toContainEqual(tenur);
    expect(sceneFor('Dapîr bakes bread in the tenûr.').props).toContainEqual(tenur);
    // and a word inside a longer one is not that word
    expect(sceneFor('Hamo is a teacher of teamwork.').props).toEqual([]);
  });

  it('composes a scene for every lesson of the road from drawings that exist', async () => {
    const { plan, docs, stories } = await loadRoadBookSources();
    const scenes = roadBookChapters(plan, docs, stories, ALL).flatMap((c) => c.parts.flatMap((p) => p.lessons.map((l) => ({ key: l.key, scene: sceneFor(l.beat, l.words) }))));
    expect(scenes).toHaveLength(192);
    for (const { key, scene } of scenes) {
      expect(BOOK_SETTINGS, key).toContain(scene.setting);
      expect(scene.cast.length, key).toBeGreaterThanOrEqual(1);
      expect(scene.cast.length, key).toBeLessThanOrEqual(2);
      expect(new Set(scene.cast.map((c) => c.who)).size, key).toBe(scene.cast.length);
      for (const c of scene.cast) expect(drawable({ kind: 'cast', ...c }), `${key} ${c.who} ${c.pose}`).toBe(true);
      // Hamo, when he is in it, stands first: on the left, looking into the scene
      if (scene.cast.some((c) => c.who === 'hamo')) expect(scene.cast[0]!.who, key).toBe('hamo');
      expect(scene.props.length, key).toBeLessThanOrEqual(scene.cast.length > 1 ? 1 : 3);
      for (const p of scene.props) expect(drawable(p) && p.kind !== 'cast' && p.kind !== 'figure', `${key} ${JSON.stringify(p)}`).toBe(true);
    }
    // the road has all three kinds of weather, the deer is in a good third of it, and he is caught at it again and again
    for (const setting of BOOK_SETTINGS) expect(scenes.filter((s) => s.scene.setting === setting).length, setting).toBeGreaterThan(5);
    const deer = scenes.flatMap((s) => s.scene.cast.filter((c) => c.who === 'hevalo'));
    expect(deer.length).toBeGreaterThan(60);
    expect(deer.filter((c) => c.pose === 'caught' || c.pose === 'innocent').length).toBeGreaterThan(20);
  });
});
