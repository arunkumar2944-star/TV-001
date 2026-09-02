import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { dashboardApi, publishApi } from '../services/endpoints.js';
import { useAsync } from '../hooks/useAsync.js';
import { usePolling } from '../hooks/usePolling.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useAuth } from '../context/AuthContext.jsx';
import { StatCard } from '../components/StatCard.jsx';
import { Button } from '../components/Button.jsx';
import { StatusBadge, JobStatusBadge, PlatformChip } from '../components/Badge.jsx';
import { LoadingState, ErrorState, EmptyState, Alert } from '../components/States.jsx';
import { formatRelative, formatDateTime } from '../utils/format.js';
import { PLATFORM_META } from '../utils/constants.js';

const REFRESH_MS = Number(import.meta.env.VITE_DASHBOARD_REFRESH_MS || 30000);

function PlatformRow({ platform }) {
  const meta = PLATFORM_META[platform.code] || { name: platform.name, glyph: '•' };
  const total = platform.total || 0;
  const rate = total > 0 ? Math.round((platform.success / total) * 100) : null;

  return (
    <tr>
      <td>
        <span className="flex">
          <span aria-hidden="true">{meta.glyph}</span>
          <strong>{platform.name}</strong>
          {platform.is_active === false && <span className="badge badge--neutral">disabled</span>}
        </span>
      </td>
      <td className="table__num" style={{ color: 'var(--success)' }}>
        {platform.success}
      </td>
      <td className="table__num" style={{ color: 'var(--danger)' }}>
        {platform.failed}
      </td>
      <td className="table__num" style={{ color: 'var(--warning)' }}>
        {platform.pending}
      </td>
      <td className="table__num muted">{rate === null ? '-' : `${rate}%`}</td>
      <td className="small muted nowrap">
        {platform.last_published_at ? formatRelative(platform.last_published_at) : 'never'}
      </td>
    </tr>
  );
}

export default function DashboardPage() {
  useDocumentTitle('Dashboard');
  const { user } = useAuth();
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const summary = useAsync(({ signal }) => dashboardApi.summary({ signal }), []);
  const publishing = useAsync(({ signal }) => dashboardApi.publishing(null, { signal }), []);
  const activity = useAsync(({ signal }) => dashboardApi.activity({ signal }), []);
  const integration = useAsync(({ signal }) => publishApi.integration({ signal }), []);

  const refreshAll = useCallback(() => {
    summary.refreshQuietly();
    publishing.refreshQuietly();
    activity.refreshQuietly();
    setLastRefresh(new Date());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  usePolling(refreshAll, REFRESH_MS, true);

  if (summary.isLoading && !summary.data) return <LoadingState label="Loading the newsroom dashboard..." />;
  if (summary.error && !summary.data) return <ErrorState error={summary.error} onRetry={() => summary.reload()} />;

  const cards = summary.data ? summary.data.data.cards : {};
  const meta = summary.data ? summary.data.data : {};
  const platforms = publishing.data ? publishing.data.data.platforms : [];
  const totals = publishing.data ? publishing.data.data.totals : null;
  const feed = activity.data ? activity.data.data : { recentJobs: [], openFailures: [], recentPosts: [] };
  const n8nConfigured = integration.data ? integration.data.data.n8nConfigured : true;

  return (
    <div className="stack">
      <div className="page-head">
        <div className="page-head__text">
          <h1>Good to see you, {user ? user.role.split(' ')[0] : 'there'}</h1>
          <p className="page-head__subtitle">
            Live newsroom status straight from the database - {meta.todayTotal || 0} post
            {meta.todayTotal === 1 ? '' : 's'} created today.
          </p>
        </div>
        <div className="page-head__actions">
          <span className="small muted nowrap">Updated {formatRelative(lastRefresh)}</span>
          <Button onClick={refreshAll} loading={summary.isRefreshing}>
            Refresh
          </Button>
          {user.role !== 'PLATFORM_ADMIN' && (
            <Link className="btn btn--primary" to="/posts/new">
              New post
            </Link>
          )}
        </div>
      </div>

      {!n8nConfigured && (
        <Alert tone="warning" title="n8n webhook is not configured">
          Publishing jobs will be recorded in the database but cannot be dispatched until
          <span className="kv"> N8N_WEBHOOK_URL</span> is set on the server. Everything below still reflects the
          stored publishing history.
        </Alert>
      )}

      <section className="grid grid--stats" aria-label="Post status summary">
        <StatCard label="Today" value={meta.todayTotal} hint="posts created today" tone="today" to="/posts" />
        <StatCard label="Draft" value={cards.draft} tone="draft" to="/posts" state={{ filters: { status: 'DRAFT' } }} />
        <StatCard
          label="Pending approval"
          value={cards.pendingApproval}
          tone="pending"
          to="/approval"
          hint="waiting for a reviewer"
        />
        <StatCard label="Rejected" value={cards.rejected} tone="rejected" to="/posts" state={{ filters: { status: 'REJECTED' } }} />
        <StatCard label="Approved" value={cards.approved} tone="approved" to="/publish" hint="ready to publish" />
        <StatCard label="Publishing" value={cards.publishing} tone="publishing" to="/posts" state={{ filters: { status: 'PUBLISHING' } }} />
        <StatCard label="Published" value={cards.published} tone="published" to="/posts" state={{ filters: { status: 'PUBLISHED' } }} />
        <StatCard
          label="Partially published"
          value={cards.partiallyPublished}
          tone="partial"
          to="/posts" state={{ filters: { status: 'PARTIALLY_PUBLISHED' } }}
          hint="some platforms failed"
        />
        <StatCard label="Failed" value={cards.failed} tone="failed" to="/posts" state={{ filters: { status: 'FAILED' } }} />
      </section>

      <section className="grid grid--wide">
        <div className="card">
          <div className="card__head">
            <h2>Publishing by platform</h2>
            {totals && (
              <span className="small muted">
                {totals.success} published - {totals.failed} failed - {totals.pending} in progress
              </span>
            )}
            <div className="card__head-actions">
              <Link className="btn btn--sm" to="/publish" state={{ view: 'history' }}>
                Publishing history
              </Link>
            </div>
          </div>
          <div className="card__body card__body--flush">
            {publishing.isLoading && !publishing.data ? (
              <LoadingState label="Loading platform statistics..." />
            ) : platforms.length === 0 ? (
              <EmptyState
                icon={'\u{1F4E1}'}
                title="No publishing activity yet"
                text="Platform statistics appear here once a post has been published."
              />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Platform</th>
                      <th className="table__num">Success</th>
                      <th className="table__num">Failed</th>
                      <th className="table__num">Pending</th>
                      <th className="table__num">Rate</th>
                      <th>Last published</th>
                    </tr>
                  </thead>
                  <tbody>
                    {platforms.map((platform) => (
                      <PlatformRow key={platform.code} platform={platform} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div className="card__head">
              <h2>Needs attention</h2>
            </div>
            <div className="card__body">
              {feed.openFailures.length === 0 ? (
                <p className="muted small">No failed platforms. Everything published cleanly.</p>
              ) : (
                <div className="stack--sm">
                  {feed.openFailures.slice(0, 6).map((failure) => (
                    <div key={failure.id} className="platform-status platform-status--failed">
                      <div className="platform-status__top">
                        <PlatformChip code={failure.platform_code} status="FAILED" />
                        <Link className="small" to={`/publish/${failure.publish_job_id}`}>
                          Job #{failure.publish_job_id}
                        </Link>
                      </div>
                      <div className="platform-status__detail">
                        <strong>{failure.headline}</strong>
                      </div>
                      <div className="platform-status__detail">
                        {failure.error_type}
                        {failure.error_message ? `: ${failure.error_message}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card__head">
              <h2>Recent publish jobs</h2>
            </div>
            <div className="card__body">
              {feed.recentJobs.length === 0 ? (
                <p className="muted small">No publish jobs yet.</p>
              ) : (
                <div className="stack--sm">
                  {feed.recentJobs.slice(0, 6).map((job) => (
                    <div key={job.id} className="flex-between">
                      <div style={{ minWidth: 0 }}>
                        <Link to={`/publish/${job.id}`}>
                          <strong>#{job.id}</strong> {job.headline}
                        </Link>
                        <div className="small muted">
                          {job.job_type === 'RETRY' ? 'Retry' : 'Publish'} by {job.triggered_by_name || 'system'} -{' '}
                          {formatRelative(job.created_at)}
                        </div>
                      </div>
                      <JobStatusBadge status={job.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card__head">
          <h2>Latest posts</h2>
          <div className="card__head-actions">
            <Link className="btn btn--sm" to="/posts">
              All posts
            </Link>
          </div>
        </div>
        <div className="card__body card__body--flush">
          {feed.recentPosts.length === 0 ? (
            <EmptyState
              icon={'\u{1F4DD}'}
              title="No posts yet"
              text="Create the first Trichy Vision news post to get started."
              action={
                <Link className="btn btn--primary" to="/posts/new">
                  Create a post
                </Link>
              }
            />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Headline</th>
                    <th>Category</th>
                    <th>Created by</th>
                    <th>Status</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {feed.recentPosts.map((post) => (
                    <tr key={post.id}>
                      <td>
                        <Link to={`/posts/${post.id}`}>{post.headline}</Link>
                      </td>
                      <td className="small muted">{post.category || '-'}</td>
                      <td className="small">{post.created_by_name || '-'}</td>
                      <td>
                        <StatusBadge status={post.status} />
                      </td>
                      <td className="small muted nowrap" title={formatDateTime(post.created_at)}>
                        {formatRelative(post.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
