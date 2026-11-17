/**
 * The animal fables are Çîrokên ajalan in Kurmancî.
 *
 * The library migration (1751000211000) seeded the fable category's Kurmancî
 * name as Çîrokên heywanan. Heywan is the Arabic loan; the legends, the
 * riddles and the games all write ajal, and the apps' own catalogues now name
 * the category Çîrokên ajalan. An app names a category it knows from its
 * catalogue, but the list the server answers is what the admin console, an
 * older app and a category's other readers fall back on, so it says the same.
 *
 * A name an editor has changed by hand is left as it is: `up` touches the
 * fable row only while its Kurmancî name is still the old one, and `down` only
 * while it is the new one. The English and Soranî names do not change.
 */

export const FROM = 'Çîrokên heywanan';
export const TO = 'Çîrokên ajalan';

/** The fable category's Kurmancî name set to `to`, on the row only while it still reads `from`. */
const rename = (from, to) =>
  `UPDATE story_categories SET name = jsonb_set(name, '{ku}', to_jsonb('${to}'::text)) WHERE slug = 'fable' AND name->>'ku' = '${from}'`;

export const up = (pgm) => {
  pgm.sql(rename(FROM, TO));
};

export const down = (pgm) => {
  pgm.sql(rename(TO, FROM));
};
