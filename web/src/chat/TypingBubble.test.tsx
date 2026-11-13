import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TypingBubble } from './TypingBubble';

describe('TypingBubble', () => {
  it('draws nothing while nobody is writing', () => {
    const { container } = render(<TypingBubble names={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('is a bubble on their side with three dots, and says who is writing to a screen reader', () => {
    const { container } = render(<TypingBubble names={['zana']} avatarUrl="https://img/z.png" />);
    expect(container.querySelector('.chat-run.is-typing')).not.toBeNull();
    expect(container.querySelectorAll('.chat-typing-dots i')).toHaveLength(3);
    // the dots are for the eye only; the words are announced, politely, and not printed
    expect(container.querySelector('.chat-typing-bubble')?.getAttribute('aria-hidden')).toBe('true');
    const said = screen.getByText('zana is typing…');
    expect(said.getAttribute('aria-live')).toBe('polite');
    expect(said.className).toContain('sr-only');
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://img/z.png');
  });

  it('prints who is writing in a group, where the bubble alone does not say', () => {
    render(<TypingBubble names={['zana', 'dilan']} named />);
    expect(screen.getByText('zana and dilan are typing…').className).not.toContain('sr-only');
  });
});
