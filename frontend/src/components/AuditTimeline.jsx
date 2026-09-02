import { AUDIT_STAGE_TONE } from '../utils/constants.js';
import { formatDateTime, humanise } from '../utils/format.js';
import { Badge } from './Badge.jsx';

const DOT_BY_STATUS = {
  SUCCESS: 'timeline__dot--success',
  FAILED: 'timeline__dot--failed',
  WARNING: 'timeline__dot--warning',
};

/** Renders news_execution_audit rows as a readable trail. */
export function AuditTimeline({ entries = [], empty = 'No activity recorded yet.' }) {
  if (!entries || entries.length === 0) {
    return <p className="muted small">{empty}</p>;
  }

  return (
    <div className="timeline">
      {entries.map((entry) => (
        <div className="timeline__item" key={entry.id}>
          <span className={`timeline__dot ${DOT_BY_STATUS[entry.status] || ''}`} aria-hidden="true" />
          <div>
            <div className="timeline__title">
              <Badge tone={AUDIT_STAGE_TONE[entry.stage] || 'neutral'}>{humanise(entry.stage)}</Badge>{' '}
              {entry.message}
            </div>
            <div className="timeline__meta">
              {formatDateTime(entry.created_at)}
              {entry.actor_name ? ` - ${entry.actor_name}` : ''}
              {entry.platform_name ? ` - ${entry.platform_name}` : ''}
              {entry.attempt_count ? ` - attempt ${entry.attempt_count}` : ''}
              {entry.n8n_execution_id ? ` - execution ${entry.n8n_execution_id}` : ''}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
