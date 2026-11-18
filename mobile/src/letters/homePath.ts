/**
 * GET /letters as every screen of this app reads it. Without `landings=1` the server treats the reader as an older
 * build and marks letters as landed, so a screen that only lists them would use up a bird's landing before the
 * window ever showed it.
 */
export const LETTERS_HOME_PATH = '/letters?landings=1';
