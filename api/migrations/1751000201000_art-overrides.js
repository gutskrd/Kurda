/**
 * Pictures an admin has put in place of the art that ships (art/overrides.ts;
 * the slots are in @kurda/shared art-slots.ts): a badge, a level of one, a
 * rank or league emblem, a season frame, a default profile picture, an event's
 * banner. One row per replaced slot, naming the uploaded picture
 * (`cosmetic/<kind>/<sha256>`, stored and served like the shop's art), and a
 * history of every change, the resets included, so the admin can see what a
 * slot held before and put it back.
 */

export const up = (pgm) => {
  pgm.createTable('art_overrides', {
    slot: { type: 'text', primaryKey: true },
    asset_key: { type: 'text', notNull: true },
    note: { type: 'text' },
    updated_by: { type: 'uuid' },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('art_overrides', 'asset_key');

  pgm.createTable('art_override_history', {
    id: { type: 'bigserial', primaryKey: true },
    slot: { type: 'text', notNull: true },
    // null: the slot went back to the art that ships
    asset_key: { type: 'text' },
    note: { type: 'text' },
    changed_by: { type: 'uuid' },
    changed_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('art_override_history', [{ name: 'slot' }, { name: 'changed_at', sort: 'DESC' }]);
};

export const down = (pgm) => {
  pgm.dropTable('art_override_history');
  pgm.dropTable('art_overrides');
};
