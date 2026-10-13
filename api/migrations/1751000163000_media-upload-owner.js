/**
 * Who uploaded a picture, what kind of upload it is, and its size — and a
 * picture upload is confirmed only when a post uses it.
 *
 * Nothing recorded who an upload belonged to, so posting a picture accepted any
 * cleared key: somebody else's profile photo (the key is in its public
 * address), a voice note, or the same picture again and again. And a picture
 * was confirmed the moment it was stored, before any post existed, so one that
 * was uploaded and never posted stayed in the bucket for good — the orphan
 * sweep only reclaims what is unconfirmed.
 *
 * `uploader_id` and `kind` are recorded from now on (nullable, no backfill: an
 * old upload simply cannot be put on a new post), with the stored size. Picture
 * uploads are left unconfirmed until a post claims them, which is what lets the
 * existing sweep reclaim the abandoned ones after a day.
 *
 * The picture uploads already confirmed that no post uses are handed to the
 * sweep the same way, with a day's grace: they were confirmed only because the
 * old upload step did it, and nothing points at them. One held as evidence by
 * an image scan is left alone.
 */

export const up = (pgm) => {
  pgm.addColumns('media_uploads', {
    uploader_id: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    kind: { type: 'text' },
    width: { type: 'integer' },
    height: { type: 'integer' },
  });
  pgm.createIndex('media_uploads', 'uploader_id', { name: 'media_uploads_uploader' });

  pgm.sql(`
    UPDATE media_uploads m SET confirmed_at = NULL, created_at = now()
     WHERE m.key LIKE 'image-post/%'
       AND m.confirmed_at IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM image_posts i WHERE i.image_media_id = m.key)
       AND NOT EXISTS (SELECT 1 FROM image_scans s WHERE s.media_key = m.key AND s.preserve_evidence)`);
};

export const down = (pgm) => {
  pgm.dropIndex('media_uploads', 'uploader_id', { name: 'media_uploads_uploader' });
  pgm.dropColumns('media_uploads', ['uploader_id', 'kind', 'width', 'height']);
};
