import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { MeProfile, ProfileSection, ProfileSections } from '../lib/types';
import { PROFILE_SECTIONS } from '../lib/types';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';

const COPY: Record<ProfileSection, { labelKey: MessageKey; hintKey: MessageKey }> = {
  posts: { labelKey: 'profile.tab.posts', hintKey: 'edit.sections.posts' },
  games: { labelKey: 'nav.games', hintKey: 'edit.sections.games' },
  likes: { labelKey: 'profile.tab.likes', hintKey: 'edit.sections.likes' },

  reposts: { labelKey: 'repost.tab', hintKey: 'repost.sectionHint' },
  saved: { labelKey: 'saved.title', hintKey: 'edit.sections.saved' },
};

/**
 * Which activity sections your profile shows other people.
 *
 * The current values come from your own public profile rather than /me, because
 * that is the endpoint visitors read — so what this screen shows is literally
 * what they would see, not a second copy that could disagree with it.
 *
 * Each toggle saves on its own: there is no Save button to forget, and the API
 * merges one key at a time so two quick toggles cannot overwrite each other.
 */
export function SectionToggles({ me }: { me: MeProfile }): React.JSX.Element {
  const t = useT();
  const { client } = useAuth();
  const [sections, setSections] = useState<ProfileSections | null>(null);
  const [busy, setBusy] = useState<ProfileSection | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await client.get<{ sections?: ProfileSections | null }>(`/users/${me.id}`);
      if (cancelled) return;
      if (res.ok && res.data.sections) setSections(res.data.sections);
      else setError(res.ok ? t('edit.sections.failed') : describeError(res.error, t));
    })();
    return () => {
      cancelled = true;
    };
  }, [client, me.id, t]);

  async function toggle(key: ProfileSection, next: boolean): Promise<void> {
    if (!sections) return;
    setBusy(key);
    setError(null);
    const res = await client.patch<{ sections: ProfileSections }>('/me/profile/sections', { [key]: next });
    setBusy(null);
    // trust the server's answer rather than the optimistic guess — it is the
    // one the profile will actually be rendered from
    if (res.ok) setSections(res.data.sections);
    else setError(describeError(res.error, t));
  }

  return (
    <section className="card" style={{ marginTop: 24 }}>
      <h2 className="friend-heading" style={{ marginTop: 0 }}>{t('edit.sections.title')}</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        {t('edit.sections.help')}
      </p>

      {error && <div className="msg msg-error" role="status">{error}</div>}

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
                  disabled={busy !== null}
                  onChange={(e) => void toggle(key, e.target.checked)}
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
