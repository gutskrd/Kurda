import { useAuth } from '../auth';
import { NAV_GROUPS, ROLE_NAME, visibleNav } from '../navigation';
import { useSession } from '../session';
import { Badge, Banner, PageHeader, Section } from '../ui';

const CAPABILITY: Record<string, string> = {
  'content.edit': 'Write and edit lessons',
  'content.publish': 'Publish lessons',
  'users.view': 'Look people up',
  'users.moderate': 'Warn, mute and ban people',
  'economy.view': 'See the economy',
  'economy.adjust': 'Change wallets and items',
  'fraud.review': 'Decide held purchases',
  'events.manage': 'Run live events',
  'admins.manage': 'Manage admins',
  'moderation.act': 'Work the moderation queue',
};

/**
 * My security: this login's 2FA, roles and what they open — read from the
 * session the panel was let in with (GET /admin/session).
 *
 * It used to ask /admin/me, which refuses an account with only the legacy
 * `admin` or `founder` role; the page then said "2FA not set up" to an admin
 * who had it, and its "Set up 2FA" button re-generated their secret and
 * un-confirmed it. Setting up 2FA happens once, before the panel opens (the
 * gate), and nowhere else.
 */
export function Security(): React.JSX.Element {
  const { me } = useAuth();
  const session = useSession();
  const roles = session.staffRoles.length ? session.staffRoles : session.roles;
  const pages = visibleNav(session);

  return (
    <div>
      <PageHeader title="My security" subtitle={me ? `Signed in as @${me.username}.` : undefined} />

      <Banner tone="ok" title="Two-factor authentication is on">
        This login entered a code from your authenticator app. You are asked again 12 hours later, and every time you sign in.
      </Banner>

      <Section title="If you lose your authenticator">
        <p className="section-text">
          Your password alone cannot open the admin, by design. Without the app (or the key you saved when you set it up), your 2FA has
          to be reset on the server by someone who runs it. The panel has no reset button.
        </p>
      </Section>

      <Section title="Your roles">
        <div className="badges">
          {roles.length ? roles.map((r) => <Badge key={r}>{ROLE_NAME[r] ?? r}</Badge>) : <span className="subtle">None</span>}
        </div>
        {session.capabilities.length > 0 && (
          <>
            <h3 className="drawer-sub">What they let you do</h3>
            <ul className="plain-list">
              {session.capabilities.map((c) => (
                <li key={c}>{CAPABILITY[c] ?? c}</li>
              ))}
            </ul>
          </>
        )}
        <h3 className="drawer-sub">The pages you can open</h3>
        <ul className="plain-list">
          {NAV_GROUPS.map((g) => {
            const here = pages.filter((p) => p.group === g.key);
            return here.length ? (
              <li key={g.key}>
                <strong>{g.label}:</strong> {here.map((p) => p.label).join(', ')}
              </li>
            ) : null;
          })}
        </ul>
        <p className="note">Roles are given on the server, by whoever runs Hevalo; the panel cannot change them.</p>
      </Section>
    </div>
  );
}
