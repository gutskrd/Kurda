/**
 * A superadmin can now give someone the content editor role from their page,
 * and take it away (PUT /admin/users/:id/content-editor): how a person joins
 * the team that writes and records lessons. Each change goes into the person's
 * history in admin_actions, so the two actions join its list.
 */

const BEFORE = [
  'warn',
  'mute',
  'temp_ban',
  'perm_ban',
  'unban',
  'wallet_adjust',
  'auto_mute',
  'auto_suspend',
  'item_grant',
  'item_revoke',
  'content_removal',
  'post_mute',
  'feature_limit',
  'unmute',
  'lift_chat_mute',
  'revoke_sanction',
  'approve_ban',
  'reject_ban',
  'case_decision',
  'case_reopen',
  'case_escalate',
  'csam',
  'caring_message',
  'appeal_decision',
  'session_revoke',
];
const AFTER = [...BEFORE, 'role_grant', 'role_revoke'];
const check = (actions) => `action IN (${actions.map((a) => `'${a}'`).join(', ')})`;

export const up = (pgm) => {
  pgm.dropConstraint('admin_actions', 'admin_actions_action_check');
  pgm.addConstraint('admin_actions', 'admin_actions_action_check', { check: check(AFTER) });
};

export const down = (pgm) => {
  pgm.dropConstraint('admin_actions', 'admin_actions_action_check');
  // the history is append-only: rows already written stay, and only new ones are held to the old list
  pgm.sql(`ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_action_check CHECK (${check(BEFORE)}) NOT VALID`);
};
