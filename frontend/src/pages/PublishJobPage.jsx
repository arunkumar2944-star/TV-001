import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { publishApi } from '../services/endpoints.js';
import { useAsync } from '../hooks/useAsync.js';
import { usePolling } from '../hooks/usePolling.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useToast } from '../context/ToastContext.jsx';
import { Button } from '../components/Button.jsx';
import { JobStatusBadge, StatusBadge } from '../components/Badge.jsx';
import { PlatformStatusList } from '../components/PlatformStatusList.jsx';
import { AuditTimeline } from '../components/AuditTimeline.jsx';
import { ConfirmDialog } from '../components/Modal.jsx';
import { LoadingState, ErrorState, Alert } from '../components/States.jsx';
import { formatDateTime, formatRelative } from '../utils/format.js';

const LIVE_STATUSES = ['QUEUED', 'DISPATCHED', 'IN_PROGRESS'];

export default function PublishJobPage() {
  const { jobId } = useParams();
  const toast = useToast();
  const navigate = useNavigate();

  const [retryTarget, setRetryTarget] = useState(null);
  const [retrying, setRetrying] = useState(null);

  const job = useAsync(({ signal }) => publishApi.job(jobId, { signal }), [jobId]);
  const data = job.data ? job.data.data : null;

  useDocumentTitle(data ? `Job #${data.id}` : 'Publish job');

  const isLive = data && LIVE_STATUSES.includes(data.status);
  usePolling(() => job.refreshQuietly(), 8000, Boolean(isLive));

  async function runRetry(platformCodes) {
    setRetrying(platformCodes ? platformCodes[0] : 'all');
    try {
      const response = await publishApi.retry(jobId, platformCodes);
      const dispatch = response.data.dispatch;
      if (dispatch.dispatched) {
        toast.success('Retry started', `Retry job #${response.data.job.id} was handed to n8n.`);
      } else {
        toast.warning(`Retry job #${response.data.job.id} created`, dispatch.message);
      }
      setRetryTarget(null);
      navigate(`/publish/${response.data.job.id}`);
    } catch (error) {
      toast.error('Could not retry', error.message);
      setRetryTarget(null);
    } finally {
      setRetrying(null);
    }
  }

  if (job.isLoading && !job.data) return <LoadingState label="Loading publish job..." />;
  if (job.error) return <ErrorState error={job.error} onRetry={() => job.reload()} />;
  if (!data) return null;

  const failed = (data.platforms || []).filter(
    (platform) => platform.status === 'FAILED' && platform.retry_allowed !== false
  );
  const published = (data.platforms || []).filter((platform) => platform.status === 'PUBLISHED');

  return (
    <div className="stack">
      <div className="page-head">
        <div className="page-head__text">
          <div className="flex mb-1">
            <Link className="small muted" to="/publish" state={{ view: 'history' }}>
              {'←'} Publishing history
            </Link>
            <JobStatusBadge status={data.status} />
            {data.job_type === 'RETRY' && (
              <span className="badge badge--orange">Retry - attempt {data.attempt_count}</span>
            )}
          </div>
          <h1>
            Job #{data.id} - {data.headline}
          </h1>
          <p className="page-head__subtitle">
            Triggered by {data.triggered_by_name || 'system'} - {formatDateTime(data.created_at)}
          </p>
        </div>

        <div className="page-head__actions">
          <Button onClick={() => job.reload()} loading={job.isRefreshing}>
            Refresh
          </Button>
          {failed.length > 1 && (
            <Button variant="warning" onClick={() => setRetryTarget({ all: true })}>
              Retry all failed ({failed.length})
            </Button>
          )}
          <Link className="btn" to={`/posts/${data.news_id}`}>
            Open post
          </Link>
        </div>
      </div>

      {isLive && (
        <Alert tone="info" title="Publishing in progress">
          Waiting for n8n to report each platform. This page refreshes automatically every few seconds.
        </Alert>
      )}

      {data.status === 'PARTIAL' && (
        <Alert tone="warning" title="Partially published">
          {published.length} platform{published.length === 1 ? '' : 's'} published and {failed.length} failed. Retrying
          only re-sends the failed ones - the successful platforms are never published twice.
        </Alert>
      )}

      {data.error_message && (
        <Alert tone="error" title="Job error">
          {data.error_message}
        </Alert>
      )}

      <div className="grid grid--wide">
        <div className="stack">
          <div className="card">
            <div className="card__head">
              <h2>Platform results</h2>
              <span className="small muted">
                {published.length} published - {failed.length} failed
              </span>
            </div>
            <div className="card__body">
              <PlatformStatusList
                statuses={data.platforms}
                retryingPlatform={retrying}
                onRetry={(row) => setRetryTarget({ platform: row.platform_code, name: row.platform_name })}
              />
            </div>
          </div>

          <div className="card">
            <div className="card__head">
              <h2>Execution trail</h2>
              <span className="small muted">news_execution_audit</span>
            </div>
            <div className="card__body">
              <AuditTimeline entries={data.audit} empty="No execution records for this job yet." />
            </div>
          </div>
        </div>

        <aside className="side-stack">
          <div className="card">
            <div className="card__head">
              <h3>Job details</h3>
            </div>
            <div className="card__body">
              <div className="meta-list">
                <div className="meta-row">
                  <span className="meta-row__label">Job status</span>
                  <span className="meta-row__value">
                    <JobStatusBadge status={data.status} />
                  </span>
                </div>
                <div className="meta-row">
                  <span className="meta-row__label">Post status</span>
                  <span className="meta-row__value">
                    <StatusBadge status={data.news_status} />
                  </span>
                </div>
                <div className="meta-row">
                  <span className="meta-row__label">Type</span>
                  <span className="meta-row__value">{data.job_type}</span>
                </div>
                <div className="meta-row">
                  <span className="meta-row__label">Attempt</span>
                  <span className="meta-row__value">{data.attempt_count}</span>
                </div>
                {data.parent_job_id && (
                  <div className="meta-row">
                    <span className="meta-row__label">Retry of</span>
                    <span className="meta-row__value">
                      <Link to={`/publish/${data.parent_job_id}`}>#{data.parent_job_id}</Link>
                    </span>
                  </div>
                )}
                <div className="meta-row">
                  <span className="meta-row__label">Created</span>
                  <span className="meta-row__value">{formatDateTime(data.created_at)}</span>
                </div>
                <div className="meta-row">
                  <span className="meta-row__label">Dispatched</span>
                  <span className="meta-row__value">
                    {data.dispatched_at ? formatRelative(data.dispatched_at) : 'not yet'}
                  </span>
                </div>
                <div className="meta-row">
                  <span className="meta-row__label">Completed</span>
                  <span className="meta-row__value">
                    {data.completed_at ? formatRelative(data.completed_at) : '-'}
                  </span>
                </div>
                <div className="meta-row">
                  <span className="meta-row__label">n8n execution</span>
                  <span className="meta-row__value kv">{data.n8n_execution_id || '-'}</span>
                </div>
                <div className="meta-row">
                  <span className="meta-row__label">Workflow</span>
                  <span className="meta-row__value">{data.workflow_name || '-'}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card__head">
              <h3>Post</h3>
            </div>
            <div className="card__body">
              <div className="meta-list">
                <div className="meta-row">
                  <span className="meta-row__label">Created by</span>
                  <span className="meta-row__value">{data.created_by_name || '-'}</span>
                </div>
                <div className="meta-row">
                  <span className="meta-row__label">Approved by</span>
                  <span className="meta-row__value">{data.approved_by_name || '-'}</span>
                </div>
                <div className="meta-row">
                  <span className="meta-row__label">Category</span>
                  <span className="meta-row__value">{data.category || '-'}</span>
                </div>
              </div>
              {data.summary && <p className="small muted mt-2">{data.summary}</p>}
            </div>
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={Boolean(retryTarget)}
        title={retryTarget && retryTarget.all ? 'Retry every failed platform?' : 'Retry this platform?'}
        message={
          retryTarget && retryTarget.all
            ? `A new retry job will be created for ${failed.length} failed platform(s). Platforms that already published are not included.`
            : retryTarget
              ? `A new retry job will be created for ${retryTarget.name || retryTarget.platform} only. Successful platforms are never republished.`
              : ''
        }
        confirmLabel="Start retry"
        tone="warning"
        busy={Boolean(retrying)}
        onConfirm={() =>
          runRetry(retryTarget && retryTarget.all ? failed.map((row) => row.platform_code) : [retryTarget.platform])
        }
        onCancel={() => setRetryTarget(null)}
      />
    </div>
  );
}
