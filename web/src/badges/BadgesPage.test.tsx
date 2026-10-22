import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BADGES, badgeTierKey, resolveThresholds, type BadgeView, type BadgesResponse } from '@kurda/shared';
import { renderApp, jsonResponse } from '../test/utils';
import { en } from '../i18n/en';
import { BadgesPage } from './BadgesPage';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

/** Every badge in the catalogue, with these ones earned or under way. */
function response(progress: Record<string, { tier: number; progress: number }>, over: Partial<BadgesResponse> = {}): BadgesResponse {
  const badges: BadgeView[] = BADGES.map((def) => {
    const p = progress[def.key] ?? { tier: 0, progress: 0 };
    const thresholds = resolveThresholds(def, def.tiers.includes('all') ? 30 : undefined);
    const found = p.tier > 0;
    return {
      key: def.key,
      family: def.family,
      tier: p.tier,
      tierCount: def.tiers.length,
      tierKey: badgeTierKey(def, p.tier),
      progress: p.progress,
      thresholds,
      next: p.tier < thresholds.length ? thresholds[p.tier]! : null,
      unit: def.unit,
      earnedAt: found ? '2026-08-01T00:00:00.000Z' : null,
      tierEarnedAt: Array.from({ length: p.tier }, () => '2026-08-01T00:00:00.000Z'),
      secret: def.secret,
      hidden: def.secret && !found,
      hintKey: def.secret && !found ? (def.hintKey ?? null) : null,
      rarity: null,
    };
  });
  return {
    badges,
    showcase: [],
    secretsFound: 1,
    secretsTotal: BADGES.filter((b) => b.secret).length,
    legacy: [],
    monthlyChallenge: { month: '2026-10', days: 3, goal: 8 },
    ...over,
  };
}

const answer = (body: unknown) => vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse(200, body));

describe('BadgesPage', () => {
  it('lays the badges out by family, with progress in words', async () => {
    vi.stubGlobal('fetch', answer(response({ agir: { tier: 1, progress: 12 }, ders: { tier: 0, progress: 4 }, 'tire-rast': { tier: 1, progress: 1 } })));
    renderApp(<BadgesPage />);

    for (const family of ['learning', 'habit', 'games', 'ranked', 'friends', 'events', 'secret'] as const) {
      expect(await screen.findByRole('heading', { name: new RegExp(en[`badges.family.${family}`]) })).toBeInTheDocument();
    }
    const learning = screen.getByRole('heading', { name: new RegExp(en['badges.family.learning']) }).closest('section')!;
    const habit = screen.getByRole('heading', { name: new RegExp(en['badges.family.habit']) }).closest('section')!;
    expect(within(habit).getByText('12 / 30 days')).toBeInTheDocument();
    expect(within(learning).getByText('4 / 10 lessons')).toBeInTheDocument();
    expect(screen.getByText('3 of 8 learning days')).toBeInTheDocument();
    // a medal not earned yet is said to be so, never hidden
    expect(within(learning).getByRole('img', { name: 'Ders (Lessons), not earned yet' })).toBeInTheDocument();
    expect(within(habit).getByRole('img', { name: 'Agir (Fire), Sifir' })).toBeInTheDocument();
  });

  it('keeps an unfound secret a secret, with its hint once one has been found', async () => {
    vi.stubGlobal('fetch', answer(response({ 'tire-rast': { tier: 1, progress: 1 } })));
    renderApp(<BadgesPage />);

    const secrets = (await screen.findByRole('heading', { name: new RegExp(en['badges.family.secret']) })).closest('section')!;
    // every secret in the catalogue but the one found
    expect(within(secrets).getAllByText('???')).toHaveLength(BADGES.filter((b) => b.secret).length - 1);
    expect(within(secrets).getByText('Tîrê rast')).toBeInTheDocument();

    await userEvent.click(within(secrets).getAllByRole('button')[1]!);
    const dialog = await screen.findByRole('dialog', { name: '???' });
    expect(dialog).toHaveTextContent(/^.*Hint: /);
  });

  it('opens a badge to show every tier and what it needs', async () => {
    vi.stubGlobal('fetch', answer(response({ agir: { tier: 2, progress: 41 } })));
    renderApp(<BadgesPage />);
    await userEvent.click((await screen.findAllByRole('button', { name: /^Agir \(Fire\)/ }))[0]!);

    const dialog = await screen.findByRole('dialog', { name: 'Agir' });
    expect(within(dialog).getByText(en['badges.agir.desc'])).toBeInTheDocument();
    for (const tier of ['Sifir', 'Zîv', 'Zêr', 'Firûze']) expect(within(dialog).getByText(tier)).toBeInTheDocument();
    expect(within(dialog).getByText('100 days')).toBeInTheDocument();
    expect(within(dialog).getByText('41 / 100 days')).toBeInTheDocument();
  });

  it('puts the badges nearest their next tier first, and past halfway says what is left', async () => {
    vi.stubGlobal('fetch', answer(response({ ders: { tier: 0, progress: 9 }, agir: { tier: 1, progress: 12 }, roj: { tier: 1, progress: 100 }, heval: { tier: 0, progress: 0 } })));
    renderApp(<BadgesPage />);

    const nearest = (await screen.findByRole('heading', { name: en['badges.nearest'] })).closest('section')!;
    const names = within(nearest)
      .getAllByRole('button')
      .map((b) => b.querySelector('.badge-tile-name')?.textContent);
    // nine of ten lessons first, then most of the way to Roj's silver, then Agir; nothing untouched
    expect(names).toEqual(['Ders', 'Roj', 'Agir']);
    expect(within(nearest).getByText('1 lesson to go')).toBeInTheDocument();
    expect(within(nearest).getByText('20 days to go')).toBeInTheDocument();
    expect(within(nearest).getByText('12 / 30 days')).toBeInTheDocument();
  });

  it('says one season, not one seasons', async () => {
    vi.stubGlobal('fetch', answer(response({})));
    renderApp(<BadgesPage />);
    await userEvent.click(await screen.findByRole('button', { name: /^Deşt \(Plain\)/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Deşt' });
    expect(within(dialog).getByText('1 season')).toBeInTheDocument();
    expect(within(dialog).getByText('3 seasons')).toBeInTheDocument();
    expect(within(dialog).getByText('0 / 1 season')).toBeInTheDocument();
  });

  it('shows rarity only when the server sends it', async () => {
    const body = response({ agir: { tier: 1, progress: 9 } });
    body.badges.find((b) => b.key === 'agir')!.rarity = [38.4, 9, 2, 0.4];
    vi.stubGlobal('fetch', answer(body));
    renderApp(<BadgesPage />);
    await userEvent.click((await screen.findAllByRole('button', { name: /^Agir \(Fire\)/ }))[0]!);
    const dialog = await screen.findByRole('dialog', { name: 'Agir' });
    expect(within(dialog).getAllByText('38% of learners have this').length).toBeGreaterThan(0);
    expect(within(dialog).getByText('<1% of learners have this')).toBeInTheDocument();
  });

  it('lets three earned badges be chosen for the profile, and no fourth', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) =>
      init?.method === 'PUT'
        ? jsonResponse(200, { showcase: JSON.parse(String(init.body)).keys })
        : jsonResponse(200, response({ agir: { tier: 1, progress: 9 }, ders: { tier: 2, progress: 60 }, heval: { tier: 1, progress: 1 }, roj: { tier: 1, progress: 30 } })),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderApp(<BadgesPage />);
    await userEvent.click(await screen.findByRole('button', { name: en['badges.showcase.choose'] }));

    const dialog = await screen.findByRole('dialog', { name: en['badges.showcase.title'] });
    await userEvent.click(within(dialog).getByRole('button', { name: /Ders/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: /Agir/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: /Heval/ }));
    expect(within(dialog).getByText(en['badges.showcase.full'])).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Roj/ })).toBeDisabled();
    await userEvent.click(within(dialog).getByRole('button', { name: en['badges.showcase.save'] }));

    await waitFor(() => {
      const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
      expect(put![0]).toContain('/me/badges/showcase');
      expect(JSON.parse(String(put![1]!.body))).toEqual({ keys: ['ders', 'agir', 'heval'] });
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Heval', { selector: '.badges-slot-name' })).toBeInTheDocument();
  });
});
