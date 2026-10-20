// Lip-sync: the mouth shapes, and the timeline a recording's mouth follows.
export * from './visemes.js';
// who says a recording, and the shapes the API sends it in
export * from './speakers.js';
// the stored timeline, and the shape at a moment of playback
export * from './timeline.js';
// Kurdish text as mouth shapes, in either script
export * from './letters.js';
// a recording's loudness: where the speech, its pauses and its syllables are
export * from './envelope.js';
// the two put together, and the text alone when there is no sound to analyse
export * from './align.js';
