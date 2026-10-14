import { useState } from 'react';
import type { CaseDetail, CaseMediaItem, CopyrightCaseInfo, CopyrightNoticeView, EvidenceMessage, EvidenceSnapshot } from '@kurda/shared';
import { isSnapshot, mediaKind, noticeFields, noticeStatusName, noticeStatusTone, noticeTargetText, notifierRoleName, targetName } from '../moderation';
import { Badge, Banner, Icon, Section, Time, UserLink, useDialogs } from '../ui';

/**
 * What was reported, as the server froze it when the report came in: the post
 * or message with its pictures, the chat around it with the reported line
 * marked, the game and who sat where. An author who edits or deletes the
 * content afterwards changes nothing here.
 *
 * Pictures stay hidden until a moderator chooses to look (research: a reveal
 * the moderator controls lowers the harm of looking without lowering
 * accuracy). Hidden means not fetched: the file is requested only on the
 * reveal, so nothing reaches the moderator's device before they agree to see
 * it. Anything that may be child abuse material asks first, and says not to
 * download or forward it.
 */
export function Evidence({ detail, sensitive }: { detail: CaseDetail; sensitive: boolean }): React.JSX.Element {
  const snapshots = detail.reports.map((r) => r.evidence).filter(isSnapshot);
  const first = snapshots[0] ?? null;
  // the same thing captured again later, changed in between: say so
  const changed = snapshots.some((s) => first && (s.text !== first.text || s.caption !== first.caption || s.title !== first.title));
  const automated = detail.case.evidence as Record<string, unknown>;
  // an automatic flag keeps its capture under `snapshot`; a report's case is the capture itself
  const ownSnapshot = isSnapshot(automated);
  const autoSnapshot = isSnapshot(automated.snapshot) ? automated.snapshot : ownSnapshot ? automated : null;
  const legacy = !first && detail.reports.some((r) => (r.evidence as { legacy?: unknown }).legacy === true);
  const shown = first ?? autoSnapshot;
  const keysShown = new Set(shown ? [...shown.mediaKeys, ...(shown.pictures ?? []).map((p) => p.mediaKey)] : []);
  const otherMedia = detail.media.filter((m) => !keysShown.has(m.key));
  const autoFacts = ownSnapshot ? [] : automatedFacts(automated);

  return (
    <Section title="What was reported" className="case-evidence">
      {shown ? (
        <Snapshot snapshot={shown} media={detail.media} sensitive={sensitive} />
      ) : legacy ? (
        <p className="section-text">
          This came from an older version of the app, which kept no copy of the content. The reporters’ words and the automatic
          summary are all there is.
        </p>
      ) : detail.media.length === 0 && autoFacts.length === 0 ? (
        <p className="section-text">No content was captured for this case: it is about the account itself.</p>
      ) : null}
      {changed && (
        <p className="note tone-warn">
          The content changed between reports. Each report below keeps what it captured.
        </p>
      )}
      {otherMedia.length > 0 && (
        <div className="evidence-media">
          {otherMedia.map((m) => (
            <MediaItem key={m.key} item={m} alt={null} sensitive={sensitive} />
          ))}
        </div>
      )}
      {autoFacts.length > 0 && (
        <>
          <h3 className="drawer-sub">What the automatic check recorded</h3>
          <dl className="facts">
            {autoFacts.map((f) => (
              <div key={f.label}>
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </Section>
  );
}

/** An automated feed's own record, minus what is shown as content already (the snapshot, the file). */
function automatedFacts(evidence: Record<string, unknown>): Array<{ label: string; value: string }> {
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(evidence)) {
    if (k === 'snapshot' || k === 'mediaKey' || k === 'audio') continue;
    rest[k] = typeof v === 'number' && /score|confidence/i.test(k) && v >= 0 && v <= 1 ? `${Math.round(v * 100)}%` : v;
  }
  return noticeFields(rest);
}

/** One captured thing: who, when, what it said, its pictures, and what was around it. */
export function Snapshot({ snapshot: s, media, sensitive }: { snapshot: EvidenceSnapshot; media: CaseMediaItem[]; sensitive: boolean }): React.JSX.Element {
  const byKey = new Map(media.map((m) => [m.key, m]));
  const pictures = s.pictures ?? s.mediaKeys.map((k) => ({ mediaKey: k, altText: null }));
  // a plain text message says nothing by being one
  const extra = s.extra ? noticeFields(s.extra).filter((f) => !(f.label === 'Kind' && f.value === 'text')) : [];
  return (
    <div className="snapshot">
      <div className="snapshot-head">
        <Badge>{targetName(s.targetType)}</Badge>
        {s.author && (
          <span>
            by <UserLink user={s.author} />
          </span>
        )}
        {s.createdAt && (
          <span className="subtle">
            posted <Time value={s.createdAt} />
          </span>
        )}
        {s.editedAt && (
          <span className="subtle">
            edited <Time value={s.editedAt} />
          </span>
        )}
        {s.status && s.status !== 'published' && <Badge tone="warn">{s.status}</Badge>}
        <span className="subtle">
          captured <Time value={s.capturedAt} />
        </span>
      </div>
      {s.group && (
        <p className="snapshot-where">
          In the group <strong dir="auto">{s.group.name}</strong>
          {s.group.privacy ? ` (${s.group.privacy})` : ''}
        </p>
      )}
      {s.title && (
        <h3 className="snapshot-title" dir="auto">
          {s.title}
        </h3>
      )}
      {s.text && (
        <blockquote className="snapshot-text" dir="auto">
          {s.text}
        </blockquote>
      )}
      {s.caption && (
        <p className="snapshot-caption" dir="auto">
          <span className="subtle">Caption: </span>
          {s.caption}
        </p>
      )}
      {pictures.length > 0 && (
        <div className="evidence-media">
          {pictures.map((p) => {
            const item = byKey.get(p.mediaKey) ?? { key: p.mediaKey, url: null, contentType: null, quarantine: null };
            return <MediaItem key={p.mediaKey} item={item} alt={p.altText} sensitive={sensitive} />;
          })}
        </div>
      )}
      {s.context && s.context.length > 0 && <ChatContext messages={s.context} />}
      {s.game && (
        <div className="snapshot-game">
          <p>
            Game: <strong>{s.game.game}</strong>
            {s.game.status ? <span className="subtle"> · {s.game.status}</span> : null}
          </p>
          <ul className="plain-list">
            {s.game.players.map((p) => (
              <li key={p.seat} className={p.seat === s.game!.seat ? 'is-reported' : undefined}>
                Player {p.seat}: <UserLink user={{ id: p.userId, username: p.username }} />
                {p.seat === s.game!.seat && <Badge tone="bad">Reported</Badge>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {extra.length > 0 && (
        <dl className="facts snapshot-extra">
          {extra.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/** The conversation around a reported message, the message itself marked. */
function ChatContext({ messages }: { messages: EvidenceMessage[] }): React.JSX.Element {
  return (
    <div className="chat-context">
      <h3 className="drawer-sub">The conversation around it</h3>
      <ol className="chat-lines">
        {messages.map((m) => (
          <li key={m.id} className={`chat-line${m.reported ? ' is-reported' : ''}`} aria-current={m.reported ? 'true' : undefined}>
            <div className="chat-line-head">
              {m.senderId ? <UserLink user={{ id: m.senderId, username: m.username }} /> : <span className="subtle">Deleted account</span>}
              <Time value={m.createdAt} mode="absolute" />
              {m.reported && <Badge tone="bad">Reported message</Badge>}
            </div>
            <div className="chat-line-body" dir="auto">
              {m.body ?? <span className="subtle">{m.kind === 'text' ? 'No text' : `A ${m.kind.replace(/_/g, ' ')}`}</span>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * A picture hidden (and not downloaded) until revealed, a voice clip with its player, or a file
 * that is gone. The link is signed for five minutes; a page left open longer
 * needs Refresh to show it again.
 */
export function MediaItem({ item, alt, sensitive }: { item: CaseMediaItem; alt: string | null; sensitive: boolean }): React.JSX.Element {
  const [shown, setShown] = useState(false);
  const dialogs = useDialogs();
  const kind = mediaKind(item);
  const quarantined = item.quarantine !== null;

  if (!item.url) {
    return (
      <div className="media-item is-missing">
        <Icon name="alert" />
        <span>
          {quarantined ? 'Held in private evidence storage; no link can be made here.' : 'This file is no longer stored, or storage is not set up here.'}
        </span>
      </div>
    );
  }

  if (kind === 'audio') {
    return (
      <div className="media-item is-audio">
        <audio controls preload="none" src={item.url}>
          <a href={item.url}>Play the recording</a>
        </audio>
      </div>
    );
  }

  if (kind !== 'image') {
    return (
      <div className="media-item is-file">
        <Icon name="code" />
        <span className="mono">{item.key}</span>
      </div>
    );
  }

  async function reveal(): Promise<void> {
    if (sensitive || quarantined) {
      const yes = await dialogs.confirm({
        title: 'Show this picture?',
        body: 'It may be child sexual abuse material. Look only as much as you need to decide. Never download, forward or screenshot it — the CSAM action keeps the evidence for the report.',
        confirmLabel: 'Show it',
        tone: 'danger',
      });
      if (!yes) return;
    }
    setShown(true);
  }

  return (
    <figure className={`media-item is-image${shown ? ' is-shown' : ''}`}>
      <div className="media-frame">
        {shown ? (
          // only now is the file requested: before the reveal it is not on this device at all, not even in the cache
          <img src={item.url} alt={alt ?? 'The reported picture'} draggable={false} referrerPolicy="no-referrer" />
        ) : (
          <>
            <span className="media-hidden" aria-hidden="true">
              <Icon name="eyeOff" size={28} />
            </span>
            <button type="button" className="media-reveal" onClick={() => void reveal()}>
              <Icon name="eye" />
              Show picture
            </button>
          </>
        )}
      </div>
      <figcaption>
        {alt ? <span dir="auto">Alt text: {alt}</span> : <span className="subtle">No alt text</span>}
        {quarantined && <Badge tone="warn">Preserved as evidence</Badge>}
        {shown && (
          <button type="button" className="ghost media-hide" onClick={() => setShown(false)}>
            <Icon name="eyeOff" size={16} />
            Hide again
          </button>
        )}
      </figcaption>
    </figure>
  );
}

/**
 * The copyright notices behind the case (`CaseDetail.copyright`, shared
 * copyright.ts), every field the notifier sent and any counter-notice from
 * the uploader, with the reported person's confirmed strikes. Three in a
 * year and the repeat-infringer policy suggests closing the account; the
 * admin decides.
 */
export function CopyrightPanel({ info }: { info: CopyrightCaseInfo }): React.JSX.Element {
  const strikes = info.strikes;
  return (
    <Section
      title={info.notices.length > 1 ? 'Copyright notices' : 'Copyright notice'}
      description="What the person claiming the rights sent us, field by field, and any answer from the uploader."
      className="case-copyright"
    >
      {strikes?.terminationSuggested && (
        <Banner tone="bad" title="Repeat infringer">
          {strikes.count} confirmed copyright decisions in {strikes.windowDays} days. The Terms say an account with {strikes.threshold} is closed; that is your call.
        </Banner>
      )}
      {info.notices.length === 0 ? (
        <p className="section-text">No formal notice: this case is about copyright from a member’s report.</p>
      ) : (
        info.notices.map((n) => <CopyrightNotice key={n.id} notice={n} />)
      )}
      {strikes && (
        <p className="section-text">
          Strikes: {strikes.count} of {strikes.threshold} in {strikes.windowDays} days
          {strikes.caseIds.length > 0 && (
            <>
              {' '}
              (
              {strikes.caseIds.map((id, i) => (
                <span key={id}>
                  {i > 0 && ', '}
                  <a href={`#/moderation/${encodeURIComponent(id)}`}>{id.slice(0, 8)}</a>
                </span>
              ))}
              )
            </>
          )}
          .
        </p>
      )}
    </Section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div>
      <dt>{label}</dt>
      <dd dir="auto">{children}</dd>
    </div>
  );
}

const yesNo = (v: boolean): string => (v ? 'Yes' : 'No');

function CopyrightNotice({ notice: n }: { notice: CopyrightNoticeView }): React.JSX.Element {
  const c = n.counterNotice;
  return (
    <div className="copyright-notice">
      <h3 className="drawer-sub">
        {n.reference} <Badge tone={noticeStatusTone(n.status)}>{noticeStatusName(n.status)}</Badge>
      </h3>
      <dl className="facts">
        <Fact label="Received">
          <Time value={n.receivedAt} mode="absolute" />
        </Fact>
        <Fact label="Name">{n.notifier.name}</Fact>
        <Fact label="Sent by">{notifierRoleName(n.notifier.role)}</Fact>
        {n.notifier.rightsHolder && <Fact label="Rights holder">{n.notifier.rightsHolder}</Fact>}
        <Fact label="Email">{n.notifier.email}</Fact>
        <Fact label="Address">{n.notifier.address}</Fact>
        {n.notifier.phone && <Fact label="Phone">{n.notifier.phone}</Fact>}
        <Fact label="The work">{n.work}</Fact>
        {n.workUrl && <Fact label="Where the original is">{n.workUrl}</Fact>}
        <Fact label="Link to the post">{n.contentUrl}</Fact>
        <Fact label="Read as">{noticeTargetText(n.target, n.targetFound)}</Fact>
        <Fact label="Why it infringes">{n.explanation}</Fact>
        <Fact label="Good faith statement">{yesNo(n.goodFaith)}</Fact>
        <Fact label="Accurate, under penalty of perjury">{yesNo(n.accurate)}</Fact>
        <Fact label="Signature">{n.notifier.signature}</Fact>
        <Fact label="Language">{n.notifier.locale}</Fact>
        <Fact label="Receipt emailed">
          <Time value={n.receiptSentAt} mode="absolute" />
        </Fact>
        <Fact label="Outcome emailed">
          <Time value={n.outcomeSentAt} mode="absolute" />
        </Fact>
      </dl>
      {c && (
        <>
          <h4 className="drawer-sub">Counter-notice from the uploader</h4>
          <dl className="facts">
            <Fact label="Received">
              <Time value={c.createdAt} mode="absolute" />
            </Fact>
            <Fact label="Name">{c.name}</Fact>
            <Fact label="Email">{c.email}</Fact>
            <Fact label="Address">{c.address}</Fact>
            {c.phone && <Fact label="Phone">{c.phone}</Fact>}
            <Fact label="Why the removal was a mistake">{c.statement}</Fact>
            <Fact label="Good faith, under penalty of perjury">{yesNo(c.goodFaith)}</Fact>
            <Fact label="Consents to the court and to service">{yesNo(c.consent)}</Fact>
            <Fact label="Signature">{c.signature}</Fact>
            <Fact label="Copy sent to the notifier">
              <Time value={c.forwardedAt} mode="absolute" />
            </Fact>
            <Fact label="Can be put back from">
              <Time value={c.restoreNotBefore} mode="date" />
            </Fact>
          </dl>
        </>
      )}
    </div>
  );
}
