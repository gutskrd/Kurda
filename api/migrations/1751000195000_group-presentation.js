/**
 * A group's own picture, and who last changed how the group presents itself.
 *
 * - `groups.photo_key`: the group's picture on the media bucket
 *   (`group-photo/<sha256>.webp`), put up through the same guards as a
 *   profile photo — size, real type, re-encoded to WebP, the storage ceiling
 *   and the image scan. Null shows the group's initials.
 * - `groups.photo_set_by`, `groups.edited_by` / `edited_at`: who put up the
 *   picture, and who last changed the name or description, so a report about
 *   either is answered by the person who did it rather than by the owner.
 *   Kept when that account goes (SET NULL), like the owner.
 */

export const up = (pgm) => {
  pgm.addColumns('groups', {
    photo_key: { type: 'text' },
    photo_set_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    edited_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    edited_at: { type: 'timestamptz' },
  });
  // which groups still hold a picture, for the check before a replaced one is deleted
  pgm.createIndex('groups', 'photo_key', { where: 'photo_key IS NOT NULL' });
};

export const down = (pgm) => {
  pgm.dropIndex('groups', 'photo_key');
  pgm.dropColumns('groups', ['photo_key', 'photo_set_by', 'edited_by', 'edited_at']);
};
