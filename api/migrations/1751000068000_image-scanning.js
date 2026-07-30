/**
 * Automatic image scanning (KUR-294). Every uploaded image is auto-classified
 * (NSFW / violence) and hash-matched (CSAM) at the media finalize step; the
 * verdict gates whether it is ever publicly served. `media_uploads.scan_status`
 * is the gate; `image_scans` records each verdict (scores + model/hash-db
 * version) for audit (#104) and moderator reversal. A CSAM match is hard-blocked
 * with the record **preserved** (evidence + mandated reporting) — never deleted.
 */

export const up = (pgm) => {
  // Gate: only 'cleared' images are publicly servable. Existing rows default to
  // 'cleared' (backward-compatible); new uploads are scanned before serving.
  pgm.addColumns('media_uploads', {
    scan_status: {
      type: 'text',
      notNull: true,
      default: 'cleared',
      check: "scan_status IN ('pending','cleared','gated','blocked')",
    },
  });

  pgm.createTable('image_scans', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    media_key: { type: 'text', notNull: true },
    surface: { type: 'text', notNull: true, check: "surface IN ('feed','profile')" },
    nsfw_score: { type: 'numeric(4,3)', notNull: true, default: 0 },
    violence_score: { type: 'numeric(4,3)', notNull: true, default: 0 },
    csam_match: { type: 'boolean', notNull: true, default: false },
    action: {
      type: 'text',
      notNull: true,
      check: "action IN ('allow','flag','gate','auto_block','hard_block')",
    },
    reasons: { type: 'text[]', notNull: true, default: '{}' },
    preserve_evidence: { type: 'boolean', notNull: true, default: false },
    model_version: { type: 'text', notNull: true },
    status: {
      type: 'text',
      notNull: true,
      default: 'pending',
      check: "status IN ('pending','actioned','reversed')",
    },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    resolved_at: { type: 'timestamptz' },
    resolved_by: { type: 'uuid' },
  });

  pgm.createIndex('image_scans', ['status', 'created_at']);
  pgm.createIndex('image_scans', 'media_key');
};

export const down = (pgm) => {
  pgm.dropTable('image_scans');
  pgm.dropColumns('media_uploads', ['scan_status']);
};
