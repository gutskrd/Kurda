import { CSAM_REPORTING_LINKS, HELPLINE_URL, PRIORITY_SLA_HOURS, SECOND_APPROVAL_HOURS } from '@kurda/shared';
import { PRIORITY_NAME, slaTarget } from '../moderation';
import { Icon, PageHeader, Section } from '../ui';

/**
 * The moderation playbook (#/playbook): what to do in the cases that must
 * not be improvised — child abuse material, someone at risk of hurting
 * themselves, a threat to someone's life — and how the everyday rules work.
 * Static, short, and only about what the panel actually does.
 */
export function Playbook(): React.JSX.Element {
  return (
    <div className="playbook">
      <PageHeader title="Moderation playbook" subtitle="What to do when it matters most, and how decisions work here. Read it once; come back when a case is hard." />

      <Section title="Child sexual abuse material">
        <ol className="playbook-steps">
          <li>
            <strong>Don’t download, forward or screenshot it.</strong> Pictures on a child-safety case stay blurred until you choose to look; look only as
            much as you need to decide.
          </li>
          <li>
            On the case, press <strong>Child abuse material…</strong>. It hides the content everywhere, moves the files off public storage into private
            evidence storage, and closes the account for good at once — no second approval is waited for.
          </li>
          <li>
            File a report with the hotline for where the content or the account is. Nothing is sent by Hevalo itself. The case keeps a filing task with
            these links; write the reference the hotline gives you on it.
          </li>
          <li>If a child is in danger right now, call the emergency services or the police where they live.</li>
        </ol>
        <ul className="link-list">
          {CSAM_REPORTING_LINKS.map((l) => (
            <li key={l.url}>
              <a href={l.url} target="_blank" rel="noreferrer noopener">
                {l.label}
                <Icon name="external" size={14} />
              </a>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Someone may hurt themselves">
        <p className="section-text">
          They are helped, never punished: the panel refuses a sanction under the self-harm rule. On the case, choose{' '}
          <strong>Add a caring message</strong> — a kind note with places to find help near them ({HELPLINE_URL.replace('https://', '')}). If their life
          is in danger now, contact the emergency services where they live, and escalate the case so another person knows.
        </p>
      </Section>

      <Section title="A threat to someone’s life">
        <p className="section-text">
          Act on the account first (a suspension stops them at once), then escalate the case with what you know. If the threat is real and close, contact
          the police where the person threatened lives.
        </p>
      </Section>

      <Section title="When a child is involved">
        <p className="section-text">
          A case where the reported person or a reporter is under 18 is marked <strong>Minor involved</strong> and comes earlier in the queue. An adult
          sending sexual messages to a child, or grooming one, is urgent. Write statements a child can read.
        </p>
      </Section>

      <Section title="How fast">
        <ul className="plain-list">
          {([0, 1, 2, 3] as const).map((p) => (
            <li key={p}>
              <strong>{PRIORITY_NAME[p]}</strong>: decide {slaTarget(p)} of the first report
              {PRIORITY_SLA_HOURS[p] <= 1 ? ' — child safety, self-harm and threats of violence' : ''}.
            </li>
          ))}
        </ul>
        <p className="section-text">
          Claim a case before deciding it: for 15 minutes nobody else can decide it. Let it go if you stop. <kbd>j</kbd> and <kbd>k</kbd> move through
          the queue, <kbd>c</kbd> claims.
        </p>
      </Section>

      <Section title="Bans and second opinions">
        <p className="section-text">
          A permanent ban needs a second moderator when there is one: the account is suspended for up to {SECOND_APPROVAL_HOURS} hours while it waits in
          Ban approvals, and the request lapses if nobody decides. A child-safety ban applies at once and is confirmed afterwards. The only moderator
          confirms a ban by typing the username. Someone who is part of a case — reported, or a reporter — never decides it.
        </p>
      </Section>

      <Section title="Reports in bad faith">
        <p className="section-text">
          A reporter who keeps reporting things that break no rule can get a warning, or more, from the case: <strong>Sanction this reporter</strong>.
          Look at how often their reports led to action first. Reporters are never named to the person they reported.
        </p>
      </Section>

      <Section title="Appeals">
        <p className="section-text">
          Anyone sanctioned can ask for a review once, within six months. Someone other than the moderator who decided answers it when there is someone
          else. Your answer is theirs to read: say what you looked at, and what happens now.
        </p>
      </Section>
    </div>
  );
}
