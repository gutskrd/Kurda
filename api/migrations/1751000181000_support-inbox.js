/**
 * The support inbox: mail received at support@hevalo.app, and the answers sent
 * from the admin panel.
 *
 * Resend receives the mail and tells us with a webhook that carries who it is
 * from, who it is to and its subject; the body is read from Resend afterwards
 * (`body_fetched_at`), so a row can exist before its body does. `provider_id`
 * is Resend's id for the mail, unique so a webhook delivered twice is one row.
 * `message_id` is the mail's own Message-ID, which an answer names in
 * In-Reply-To so it threads in the sender's mail program.
 */

export const up = (pgm) => {
  pgm.createTable('support_emails', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    provider_id: { type: 'text', notNull: true, unique: true },
    from_address: { type: 'text', notNull: true },
    from_name: { type: 'text' },
    to_addresses: { type: 'text[]', notNull: true, default: '{}' },
    cc_addresses: { type: 'text[]', notNull: true, default: '{}' },
    subject: { type: 'text', notNull: true, default: '' },
    message_id: { type: 'text' },
    text_body: { type: 'text' },
    html_body: { type: 'text' },
    attachments: { type: 'jsonb', notNull: true, default: '[]' },
    body_fetched_at: { type: 'timestamptz' },
    received_at: { type: 'timestamptz', notNull: true },
    read_at: { type: 'timestamptz' },
    archived_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  // the inbox reads newest first, and the unread count reads only what is open
  pgm.createIndex('support_emails', [{ name: 'received_at', sort: 'DESC' }], {
    name: 'support_emails_open_idx',
    where: 'archived_at IS NULL',
  });

  pgm.createTable('support_email_replies', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    email_id: { type: 'uuid', notNull: true, references: 'support_emails', onDelete: 'CASCADE' },
    // kept when the admin's account goes: the answer was still sent
    admin_id: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    body: { type: 'text', notNull: true },
    provider_message_id: { type: 'text' },
    sent_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('support_email_replies', ['email_id', 'sent_at']);
};

export const down = (pgm) => {
  pgm.dropTable('support_email_replies');
  pgm.dropTable('support_emails');
};
