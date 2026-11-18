/**
 * A home-screen widget stops reading letters when the session that made it
 * ends.
 *
 * A widget's token remembered the account's token version and nothing else,
 * so a new password or signing out everywhere ended it, but signing out one
 * device from the session list did not: a phone signed out from somewhere
 * else, because it was lost or sold, kept showing the account's letters on its
 * home screen, for as long as the token lived — and it had no end.
 *
 * Each token now remembers the session it was made in (the refresh token
 * family), and a widget reads only while that session is live
 * (letters/widget.ts). Every token also has a fixed lifetime from when it was
 * made, checked there too; the app makes a new one each time it starts, so a
 * phone in use never meets it.
 *
 * Tokens made before this have no session to follow, and are left without
 * one: they read as ended. A widget holding one shows "Open Hevalo", and
 * opening the app makes its new token, as after a new password.
 */

export const up = (pgm) => {
  pgm.addColumn('letter_widget_tokens', { family_id: { type: 'uuid' } });
};

export const down = (pgm) => {
  pgm.dropColumn('letter_widget_tokens', 'family_id');
};
