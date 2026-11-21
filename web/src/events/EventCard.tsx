import { Link } from 'react-router-dom';
import type { ActiveEvent } from '@kurda/shared';
import { ChevronIcon, StarIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import { useApiGet } from '../lib/useApi';
import './events.css';

/**
 * The event running now on Home, as a slim card above the daily card, opening its quests (events/EventsPage.tsx).
 * Only while an event runs: it takes no room while loading, between events, or when events cannot be read.
 */
export function EventCard(): React.JSX.Element | null {
  const t = useT();
  const { data } = useApiGet<{ events: ActiveEvent[] }>('/events/active');
  const event = data?.events?.[0];
  if (!event) return null;
  return (
    <Link to="/app/events" className="event-card">
      <span className="event-card-mark hue-gold" aria-hidden="true">
        <StarIcon size={22} />
      </span>
      <span className="event-card-text">
        <span className="event-card-title">{event.name}</span>
        <span className="event-card-sub">{t('events.cardSub')}</span>
      </span>
      <ChevronIcon size={18} className="event-card-go flip-rtl" />
    </Link>
  );
}
