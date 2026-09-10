/**
 * Reporting a person.
 *
 * Every existing report is about a *thing* — a chat message, a library post, an
 * image. There was no way to report the person, which is the one you need when
 * the problem is not any single post: an account following someone around,
 * impersonating them, or opening one abusive conversation after another.
 *
 * Blocking already handled the private half of that (you stop seeing them, they
 * stop reaching you) but it tells nobody, so a serial harasser stayed invisible
 * to moderation no matter how many people blocked them. This is the half that
 * reaches a moderator.
 *
 * A reason is required, unlike the other report tables where it is optional. A
 * report about a person carries no post to look at, so without a reason there
 * is nothing for a moderator to act on — and requiring one is also the cheapest
 * brake there is on reporting somebody out of irritation.
 *
 * One report per reporter per person: re-reporting is a no-op, and many people
 * reporting the same account collapse to a single queue case whose severity
 * rises with the count.
 */

const CATEGORIES = ['harassment', 'spam', 'impersonation', 'hate', 'self_harm', 'other'];

export const up = (pgm) => {
  pgm.createTable('user_reports', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    reported_user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    reporter_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    category: {
      type: 'text',
      notNull: true,
      check: `category IN (${CATEGORIES.map((c) => `'${c}'`).join(',')})`,
    },
    reason: { type: 'text', notNull: true },
    status: { type: 'text', notNull: true, default: 'open', check: "status IN ('open','resolved')" },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // one per reporter per person; re-reporting updates nothing
  pgm.addConstraint('user_reports', 'user_reports_uniq', {
    unique: ['reported_user_id', 'reporter_id'],
  });
  // nobody reports themselves — enforced here as well as in the service, because
  // a check constraint cannot be forgotten by a future caller
  pgm.addConstraint('user_reports', 'user_reports_not_self', {
    check: 'reported_user_id <> reporter_id',
  });
  // the queue's sync scans open reports grouped by who they are about
  pgm.createIndex('user_reports', ['reported_user_id', 'status']);

  pgm.dropConstraint('moderation_cases', 'moderation_cases_source_check');
  pgm.addConstraint('moderation_cases', 'moderation_cases_source_check', {
    check:
      "source IN ('chat_report','anti_cheat','text_flag','image_flag','library_report','image_report','user_report')",
  });
};

export const down = (pgm) => {
  pgm.dropConstraint('moderation_cases', 'moderation_cases_source_check');
  pgm.addConstraint('moderation_cases', 'moderation_cases_source_check', {
    check: "source IN ('chat_report','anti_cheat','text_flag','image_flag','library_report','image_report')",
  });
  pgm.dropTable('user_reports');
};
