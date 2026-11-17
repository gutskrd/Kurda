/**
 * The letters' addresses, the website's own, for the app's linking (App.tsx):
 * the window, and one correspondence. The home-screen letter widget opens a
 * correspondence by its address; a letter's notification names its
 * correspondence on the window's address (`app/letters?bird=<id>`), which
 * arrives as the Letters screen's `bird`, so its bird lands at the window
 * before the letter is read.
 */
export const LETTER_LINKS = {
  Letters: 'app/letters',
  LetterThread: 'app/letters/:threadId',
} as const;
