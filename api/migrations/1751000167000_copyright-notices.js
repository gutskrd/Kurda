/**
 * Copyright notices and counter-notices, as moderation cases.
 *
 * A rights holder — usually someone with no account — tells Hevalo from the
 * public /copyright page that a post copies their work. Hosting law makes that
 * the moment Hevalo must act: under the EU Digital Services Act (Art. 6, 16)
 * a host keeps its safe harbour by taking down what it is properly told about,
 * and under the US DMCA (§512(c)) by the same and by closing the accounts of
 * repeat infringers (§512(i)). Until now there was no way to be told at all:
 * reports needed an account and had no copyright reason.
 *
 * - `copyright` becomes a report category (an in-app report "copies someone
 *   else's work") and a rule a decision can be made under, everywhere the
 *   categories are checked: reports, cases, sanctions.
 * - `copyright` becomes a case source. A notice opens (or joins) the open case
 *   about its target, like a report does, so it lands in the same queue and is
 *   decided in the same case view, with the same statement of reasons to the
 *   uploader. A notice whose link matched nothing still gets a case, keyed by
 *   the notice itself, for an admin to look into by hand.
 * - `copyright_notices` keeps every field the two laws ask for, exactly as sent
 *   (the case view shows it), when the receipt and the outcome were emailed,
 *   and a keyed hash of the sender's address for the per-address limit — never
 *   the address itself.
 * - `copyright_counter_notices` keeps the uploader's answer (§512(g)): one per
 *   notice, and when its copy went to the notifier.
 *
 * Strikes are not a table: a strike is a copyright decision against someone
 * that still stands — an unrevoked sanction under the copyright rule — so an
 * appeal or a counter-notice that puts the post back takes the strike with it.
 */

const CATEGORIES_OLD = [
  'child_safety',
  'self_harm',
  'violence',
  'sexual',
  'hate',
  'private_info',
  'harassment',
  'spam',
  'impersonation',
  'other',
];
const CATEGORIES_NEW = [...CATEGORIES_OLD, 'copyright'];
const SOURCES_OLD = ['report', 'chat_report', 'anti_cheat', 'text_flag', 'image_flag', 'bot_flag', 'library_report', 'image_report', 'user_report'];
const SOURCES_NEW = [...SOURCES_OLD, 'copyright'];
const list = (values) => values.map((v) => `'${v}'`).join(',');

/** [table, constraint, column, nullable] — every check that lists the categories. */
const CATEGORY_CHECKS = [
  ['reports', 'reports_category_check', 'category', false],
  ['moderation_cases', 'moderation_cases_category_check', 'category', true],
  ['moderation_cases', 'moderation_cases_policy_check', 'policy', true],
  ['sanctions', 'sanctions_policy_check', 'policy', false],
];

function setCategories(pgm, categories) {
  for (const [table, name, column, nullable] of CATEGORY_CHECKS) {
    pgm.dropConstraint(table, name);
    const check = `${column} IN (${list(categories)})`;
    pgm.addConstraint(table, name, { check: nullable ? `${column} IS NULL OR ${check}` : check });
  }
}

export const up = (pgm) => {
  setCategories(pgm, CATEGORIES_NEW);
  pgm.dropConstraint('moderation_cases', 'moderation_cases_source_check');
  pgm.addConstraint('moderation_cases', 'moderation_cases_source_check', { check: `source IN (${list(SOURCES_NEW)})` });

  pgm.createTable('copyright_notices', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    // the case it opened or joined; kept if the case is ever deleted
    case_id: { type: 'uuid', references: 'moderation_cases', onDelete: 'SET NULL' },
    status: {
      type: 'text',
      notNull: true,
      default: 'received',
      // upheld: decided against the uploader with nothing taken down (a profile, or a link that matched nothing)
      check: "status IN ('received','actioned','upheld','rejected','countered')",
    },
    // what the link was read as; null when it matched nothing on Hevalo
    target_type: { type: 'text', check: "target_type IS NULL OR target_type IN ('library_post','image_post','user')" },
    target_id: { type: 'uuid' },
    target_found: { type: 'boolean', notNull: true, default: false },
    // whose post it is, when it was found
    subject_user_id: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    notifier_name: { type: 'text', notNull: true, check: 'char_length(notifier_name) BETWEEN 1 AND 200' },
    notifier_email: { type: 'text', notNull: true, check: 'char_length(notifier_email) BETWEEN 3 AND 254' },
    notifier_address: { type: 'text', notNull: true, check: 'char_length(notifier_address) BETWEEN 1 AND 500' },
    notifier_phone: { type: 'text', check: 'notifier_phone IS NULL OR char_length(notifier_phone) <= 40' },
    notifier_role: { type: 'text', notNull: true, check: "notifier_role IN ('owner','authorised')" },
    rights_holder: { type: 'text', check: 'rights_holder IS NULL OR char_length(rights_holder) <= 200' },
    work: { type: 'text', notNull: true, check: 'char_length(work) BETWEEN 1 AND 2000' },
    work_url: { type: 'text', check: 'work_url IS NULL OR char_length(work_url) <= 500' },
    content_url: { type: 'text', notNull: true, check: 'char_length(content_url) BETWEEN 1 AND 500' },
    explanation: { type: 'text', notNull: true, check: 'char_length(explanation) BETWEEN 1 AND 4000' },
    // the two statements; the route refuses a notice without them, the table records that they were made
    good_faith: { type: 'boolean', notNull: true, check: 'good_faith' },
    accurate: { type: 'boolean', notNull: true, check: 'accurate' },
    signature: { type: 'text', notNull: true, check: 'char_length(signature) BETWEEN 1 AND 200' },
    // the language its emails are written in
    locale: { type: 'text', notNull: true, default: 'en' },
    // a keyed hash of the sender's network address (the per-address limit), never the address
    ip_hash: { type: 'text' },
    receipt_sent_at: { type: 'timestamptz' },
    // the decision was emailed to the notifier (DSA Art. 16(5)); claimed before sending, so it goes once
    outcome_sent_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('copyright_notices', 'copyright_notices_holder_named', {
    check: "notifier_role = 'owner' OR rights_holder IS NOT NULL",
  });
  pgm.createIndex('copyright_notices', 'case_id');
  pgm.createIndex('copyright_notices', ['subject_user_id', 'created_at']);
  pgm.createIndex('copyright_notices', ['ip_hash', 'created_at']);
  // the outcome sweep reads decided notices whose email has not gone yet
  pgm.createIndex('copyright_notices', 'created_at', {
    name: 'copyright_notices_outcome_due_idx',
    where: "outcome_sent_at IS NULL AND status <> 'received'",
  });

  pgm.createTable('copyright_counter_notices', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    notice_id: { type: 'uuid', notNull: true, references: 'copyright_notices', onDelete: 'CASCADE', unique: true },
    user_id: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    name: { type: 'text', notNull: true, check: 'char_length(name) BETWEEN 1 AND 200' },
    address: { type: 'text', notNull: true, check: 'char_length(address) BETWEEN 1 AND 500' },
    phone: { type: 'text', check: 'phone IS NULL OR char_length(phone) <= 40' },
    email: { type: 'text', notNull: true, check: 'char_length(email) BETWEEN 3 AND 254' },
    statement: { type: 'text', notNull: true, check: 'char_length(statement) BETWEEN 1 AND 4000' },
    good_faith: { type: 'boolean', notNull: true, check: 'good_faith' },
    consent: { type: 'boolean', notNull: true, check: 'consent' },
    signature: { type: 'text', notNull: true, check: 'char_length(signature) BETWEEN 1 AND 200' },
    // the appeal it opened on the removal, so the admin's Appeals page has it too
    appeal_id: { type: 'uuid', references: 'appeals', onDelete: 'SET NULL' },
    restore_not_before: { type: 'timestamptz', notNull: true },
    forwarded_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('copyright_counter_notices', 'user_id');
};

export const down = (pgm) => {
  pgm.dropTable('copyright_counter_notices');
  pgm.dropTable('copyright_notices');

  // what the old checks cannot hold goes back to the nearest thing they can
  pgm.sql(`DELETE FROM moderation_cases WHERE source = 'copyright'`);
  pgm.dropConstraint('moderation_cases', 'moderation_cases_source_check');
  pgm.addConstraint('moderation_cases', 'moderation_cases_source_check', { check: `source IN (${list(SOURCES_OLD)})` });
  pgm.sql(`UPDATE reports SET category = 'other' WHERE category = 'copyright'`);
  pgm.sql(`UPDATE moderation_cases SET category = 'other' WHERE category = 'copyright'`);
  pgm.sql(`UPDATE moderation_cases SET policy = 'other' WHERE policy = 'copyright'`);
  pgm.sql(`UPDATE sanctions SET policy = 'other' WHERE policy = 'copyright'`);
  setCategories(pgm, CATEGORIES_OLD);
};
