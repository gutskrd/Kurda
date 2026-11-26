import { afterEach, describe, expect, it } from 'vitest';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { renderApp } from '../test/utils';
import { Landing } from './Landing';
import { forgetVisitor } from '../landing/visitor';

const show = () => renderApp(<Landing />);

afterEach(() => {
  forgetVisitor();
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
    expect(within(words).getByText(/Not quite: it means “grandmother”/)).toBeInTheDocument();
    fireEvent.click(within(words).getByRole('button', { name: 'Next word' }));
    fireEvent.click(within(words).getByRole('button', { name: 'Welcome!' }));
    fireEvent.click(within(words).getByRole('button', { name: 'See your words' }));
    expect(within(words).getByText(/Three Kurdish words/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'You already know 2 Kurdish words. Keep them.' })).toBeInTheDocument();
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

  it('shows the legends on their paintings, each described, and the way to read them', () => {
    show();
    const legends = document.getElementById('legends')!;
    const paintings = within(legends).getAllByRole('img');
    expect(paintings).toHaveLength(5);
    for (const p of paintings) expect(p).toHaveAccessibleName(/^The painting for /);
    expect(within(legends).getByRole('link', { name: 'Open the stories' })).toHaveAttribute('href', '/app/learn/stories');
  });

  it('ends as it starts: Hevalo and the same ways in', () => {
    show();
    const end = document.getElementById('join')!;
    expect(within(end).getByRole('heading', { level: 2, name: 'Your first Kurdish words are waiting.' })).toBeInTheDocument();
    expect(within(end).getByRole('link', { name: 'Start learning, it’s free' })).toHaveAttribute('href', '/register');
    expect(within(end).getByRole('button', { name: 'Download for Android' })).toBeInTheDocument();
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
    // It asks for nothing: no address to leave, no list to join.
    expect(card.querySelector('input, form')).toBeNull();
  });

  it('says Android when Android was tapped', () => {
    show();
    fireEvent.click(screen.getAllByRole('button', { name: 'Download for Android' })[0]!);
    expect(within(screen.getByRole('dialog')).getByText('Hevalo for Android')).toBeInTheDocument();
  });

  it('closes with Escape, the dim behind it or Close, and gives focus back to the button', () => {
    show();
    const button = screen.getAllByRole('button', { name: 'Download for iOS' })[0]!;
    fireEvent.click(button);
    expect(screen.getByRole('link', { name: 'Start on the web' })).toHaveFocus();
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
    expect(screen.getByRole('link', { name: 'Start on the web' })).toHaveFocus();
  });
});
