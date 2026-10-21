import { describe, expect, it } from 'vitest';
import { initPlayer, reduce } from '../lesson-player.js';
import { SPEAKERS, isSpeakerId, type RecordingVoice } from './speakers.js';

describe('speakers', () => {
  it('are the three characters, by the names the database checks', () => {
    expect(SPEAKERS).toEqual(['hevalo', 'hamo', 'xezo']);
    for (const speaker of SPEAKERS) expect(isSpeakerId(speaker)).toBe(true);
    for (const other of ['', 'Hamo', 'none', null, undefined, 1]) expect(isSpeakerId(other)).toBe(false);
  });

  it('who says the model reaches the feedback the player shows, and only when there is one', () => {
    const voice: RecordingVoice = { speaker: 'xezo', lipsync: { v: 1, d: 600, k: [[0, 0], [80, 5], [450, 0]] } };
    const session = { sessionId: 's', exercises: [{ id: 'a', type: 'speaking' as const }, { id: 'b', type: 'translate' as const }] };
    const said = reduce(initPlayer(session), {
      type: 'ANSWERED',
      result: { verdict: 'correct', accepted: true, modelAudioUrl: 'https://cdn.test/a.wav', modelAudioVoice: voice },
    });
    expect(said.feedback).toMatchObject({ modelAudioUrl: 'https://cdn.test/a.wav', modelAudioVoice: voice });
    const plain = reduce(initPlayer(session), {
      type: 'ANSWERED',
      result: { verdict: 'correct', accepted: true, modelAudioUrl: 'https://cdn.test/a.wav' },
    });
    expect(plain.feedback).not.toHaveProperty('modelAudioVoice');
  });
});
