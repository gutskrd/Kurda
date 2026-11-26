/**
 * Approvals take a bundle's price of 500 Zêr or more ('shop_bundle'), as a shop item's. The kinds the approvals for
 * earning and an admin's own Hevalo+ add (1751000886000) stay in the list, so the two migrations agree whichever runs
 * against a database first.
 */

const WITH = "('shop_item', 'event', 'earn_rule', 'plus_grant', 'shop_bundle')";
const WITHOUT = "('shop_item', 'event', 'earn_rule', 'plus_grant')";

export const up = (pgm) => {
  pgm.dropConstraint('admin_config_changes', 'admin_config_changes_target_check');
  pgm.sql(`ALTER TABLE admin_config_changes ADD CONSTRAINT admin_config_changes_target_check CHECK (target IN ${WITH})`);
};

/** The record of bundle changes stays; the narrower rule holds only for what is written from then on. */
export const down = (pgm) => {
  pgm.dropConstraint('admin_config_changes', 'admin_config_changes_target_check');
  pgm.sql(`ALTER TABLE admin_config_changes ADD CONSTRAINT admin_config_changes_target_check CHECK (target IN ${WITHOUT}) NOT VALID`);
};
