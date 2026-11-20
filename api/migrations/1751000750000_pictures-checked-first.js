/**
 * Pictures are checked before anyone else sees them.
 *
 * Until now every picture went to the public bucket first and was scanned
 * after, by a stub that passed everything, and a "gated" picture was simply
 * refused. Now the bytes are checked in memory first: a clear picture goes
 * public, an uncertain one is held privately for a person (only its owner sees
 * it), and a clearly bad one is refused and kept privately for the appeal
 * window. What that needs:
 *
 * - `media_uploads.scan_status` gains `held` (waiting for a person) and
 *   `refused` (refused at upload), and new rows start `pending` rather than
 *   `cleared`. `private_key` is where the bytes are kept while they are not
 *   public, and `publish_state` marks a picture a person approved whose bytes
 *   are still being copied to the public bucket (the sweep retries).
 * - `image_scans` keeps what the check found per category (`levels`), how the
 *   picture came to be held (`checked_by`), the outcome and the reason shown
 *   to the owner, who uploaded it, and the owner asking a person to look again
 *   (`asked_at`, `note`). `clear` scans are recorded too, for audit. The old
 *   numeric scores are still written, from the levels.
 * - A held profile or group photo waits beside the live one
 *   (`users.pending_profile_photo_key`, `groups.pending_photo_key`), so others
 *   keep seeing the old one; a post or a letter with a held picture is `held`
 *   until a person decides, and a letter remembers its drawing's picture.
 * - Profile and group photo uploads gain the uploader, kind and content hash
 *   other uploads already record, so their cases have someone to answer for
 *   them and the same bytes can be refused on every kind.
 */

const SCAN_STATUSES_OLD = ['pending', 'cleared', 'gated', 'blocked'];
const SCAN_STATUSES_NEW = ['pending', 'cleared', 'gated', 'held', 'refused', 'blocked'];
const SURFACES_OLD = ['feed', 'profile'];
const SURFACES_NEW = [...SURFACES_OLD, 'post', 'profile_photo', 'group_photo', 'letter'];
const SCAN_ROW_STATUSES_OLD = ['pending', 'actioned', 'reversed'];
const SCAN_ROW_STATUSES_NEW = [...SCAN_ROW_STATUSES_OLD, 'clear'];
const LEVEL_CATEGORIES = ['sexual', 'suggestive', 'minor_safety', 'violence', 'self_harm', 'hate', 'drugs', 'shocking'];
const list = (values) => values.map((v) => `'${v}'`).join(',');

/** [table, constraint, old statuses, new statuses] */
const POST_STATUSES = [
  ['image_posts', 'image_posts_status_check', ['published', 'removed'], ['published', 'removed', 'held']],
  ['library_posts', 'library_posts_status_check', ['draft', 'published', 'removed'], ['draft', 'published', 'removed', 'held']],
  ['letters', 'letters_status_check', ['flying', 'delivered', 'recalled', 'removed'], ['flying', 'delivered', 'recalled', 'removed', 'held']],
];

function setCheck(pgm, table, name, column, values) {
  pgm.dropConstraint(table, name);
  pgm.addConstraint(table, name, { check: `${column} IN (${list(values)})` });
}

export const up = (pgm) => {
  // ---- uploads ---------------------------------------------------------------
  setCheck(pgm, 'media_uploads', 'media_uploads_scan_status_check', 'scan_status', SCAN_STATUSES_NEW);
  pgm.alterColumn('media_uploads', 'scan_status', { default: 'pending' });
  pgm.addColumns('media_uploads', {
    private_key: { type: 'text' },
    publish_state: { type: 'text', check: "publish_state = 'pending'" },
    // the hash of the file as it was sent, before it was resized for its kind, so the same file is known on every kind
    source_sha256: { type: 'text' },
  });
  pgm.createIndex('media_uploads', 'source_sha256', { name: 'media_uploads_source_sha256', where: 'source_sha256 IS NOT NULL' });
  pgm.createIndex('media_uploads', 'key', { name: 'media_uploads_publish_pending', where: "publish_state = 'pending'" });
  // a picture hidden by reports whose bytes are still on the public bucket
  pgm.createIndex('media_uploads', 'key', { name: 'media_uploads_hold_move_pending', where: "scan_status = 'held' AND private_key IS NULL" });

  // Profile and group photos recorded nothing of whose they were; their keys are plain hashes of their bytes.
  pgm.sql(`
    UPDATE media_uploads SET kind = split_part(key, '/', 1)
     WHERE kind IS NULL AND (key LIKE 'profile-photo/%' OR key LIKE 'group-photo/%')`);
  pgm.sql(`
    UPDATE media_uploads SET content_sha256 = substring(key from '/([a-f0-9]{64})\\.')
     WHERE content_sha256 IS NULL AND (key LIKE 'profile-photo/%' OR key LIKE 'group-photo/%')`);
  pgm.sql(`
    UPDATE media_uploads m SET uploader_id = u.id
      FROM users u WHERE u.profile_photo_key = m.key AND m.uploader_id IS NULL`);
  pgm.sql(`
    UPDATE media_uploads m SET uploader_id = g.photo_set_by
      FROM groups g WHERE g.photo_key = m.key AND m.uploader_id IS NULL AND g.photo_set_by IS NOT NULL`);

  // ---- what each check found ---------------------------------------------------
  setCheck(pgm, 'image_scans', 'image_scans_surface_check', 'surface', SURFACES_NEW);
  setCheck(pgm, 'image_scans', 'image_scans_status_check', 'status', SCAN_ROW_STATUSES_NEW);
  pgm.addColumns('image_scans', {
    // { category: 'none' | 'possible' | 'likely' | 'certain' } for every category the check looks for
    levels: { type: 'jsonb' },
    checked_by: { type: 'text', check: "checked_by IN ('auto','people_only','checker_unavailable')" },
    outcome: { type: 'text', check: "outcome IN ('clear','held','refused','child_safety')" },
    reason: { type: 'text', check: "reason IN ('sexual','violence','self_harm','hate','other')" },
    uploader_id: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    asked_at: { type: 'timestamptz' },
    note: { type: 'text', check: 'char_length(note) <= 500' },
    rescan_attempts: { type: 'smallint', notNull: true, default: 0 },
  });
  pgm.addConstraint('image_scans', 'image_scans_levels_shape', {
    check: `levels IS NULL OR (jsonb_typeof(levels) = 'object' AND levels ?& ARRAY[${list(LEVEL_CATEGORIES)}])`,
  });
  // the retry job: pictures held only because the checker could not be reached
  pgm.createIndex('image_scans', 'created_at', {
    name: 'image_scans_unavailable_idx',
    where: "checked_by = 'checker_unavailable' AND status = 'pending'",
  });
  // the daily limit counts today's automatic checks
  pgm.createIndex('image_scans', 'created_at', { name: 'image_scans_auto_day_idx', where: "checked_by = 'auto'" });
  pgm.createIndex('image_scans', ['uploader_id', 'created_at'], { name: 'image_scans_uploader_idx' });

  // ---- what waits for a person ---------------------------------------------------
  pgm.addColumns('users', { pending_profile_photo_key: { type: 'text' } });
  pgm.addColumns('groups', {
    pending_photo_key: { type: 'text' },
    // who put the waiting picture up: they see it, as the group's admins do
    pending_photo_set_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
  });
  for (const [table, name, , statuses] of POST_STATUSES) setCheck(pgm, table, name, 'status', statuses);
  pgm.addColumns('letters', { drawing_key: { type: 'text' } });
  pgm.createIndex('letters', 'drawing_key', { name: 'letters_drawing_key', where: 'drawing_key IS NOT NULL' });

  // the Pictures page reads picture cases by status, oldest first
  pgm.createIndex('moderation_cases', ['status', 'first_reported_at'], {
    name: 'moderation_cases_pictures_idx',
    where: "source = 'image_flag'",
  });
};

export const down = (pgm) => {
  pgm.dropIndex('moderation_cases', ['status', 'first_reported_at'], { name: 'moderation_cases_pictures_idx' });

  pgm.dropIndex('letters', 'drawing_key', { name: 'letters_drawing_key' });
  pgm.dropColumns('letters', ['drawing_key']);
  // what waited for a person is let go: a held post or letter is taken down, a held drawing's letter too
  pgm.sql(`UPDATE image_posts SET status = 'removed' WHERE status = 'held'`);
  pgm.sql(`UPDATE library_posts SET status = 'removed' WHERE status = 'held'`);
  pgm.sql(`UPDATE letters SET status = 'removed' WHERE status = 'held'`);
  for (const [table, name, statuses] of POST_STATUSES) setCheck(pgm, table, name, 'status', statuses);
  pgm.dropColumns('groups', ['pending_photo_key', 'pending_photo_set_by']);
  pgm.dropColumns('users', ['pending_profile_photo_key']);

  pgm.dropIndex('image_scans', ['uploader_id', 'created_at'], { name: 'image_scans_uploader_idx' });
  pgm.dropIndex('image_scans', 'created_at', { name: 'image_scans_auto_day_idx' });
  pgm.dropIndex('image_scans', 'created_at', { name: 'image_scans_unavailable_idx' });
  pgm.dropConstraint('image_scans', 'image_scans_levels_shape');
  pgm.dropColumns('image_scans', ['levels', 'checked_by', 'outcome', 'reason', 'uploader_id', 'asked_at', 'note', 'rescan_attempts']);
  pgm.sql(`DELETE FROM image_scans WHERE status = 'clear' OR surface NOT IN (${list(SURFACES_OLD)})`);
  setCheck(pgm, 'image_scans', 'image_scans_status_check', 'status', SCAN_ROW_STATUSES_OLD);
  setCheck(pgm, 'image_scans', 'image_scans_surface_check', 'surface', SURFACES_OLD);

  pgm.dropIndex('media_uploads', 'key', { name: 'media_uploads_hold_move_pending' });
  pgm.dropIndex('media_uploads', 'key', { name: 'media_uploads_publish_pending' });
  pgm.dropIndex('media_uploads', 'source_sha256', { name: 'media_uploads_source_sha256' });
  pgm.dropColumns('media_uploads', ['private_key', 'publish_state', 'source_sha256']);
  pgm.alterColumn('media_uploads', 'scan_status', { default: 'cleared' });
  // held and refused bytes are not public, so the old schema calls them gated
  pgm.sql(`UPDATE media_uploads SET scan_status = 'gated' WHERE scan_status IN ('held','refused')`);
  setCheck(pgm, 'media_uploads', 'media_uploads_scan_status_check', 'scan_status', SCAN_STATUSES_OLD);
};
