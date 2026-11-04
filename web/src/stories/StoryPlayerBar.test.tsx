import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { StoryDetail } from '@kurda/shared';
import { renderApp } from '../test/utils';
import { soundPlayer } from '../lib/sound';
import { StoryPlayerBar, clockText } from './ReaderControls';
import { nextRate, useStoryAudio } from './useStoryAudio';
import { detail, fakeApi } from './testing';

/**
 * The one player the app has, as a fake that remembers what it was given:
 * every source loaded into it, every time it was told to play, and where it
 * stands in the clip — so a test can tell a sentence started over from one
 * carried on.
 */
const loads: string[] = [];
const plays: string[] = [];
class FakeAudio extends EventTarget {
  private source = '';
  playbackRate = 1;
  defaultPlaybackRate = 1;
  currentTime = 0;
  readyState = 4;
  ended = false;
  paused = true;
  get src(): string {
    return this.source;
  }
  set src(v: string) {
    this.source = v;
    this.currentTime = 0;
    this.ended = false;
    loads.push(v);
  }
  play(): Promise<void> {
    plays.push(this.source);
    this.paused = false;
    this.dispatchEvent(new Event('playing'));
    return Promise.resolve();
  }
  pause(): void {
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  }
}

/** The app makes its one element the first time anything plays and keeps it, so the tests read it from the module. */
const el = (): FakeAudio => soundPlayer() as unknown as FakeAudio;

beforeEach(() => {
  loads.length = 0;
  plays.length = 0;
  vi.stubGlobal('Audio', FakeAudio);
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const S1 = 'Îro Rojîn diçe dibistanê.';
const S2 = 'Ew deh salî ye.';
const S3 = 'Şîlan hevala wê ye.';
const URL1 = 'https://cdn.test/1.m4a';
const URL2 = 'https://cdn.test/2.m4a';

/** Two of three sentences recorded: the first two seconds long, the second three, on one five-second track. */
function narrated(): StoryDetail {
  return detail({
    paragraphs: [`${S1} ${S2}`, S3],
    audio: { k1: URL1, k2: URL2 },
    voices: { k1: { speaker: 'hamo' } },
    narration: {
      sentences: [
        { paragraph: 0, sentence: 0, key: 'k1', url: URL1, durationMs: 2000, startMs: 0 },
        { paragraph: 0, sentence: 1, key: 'k2', url: URL2, durationMs: 3000, startMs: 2000 },
      ],
      totalMs: 5000,
      complete: false,
    },
  });
}

function Harness({ story }: { story: StoryDetail }): React.JSX.Element {
  const audio = useStoryAudio(story.paragraphs, story.audio, story.voices, false, story.narration);
  return (
    <>
      <StoryPlayerBar audio={audio} docked />
      <output data-testid="current">{audio.current ? `${audio.current.paragraph}:${audio.current.sentence}` : '-'}</output>
    </>
  );
}

const bar = (story = narrated()) => {
  fakeApi({}, { signedIn: false });
  renderApp(<Harness story={story} />);
  return screen.getByRole('group', { name: 'Listen to the story' });
};

describe('the story player', () => {
  it('plays the sentences in order and shows where it is on the stitched track', async () => {
    const group = bar();
    expect(within(group).getByText('0:00 / 0:05')).toBeInTheDocument();
    await userEvent.click(within(group).getByRole('button', { name: 'Play' }));
    expect(loads).toEqual([URL1]);
    expect(screen.getByTestId('current')).toHaveTextContent('0:0');
    // the clip's own clock moves the line and the numbers
    act(() => {
      el().currentTime = 1.5;
      el().dispatchEvent(new Event('timeupdate'));
    });
    expect(within(group).getByText('0:02 / 0:05')).toBeInTheDocument();
    // the first sentence ends: the second starts at its place on the track
    act(() => el().dispatchEvent(new Event('ended')));
    expect(loads).toEqual([URL1, URL2]);
    expect(screen.getByTestId('current')).toHaveTextContent('0:1');
    const seek = within(group).getByRole('slider', { name: 'Where you are in the story' });
    expect(seek).toHaveValue('2000');
  });

  it('seeks into the sentence that plays at that point, starting it part-way through', async () => {
    const group = bar();
    const seek = within(group).getByRole('slider', { name: 'Where you are in the story' });
    fireEvent.change(seek, { target: { value: '2500' } });
    expect(loads).toEqual([URL2]);
    expect(el().currentTime).toBeCloseTo(0.5);
    expect(screen.getByTestId('current')).toHaveTextContent('0:1');
    expect(seek).toHaveAttribute('aria-valuetext', '0:03 of 0:05');
  });

  it('moves the reading once when a drag lets go, not on every step of it', () => {
    const group = bar();
    const seek = within(group).getByRole('slider', { name: 'Where you are in the story' });
    fireEvent.pointerDown(seek);
    fireEvent.change(seek, { target: { value: '500' } });
    fireEvent.change(seek, { target: { value: '1000' } });
    fireEvent.change(seek, { target: { value: '4000' } });
    expect(loads).toEqual([]);
    fireEvent.pointerUp(seek);
    expect(loads).toEqual([URL2]);
    expect(el().currentTime).toBeCloseTo(2);
  });

  it('carries on inside the sentence after a pause, rather than starting it over', async () => {
    const group = bar();
    await userEvent.click(within(group).getByRole('button', { name: 'Play' }));
    act(() => {
      el().currentTime = 1.2;
    });
    await userEvent.click(within(group).getByRole('button', { name: 'Pause' }));
    expect(el().paused).toBe(true);
    await userEvent.click(within(group).getByRole('button', { name: 'Play' }));
    // one load, two plays: the clip was not reloaded, so it keeps its place
    expect(loads).toEqual([URL1]);
    expect(plays).toEqual([URL1, URL1]);
    expect(el().currentTime).toBeCloseTo(1.2);
  });

  it('cycles the speed 1× → 1.25× → 0.75× → 1×, and the player follows', async () => {
    const group = bar();
    await userEvent.click(within(group).getByRole('button', { name: 'Play' }));
    const chip = within(group).getByRole('button', { name: 'Speed: 1×' });
    await userEvent.click(chip);
    expect(within(group).getByRole('button', { name: 'Speed: 1.25×' })).toHaveTextContent('1.25×');
    expect(el().playbackRate).toBe(1.25);
    await userEvent.click(within(group).getByRole('button', { name: 'Speed: 1.25×' }));
    expect(el().playbackRate).toBe(0.75);
    await userEvent.click(within(group).getByRole('button', { name: 'Speed: 0.75×' }));
    expect(el().playbackRate).toBe(1);
    expect(nextRate(1)).toBe(1.25);
    expect(nextRate(0.75)).toBe(1);
  });

  it('says how much of a partly recorded story is there, and names the narrator', () => {
    const group = bar();
    expect(within(group).getByText('2 of 3 sentences recorded')).toBeInTheDocument();
    expect(within(group).getByText('Hamo')).toBeInTheDocument();
  });

  it('shows a spinner while the network holds a sentence up, and a line when one will not play', async () => {
    const group = bar();
    await userEvent.click(within(group).getByRole('button', { name: 'Play' }));
    act(() => el().dispatchEvent(new Event('waiting')));
    expect(within(group).getByRole('button', { name: 'Pause' })).toHaveAttribute('aria-busy', 'true');
    act(() => el().dispatchEvent(new Event('playing')));
    expect(within(group).getByRole('button', { name: 'Pause' })).not.toHaveAttribute('aria-busy');
    act(() => el().dispatchEvent(new Event('error')));
    expect(within(group).getByRole('alert')).toHaveTextContent('This sentence didn’t play.');
    // the bar is back to Play, and pressing it tries the sentence again
    await userEvent.click(within(group).getByRole('button', { name: 'Play' }));
    expect(within(group).queryByRole('alert')).toBeNull();
  });

  it('plays what there is without a seek line when the server sent no timings', () => {
    const story = narrated();
    const group = bar({ ...story, narration: null });
    expect(within(group).queryByRole('slider')).toBeNull();
    expect(within(group).getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('writes a point on the track as minutes and seconds', () => {
    expect(clockText(0)).toBe('0:00');
    expect(clockText(65_400)).toBe('1:05');
    expect(clockText(600_000)).toBe('10:00');
  });
});
