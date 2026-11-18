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
import { useBlock } from './block';
import { useLeaveGroup } from '../groups/leave';
import { failureText } from '../lib/optimistic';

/**
 * What is being reported. For a game player the id is the game's, and `game` with `seat` names the player; the server
 * maps the seat to the person, so the page never needs their account id (shared `FileReportRequest`).
 */
export type ReportTarget =
  | { targetType: Exclude<ReportTargetType, 'game_player'>; targetId: string }
  | { targetType: 'game_player'; targetId: string; game: PlayGame; seat: number };

/**
 * The props of the one report sheet used everywhere something can be reported. The done screen offers `block` when the
 * page knows the person's account id, and `leaveGroup` for a group the reader can leave.
 */
export interface ReportSheetProps {
  open: boolean;
  onClose: () => void;
  target: ReportTarget;
  /** The person's, group's or player's name, for the title. */
  name?: string;
  /** Offered on the done screen: block this person. */
  block?: { userId: string; name: string } | null;
  /** Offered on the done screen: leave this group. */
  leaveGroup?: { groupId: string; name: string } | null;
  /** The block has landed, so the page may close a thread or leave a profile. */
  /** Called as a block from the done screen is pressed, before the server answers (reports/block.ts). */
  onBlocked?: () => void;
  /** The server refused that block: put back what `onBlocked` took away. */
  onBlockRefused?: () => void;
  /** The reader has left the group. */
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
  letter: 'report.title.message',
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
 * The report sheet: pick what is wrong (with help at once for self-harm), add an optional note, then a done screen
 * with what happens next and one-tap extras. Built so an upset child can finish it: plain categories, one tap to move
 * on, and no minimum note.
 */
export function ReportSheet(props: ReportSheetProps): React.JSX.Element | null {
  // A fresh sheet every time it opens.
  if (!props.open) return null;
  return <ReportFlow {...props} />;
}

function ReportFlow({ onClose, target, name, block, leaveGroup, onBlocked, onBlockRefused, onLeftGroup }: ReportSheetProps): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const sendBlock = useBlock();
  const leave = useLeaveGroup();
  const [step, setStep] = useState<Step>('pick');
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReportReceipt | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [left, setLeft] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Each later step moves focus to its heading; on the first, the dialog itself has focus.
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
    // Help comes first, before anything else is asked.
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

  /** Blocked and said so at once; a refusal takes it back and says why here. */
  function doBlock(): void {
    if (!block || blocked) return;
    setError(null);
    setBlocked(true);
    onBlocked?.();
    void sendBlock(
      block.userId,
      () => {
        setBlocked(false);
        onBlockRefused?.();
      },
      (refusal) => setError(failureText(refusal, t)),
    );
  }

  /** Left and said so at once, the group gone from the rail; a refusal takes it back and says why here. */
  function doLeave(): void {
    if (!leaveGroup || left) return;
    setError(null);
    setLeft(true);
    onLeftGroup?.();
    void leave(leaveGroup.groupId, (refusal) => {
      setLeft(false);
      setError(failureText(refusal, t));
    });
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
              {/* The helpline the server named, only ever an https address. */}
              <a href={/^https:\/\//.test(receipt.help.url) ? receipt.help.url : HELPLINE_URL} target="_blank" rel="noopener noreferrer">
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
                    <button type="button" className="btn btn-secondary report-also-btn" onClick={doBlock}>
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
                    <button type="button" className="btn btn-secondary report-also-btn" onClick={doLeave}>
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
