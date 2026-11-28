/** The clove apple gift (1751000892000) goes by its proper name, Sêva Mêxekrêj; a name an admin has changed is kept. */

export const up = (pgm) => {
  pgm.sql(`UPDATE shop_items SET name = 'Sêva Mêxekrêj' WHERE sku = 'gift-sev-mexek' AND name = 'Sêva mêxekî'`);
};

export const down = (pgm) => {
  pgm.sql(`UPDATE shop_items SET name = 'Sêva mêxekî' WHERE sku = 'gift-sev-mexek' AND name = 'Sêva Mêxekrêj'`);
};
