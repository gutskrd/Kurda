/**
 * The letters as every screen of this app reads them (GET /letters): with
 * every letter still to land (`landings=1`). Without it the server takes the
 * reader for an app build from before landings and counts the letter such a
 * build would show as landed, so a screen that only lists the letters (the
 * row in Messages, your bird in the shop) would take a bird's landing away
 * from the window before it was ever seen there.
 */
export const LETTERS_HOME_PATH = '/letters?landings=1';
