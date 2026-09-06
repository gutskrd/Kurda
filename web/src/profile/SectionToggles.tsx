import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { MeProfile, ProfileSection, ProfileSections } from '../lib/types';
import { PROFILE_SECTIONS } from '../lib/types';

const COPY: Record<ProfileSection, { label: string; hint: string }> = {
  stories: { label: 'Stories', hint: 'Stories you have published.' },
  poems: { label: 'Poems', hint: 'Poems you have published.' },
  images: { label: 'Dîmen', hint: 'Pictures you have posted.' },
  games: { label: 'Games', hint: 'How your recent games went.' },
  likes: { label: 'Likes', hint: 'Posts you have liked.' },
  bookmarks: { label: 'Bookmarks', hint: 'Posts you have saved.' },
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
      else setError(res.ok ? 'Could not read your profile sections.' : describeError(res.error));
    })();
    return () => {
      cancelled = true;
    };
  }, [client, me.id]);

  async function toggle(key: ProfileSection, next: boolean): Promise<void> {
    if (!sections) return;
    setBusy(key);
    setError(null);
    const res = await client.patch<{ sections: ProfileSections }>('/me/profile/sections', { [key]: next });
    setBusy(null);
    // trust the server's answer rather than the optimistic guess — it is the
    // one the profile will actually be rendered from
    if (res.ok) setSections(res.data.sections);
    else setError(describeError(res.error));
  }

  return (
    <section className="card" style={{ marginTop: 24 }}>
      <h2 className="friend-heading" style={{ marginTop: 0 }}>What your profile shows</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Turn a section off and it disappears from your profile for everyone else. Nothing is deleted — you can turn
        it back on whenever you like.
      </p>

      {error && <div className="msg msg-error" role="status">{error}</div>}

      {sections === null ? (
        <p className="muted">Loading…</p>
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
                  <span className="section-toggle-label">{COPY[key].label}</span>
                  <span className="section-toggle-hint">{COPY[key].hint}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
