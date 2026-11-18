import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { ApiResult, ProfileSection, ProfileSections } from '../lib/types';
import { PROFILE_SECTIONS } from '../lib/types';
import { useT } from '../i18n/I18nProvider';
import { failureText, useOptimistic } from '../lib/optimistic';
import type { MessageKey } from '../i18n/en';

const COPY: Record<ProfileSection, { labelKey: MessageKey; hintKey: MessageKey }> = {
  posts: { labelKey: 'profile.tab.posts', hintKey: 'edit.sections.posts' },
  games: { labelKey: 'nav.games', hintKey: 'edit.sections.games' },
  likes: { labelKey: 'profile.tab.likes', hintKey: 'edit.sections.likes' },

  reposts: { labelKey: 'repost.tab', hintKey: 'repost.sectionHint' },
  saved: { labelKey: 'saved.title', hintKey: 'edit.sections.saved' },
};

/**
 * Which activity sections the profile shows others, from the public profile visitors see rather than /me, which the
 * page reads (`own`; null while it does). Each toggle moves at once and saves by itself (lib/optimistic.ts); the API
 * merges the keys it is sent, so only what differs from what the server has is sent, and its answer replaces the shown
 * choice.
 */
export function SectionToggles({ own }: { own: ApiResult<{ sections?: ProfileSections | null }> | null }): React.JSX.Element {
  const t = useT();
  const { client } = useAuth();
  const loaded = own?.ok ? (own.data.sections ?? null) : null;
  const unread = own === null ? null : own.ok ? (own.data.sections ? null : t('edit.sections.failed')) : describeError(own.error, t);
  const [error, setError] = useState<string | null>(null);
  const [sections, want] = useOptimistic<ProfileSections | null, { sections: ProfileSections }>(
    loaded,
    (wanted, held) =>
      client.patch<{ sections: ProfileSections }>(
        '/me/profile/sections',
        Object.fromEntries(PROFILE_SECTIONS.filter((key) => wanted![key] !== held![key]).map((key) => [key, wanted![key]])),
      ),
    { fromAnswer: (data) => data.sections, onFailed: (refusal) => setError(failureText(refusal, t)) },
  );

  function toggle(key: ProfileSection, next: boolean): void {
    setError(null);
    want((shown) => (shown ? { ...shown, [key]: next } : shown));
  }

  return (
    <section className="card" style={{ marginTop: 24 }}>
      <h2 className="friend-heading" style={{ marginTop: 0 }}>{t('edit.sections.title')}</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        {t('edit.sections.help')}
      </p>

      {(error ?? unread) && <div className="msg msg-error" role="status">{error ?? unread}</div>}

      {sections === null ? (
        <p className="muted">{t('common.loading')}</p>
      ) : (
        <ul className="section-toggles">
          {PROFILE_SECTIONS.map((key) => (
            <li key={key}>
              <label className="section-toggle">
                <input
                  type="checkbox"
                  checked={sections[key]}
                  onChange={(e) => toggle(key, e.target.checked)}
                />
                <span className="section-toggle-text">
                  <span className="section-toggle-label">{t(COPY[key].labelKey)}</span>
                  <span className="section-toggle-hint">{t(COPY[key].hintKey)}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
