/**
 * The default avatar changed, and nobody who chose the old one loses it.
 *
 * `default-01` is what everyone without a choice sees, so swapping its picture
 * is how the default changes. The old picture, the deer in the hat, is now
 * `default-17`, an avatar like any other. Somebody who picked it on purpose
 * has `default-01` stored and would have woken up as the new silhouette; they
 * are moved to `default-17`, which is the same picture they chose. Users with
 * nothing stored (NULL) get the new default, which is the point.
 */

export const up = (pgm) => {
  pgm.sql(`UPDATE users SET selected_avatar_key = 'default-17' WHERE selected_avatar_key = 'default-01'`);
};

// Cannot tell who picked default-17 after this ran from who was moved here,
// so going down moves everyone back: they all see the deer either way.
export const down = (pgm) => {
  pgm.sql(`UPDATE users SET selected_avatar_key = 'default-01' WHERE selected_avatar_key = 'default-17'`);
};
