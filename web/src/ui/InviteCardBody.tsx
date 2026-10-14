import { useT } from '../i18n/I18nProvider';

/**
 * What a game invite says, in the order the front page shows it: that it is an
 * invite, which game, what it is, and the way in.
 *
 * Only the inside. In a chat the whole card is one link (`GameInviteCard`), so
 * the "button" here is a span that looks like one — a real button inside a link
 * would be two controls fighting over one tap. On the front page the same body
 * sits in a picture, where nothing may be pressable at all.
 */
export function InviteCardBody({ game, blurb, action }: { game: string; blurb: string; action: string }): React.JSX.Element {
  const t = useT();
  return (
    <>
      <span className="invite-eyebrow">{t('games.invite.eyebrow')}</span>
      <span className="invite-title">{t('games.invite.join', { game })}</span>
      <span className="invite-blurb">{blurb}</span>
      <span className="invite-action">{action}</span>
    </>
  );
}
