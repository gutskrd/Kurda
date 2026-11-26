import { describe, expect, it } from 'vitest';
import { freshKeys } from './arrivals';

const same = (id: string): string => id;
const msg = (id: string, senderId: string, pending?: 'sending' | 'failed') => ({ id, senderId, pending });

describe('freshKeys', () => {
  it('finds the messages newer than everything seen, mine on their way and theirs', () => {
    const thread = [msg('local:2', 'me', 'sending'), msg('m4', 'her'), msg('m3', 'her'), msg('m2', 'me')];
    expect(freshKeys(thread, new Set(['m3', 'm2']), 'me', same)).toEqual(['local:2', 'm4']);
  });

  it('passes over my own message coming back confirmed under a new key', () => {
    expect(freshKeys([msg('m5', 'me'), msg('m4', 'her')], new Set(['m4']), 'me', same)).toEqual([]);
  });

  it('never counts older history loaded above as arriving', () => {
    const thread = [msg('m9', 'her'), msg('m1', 'her'), msg('m0', 'her')];
    expect(freshKeys(thread, new Set(['m9']), 'me', same)).toEqual([]);
  });

  it('reads keys through the thread’s own mapping', () => {
    expect(freshKeys([msg('srv-1', 'me')], new Set(['local:1']), 'me', (id) => (id === 'srv-1' ? 'local:1' : id))).toEqual([]);
  });
});
