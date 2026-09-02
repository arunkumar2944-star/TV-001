import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { newsApi, publishApi } from '../services/endpoints.js';
import { useAsync } from '../hooks/useAsync.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { usePolling } from '../hooks/usePolling.js';
import { useToast } from '../context/ToastContext.jsx';
import { Button } from '../components/Button.jsx';
import { StatusBadge, JobStatusBadge, PlatformChips } from '../components/Badge.jsx';
import { ConfirmDialog, Modal } from '../components/Modal.jsx';
import { MediaTile } from '../components/MediaPreview.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { LoadingState, ErrorState, EmptyState, Alert } from '../components/States.jsx';
import { formatDateTime, formatRelative } from '../utils/format.js';
import { JOB_STATUS_META } from '../utils/constants.js';

function ReadyCard({ item, onPublish, onPreview, publishing }) {
  return (
    <article className="review-card">
      <div className="review-card__head">
        <div className="review-card__title">
          <Link to={`/posts/${item.id}`}>{item.headline}</Link>
          <div className="byline mt-1">
            <span>
              Created by <strong>{item.created_by_name || '-'}</strong>
            </span>
            <span>
              Approved by <strong>{item.approved_by_name || '-'}</strong>
            </span>
            <span>Approved {formatRelative(item.approved_at)}</span>
            <span>
              {item.media_count} media file{item.media_count === 1 ? '' : 's'}
            </span>
          </div>
        </div>
        <StatusBadge status={item.status} />
      </div>

      <div className="review-card__body">
        {item.summary && <p className="muted small">{item.summary}</p>}
        <p className="review-card__excerpt">{item.content}</p>
        <PlatformChips codes={item.platform_codes} />
      </div>

      <div className="review-card__foot">
        <span className="small muted" title={formatDateTime(item.approved_at)}>
          #{item.id}
        </span>
        <div className="btn-row">
          <Button size="sm" onClick={() => onPreview(item)}>
            Review
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={() => onPublish(item)}
            loading={publishing === item.id}
            disabled={!item.platform_codes || item.platform_codes.length === 0}
          >
            Publish
          </Button>
        </div>
      </div>
    </article>
  );
}

export default function PublishPage() {
  useDocumentTitle('Publish');

  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [view, setView] = useState(location.state?.view === 'history' ? 'history' : 'ready');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput, 350);

  const [confirmTarget, setConfirmTarget] = useState(null);
  const [publishing, setPublishing] = useState(null);
  const [preview, setPreview] = useState(null);

  const integration = useAsync(({ signal }) => publishApi.integration({ signal }), []);

  const ready = useAsync(
    ({ signal }) =>
      view === 'ready'
        ? publishApi.ready({ page, pageSize, search: search || undefined }, { signal })
        : Promise.resolve(null),
    [view, page, pageSize, search]
  );

  const history = useAsync(
    ({ signal }) =>
      view === 'history'
        ? publishApi.history({ page, pageSize, status: statusFilter || undefined }, { signal })
        : Promise.resolve(null),
    [view, page, pageSize, statusFilter]
  );

  const active = view === 'ready' ? ready : history;

  // While a job is in flight, keep the history view fresh without a full reload.
  const hasRunningJob =
    view === 'history' &&
    history.data &&
    (history.data.data || []).some((job) => ['QUEUED', 'DISPATCHED', 'IN_PROGRESS'].includes(job.status));

  usePolling(() => history.refreshQuietly(), 15000, hasRunningJob);

  function switchView(next) {
    setView(next);
    setPage(1);
  }

  async function publishNow() {
    if (!confirmTarget) return;
    setPublishing(confirmTarget.id);
    try {
      const response = await newsApi.publish(confirmTarget.id);
      const dispatch = response.data.dispatch;
      if (dispatch.dispatched) {
        toast.success('Publishing started', `Job #${response.data.job.id} was handed to n8n.`);
      } else {
        toast.warning(`Job #${response.data.job.id} created`, dispatch.message);
      }
      setConfirmTarget(null);
      navigate(`/publish/${response.data.job.id}`);
    } catch (error) {
      toast.error('Could not start publishing', error.message);
      setConfirmTarget(null);
      ready.reload();
    } finally {
      setPublishing(null);
    }
  }

  const items = active.data ? active.data.data : [];
  const pagination = active.data ? active.data.pagination : null;
  const n8nConfigured = integration.data ? integration.data.data.n8nConfigured : true;

  return (
    <div className="stack">
      <div className="page-head">
        <div className="page-head__text">
          <h1>Publish</h1>
          <p className="page-head__subtitle">
            Approved posts are handed to n8n, which publishes to each selected platform independently.
          </p>
        </div>
        <div className="page-head__actions">
          <div className="btn-row">
            <Button variant={view === 'ready' ? 'primary' : 'default'} onClick={() => switchView('ready')}>
              Ready to publish
            </Button>
            <Button variant={view === 'history' ? 'primary' : 'default'} onClick={() => switchView('history')}>
              Publishing history
            </Button>
          </div>
          <Button onClick={() => active.reload()} loading={active.isRefreshing}>
            Refresh
          </Button>
        </div>
      </div>

      {!n8nConfigured && (
        <Alert tone="warning" title="n8n webhook is not configured">
          A publish job will still be created and stored, but it cannot be dispatched until
          <span className="kv"> N8N_WEBHOOK_URL</span> is configured. Nothing is lost - the job can be retried.
        </Alert>
      )}

      {view === 'ready' ? (
        <>
          <div className="card">
            <div className="card__body">
              <div className="filters">
                <div className="field field--grow">
                  <label className="field__label" htmlFor="tv-publish-search">
                    Search approved posts
                  </label>
                  <input
                    id="tv-publish-search"
                    className="input"
                    type="search"
                    placeholder="Headline..."
                    value={searchInput}
                    onChange={(event) => {
                      setSearchInput(event.target.value);
                      setPage(1);
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {ready.isLoading && !ready.data ? (
            <LoadingState label="Loading approved posts..." />
          ) : ready.error ? (
            <ErrorState error={ready.error} onRetry={() => ready.reload()} />
          ) : items.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={'\u{1F4E4}'}
                title="Nothing approved is waiting"
                text="Only APPROVED posts appear here. Approve a post in the Approval queue to publish it."
                action={
                  <Link className="btn btn--primary" to="/approval">
                    Go to approvals
                  </Link>
                }
              />
            </div>
          ) : (
            <div className="stack">
              {items.map((item) => (
                <ReadyCard
                  key={item.id}
                  item={item}
                  publishing={publishing}
                  onPublish={setConfirmTarget}
                  onPreview={async (post) => {
                    try {
                      const response = await newsApi.get(post.id);
                      setPreview(response.data);
                    } catch (error) {
                      toast.error('Could not open the post', error.message);
                    }
                  }}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="card">
          <div className="card__body">
            <div className="filters">
              <div className="field">
                <label className="field__label" htmlFor="tv-job-status">
                  Job status
                </label>
                <select
                  id="tv-job-status"
                  className="select"
                  value={statusFilter}
                  onChange={(event) => {
                    setStatusFilter(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">All jobs</option>
                  {Object.entries(JOB_STATUS_META).map(([value, meta]) => (
                    <option key={value} value={value}>
                      {meta.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="card__body card__body--flush">
            {history.isLoading && !history.data ? (
              <LoadingState label="Loading publishing history..." />
            ) : history.error ? (
              <ErrorState error={history.error} onRetry={() => history.reload()} />
            ) : items.length === 0 ? (
              <EmptyState
                icon={'\u{1F553}'}
                title="No publish jobs yet"
                text="Every publish and retry is recorded here, straight from the database."
              />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Job</th>
                      <th>Headline</th>
                      <th>Type</th>
                      <th>Platforms</th>
                      <th>Job status</th>
                      <th>Post status</th>
                      <th>Triggered by</th>
                      <th>When</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((job) => (
                      <tr key={job.id}>
                        <td className="table__id">#{job.id}</td>
                        <td>
                          <Link to={`/posts/${job.news_id}`}>{job.headline}</Link>
                        </td>
                        <td>
                          <span className={`badge badge--${job.job_type === 'RETRY' ? 'orange' : 'neutral'}`}>
                            {job.job_type === 'RETRY' ? `Retry #${job.attempt_count}` : 'Publish'}
                          </span>
                        </td>
                        <td>
                          <span className="chip-row">
                            <PlatformChips
                              codes={(job.platforms || []).map((platform) => platform.platform_code)}
                              statuses={job.platforms}
                              empty="-"
                            />
                          </span>
                        </td>
                        <td>
                          <JobStatusBadge status={job.status} />
                        </td>
                        <td>
                          <StatusBadge status={job.news_status} />
                        </td>
                        <td className="small">{job.triggered_by_name || '-'}</td>
                        <td className="small muted nowrap" title={formatDateTime(job.created_at)}>
                          {formatRelative(job.created_at)}
                        </td>
                        <td>
                          <div className="table__actions">
                            <Link className="btn btn--sm" to={`/publish/${job.id}`}>
                              Details
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {pagination && (
            <div className="card__foot">
              <Pagination
                pagination={pagination}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
              />
            </div>
          )}
        </div>
      )}

      {view === 'ready' && pagination && (
        <div className="card">
          <div className="card__body">
            <Pagination
              pagination={pagination}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmTarget)}
        title="Publish this post?"
        confirmLabel="Publish now"
        tone="primary"
        busy={Boolean(publishing)}
        onConfirm={publishNow}
        onCancel={() => setConfirmTarget(null)}
      >
        {confirmTarget && (
          <>
            <p>
              <strong>{confirmTarget.headline}</strong>
            </p>
            <p className="small muted">
              A publish job is created in the database first, then n8n is triggered for each selected platform.
            </p>
            <PlatformChips codes={confirmTarget.platform_codes} />
          </>
        )}
      </ConfirmDialog>

      <Modal
        open={Boolean(preview)}
        title={preview ? preview.headline : ''}
        onClose={() => setPreview(null)}
        wide
        footer={
          preview && (
            <>
              <Link className="btn" to={`/posts/${preview.id}`}>
                Open post
              </Link>
              <Button
                variant="primary"
                onClick={() => {
                  setConfirmTarget({
                    id: preview.id,
                    headline: preview.headline,
                    platform_codes: (preview.platforms || []).map((platform) => platform.code),
                  });
                  setPreview(null);
                }}
              >
                Publish
              </Button>
            </>
          )
        }
      >
        {preview && (
          <div className="stack">
            <div className="byline">
              <span>
                Created by <strong>{preview.created_by_name}</strong>
              </span>
              <span>
                Approved by <strong>{preview.approved_by_name || '-'}</strong>
              </span>
              <span>{formatDateTime(preview.approved_at)}</span>
            </div>
            <PlatformChips codes={(preview.platforms || []).map((platform) => platform.code)} />
            <div>
              <h3>Content</h3>
              <div className="prose prose--clamped">{preview.content}</div>
            </div>
            {preview.media && preview.media.length > 0 && (
              <div>
                <h3>Media ({preview.media.length})</h3>
                <div className="media-grid mt-1">
                  {preview.media.map((item) => (
                    <MediaTile key={item.id} item={item} readOnly />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
