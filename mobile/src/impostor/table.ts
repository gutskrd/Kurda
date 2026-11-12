/**
 * The colours of Kurdish Impostor's own table: night blue with gold on it,
 * the colours of the masked card in the game's emblem, and the paper a card
 * is printed on.
 *
 * They are the same in the light theme and the dark, because the table is a
 * place rather than a surface of the app: the night stays night, a card's
 * face stays paper. Everything round the table (the setup's panels, the
 * score) wears the theme's own colours as usual. The website's table has the
 * same ones (web/src/impostor/start.css).
 */
export const TABLE = {
  /** the table's cloth, from the lamp over it down to its far edge */
  nightLight: '#46378a',
  night: '#2a2150',
  nightDeep: '#171231',
  /** writing on the cloth, and its quieter kind */
  ink: '#f4efff',
  inkSoft: 'rgba(244, 239, 255, 0.72)',
  /** a quiet shape on the cloth: a chip, a button that is not the one to press */
  veil: 'rgba(255, 255, 255, 0.12)',
  /** the one thing to press, the edge it stands on, and what is written on it */
  gold: '#f2b632',
  goldEdge: '#a8791a',
  goldInk: '#2a1d05',
  goldSoft: '#f2c95a',
  /** a card's face, and the ink on it */
  paper: '#fbf5e9',
  paperInk: '#2c2137',
  paperSoft: '#6c5f79',
  /** a clock running out, on the cloth */
  low: '#ff9c90',
} as const;

/** The cloth as a gradient's stops, top to bottom. */
export const TABLE_CLOTH = [TABLE.nightLight, TABLE.night, TABLE.nightDeep] as const;
