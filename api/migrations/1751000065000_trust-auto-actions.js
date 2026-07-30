/**
 * Trust auto-moderation actions (KUR-295). The spam engine can auto-mute or
 * auto-suspend an account with no acting admin (admin_id stays NULL). Extend the
 * admin_actions action whitelist to record these system decisions so they show
 * in the user's moderation history and remain reversible + audited (#104).
 */

const ACTIONS_OLD = "action IN ('warn', 'mute', 'temp_ban', 'perm_ban', 'unban', 'wallet_adjust')";
const ACTIONS_NEW =
  "action IN ('warn', 'mute', 'temp_ban', 'perm_ban', 'unban', 'wallet_adjust', 'auto_mute', 'auto_suspend')";

export const up = (pgm) => {
  pgm.dropConstraint('admin_actions', 'admin_actions_action_check');
  pgm.addConstraint('admin_actions', 'admin_actions_action_check', { check: ACTIONS_NEW });
};

export const down = (pgm) => {
  pgm.dropConstraint('admin_actions', 'admin_actions_action_check');
  pgm.addConstraint('admin_actions', 'admin_actions_action_check', { check: ACTIONS_OLD });
};
