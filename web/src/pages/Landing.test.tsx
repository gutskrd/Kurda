import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderApp } from '../test/utils';
import { Landing } from './Landing';
import { forgetVisitor } from '../landing/visitor';

const show = () => renderApp(<Landing />);

afterEach(() => {
  forgetVisitor();
  vi.unstubAllGlobals();
});

describe('the front page', () => {
  it('says what Hevalo is in its heading, and offers every way in', () => {
    show();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Learn Kurdish with a friend.');
    const hero = screen.getByRole('heading', { level: 1 }).closest('section')!;
    expect(within(hero).getByRole('link', { name: 'Start learning, it’s free' })).toHaveAttribute('href', '/register');
    expect(within(hero).getByRole('button', { name: 'Download for iOS' })).toBeInTheDocument();
    expect(within(hero).getByRole('button', { name: 'Download for Android' })).toBeInTheDocument();
    expect(within(hero).getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
  });

  it('says only what is new and real, each pointing at the part of the page that shows it', () => {
    show();
    const pill = screen.getByRole('link', { name: /^New/ });
    expect(pill).toHaveTextContent('Letters by pigeon');
    expect(document.querySelector(pill.getAttribute('href')!)).not.toBeNull();
  });

  it('has Hevalo say hello, with what it means, when he is tapped', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Say hello to Hevalo' }));
    const said = screen.getByText('Silav!').closest('p')!;
    expect(said).toHaveTextContent('Hello!');
    expect(screen.getByText('Silav!')).toHaveAttribute('lang', 'ku');
  });

  it('claims no store availability it does not have', () => {
    const { container } = show();
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/download on the app store|get it on google play|available on ios|available now/i);
  });

  it('teaches three words on the spot, and counts the ones got right at the foot of the page', () => {
    show();
    const words = document.getElementById('first-words')!;
    expect(within(words).getByText('heval')).toHaveAttribute('lang', 'ku');
    fireEvent.click(within(words).getByRole('button', { name: 'friend' }));
    expect(within(words).getByText('Right!')).toBeInTheDocument();
    fireEvent.click(within(words).getByRole('button', { name: 'Next word' }));
    // A miss says what the word means, and is not counted.
    fireEvent.click(within(words).getByRole('button', { name: 'grandfather' }));
    expect(words.querySelector('.fp-quiz-say[aria-live]')).toHaveTextContent(/Not quite: it means “grandmother”/);
    fireEvent.click(within(words).getByRole('button', { name: 'Next word' }));
    fireEvent.click(within(words).getByRole('button', { name: 'Welcome!' }));
    fireEvent.click(within(words).getByRole('button', { name: 'See your words' }));
    expect(within(words).getByText(/Three Kurdish words/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'You already know 2 Kurdish words. Keep them.' })).toBeInTheDocument();
  });

  it('moves nothing when an answer is chosen: its words go into a place kept for them, as tall as the longest', () => {
    show();
    const words = document.getElementById('first-words')!;
    const after = words.querySelector('.fp-quiz-after')!;
    const teacher = words.querySelector('.fp-words-teacher');
    const shape = (): string[] => [...after.children].map((el) => `${el.tagName}.${el.className}`);
    const before = shape();
    // every word's longest answer lies there unseen from the start, so the place is already as tall as it gets
    expect(after.querySelectorAll('.fp-quiz-room[aria-hidden="true"]')).toHaveLength(3);
    fireEvent.click(within(words).getByRole('button', { name: 'home' }));
    expect(shape()).toEqual(before);
    expect(words.querySelector('.fp-words-teacher')).toBe(teacher);
    expect(words.querySelector('.fp-quiz-say[aria-live]')).toHaveTextContent(/Not quite/);
  });

  it('plays no sound for the first words, since none of them has a recording in the build', () => {
    show();
    const words = document.getElementById('first-words')!;
    expect(words.querySelector('audio')).toBeNull();
    expect(within(words).queryByRole('button', { name: /play|listen|hear/i })).toBeNull();
  });

  it('asks who the visitor is learning for, and speaks to that answer, kept in this browser alone', () => {
    show();
    expect(screen.getByText('Your answer stays in this browser.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'My children' }));
    expect(screen.getByRole('button', { name: 'My children' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { level: 2, name: /Hevalo teaches you to talk with your children\./ })).toBeInTheDocument();
    expect(screen.getByText('Next come the words your children will hear from you.')).toBeInTheDocument();
    expect(localStorage.getItem('hevalo_front_visitor')).toContain('children');
    // A second press takes the answer back.
    fireEvent.click(screen.getByRole('button', { name: 'My children' }));
    expect(screen.getByRole('heading', { level: 2, name: /talk to the people you love\./ })).toBeInTheDocument();
  });

  it('lets Hamo say each phrase of his table, with what it means', () => {
    show();
    const table = document.getElementById('family')!;
    fireEvent.click(within(table).getByRole('button', { name: 'Noşî can be!' }));
    expect(within(table).getByRole('button', { name: 'Noşî can be!' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(table).getByText('Enjoy your food!')).toBeInTheDocument();
  });

  it('plays three scenes under tabs, each one picture with nothing to press inside', async () => {
    show();
    const learn = document.getElementById('learn')!;
    const tabs = await within(learn).findAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['A game', 'A letter', 'Your road']);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    const scene = within(learn).getByRole('img', { name: /Rojîn invites you to a Peyvok battle/ });
    expect(scene.querySelector('a, button, input')).toBeNull();

    fireEvent.click(tabs[1]!);
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    expect(within(learn).getByRole('img', { name: /Dilan’s pigeon flies in through your window/ })).toBeInTheDocument();
    fireEvent.keyDown(tabs[1]!, { key: 'ArrowRight' });
    expect(tabs[2]).toHaveAttribute('aria-selected', 'true');
    expect(within(learn).getByRole('img', { name: /Hevalo walks the first chapter of the road/ })).toBeInTheDocument();
  });

  it('lets the scenes be paused and played again', async () => {
    show();
    const learn = document.getElementById('learn')!;
    const pause = await within(learn).findByRole('button', { name: 'Pause the scenes' });
    fireEvent.click(pause);
    expect(within(learn).getByRole('button', { name: 'Play the scenes' })).toBeInTheDocument();
  });

  it('shows the tree a lesson waters, named for its stage, with a way to each stage', async () => {
    show();
    const tree = document.getElementById('tree')!;
    const dots = await within(tree).findAllByRole('button');
    expect(dots).toHaveLength(7);
    expect(within(tree).getByRole('img', { name: /^A pomegranate tree: / })).toBeInTheDocument();
  });

  it('lets Hevalo lean in from the page’s edge to eat an apple after the tree, as on the road, out of the reading order', async () => {
    show();
    const tree = document.getElementById('tree')!;
    const place = tree.nextElementSibling!;
    expect(place).toHaveClass('fp-apple');
    await waitFor(() => expect(place.querySelector('.lp-scene-stage .speaking-character')).not.toBeNull());
    expect(place.querySelector('.fp-apple-edge')).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows the legends on their paintings, each described, and the way to read them', () => {
    show();
    const legends = document.getElementById('legends')!;
    const paintings = within(legends).getAllByRole('img');
    expect(paintings).toHaveLength(5);
    for (const p of paintings) expect(p).toHaveAccessibleName(/^The painting for /);
    expect(within(legends).getByRole('link', { name: 'Open the stories' })).toHaveAttribute('href', '/app/learn/stories');
  });

  it('runs the legends as an endless row of two sets, the second unseen by screen readers, and still under Reduce Motion', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }));
    show();
    let legends = document.getElementById('legends')!;
    const sets = legends.querySelectorAll('.fp-legend-row');
    expect(sets).toHaveLength(2);
    expect(sets[1]).toHaveAttribute('aria-hidden', 'true');
    for (const img of sets[1]!.querySelectorAll('img')) expect(img).toHaveAttribute('alt', '');
    expect(within(legends).getAllByRole('img')).toHaveLength(5);
    expect(legends.querySelector('.fp-legend-rail')).toHaveClass('is-endless');
    cleanup();
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)', media: query, addEventListener() {}, removeEventListener() {} }));
    show();
    legends = document.getElementById('legends')!;
    expect(legends.querySelectorAll('.fp-legend-row')).toHaveLength(1);
    expect(legends.querySelector('.fp-legend-rail')).not.toHaveClass('is-endless');
  });

  it('holds up each game’s stamp in turn, turns to the next on a tap, and leads to the games page', async () => {
    show();
    const learn = document.getElementById('learn')!;
    const stamp = await within(learn).findByRole('button', { name: 'Peyvok. Show the next game' });
    expect(within(learn).getByRole('link', { name: 'See all the games' })).toHaveAttribute('href', '/app/games');
    // Each stamp has the next game on its back, to come round as it turns.
    expect(learn.querySelectorAll('.fp-flip-face')).toHaveLength(2);
    // Where nothing can be animated, a tap moves straight on to the next game.
    fireEvent.click(stamp);
    expect(await within(learn).findByRole('button', { name: 'Peyvên Hevserwa. Show the next game' })).toBeInTheDocument();
    expect(learn.querySelector('.fp-flip-name')).toHaveTextContent('Peyvên HevserwaRhyming words');
    expect(within(learn).queryByRole('button', { name: 'Show the previous game' })).toBeNull();
  });

  it('holds one stamp still under Reduce Motion, with a way to the one before and the one after', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)', media: query, addEventListener() {}, removeEventListener() {} }));
    show();
    const learn = document.getElementById('learn')!;
    fireEvent.click(await within(learn).findByRole('button', { name: 'Show the previous game' }));
    expect(learn.querySelector('.fp-flip-name')).toHaveTextContent('Ez kî me?Who am I?');
    fireEvent.click(within(learn).getAllByRole('button', { name: /Show the next game$/ }).at(-1)!);
    expect(learn.querySelector('.fp-flip-name')).toHaveTextContent('Peyvok');
  });

  it('shows Hevalo on a phone, says the apps are still coming, and lets either download button say so', async () => {
    show();
    const phone = document.getElementById('phone')!;
    expect(within(phone).getByRole('heading', { level: 2, name: 'Hevalo, in your pocket.' })).toBeInTheDocument();
    expect(phone).toHaveTextContent('The phone apps are coming soon.');
    await waitFor(() => expect(phone.querySelector('.fp-phone-screen .speaking-character')).not.toBeNull());
    expect(phone.querySelector('.fp-phone-hold')).toHaveAttribute('aria-hidden', 'true');
    fireEvent.click(within(phone).getByRole('button', { name: 'Download for Android' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Hevalo for Android');
  });

  it('offers the two download buttons twice, in the hero and beside the phone, and nowhere else', () => {
    show();
    const hero = screen.getByRole('heading', { level: 1 }).closest('section')!;
    const phone = document.getElementById('phone')!;
    for (const name of ['Download for iOS', 'Download for Android']) {
      expect(screen.getAllByRole('button', { name })).toHaveLength(2);
      expect(within(hero).getByRole('button', { name })).toBeInTheDocument();
      expect(within(phone).getByRole('button', { name })).toBeInTheDocument();
    }
    expect(document.querySelectorAll('.fp-store')).toHaveLength(4);
  });

  it('ends with Hevalo, the way to start and the way back in', () => {
    show();
    const end = document.getElementById('join')!;
    expect(within(end).getByRole('heading', { level: 2, name: 'Your first Kurdish words are waiting.' })).toBeInTheDocument();
    expect(within(end).getByRole('link', { name: 'Start learning, it’s free' })).toHaveAttribute('href', '/register');
    expect(within(end).getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
    expect(within(end).queryByRole('button')).toBeNull();
  });
});

describe('the apps-coming-soon card', () => {
  it('rises from a download button, names the platform, and offers the web instead', () => {
    show();
    fireEvent.click(screen.getAllByRole('button', { name: 'Download for iOS' })[0]!);
    const card = screen.getByRole('dialog', { name: 'Coming very soon' });
    expect(card).toHaveAccessibleDescription(/The phone apps are on their way/);
    expect(within(card).getByText('Hevalo for iPhone and iPad')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Start on the web' })).toHaveAttribute('href', '/register');
    // It asks for nothing: no address to leave, no list to join; its only inputs choose which phone it talks about.
    expect(card.querySelector('input:not([type="radio"]), textarea, form')).toBeNull();
  });

  it('says Android when Android was tapped', () => {
    show();
    fireEvent.click(screen.getAllByRole('button', { name: 'Download for Android' })[0]!);
    expect(within(screen.getByRole('dialog')).getByText('Hevalo for Android')).toBeInTheDocument();
  });

  it('opens on the platform tapped, and a labelled switch turns it to the other', () => {
    show();
    fireEvent.click(screen.getAllByRole('button', { name: 'Download for iOS' })[0]!);
    const card = screen.getByRole('dialog');
    const which = within(card).getByRole('group', { name: 'Which phone' });
    expect(within(which).getByRole('radio', { name: 'iOS' })).toBeChecked();
    fireEvent.click(within(which).getByRole('radio', { name: 'Android' }));
    expect(within(which).getByRole('radio', { name: 'Android' })).toBeChecked();
    expect(within(card).getByText('Hevalo for Android')).toBeInTheDocument();
    expect(within(card).queryByText('Hevalo for iPhone and iPad')).toBeNull();
  });

  it('closes with Escape, the dim behind it or Close, and gives focus back to the button', () => {
    show();
    const button = screen.getAllByRole('button', { name: 'Download for iOS' })[0]!;
    fireEvent.click(button);
    expect(within(screen.getByRole('dialog')).getByRole('link', { name: 'Start on the web' })).toHaveFocus();
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(button).toHaveFocus();

    fireEvent.click(button);
    fireEvent.click(screen.getByRole('dialog').parentElement!);
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(button);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps Tab inside the card', () => {
    show();
    fireEvent.click(screen.getAllByRole('button', { name: 'Download for iOS' })[0]!);
    const close = within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' });
    close.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    // round to the top of the card: the switch for which phone
    expect(within(screen.getByRole('dialog')).getByRole('radio', { name: 'iOS' })).toHaveFocus();
  });
});
