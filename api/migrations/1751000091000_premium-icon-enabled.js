/**
 * Premium-icon visibility toggle. Users can keep their selected premium icon
 * (users.equipped_icon_sku) but hide it without losing the selection.
 *
 *  users.premium_icon_enabled  show/hide the equipped premium icon
 *
 * Additive + reversible. Defaults to true so any already-equipped icon keeps
 * showing after the migration. The icon still only renders when the viewer has
 * access (owns it, or premium is active) — this flag only gates visibility.
 */
export const up = (pgm) => {
  pgm.addColumns('users', {
    premium_icon_enabled: { type: 'boolean', notNull: true, default: true },
  });
};

export const down = (pgm) => {
  pgm.dropColumns('users', ['premium_icon_enabled']);
};
