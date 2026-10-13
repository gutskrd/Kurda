/**
 * The hash of a picture's stored bytes, kept beside its key.
 *
 * A key used to be the hash of the bytes, so "the same picture" and "the same
 * key" were one thing: moderation blocked or quarantined a key, and the same
 * bytes uploaded again — by anyone — landed on that key and were refused, and
 * taking a picture down took it off every post that showed it. A picture
 * uploaded for a post now has its uploader mixed into its key, and a new key
 * of its own each time it is uploaded again after it is posted (one upload is
 * one post's), so the same picture can sit under several keys.
 * `content_sha256` is what they share: the upload step refuses bytes
 * moderation took down under any key, and a takedown reaches every copy.
 *
 * Uploads stored before this have none; their keys are still plain hashes of
 * their bytes, which the key check covers.
 */

export const up = (pgm) => {
  pgm.addColumns('media_uploads', {
    content_sha256: { type: 'text' },
  });
  pgm.createIndex('media_uploads', 'content_sha256', {
    name: 'media_uploads_content_sha256',
    where: 'content_sha256 IS NOT NULL',
  });
};

export const down = (pgm) => {
  pgm.dropIndex('media_uploads', 'content_sha256', { name: 'media_uploads_content_sha256' });
  pgm.dropColumns('media_uploads', ['content_sha256']);
};
