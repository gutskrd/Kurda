import { describe, it, expect, afterEach } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../test/utils';
import { soundPlayer, stop } from '../lib/sound';
import { VoicePlayer } from './VoicePlayer';

const SRC = 'https://media.example.test/voice/v1.m4a';

/** Gives the hidden header reader a length, as a browser does once the file's header has arrived. */
function headerSays(seconds: number): void {
  const reader = document.querySelector<HTMLAudioElement>('.voice audio')!;
  Object.defineProperty(reader, 'duration', { value: seconds, configurable: true });
  fireEvent.loadedMetadata(reader);
}

/** What the app's one player would report while this note sounds. */
function sounding(event: string): void {
  act(() => {
    soundPlayer()!.dispatchEvent(new Event(event));
  });
}

afterEach(() => stop());

describe('VoicePlayer', () => {
  it('is a named group with a play button, and plays the note through the app’s one player', async () => {
    renderApp(<VoicePlayer src={SRC} label="Voice comment" />);
    const group = screen.getByRole('group', { name: 'Voice comment' });
    expect(group).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(soundPlayer()!.src).toBe(SRC);
    sounding('playing');
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    sounding('pause');
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('offers a seek line once the length is known, and says where it is in words', () => {
    renderApp(<VoicePlayer src={SRC} label="Voice comment" />);
    expect(screen.queryByRole('slider')).toBeNull();
    headerSays(12.4);
    const line = screen.getByRole('slider', { name: 'Where you are in the recording' });
    expect(line).toHaveAttribute('aria-valuetext', '0:00 of 0:12');
    fireEvent.change(line, { target: { value: '5000' } });
    expect(line).toHaveAttribute('aria-valuetext', '0:05 of 0:12');
  });

  it('plays without a seek line when the file gives no length', () => {
    renderApp(<VoicePlayer src={SRC} label="Voice comment" />);
    headerSays(Infinity);
    expect(screen.queryByRole('slider')).toBeNull();
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('says so when the note will not play', async () => {
    renderApp(<VoicePlayer src={SRC} label="Voice comment" />);
    await userEvent.click(screen.getByRole('button', { name: 'Play' }));
    sounding('error');
    expect(screen.getByRole('alert')).toHaveTextContent('This recording didn’t play. Try again in a moment.');
  });
});
