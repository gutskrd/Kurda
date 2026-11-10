/**
 * What a Hevalo+ member is given needs three small changes to what the
 * database allows.
 *
 * - A member may hold two streak freezes, so the bound on user_streaks.freezes
 *   goes from 1 to 2. Who may hold the second is the server's rule
 *   (streaks/streak-logic.ts `maxFreezesFor`); the database only stops a
 *   number no rule allows.
 * - Two freezes can keep two days running, and the week row should show both
 *   as kept. freeze_used_days counts the days in a row, ending on
 *   freeze_used_on, that freezes kept; 1 for every row there is, which is what
 *   one freeze could ever do.
 * - Membership can be given or extended from a person's page in the admin
 *   (POST /admin/users/:id/plus), so that testers and reviewers can have it
 *   before it can be bought. Each grant goes into the person's history in
 *   admin_actions, so `plus_grant` joins its list of actions.
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
  'role_grant',
  'role_revoke',
];
const AFTER = [...BEFORE, 'plus_grant'];
const check = (actions) => `action IN (${actions.map((a) => `'${a}'`).join(', ')})`;

export const up = (pgm) => {
  pgm.dropConstraint('user_streaks', 'user_streaks_freezes_check');
  pgm.addConstraint('user_streaks', 'user_streaks_freezes_check', { check: 'freezes BETWEEN 0 AND 2' });
  pgm.addColumns('user_streaks', {
    freeze_used_days: { type: 'smallint', notNull: true, default: 1, check: 'freeze_used_days >= 1' },
  });

  pgm.dropConstraint('admin_actions', 'admin_actions_action_check');
  pgm.addConstraint('admin_actions', 'admin_actions_action_check', { check: check(AFTER) });
};

export const down = (pgm) => {
  pgm.dropConstraint('admin_actions', 'admin_actions_action_check');
  // the history is append-only: rows already written stay, and only new ones are held to the old list
  pgm.sql(`ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_action_check CHECK (${check(BEFORE)}) NOT VALID`);

  pgm.dropColumns('user_streaks', ['freeze_used_days']);
  pgm.dropConstraint('user_streaks', 'user_streaks_freezes_check');
  // a second freeze held is given up with the room for it
  pgm.sql(`UPDATE user_streaks SET freezes = 1 WHERE freezes > 1`);
  pgm.addConstraint('user_streaks', 'user_streaks_freezes_check', { check: 'freezes BETWEEN 0 AND 1' });
};
