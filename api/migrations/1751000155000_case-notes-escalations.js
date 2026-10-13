/**
 * Internal notes on a case, and escalations.
 *
 * A note is for the admins only — what one moderator wants the next to know
 * ("asked the reporter for the screenshot", "same pattern as last month's
 * case"). It never reaches the people in the case.
 *
 * An escalation is a task that cannot be finished inside Hevalo: a case passed
 * up for a second opinion, or — after the CSAM action — the report a person has
 * to file by hand with NCMEC, the IWF/NCA or an INHOPE hotline. It carries the
 * links, and is closed with the reference the hotline gave, which the UK rules
 * expect a service to keep (research: NCA references for five years).
 */

export const up = (pgm) => {
  pgm.createTable('moderation_case_notes', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    case_id: { type: 'uuid', notNull: true, references: 'moderation_cases', onDelete: 'CASCADE' },
    // the admin; no foreign key, so the note keeps its author's id
    author_id: { type: 'uuid' },
    body: { type: 'text', notNull: true, check: 'char_length(body) BETWEEN 1 AND 4000' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('moderation_case_notes', ['case_id', 'created_at']);

  pgm.createTable('moderation_escalations', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    case_id: { type: 'uuid', notNull: true, references: 'moderation_cases', onDelete: 'CASCADE' },
    kind: { type: 'text', notNull: true, check: "kind IN ('csam','escalation')" },
    reason: { type: 'text' },
    links: { type: 'jsonb', notNull: true, default: '[]' },
    status: { type: 'text', notNull: true, default: 'open', check: "status IN ('open','filed')" },
    reference: { type: 'text' },
    created_by: { type: 'uuid' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    filed_by: { type: 'uuid' },
    filed_at: { type: 'timestamptz' },
  });
  pgm.createIndex('moderation_escalations', ['case_id']);
  pgm.createIndex('moderation_escalations', ['status', 'created_at']);
};

export const down = (pgm) => {
  pgm.dropTable('moderation_escalations');
  pgm.dropTable('moderation_case_notes');
};
