import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import type { PracticeHub as Hub } from '@kurda/shared';
import { jsonResponse, renderApp } from '../test/utils';
import { PracticeHub } from './PracticeHub';

const hub: Hub = {
  due: 3,
  available: 10,
  mistakes: 2,
  listen: true,
  speak: true,
  words: false,
  skipSpeaking: false,
  units: [{ unitId: 'u2', title: 'Family', number: 2, tone: 'saffron' }],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  // jsdom has neither; a test that gives the browser one takes it away again.
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
  Object.defineProperty(navigator, 'permissions', { configurable: true, value: undefined });
});

function serve(answer: Hub = hub): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const path = new URL(url).pathname;
      if (path === '/practice/hub') return jsonResponse(200, answer);
      if (path === '/practice/due') return jsonResponse(200, { due: answer.due, available: answer.available });
      if (path === '/games/availability') return jsonResponse(200, { games: [] });
      return jsonResponse(404, { code: 'NOT_FOUND', message: 'not found' });
    }),
  );
}

/** A browser that can record, whose microphone answers as `answer` says. */
function microphone(answer: 'yes' | DOMException): { asked: () => number; stopped: () => number } {
  let asked = 0;
  let stopped = 0;
  vi.stubGlobal('MediaRecorder', class {});
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => {
        asked += 1;
        if (answer !== 'yes') throw answer;
        return { getTracks: () => [{ stop: () => (stopped += 1) }] };
      }),
    },
  });
  return { asked: () => asked, stopped: () => stopped };
}

function Where(): React.JSX.Element {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}

function show(): void {
  renderApp(
    <>
      <Routes>
        <Route path="/app/learn/practice" element={<PracticeHub />} />
        <Route path="/app/learn/review" element={<p>review</p>} />
      </Routes>
      <Where />
    </>,
    ['/app/learn/practice'],
  );
}

describe('the practice page', () => {
  it('lists every kind: the ready ones lead to their session, the empty ones say what would fill them', async () => {
    serve();
    show();
    const kinds = await screen.findByRole('region', { name: 'Ways to practise' });
    const mistakes = await within(kinds).findByRole('link', { name: /Mistakes/ });
    expect(mistakes).toHaveAttribute('href', '/app/learn/review?mode=mistakes');
    expect(mistakes).toHaveTextContent('2 to put right');
    expect(within(kinds).getByRole('link', { name: /Listen/ })).toHaveAttribute('href', '/app/learn/review?mode=listen');
    // Nothing to practise in words yet: listed, but not a way in.
    expect(within(kinds).queryByRole('link', { name: /Words/ })).toBeNull();
    expect(within(kinds).getByText('Finish a lesson to practise its words')).toBeInTheDocument();
    // Review heads the page, with what is due.
    expect(screen.getByRole('heading', { level: 2, name: 'Review' })).toBeInTheDocument();
  });

  it('reviews one finished chapter, picked from a sheet', async () => {
    serve();
    show();
    await userEvent.click(await screen.findByRole('button', { name: /Review a chapter/ }));
    const sheet = screen.getByRole('dialog', { name: 'Review a chapter' });
    expect(within(sheet).getByRole('link', { name: /Chapter 2.*Family/ })).toHaveAttribute('href', '/app/learn/review?mode=unit&unit=u2');
  });

  it('asks for the microphone only when speaking starts, then starts it', async () => {
    serve();
    const mic = microphone('yes');
    show();
    const speak = await screen.findByRole('button', { name: /Speak/ });
    expect(mic.asked()).toBe(0);
    await userEvent.click(speak);
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/app/learn/review?mode=speak'));
    expect(mic.asked()).toBe(1);
    // Let go at once: the exercise asks again, already allowed, when it records.
    expect(mic.stopped()).toBe(1);
  });

  it('says plainly when the microphone is refused, and keeps the other kinds a press away', async () => {
    serve();
    microphone(new DOMException('no', 'NotAllowedError'));
    show();
    await userEvent.click(await screen.findByRole('button', { name: /Speak/ }));
    const said = await screen.findByRole('alert');
    expect(said).toHaveTextContent('Speaking needs the microphone, and it is off for Hevalo.');
    expect(said).toHaveTextContent('Every other kind of practice here works without it.');
    expect(within(said).getByRole('button', { name: 'Try the microphone again' })).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/app/learn/practice');
    expect(screen.getByRole('link', { name: /Mistakes/ })).toBeInTheDocument();
  });

  it('says so before anything is pressed when the browser already refuses the microphone', async () => {
    serve();
    const mic = microphone('yes');
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: { query: async () => ({ state: 'denied', addEventListener: () => undefined, removeEventListener: () => undefined }) },
    });
    show();
    expect(await screen.findByRole('alert')).toHaveTextContent('Speaking needs the microphone');
    expect(screen.getByRole('button', { name: /Speak/ })).toHaveTextContent('The microphone is off for Hevalo');
    expect(mic.asked()).toBe(0);
  });

  it('points to another browser where this one cannot record, with nothing to try again', async () => {
    serve();
    show();
    await userEvent.click(await screen.findByRole('button', { name: /Speak/ }));
    const said = await screen.findByRole('alert');
    expect(said).toHaveTextContent('This browser cannot record sound.');
    expect(within(said).queryByRole('button')).toBeNull();
  });

  it('keeps speaking listed but closed when the learner turned it off', async () => {
    serve({ ...hub, skipSpeaking: true });
    show();
    expect(await screen.findByText('Speaking is turned off for your lessons')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Speak/ })).toBeNull();
  });
});
