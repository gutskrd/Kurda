/**
 * A family PIN's locks grow longer (shared `PIN_LOCK_STEPS`): `locks` counts the locks in a row since the PIN was last
 * entered right, which decides how long the next one lasts and when its parent is told.
 */

export const up = (pgm) => {
  pgm.addColumn('family_pins', { locks: { type: 'integer', notNull: true, default: 0, check: 'locks >= 0' } });
};

export const down = (pgm) => {
  pgm.dropColumn('family_pins', 'locks');
};
