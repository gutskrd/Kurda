import { describe, expect, it } from 'vitest';
import { stackOptions } from './stackOptions';

describe('the options every stack shares', () => {
  it('slide a screen in, over the theme’s background, with no bar of the stack’s own', () => {
    expect(stackOptions(false, '#101010')).toMatchObject({ headerShown: false, animation: 'default', contentStyle: { backgroundColor: '#101010' } });
  });

  it('put a screen in place at once under Reduce Motion', () => {
    expect(stackOptions(true, '#fff').animation).toBe('none');
  });

  it('let the keyboard go with the screen it was typed in', () => {
    expect(stackOptions(false, '#fff').keyboardHandlingEnabled).toBe(true);
    expect(stackOptions(true, '#fff').keyboardHandlingEnabled).toBe(true);
  });
});
