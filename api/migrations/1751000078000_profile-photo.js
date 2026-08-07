/**
 * Profile photos (KUR-177). A nullable, content-addressed media key on users
 * (kind `profile-photo`, served from the CDN). NULL means "no photo — use the
 * initials/monogram fallback (#178)". The object lifecycle reuses the #013 media
 * pipeline: request signed upload → confirm the key here → replaced/cleared keys
 * are un-confirmed so the orphan job reclaims them.
 */

export const up = (pgm) => {
  pgm.addColumn('users', {
    profile_photo_key: { type: 'text', notNull: false },
  });
};

export const down = (pgm) => {
  pgm.dropColumn('users', 'profile_photo_key');
};
