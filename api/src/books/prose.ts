/**
 * The few things the Hevalo book says in its own words rather than the
 * course's: Hamo's letter at the front, who the three friends are on the
 * people pages, and the author's own note at the back.
 *
 * They are written for a reader holding the book, not for the people who
 * write the course: each says what the reader does not know yet and nothing
 * they do, and the friends are introduced as the road shows them, without
 * their families, whom the chapters bring in themselves. The author's note is
 * the owner's own text, in their voice and under their name, edited only so
 * that it reads smoothly on the page.
 *
 * There is no Kurdish here but the road's own names (Hevalo, Sêvan, Kobanî,
 * Amed) and the author's town as the author writes it, so nothing in these
 * pages needs the course's review.
 */
import type { CharacterId } from '@kurda/shared';
import type { Span } from './sheet.js';

/** Hamo's letter, a paragraph to a list of spans: the names it introduces are set in the semi-bold. */
export const LETTER: readonly (readonly Span[])[] = [
  [
    { text: 'I am ' },
    { text: 'Hamo', font: 'semi' },
    { text: ', and every line of this road is mine: in the app you hear me say it, and here you can read it at your own pace, with a pencil, in the shade of a tree if you have one.' },
  ],
  [
    { text: 'The road runs through ' },
    { text: 'Sêvan', font: 'semi' },
    {
      text:
        ', a village of apple orchards under the mountains. You will not find it on a map: Sêvan is a made-up village, drawn from the villages of the Kurdish countryside, with their flat roofs, their springs and their walnut trees.',
    },
  ],
  [{ text: 'Read everything aloud, even when you are alone. Kurdish lives in the mouth, not only on the page. And when a word will not stay in your head, go back to the app, listen, and say it after me. What you still remember on the second day is yours.' }],
  [
    { text: 'One more thing. If you meet a young deer with round cheeks near the apple trees, that is ' },
    { text: 'Hevalo', font: 'semi' },
    { text: ', your guide. He will tell you he is not hungry. Watch the apple in the corner of the page as you go through a chapter, and judge for yourself.' },
  ],
];

/** Who each of the three friends is, as the people pages introduce them. */
export const FRIENDS: Readonly<Record<CharacterId, string>> = {
  hamo:
    'Hamo was born in Kobanî and grew up with Kurdish roots, and later built his life in the Netherlands. Like many Kurds who grow up far from their homeland, he came to see how much a language holds: who a people are, their culture, and what passes from one generation to the next. So he created the Hevalo app, to make learning, practising and keeping Kurdish easier and more of a pleasure. On the road he is your host in Sêvan.',
  hevalo:
    'Hevalo brings you to Hamo’s blue gate in the first lesson and walks the whole road beside you. His name means “O\u00a0friend!” Curious about everything and quick on his feet, he hops when he is pleased, tilts his head when something puzzles him and pricks up his ears at anything new. When apples go missing, he is always the first suspect.',
  xezo: 'Xezal is the young teacher at the village school. She comes from Amed and teaches the children of Sêvan their letters, and she lives in the village like any other neighbour. Bright, quick and kind, she knows the city and the village alike.',
};

/** The author's own note, printed on a page of its own and signed with their name. */
export const AUTHOR = {
  name: 'Mohamad Saleh Abdulrahman',
  paragraphs: [
    'My name is Mohamad Saleh Abdulrahman. I was born in Kobanê and grew up with Kurdish roots, and later built my life in the Netherlands.',
    'Like many Kurds growing up outside their homeland, I came to understand how important language is to preserving identity, culture and the connection between generations.',
    'This inspired me to create Hevalo, a platform built to make learning, practising and preserving the Kurdish language more accessible, engaging and enjoyable.',
    'I believe Kurdish is more than a language. It carries our history, our stories and expressions, and the experiences of the generations before us.',
    'This book is one small contribution to keeping that heritage alive, and to making it easier for future generations to discover, learn and embrace their language.',
  ],
} as const;
