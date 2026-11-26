/**
 * Approvals take two more kinds of change: an earn rule that would pay more ('earn_rule'), and Hevalo+ an admin gives
 * their own account ('plus_grant'). Each waits for a second admin, as a dear price or a rewarding event does.
 */

export const up = (pgm) => {
  pgm.dropConstraint('admin_config_changes', 'admin_config_changes_target_check');
  pgm.addConstraint('admin_config_changes', 'admin_config_changes_target_check', { check: "target IN ('shop_item', 'event', 'earn_rule', 'plus_grant')" });
};

/** The record of changes of the two kinds stays; the old rule holds only for what is written from then on. */
export const down = (pgm) => {
  pgm.dropConstraint('admin_config_changes', 'admin_config_changes_target_check');
  pgm.sql(`ALTER TABLE admin_config_changes ADD CONSTRAINT admin_config_changes_target_check CHECK (target IN ('shop_item', 'event')) NOT VALID`);
};
