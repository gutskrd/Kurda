/**
 * Icons Hevalo draws itself where the icon family has none for the job. Each is drawn the family's way, in a 256 box
 * with 16-wide lines and round ends, as filled outlines, so it sits among the others unnoticed in both apps.
 */
export const HEVALO_GLYPHS = {
  /** A parent with a child in front of them: parental controls. The parent's shoulder stops short of the child. */
  parental: [
    'M46.68,79.3a51.24,51.24 0 1,1 102.48,0a51.24,51.24 0 1,1 -102.48,0ZM62.68,79.3a35.24,35.24 0 1,0 70.48,0a35.24,35.24 0 1,0 -70.48,0Z',
    'M13.98,203.76A92.6,92.6 0 0,1 141.13,160.96A8,8 0 0,1 133.67,175.11A76.6,76.6 0 0,0 28.48,210.52A8,8 0 0,1 13.98,203.76Z',
    'M146.32,139.46a34.32,34.32 0 1,1 68.64,0a34.32,34.32 0 1,1 -68.64,0ZM162.32,139.46a18.32,18.32 0 1,0 36.64,0a18.32,18.32 0 1,0 -36.64,0Z',
    'M122.64,218.31A66.28,66.28 0 0,1 238.64,218.31A8,8 0 0,1 224.64,226.05A50.28,50.28 0 0,0 136.64,226.05A8,8 0 0,1 122.64,218.31Z',
  ],
} as const satisfies Record<string, readonly string[]>;

export type HevaloGlyph = keyof typeof HEVALO_GLYPHS;
