import {
  STATUS_META,
  PLATFORM_STATUS_META,
  JOB_STATUS_META,
  PLATFORM_META,
} from '../utils/constants.js';
import { humanise } from '../utils/format.js';

export function Badge({ tone = 'neutral', children, dot = false, title }) {
  return (
    <span className={`badge badge--${tone}`} title={title}>
      {dot && <span className="badge__dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

/** news.status */
export function StatusBadge({ status }) {
  const meta = STATUS_META[status] || { tone: 'neutral', label: humanise(status) };
  return (
    <Badge tone={meta.tone} dot title={`Status: ${meta.label}`}>
      {meta.label}
    </Badge>
  );
}

/** publish_jobs.status */
export function JobStatusBadge({ status }) {
  const meta = JOB_STATUS_META[status] || { tone: 'neutral', label: humanise(status) };
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

/** social_publish_status.status for one platform */
export function PlatformStatusBadge({ status }) {
  const meta = PLATFORM_STATUS_META[status] || { tone: 'neutral', label: humanise(status) };
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

/**
 * A platform chip. With `status` it also carries the outcome, which is what the
 * Publish and Dashboard screens show (Facebook ✓ Published / YouTube ✗ Failed).
 */
export function PlatformChip({ code, status, name }) {
  const meta = PLATFORM_META[code] || { name: name || code, glyph: '•' };
  const statusMeta = status ? PLATFORM_STATUS_META[status] : null;
  const className = ['platform-chip', status ? `platform-chip--${String(status).toLowerCase()}` : '']
    .filter(Boolean)
    .join(' ');

  return (
    <span className={className} title={statusMeta ? `${meta.name}: ${statusMeta.label}` : meta.name}>
      <span className="platform-chip__glyph" aria-hidden="true">
        {meta.glyph}
      </span>
      {meta.name}
      {statusMeta && <span aria-hidden="true">{statusMeta.glyph}</span>}
      {statusMeta && <span className="sr-only">{statusMeta.label}</span>}
    </span>
  );
}

export function PlatformChips({ codes = [], statuses = null, empty = 'No platforms selected' }) {
  if (!codes || codes.length === 0) return <span className="muted small">{empty}</span>;

  const statusByCode = statuses
    ? statuses.reduce((acc, row) => ({ ...acc, [row.platform_code]: row.status }), {})
    : {};

  return (
    <span className="chip-row">
      {codes.map((code) => (
        <PlatformChip key={code} code={code} status={statusByCode[code]} />
      ))}
    </span>
  );
}
