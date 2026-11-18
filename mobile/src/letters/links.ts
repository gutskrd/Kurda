/**
 * The website's letter addresses, for the app's linking (App.tsx): the window and one correspondence. The widget
 * opens a correspondence by its address; a notification links the window with `?bird=<id>`, which arrives as the
 * Letters screen's `bird` param so the bird lands before the letter is read.
 */
export const LETTER_LINKS = {
  Letters: 'app/letters',
  LetterThread: 'app/letters/:threadId',
} as const;
