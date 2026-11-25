/**
 * Who read whose letters and private chats, and why (api/src/message-access).
 *
 * - `safety_reviews`: a superadmin letting one staff member read one account's letters and private chats, read-only,
 *   for exactly 24 hours, for a reason from a fixed list with a note. The database sets when it starts and ends, so no
 *   insert can open one in the past or for longer, and nothing about it may change afterwards except ending it early,
 *   once.
 * - `message_access_log`: every such grant and its end, every list of conversations and every conversation opened
 *   under one, and every time a moderator read a reported or flagged letter or message in its case. Never what a
 *   message says. Append-only, with no way round it: no update, delete or truncate.
 *
 * The people in both are plain columns, as in admin_audit_log, so the record outlives the accounts it names.
 */

const REASONS = ['child_safety', 'threat_to_life', 'legal_request', 'report_context'];

export const up = (pgm) => {
  pgm.createTable('safety_reviews', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    subject_id: { type: 'uuid', notNull: true },
    reviewer_id: { type: 'uuid', notNull: true },
    granted_by: { type: 'uuid', notNull: true },
    reason: { type: 'text', notNull: true, check: `reason IN (${REASONS.map((r) => `'${r}'`).join(', ')})` },
    note: { type: 'text', notNull: true, check: 'char_length(note) BETWEEN 20 AND 1000' },
    case_id: { type: 'uuid' },
    granted_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    expires_at: { type: 'timestamptz', notNull: true },
    ended_at: { type: 'timestamptz' },
    ended_by: { type: 'uuid' },
  });
  pgm.addConstraint('safety_reviews', 'safety_reviews_one_day', { check: "expires_at = granted_at + interval '24 hours'" });
  pgm.addConstraint('safety_reviews', 'safety_reviews_not_own', { check: 'subject_id <> reviewer_id AND subject_id <> granted_by' });
  pgm.addConstraint('safety_reviews', 'safety_reviews_ended_shape', { check: '(ended_at IS NULL) = (ended_by IS NULL)' });
  pgm.addConstraint('safety_reviews', 'safety_reviews_context_case', { check: "reason <> 'report_context' OR case_id IS NOT NULL" });
  pgm.createIndex('safety_reviews', ['reviewer_id', 'subject_id', 'expires_at'], { name: 'safety_reviews_reviewer' });
  pgm.createIndex('safety_reviews', ['granted_by', 'granted_at'], { name: 'safety_reviews_granter_day' });
  pgm.createIndex('safety_reviews', ['expires_at'], { name: 'safety_reviews_open', where: 'ended_at IS NULL' });

  pgm.createFunction(
    'safety_reviews_guard',
    [],
    { returns: 'trigger', language: 'plpgsql', replace: true },
    `BEGIN
       IF TG_OP = 'DELETE' THEN
         RAISE EXCEPTION 'safety_reviews keeps every review';
       END IF;
       -- the one change allowed: ending a review early, once, and nothing else
       IF OLD.ended_at IS NULL AND NEW.ended_at IS NOT NULL
          AND (to_jsonb(NEW) - 'ended_at' - 'ended_by') = (to_jsonb(OLD) - 'ended_at' - 'ended_by') THEN
         RETURN NEW;
       END IF;
       RAISE EXCEPTION 'safety_reviews can only be ended early, once';
     END;`,
  );
  pgm.createTrigger('safety_reviews', 'safety_reviews_no_rewrite', {
    when: 'BEFORE',
    operation: ['UPDATE', 'DELETE'],
    level: 'ROW',
    function: 'safety_reviews_guard',
  });
  // a review starts when it is written and lasts its 24 hours, whatever the insert said
  pgm.createFunction(
    'safety_reviews_times',
    [],
    { returns: 'trigger', language: 'plpgsql', replace: true },
    `BEGIN
       NEW.granted_at := now();
       NEW.expires_at := now() + interval '24 hours';
       NEW.ended_at := NULL;
       NEW.ended_by := NULL;
       RETURN NEW;
     END;`,
  );
  pgm.createTrigger('safety_reviews', 'safety_reviews_set_times', {
    when: 'BEFORE',
    operation: 'INSERT',
    level: 'ROW',
    function: 'safety_reviews_times',
  });

  pgm.createTable('message_access_log', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    kind: { type: 'text', notNull: true, check: "kind IN ('granted','ended','listed','read','case')" },
    staff_id: { type: 'uuid', notNull: true },
    subject_id: { type: 'uuid' },
    review_id: { type: 'uuid' },
    case_id: { type: 'uuid' },
    basis: { type: 'text', notNull: true, check: "basis IN ('safety_review','report','flag')" },
    conversation_kind: { type: 'text', check: "conversation_kind IN ('letters','birds','direct','group')" },
    conversation_id: { type: 'uuid' },
    messages: { type: 'integer', check: 'messages >= 0' },
    request_id: { type: 'text' },
  });
  pgm.addConstraint('message_access_log', 'message_access_log_shape', {
    check: `(basis = 'safety_review') = (review_id IS NOT NULL)
      AND (kind = 'case') = (case_id IS NOT NULL AND basis <> 'safety_review')
      AND (kind = 'read') = (conversation_kind IS NOT NULL)
      AND (conversation_kind IS NULL) = (conversation_id IS NULL)`,
  });
  pgm.createIndex('message_access_log', [{ name: 'at', sort: 'DESC' }, { name: 'id', sort: 'DESC' }], { name: 'message_access_log_recent' });
  pgm.createIndex('message_access_log', ['staff_id', 'case_id', 'at'], { name: 'message_access_log_case_reads', where: "kind = 'case'" });
  pgm.createIndex('message_access_log', ['subject_id', 'at'], { name: 'message_access_log_subject' });

  pgm.createFunction(
    'message_access_log_immutable',
    [],
    { returns: 'trigger', language: 'plpgsql', replace: true },
    `BEGIN
       RAISE EXCEPTION 'message_access_log is append-only and cannot be modified or deleted';
     END;`,
  );
  pgm.createTrigger('message_access_log', 'message_access_log_no_rewrite', {
    when: 'BEFORE',
    operation: ['UPDATE', 'DELETE'],
    level: 'ROW',
    function: 'message_access_log_immutable',
  });

  // TRUNCATE skips row triggers, so each table refuses it on its own
  pgm.createFunction(
    'message_access_no_truncate',
    [],
    { returns: 'trigger', language: 'plpgsql', replace: true },
    `BEGIN
       RAISE EXCEPTION '% is append-only and cannot be emptied', TG_TABLE_NAME;
     END;`,
  );
  for (const table of ['safety_reviews', 'message_access_log']) {
    pgm.createTrigger(table, `${table}_no_truncate`, {
      when: 'BEFORE',
      operation: 'TRUNCATE',
      level: 'STATEMENT',
      function: 'message_access_no_truncate',
    });
  }
};

export const down = (pgm) => {
  for (const table of ['safety_reviews', 'message_access_log']) pgm.dropTrigger(table, `${table}_no_truncate`);
  pgm.dropFunction('message_access_no_truncate', []);
  pgm.dropTrigger('message_access_log', 'message_access_log_no_rewrite');
  pgm.dropFunction('message_access_log_immutable', []);
  pgm.dropTable('message_access_log');
  pgm.dropTrigger('safety_reviews', 'safety_reviews_set_times');
  pgm.dropFunction('safety_reviews_times', []);
  pgm.dropTrigger('safety_reviews', 'safety_reviews_no_rewrite');
  pgm.dropFunction('safety_reviews_guard', []);
  pgm.dropTable('safety_reviews');
};
