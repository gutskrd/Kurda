import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  HELPLINE_URL,
  MAX_REPORT_NOTE_LEN,
  REPORT_CATEGORIES,
  type FileReportRequest,
  type PlayGame,
  type ReportCategory,
  type ReportReceipt,
  type ReportTargetType,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { ApiError } from '../lib/types';
import { Sheet } from '../components/Sheet';
import { Button } from '../components/Button';
import { CheckIcon, ChevronIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { CATEGORY_HINT, CATEGORY_LABEL } from './labels';
import { MY_REPORTS_PATH } from './restriction';

/**
 * What is being reported. For a game player the id is the GAME's, and `game`
 * + `seat` say which player — the server maps the seat to the person, so the
 * page never needs anyone's account id (shared `FileReportRequest`).
 */
export type ReportTarget =
  | { targetType: Exclude<ReportTargetType, 'game_player'>; targetId: string }
  | { targetType: 'game_player'; targetId: string; game: PlayGame; seat: number };

/**
 * The props of the one report sheet, used everywhere something can be
 * reported: a profile, a direct or group message, a group, a library post or
 * picture post, a comment, a game player by seat.
 *
 * How a new surface uses it (Stories does, for its players):
 *
 *   const [reporting, setReporting] = useState(false);
 *   <ReportSheet
 *     open={reporting}
 *     onClose={() => setReporting(false)}
 *     target={{ targetType: 'game_player', targetId: gameId, game: 'stories', seat: player.seat }}
 *     name={player.name ?? t('…player N…')}
 *   />
 *
 * The done screen offers what fits the place: `block` when the page knows the
 * person's account id (a profile, a message, a post's author), `leaveGroup`
 * when it is a group you can leave (not its owner). There is no "mute a
 * person" in Hevalo, so it offers none.
 */
export interface ReportSheetProps {
  open: boolean;
  onClose: () => void;
  target: ReportTarget;
  /** who or what, for the title: a person's or group's or player's name */
  name?: string;
  /** offered on the done screen: block this person */
  block?: { userId: string; name: string } | null;
  /** offered on the done screen: leave this group */
  leaveGroup?: { groupId: string; name: string } | null;
  /** the block has landed (the page may want to close a thread, or leave a profile) */
  onBlocked?: () => void;
  /** you have left the group */
  onLeftGroup?: () => void;
}

type Step = 'pick' | 'help' | 'note' | 'done';

const TITLE: Record<ReportTargetType, MessageKey> = {
  user: 'report.title.named',
  group: 'report.title.named',
  game_player: 'report.title.named',
  dm_message: 'report.title.message',
  group_message: 'report.title.message',
  library_post: 'report.title.post',
  image_post: 'report.title.post',
  library_comment: 'report.title.comment',
  image_comment: 'report.title.comment',
};

/** Report-specific refusals said plainly; anything else as the app says errors. */
function reportError(error: ApiError, t: (key: MessageKey) => string): string {
  switch (error.code) {
    case 'REPORT_LIMIT':
      return t('report.error.limit');
    case 'SELF_REPORT':
      return t('report.error.self');
    case 'TARGET_NOT_FOUND':
      return t('report.error.gone');
    default:
      return describeError(error, t);
  }
}

/**
 * The report sheet: pick what is wrong → (help, at once, for "someone may
 * hurt themselves") → an optional note → done, with what happens next and the
 * one-tap things you can also do.
 *
 * Built to be finishable by a child who is upset: the categories are their
 * words, not a policy's; one tap on a category moves on; the note has no
 * minimum; nothing on the way asks them to explain themselves before they can
 * send.
 */
export function ReportSheet(props: ReportSheetProps): React.JSX.Element | null {
  // a fresh sheet every time it opens: a half-filled report from last time is not this one
  if (!props.open) return null;
  return <ReportFlow {...props} />;
}

function ReportFlow({ onClose, target, name, block, leaveGroup, onBlocked, onLeftGroup }: ReportSheetProps): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const [step, setStep] = useState<Step>('pick');
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReportReceipt | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [left, setLeft] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // each step is a new page of the sheet: say so by moving focus to its heading
  // (not on the first, where the dialog itself has focus and is announced)
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  const title = t(TITLE[target.targetType], { name: name ?? '' });

  function pick(c: ReportCategory): void {
    setCategory(c);
    setError(null);
    // help comes first, before anything else is asked of them
    setStep(c === 'self_harm' ? 'help' : 'note');
  }

  async function send(): Promise<void> {
    if (!category || busy) return;
    setBusy(true);
    setError(null);
    const body: FileReportRequest = {
      targetType: target.targetType,
      targetId: target.targetId,
      category,
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(target.targetType === 'game_player' ? { game: target.game, seat: target.seat } : {}),
    };
    const res = await client.post<ReportReceipt>('/reports', body);
    setBusy(false);
    if (!res.ok) {
      setError(reportError(res.error, t));
      return;
    }
    setReceipt(res.data);
    setStep('done');
  }

  async function doBlock(): Promise<void> {
    if (!block || busy) return;
    setBusy(true);
    setError(null);
    const res = await client.post(`/friends/${block.userId}/block`);
    setBusy(false);
    if (!res.ok) {
      setError(describeError(res.error, t));
      return;
    }
    setBlocked(true);
    onBlocked?.();
  }

  async function doLeave(): Promise<void> {
    if (!leaveGroup || busy) return;
    setBusy(true);
    setError(null);
    const res = await client.post(`/groups/${leaveGroup.groupId}/leave`);
    setBusy(false);
    if (!res.ok) {
      setError(describeError(res.error, t));
      return;
    }
    setLeft(true);
    onLeftGroup?.();
  }

  return (
    <Sheet open onClose={onClose} label={title} className="report-sheet">
      <p className="report-eyebrow">{title}</p>

      {step === 'pick' && (
        <>
          <h2 className="report-heading" ref={headingRef} tabIndex={-1}>
            {t('report.pick.title')}
          </h2>
          <p className="report-intro">{t('report.pick.intro')}</p>
          <ul className="report-cats" aria-label={t('report.pick.title')}>
            {REPORT_CATEGORIES.map((c) => (
              <li key={c.key}>
                <button
                  type="button"
                  className={`report-cat${c.priority === 0 ? ' is-urgent' : ''}`}
                  onClick={() => pick(c.key)}
                >
                  <span className="report-cat-text">
                    <span className="report-cat-label">{t(CATEGORY_LABEL[c.key])}</span>
                    <span className="report-cat-hint">{t(CATEGORY_HINT[c.key])}</span>
                  </span>
                  <ChevronIcon size={16} className="report-cat-go" />
                </button>
              </li>
            ))}
          </ul>
          <p className="report-privacy">{t('report.privacy')}</p>
        </>
      )}

      {step === 'help' && (
        <div className="report-help">
          <h2 className="report-heading" ref={headingRef} tabIndex={-1}>
            {t('report.help.title')}
          </h2>
          <p>{t('report.help.body')}</p>
          <a className="btn btn-primary btn-block report-help-link" href={HELPLINE_URL} target="_blank" rel="noopener noreferrer">
            {t('report.help.link')}
          </a>
          <p className="report-intro">{t('report.help.urgent')}</p>
          <div className="report-actions">
            <Button variant="ghost" onClick={() => setStep('pick')}>
              {t('report.back')}
            </Button>
            <Button variant="secondary" onClick={() => setStep('note')}>
              {t('report.help.continue')}
            </Button>
          </div>
        </div>
      )}

      {step === 'note' && category && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <h2 className="report-heading" ref={headingRef} tabIndex={-1}>
            {t('report.note.title')}
          </h2>
          <p className="report-chosen">
            <CheckIcon size={15} /> {t(CATEGORY_LABEL[category])}
          </p>
          <label className="field-label" htmlFor="report-note">
            {t('report.note.label')}
          </label>
          <textarea
            id="report-note"
            className="input report-note"
            rows={4}
            value={note}
            maxLength={MAX_REPORT_NOTE_LEN}
            placeholder={t('report.note.placeholder')}
            onChange={(e) => setNote(e.target.value)}
            aria-describedby="report-note-hint"
          />
          <p className="report-intro" id="report-note-hint">
            {t('report.note.hint')}
          </p>
          {error && (
            <div className="msg msg-error" role="alert">
              {error}
            </div>
          )}
          <div className="report-actions">
            <Button type="button" variant="ghost" onClick={() => setStep(category === 'self_harm' ? 'help' : 'pick')} disabled={busy}>
              {t('report.back')}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? t('report.sending') : t('report.send')}
            </Button>
          </div>
        </form>
      )}

      {step === 'done' && receipt && (
        <div className="report-done">
          <span className="report-done-mark" aria-hidden>
            <CheckIcon size={26} />
          </span>
          <h2 className="report-heading" ref={headingRef} tabIndex={-1}>
            {receipt.deduped ? t('report.done.dedupedTitle') : t('report.done.title')}
          </h2>
          {receipt.deduped && <p className="report-intro">{t('report.done.deduped')}</p>}

          {receipt.help && (
            <p className="report-help-again">
              {t('report.done.help')}{' '}
              <a href={receipt.help.url} target="_blank" rel="noopener noreferrer">
                {t('report.help.link')}
              </a>
            </p>
          )}

          <h3 className="report-subheading">{t('report.done.next')}</h3>
          <ol className="report-next">
            <li>{t('report.done.step1')}</li>
            <li>{t('report.done.step2')}</li>
            <li>{t('report.done.step3')}</li>
          </ol>

          {(block || leaveGroup) && (
            <div className="report-also">
              <h3 className="report-subheading">{t('report.done.also')}</h3>
              {block &&
                (blocked ? (
                  <p className="msg msg-success" role="status">
                    {t('report.done.blocked', { name: block.name })}
                  </p>
                ) : (
                  <div className="report-also-row">
                    <button type="button" className="btn btn-secondary report-also-btn" onClick={() => void doBlock()} disabled={busy}>
                      {t('report.done.block', { name: block.name })}
                    </button>
                    <span className="report-also-note">{t('report.done.blockNote')}</span>
                  </div>
                ))}
              {leaveGroup &&
                (left ? (
                  <p className="msg msg-success" role="status">
                    {t('report.done.left', { group: leaveGroup.name })}
                  </p>
                ) : (
                  <div className="report-also-row">
                    <button type="button" className="btn btn-secondary report-also-btn" onClick={() => void doLeave()} disabled={busy}>
                      {t('report.done.leave', { group: leaveGroup.name })}
                    </button>
                  </div>
                ))}
              {error && (
                <div className="msg msg-error" role="alert">
                  {error}
                </div>
              )}
            </div>
          )}

          <div className="report-actions">
            <Link to={MY_REPORTS_PATH} className="btn btn-ghost" onClick={onClose}>
              {t('report.done.myReports')}
            </Link>
            <Button onClick={onClose}>{t('report.done.close')}</Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
