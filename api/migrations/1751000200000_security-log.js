/**
 * The security log: who signed in and from where, who failed to, who was
 * locked out, slowed down or refused, what happened on the admin console, and
 * who was given staff access (security/log.ts; the kinds are in
 * @kurda/shared security-log.ts).
 *
 * An event is never rewritten. The table refuses every UPDATE except the one
 * that forgets the sealed address an event came from (kept a month), and every
 * DELETE of an event still inside its retention: 90 days for the routine ones,
 * a year for warnings and worse. So the daily purge can do its job, and
 * nothing else, not even a superadmin's session, can quietly erase what an
 * intruder did last week.
 *
 * `user_id` and `actor_id` are plain columns, as in admin_audit_log: the record
 * of an account's sign-ins outlasts the account for as long as it is kept. The
 * address itself is never stored in the clear: `network_hash` is the keyed hash
 * every network comparison uses (net/network-key.ts), `ip_sealed` the address
 * encrypted at rest (security/at-rest.ts), readable only through the admin
 * route that records who read it and why.
 *
 * `security_alerts` is the "Needs attention" list: one row for each warning or
 * critical event, which a superadmin marks reviewed. A critical one is emailed
 * (`emailed_at` is the claim, so two sweeps never send it twice).
 */

export const up = (pgm) => {
  pgm.createTable('security_events', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    occurred_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    kind: { type: 'text', notNull: true },
    severity: { type: 'text', notNull: true, check: "severity IN ('info','notice','warning','critical')" },
    category: { type: 'text', notNull: true },
    user_id: { type: 'uuid' },
    actor_id: { type: 'uuid' },
    network_hash: { type: 'text' },
    ip_sealed: { type: 'text' },
    country: { type: 'text', check: "country IS NULL OR country ~ '^[A-Z0-9]{2}$'" },
    device: { type: 'text' },
    request_id: { type: 'text' },
    details: { type: 'jsonb', notNull: true, default: pgm.func("'{}'::jsonb") },
  });
  pgm.createIndex('security_events', [{ name: 'occurred_at', sort: 'DESC' }, { name: 'id', sort: 'DESC' }], {
    name: 'security_events_recent_idx',
  });
  pgm.createIndex('security_events', ['user_id', 'occurred_at']);
  pgm.createIndex('security_events', ['network_hash', 'occurred_at']);
  pgm.createIndex('security_events', ['severity', 'occurred_at']);
  pgm.createIndex('security_events', ['kind', 'occurred_at']);

  pgm.createFunction(
    'security_events_guard',
    [],
    { returns: 'trigger', language: 'plpgsql', replace: true },
    `BEGIN
       IF TG_OP = 'DELETE' THEN
         -- in brackets: unbracketed, the IF would end at the CASE's own THEN
         IF OLD.occurred_at < now() - (CASE WHEN OLD.severity IN ('info','notice') THEN interval '90 days' ELSE interval '365 days' END) THEN
           RETURN OLD;
         END IF;
         RAISE EXCEPTION 'security_events keeps every event for its whole retention period';
       END IF;
       -- the one change allowed: forgetting the sealed address, and nothing else
       IF NEW.ip_sealed IS NULL AND (to_jsonb(NEW) - 'ip_sealed') = (to_jsonb(OLD) - 'ip_sealed') THEN
         RETURN NEW;
       END IF;
       RAISE EXCEPTION 'security_events is append-only';
     END;`,
  );
  pgm.createTrigger('security_events', 'security_events_no_rewrite', {
    when: 'BEFORE',
    operation: ['UPDATE', 'DELETE'],
    level: 'ROW',
    function: 'security_events_guard',
  });

  pgm.createTable('security_alerts', {
    event_id: { type: 'uuid', primaryKey: true, references: 'security_events', onDelete: 'CASCADE' },
    kind: { type: 'text', notNull: true },
    severity: { type: 'text', notNull: true, check: "severity IN ('warning','critical')" },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    emailed_at: { type: 'timestamptz' },
    reviewed_at: { type: 'timestamptz' },
    reviewed_by: { type: 'uuid' },
    review_note: { type: 'text' },
  });
  pgm.createIndex('security_alerts', ['created_at'], { name: 'security_alerts_open_idx', where: 'reviewed_at IS NULL' });
  pgm.createIndex('security_alerts', ['emailed_at']);
};

export const down = (pgm) => {
  pgm.dropTable('security_alerts');
  pgm.dropTrigger('security_events', 'security_events_no_rewrite');
  pgm.dropFunction('security_events_guard', []);
  pgm.dropTable('security_events');
};
