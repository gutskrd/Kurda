/**
 * Forty default avatars became sixteen, so some selections point at nothing.
 *
 * The art was replaced wholesale: a new set of sixteen drawn deer, written
 * over `default-01` … `default-16`, with `default-17` … `default-41` deleted
 * and dropped from the manifest. Anyone who had picked one of the twenty-five
 * that are gone is holding a key the registry no longer knows.
 *
 * Nothing is broken by that on its own. `effectiveAvatarKey` checks the
 * registry before it trusts a selection and falls through to `default-01`, so
 * a profile still renders a face — that fallback is the reason this is a tidy-
 * up rather than a rescue. What it does leave is a quiet disagreement: the
 * profile shows the default avatar while the picker, which matches the stored
 * key against what it can offer, shows nothing selected at all. Somebody in
 * that state cannot tell whether they have chosen an avatar or not.
 *
 * So the dangling keys are cleared. `NULL` is what "I have not chosen one"
 * has always meant here, and it is what the picker and the profile both
 * already agree about.
 *
 * Keys 01–16 are left exactly as they are. The person picked the fourth
 * avatar; the fourth avatar is now a different drawing, which is what
 * replacing the art means, and their choice of slot is still theirs.
 */

/** The sixteen that exist now. Anything else is from the set that was replaced. */
const KEPT = Array.from({ length: 16 }, (_, i) => `default-${String(i + 1).padStart(2, '0')}`);

export const up = async (pgm) => {
  await pgm.db.query(
    `UPDATE users
        SET selected_avatar_key = NULL
      WHERE selected_avatar_key IS NOT NULL
        AND selected_avatar_key <> ALL($1)`,
    [KEPT],
  );
};

/**
 * Nothing to put back.
 *
 * Which of the twenty-five each person had chosen is not recorded anywhere
 * else, and the art those keys named is deleted — so a restored key would
 * point at a 404 rather than at their old avatar. Going down leaves them
 * unset, which is where this migration leaves them going up.
 */
export const down = async () => {};
