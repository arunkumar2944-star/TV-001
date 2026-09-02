import { useState } from 'react';
import { Link } from 'react-router-dom';
import { dashboardApi } from '../services/endpoints.js';
import { useAsync } from '../hooks/useAsync.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { Button } from '../components/Button.jsx';
import { Badge } from '../components/Badge.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { LoadingState, ErrorState, EmptyState } from '../components/States.jsx';
import { formatDateTime, humanise } from '../utils/format.js';
import { AUDIT_STAGE_TONE } from '../utils/constants.js';

const STATUS_TONE = { SUCCESS: 'success', FAILED: 'danger', WARNING: 'warning', INFO: 'info' };

export default function AuditPage() {
  useDocumentTitle('Audit log');

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [stage, setStage] = useState('');
  const [status, setStatus] = useState('');

  const audit = useAsync(
    ({ signal }) =>
      dashboardApi.audit(
        { page, pageSize, stage: stage || undefined, status: status || undefined },
        { signal }
      ),
    [page, pageSize, stage, status]
  );

  const items = audit.data ? audit.data.data : [];
  const pagination = audit.data ? audit.data.pagination : null;

  return (
    <div className="stack">
      <div className="page-head">
        <div className="page-head__text">
          <h1>Audit log</h1>
          <p className="page-head__subtitle">
            Every sign-in, edit, approval, publish and n8n callback recorded in news_execution_audit. Available to
            administrators and editors alike.
          </p>
        </div>
        <div className="page-head__actions">
          <Button onClick={() => audit.reload()} loading={audit.isRefreshing}>
            Refresh
          </Button>
        </div>
      </div>

      <div className="card">
        <div className="card__body">
          <div className="filters">
            <div className="field">
              <label className="field__label" htmlFor="tv-audit-stage">
                Action
              </label>
              <select
                id="tv-audit-stage"
                className="select"
                value={stage}
                onChange={(event) => {
                  setStage(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">All actions</option>
                {Object.keys(AUDIT_STAGE_TONE).map((value) => (
                  <option key={value} value={value}>
                    {humanise(value)}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="tv-audit-status">
                Outcome
              </label>
              <select
                id="tv-audit-status"
                className="select"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">Any outcome</option>
                <option value="SUCCESS">Success</option>
                <option value="FAILED">Failed</option>
                <option value="WARNING">Warning</option>
                <option value="INFO">Info</option>
              </select>
            </div>

            <Button
              onClick={() => {
                setStage('');
                setStatus('');
                setPage(1);
              }}
              disabled={!stage && !status}
            >
              Clear
            </Button>
          </div>
        </div>

        <div className="card__body card__body--flush">
          {audit.isLoading && !audit.data ? (
            <LoadingState label="Loading the audit trail..." />
          ) : audit.error ? (
            <ErrorState error={audit.error} onRetry={() => audit.reload()} />
          ) : items.length === 0 ? (
            <EmptyState icon={'\u{1F5C3}'} title="No audit records" text="Activity appears here as staff use the system." />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Action</th>
                    <th>Outcome</th>
                    <th>Who</th>
                    <th>Details</th>
                    <th>Post</th>
                    <th>Job</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((entry) => (
                    <tr key={entry.id}>
                      <td className="small muted nowrap">{formatDateTime(entry.created_at)}</td>
                      <td>
                        <Badge tone={AUDIT_STAGE_TONE[entry.stage] || 'neutral'}>{humanise(entry.stage)}</Badge>
                      </td>
                      <td>
                        <Badge tone={STATUS_TONE[entry.status] || 'neutral'}>{entry.status}</Badge>
                      </td>
                      <td className="small">{entry.actor_name || '-'}</td>
                      <td className="small">
                        {entry.message}
                        {entry.platform_name && <span className="muted"> ({entry.platform_name})</span>}
                        {entry.error_type && (
                          <div className="small" style={{ color: 'var(--danger)' }}>
                            {entry.error_type}
                          </div>
                        )}
                      </td>
                      <td className="small">
                        {entry.news_id ? <Link to={`/posts/${entry.news_id}`}>#{entry.news_id}</Link> : '-'}
                      </td>
                      <td className="small">
                        {entry.publish_job_id ? (
                          <Link to={`/publish/${entry.publish_job_id}`}>#{entry.publish_job_id}</Link>
                        ) : (
                          '-'
                        )}
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
    </div>
  );
}
