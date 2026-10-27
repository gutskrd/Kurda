import { describe, expect, it } from 'vitest';
import { CONVERSATION_LIMITS, conversationClips, conversationLineKey, conversationLineVoice, conversationSpeaker, isConversationLineKey } from './conversation.js';
import { lessonAudioKey } from './lesson-audio.js';

const conversation = {
  id: 'nasin01',
  title: 'Nasîn',
  speakers: [conversationSpeaker('xezo'), conversationSpeaker('hamo')],
  lines: [
    { speaker: 0, text: 'Silav!', en: 'Hello!' },
    { speaker: 1, text: 'Silav!', en: 'Hello!' },
    { speaker: 0, text: 'Tu çawa yî?' },
    { speaker: 0, text: 'silav' },
  ],
  prompt: 'Xezo çawa ye?',
  options: ['Baş', 'Nexweş'],
  correctIndex: 0,
};

describe('a conversation line’s recording', () => {
  it('is filed under the conversation and the part as well as the words', () => {
    const xezo = conversationLineKey('nasin01', 0, 'Silav!');
    expect(xezo).not.toBe(conversationLineKey('nasin01', 1, 'Silav!'));
    expect(xezo).not.toBe(conversationLineKey('nasin02', 0, 'Silav!'));
    // the words keyed as every recording's are: case and the closing mark change nothing
    expect(xezo).toBe(conversationLineKey('nasin01', 0, 'silav'));
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
      [0, 'Xezo', 'xezo', 'Silav!'],
      [1, 'Hamo', 'hamo', 'Silav!'],
      [2, 'Xezo', 'xezo', 'Tu çawa yî?'],
    ]);
    expect(new Set(clips.map((c) => c.key)).size).toBe(3);
  });

  it('are none for stored content that is not a conversation', () => {
    expect(conversationClips(null)).toEqual([]);
    expect(conversationClips({ lines: conversation.lines })).toEqual([]);
    expect(conversationClips({ ...conversation, lines: [{ speaker: 5, text: 'Silav' }] })).toEqual([]);
  });
});

describe('who says a conversation', () => {
  it('is two or three of the characters, each called by its own name', () => {
    expect(conversationSpeaker('hamo')).toEqual({ name: 'Hamo', character: 'hamo' });
    expect(conversationSpeaker('hevalo')).toEqual({ name: 'Hevalo', character: 'hevalo' });
    expect(CONVERSATION_LIMITS.speakersMax).toBe(3);
  });

  it('names a part by its character whatever name was stored, and keeps an older part’s own name', () => {
    const stored = { ...conversation, speakers: [{ name: 'Rojda', character: 'xezo' }, { name: 'Azad' }] };
    expect(conversationClips(stored).map((c) => [c.name, c.character])).toEqual([
      ['Xezo', 'xezo'],
      ['Azad', null],
      ['Xezo', 'xezo'],
    ]);
  });

  it('shows each line said by its own part’s character, whoever the recording was saved for', () => {
    const lipsync = { v: 1 as const, fps: 30, frames: 'AAA' } as never;
    expect(conversationLineVoice(conversation.speakers, { speaker: 1 }, { speaker: 'hevalo', lipsync })).toEqual({ speaker: 'hamo', lipsync });
    expect(conversationLineVoice(conversation.speakers, { speaker: 0 }, null)).toEqual({ speaker: 'xezo' });
    expect(conversationLineVoice([{ character: null }], { speaker: 0 }, { speaker: 'hamo' })).toBeNull();
    expect(conversationLineVoice(conversation.speakers, { speaker: 7 }, { speaker: 'hamo' })).toBeNull();
  });
});
