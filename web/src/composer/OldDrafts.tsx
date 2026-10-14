import { useI18n, useT } from '../i18n/I18nProvider';
import type { ComposedPost } from './types';

/**
 * Drafts saved by the phone app before drafts moved onto the device.
 *
 * The old app's "Save draft" put a post on the server as a draft, and nothing
 * could ever open one again (`GET /me/library/drafts` is new). They are
 * offered here, where somebody goes to write, so a half-finished story is not
 * lost: choosing one opens it in the composer to finish and post.
 */
export function OldDrafts({
  drafts,
  onChoose,
  onBack,
}: {
  drafts: ComposedPost[];
  onChoose: (post: ComposedPost) => void;
  onBack: () => void;
}): React.JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  const when = (iso: string): string => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  };
  return (
    <div className="cmp-drafts">
      <p className="cmp-hint">{t('composer.oldDrafts.lead')}</p>
      <ul className="cmp-draft-list">
        {drafts.map((d) => {
          const name = d.title?.trim() || d.body.trim().split('\n')[0]?.slice(0, 80) || t('composer.oldDrafts.untitled');
          return (
            <li key={d.id}>
              <button type="button" className="cmp-draft" onClick={() => onChoose(d)}>
                <span className="cmp-draft-name">{name}</span>
                <span className="cmp-draft-meta">
                  {t('composer.oldDrafts.saved', { date: when(d.updatedAt ?? d.createdAt) })}
                  {d.media.length > 0 && ` · ${t('composer.oldDrafts.pictures', { count: d.media.length })}`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" className="cmp-chip" onClick={onBack}>
        {t('composer.oldDrafts.back')}
      </button>
    </div>
  );
}
