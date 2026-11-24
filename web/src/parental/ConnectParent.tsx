import { useId, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PARENT_CODE_ALPHABET, PARENT_CODE_LENGTH, normalizeParentCode, type SupervisionState } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { CheckIcon } from '../components/icons';
import { Sheet } from '../components/Sheet';
import { useT } from '../i18n/I18nProvider';
import { describeError } from '../lib/api';
import { haptic } from '../lib/haptics';
import { SettingsFrame } from '../settings/SettingsList';
import { PARENTAL_PATH, personName, type ParentLink, type PersonRef } from './api';
import { PARENTAL_HOME, type ParentalPageProps } from './ParentalSettings';
import { useSupervision } from './Supervision';

/**
 * A teen connecting a parent: the code the parent made, typed or pasted (case, spaces and dashes forgiven), then the
 * parent's face and name to confirm who it is, with what they will be able to do and see. Confirming is the teen's
 * consent; a wrong code says so under the field and keeps what was typed.
 */

/** A code as it is typed: the alphabet's letters only, upper case, with the dash after the fourth. */
export function typedCode(input: string): string {
  const letters = [...input.toUpperCase()].filter((ch) => PARENT_CODE_ALPHABET.includes(ch)).join('').slice(0, PARENT_CODE_LENGTH);
  return letters.length > 4 ? `${letters.slice(0, 4)}-${letters.slice(4)}` : letters;
}

export function ConnectParent({ overview, heading, focus }: ParentalPageProps): React.JSX.Element {
  const t = useT();
  const { client } = useAuth();
  const [params] = useSearchParams();
  const fieldId = useId();
  const [code, setCode] = useState(() => typedCode(params.get('code') ?? ''));
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [parent, setParent] = useState<PersonRef | null>(null);
  const ready = normalizeParentCode(code);

  async function look(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setProblem(null);
    const res = await client.post<{ parent: PersonRef }>(`${PARENTAL_PATH}/lookup`, { code: ready });
    setBusy(false);
    if (res.ok) setParent(res.data.parent);
    else setProblem(describeError(res.error, t));
  }

  return (
    <SettingsFrame title={t('parental.connect')} heading={heading} back={{ to: PARENTAL_HOME, label: t('parental.title') }} focus={focus}>
      <form className="settings-page-body parental-code-form" onSubmit={(e) => void look(e)} noValidate>
        <label className="field-label" htmlFor={fieldId}>
          {t('parental.code.label')}
        </label>
        <input
          id={fieldId}
          className={`input parental-code-input${problem ? ' is-wrong' : ''}`}
          value={code}
          onChange={(e) => {
            setCode(typedCode(e.target.value));
            setProblem(null);
          }}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="one-time-code"
          spellCheck={false}
          maxLength={PARENT_CODE_LENGTH + 4}
          dir="ltr"
          aria-invalid={problem ? true : undefined}
          aria-describedby={`${fieldId}-hint${problem ? ` ${fieldId}-problem` : ''}`}
        />
        {problem && (
          <p className="parental-code-problem" id={`${fieldId}-problem`} role="alert">
            {problem}
          </p>
        )}
        <p className="settings-page-note" id={`${fieldId}-hint`}>
          {t('parental.code.hint')}
        </p>
        <Button type="submit" className="parental-code-go" disabled={!ready || busy}>
          {busy ? t('parental.code.checking') : t('parental.code.continue')}
        </Button>
      </form>
      <ConfirmSheet parent={parent} code={ready} onClose={() => setParent(null)} onConnected={overview.reload} />
    </SettingsFrame>
  );
}

/** Who the code belongs to, what they will be able to do and see, and the teen's yes. */
function ConfirmSheet({
  parent,
  code,
  onClose,
  onConnected,
}: {
  parent: PersonRef | null;
  code: string | null;
  onClose: () => void;
  onConnected: () => void;
}): React.JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const { client, refreshUser } = useAuth();
  const { adopt } = useSupervision();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function connect(): Promise<void> {
    if (!code || busy) return;
    setBusy(true);
    setError(null);
    const res = await client.post<{ parents: ParentLink[]; supervision: SupervisionState | null }>(`${PARENTAL_PATH}/connect`, { code });
    setBusy(false);
    if (!res.ok) {
      setError(describeError(res.error, t));
      return;
    }
    // The beat starts at once, and the account read again carries the supervision from now on.
    adopt(res.data.supervision ?? null);
    haptic('correct');
    setDone(true);
    void refreshUser();
    onConnected();
    window.setTimeout(() => navigate(PARENTAL_HOME, { replace: true }), 1200);
  }

  const name = parent ? personName(parent) : '';
  return (
    <Sheet open={parent !== null} onClose={() => !busy && !done && onClose()} label={t('parental.confirm.title', { name })}>
      {parent && (
        <div className={`parental-sheet parental-confirm${done ? ' is-done' : ''}`}>
          <div className="parental-confirm-who">
            <span className="parental-confirm-face">
              <Avatar url={parent.avatarUrl} glyphSize={32} />
              {done && (
                <span className="parental-confirm-tick" aria-hidden="true">
                  <CheckIcon size={18} />
                </span>
              )}
            </span>
            <h2 className="report-heading parental-confirm-name">{done ? t('parental.connected', { name }) : t('parental.confirm.title', { name })}</h2>
            <p className="parental-confirm-handle" dir="ltr">
              @{parent.username}
            </p>
          </div>
          {!done && (
            <>
              <p className="report-intro">{t('parental.confirm.can')}</p>
              <ul className="parental-list">
                <li>{t('parental.confirm.limit')}</li>
                <li>{t('parental.confirm.switches')}</li>
                <li>{t('parental.confirm.see')}</li>
              </ul>
              <p className="parental-never">{t('parental.confirm.never')}</p>
              {error && (
                <div className="msg msg-error" role="alert">
                  {error}
                </div>
              )}
              <div className="report-actions">
                <Button variant="ghost" onClick={onClose} disabled={busy}>
                  {t('common.cancel')}
                </Button>
                <Button onClick={() => void connect()} disabled={busy}>
                  {busy ? t('parental.confirm.connecting') : t('parental.confirm.connect')}
                </Button>
              </div>
            </>
          )}
          <p className="sr-only" role="status">
            {done ? t('parental.connected', { name }) : ''}
          </p>
        </div>
      )}
    </Sheet>
  );
}
