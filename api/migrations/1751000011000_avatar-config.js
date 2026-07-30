/**
 * Avatar configuration (KUR-075). NULL means the default avatar; the
 * config is validated against the shared catalog + ownership on write.
 */

export const up = (pgm) => {
  pgm.addColumns('users', {
    avatar_config: { type: 'jsonb' },
  });
};

export const down = (pgm) => {
  pgm.dropColumns('users', ['avatar_config']);
};
