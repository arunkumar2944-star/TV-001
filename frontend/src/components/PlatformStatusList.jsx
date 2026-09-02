import { PLATFORM_META, PLATFORM_STATUS_META } from '../utils/constants.js';
import { formatRelative } from '../utils/format.js';
import { Button } from './Button.jsx';
import { Badge } from './Badge.jsx';

/**
 * Platform-by-platform outcome for a post or a job.
 *
 * Retry is offered ONLY for failed platforms - a successful platform can never
 * be republished from here, which is exactly what the backend enforces too.
 */
export function PlatformStatusList({ statuses = [], onRetry, retryingPlatform = null, showRetry = true }) {
  if (!statuses || statuses.length === 0) {
    return <p className="muted small">Nothing has been sent to n8n yet.</p>;
  }

  return (
    <div className="platform-status-grid">
      {statuses.map((row) => {
        const code = row.platform_code || row.code;
        const meta = PLATFORM_META[code] || { name: row.platform_name || code, glyph: '•' };
        const statusMeta = PLATFORM_STATUS_META[row.status] || { tone: 'neutral', label: row.status };
        const canRetry = row.status === 'FAILED' && row.retry_allowed !== false;

        return (
          <div key={`${row.publish_job_id || 'x'}-${code}`} className={`platform-status platform-status--${String(row.status).toLowerCase()}`}>
            <div className="platform-status__top">
              <span aria-hidden="true">{meta.glyph}</span>
              <span className="platform-status__name">{meta.name}</span>
              <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
            </div>

            {row.published_url && (
              <a
                className="platform-status__detail"
                href={row.published_url}
                target="_blank"
                rel="noreferrer noopener"
              >
                View published post
              </a>
            )}

            {row.external_post_id && (
              <div className="platform-status__detail">
                Post id: <span className="kv">{row.external_post_id}</span>
              </div>
            )}

            {row.status === 'FAILED' && (
              <div className="platform-status__detail">
                <strong>{row.error_type || 'ERROR'}</strong>
                {row.error_message ? `: ${row.error_message}` : ''}
              </div>
            )}

            <div className="platform-status__detail">
              Attempt {row.attempt_count || 0}
              {row.updated_at ? ` - ${formatRelative(row.updated_at)}` : ''}
            </div>

            {showRetry && canRetry && onRetry && (
              <div>
                <Button
                  size="sm"
                  variant="warning"
                  loading={retryingPlatform === code}
                  onClick={() => onRetry(row)}
                >
                  Retry {meta.name}
                </Button>
              </div>
            )}

            {showRetry && row.status === 'FAILED' && row.retry_allowed === false && (
              <p className="platform-status__detail muted">
                n8n marked this failure as not retryable.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
