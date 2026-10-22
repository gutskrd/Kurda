import { describe, expect, it } from 'vitest';
import { conversationClips, conversationLineKey, isConversationLineKey } from './conversation.js';
import { lessonAudioKey } from './lesson-audio.js';

const conversation = {
  id: 'nasin01',
  title: 'Nasîn',
  speakers: [{ name: 'Rojda', character: 'xezo' }, { name: 'Azad' }],
  lines: [
    { speaker: 0, text: 'Silav!', en: 'Hello!' },
    { speaker: 1, text: 'Silav!', en: 'Hello!' },
    { speaker: 0, text: 'Tu çawa yî?' },
    { speaker: 0, text: 'silav' },
  ],
  prompt: 'Rojda çawa ye?',
  options: ['Baş', 'Nexweş'],
  correctIndex: 0,
};

describe('a conversation line’s recording', () => {
  it('is filed under the conversation and the part as well as the words', () => {
    const rojda = conversationLineKey('nasin01', 0, 'Silav!');
    expect(rojda).not.toBe(conversationLineKey('nasin01', 1, 'Silav!'));
    expect(rojda).not.toBe(conversationLineKey('nasin02', 0, 'Silav!'));
    // the words keyed as every recording's are: case and the closing mark change nothing
    expect(rojda).toBe(conversationLineKey('nasin01', 0, 'silav'));
  });

  it('can never be mistaken for a plain text’s recording, whatever the text', () => {
    const key = conversationLineKey('nasin01', 0, 'Silav!');
    expect(isConversationLineKey(key)).toBe(true);
    expect(isConversationLineKey(lessonAudioKey('Silav!'))).toBe(false);
    // a text that tries to spell a line's key out is keyed without the joiner
    expect(lessonAudioKey(key)).not.toBe(key);
    expect(isConversationLineKey(lessonAudioKey(key))).toBe(false);
  });

  it('is nothing for a line with nothing to say, or a conversation with no proper id', () => {
    expect(conversationLineKey('nasin01', 0, '?!')).toBe('');
    expect(conversationLineKey('No Id', 0, 'Silav')).toBe('');
    expect(conversationLineKey('nasin01', -1, 'Silav')).toBe('');
  });
});

describe('the lines to record', () => {
  it('are every line with who says it, a part’s repeated line once', () => {
    const clips = conversationClips(conversation);
    expect(clips.map((c) => [c.index, c.name, c.character, c.text])).toEqual([
      [0, 'Rojda', 'xezo', 'Silav!'],
      [1, 'Azad', null, 'Silav!'],
      [2, 'Rojda', 'xezo', 'Tu çawa yî?'],
    ]);
    expect(new Set(clips.map((c) => c.key)).size).toBe(3);
  });

  it('are none for stored content that is not a conversation', () => {
    expect(conversationClips(null)).toEqual([]);
    expect(conversationClips({ lines: conversation.lines })).toEqual([]);
    expect(conversationClips({ ...conversation, lines: [{ speaker: 5, text: 'Silav' }] })).toEqual([]);
  });
});
