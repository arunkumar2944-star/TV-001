import { useState } from 'react';
import { Link } from 'react-router-dom';
import { approvalApi, newsApi } from '../services/endpoints.js';
import { useAsync } from '../hooks/useAsync.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useToast } from '../context/ToastContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { Button } from '../components/Button.jsx';
import { Field, TextArea } from '../components/Field.jsx';
import { StatusBadge, PlatformChips } from '../components/Badge.jsx';
import { Modal, ConfirmDialog } from '../components/Modal.jsx';
import { MediaTile } from '../components/MediaPreview.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { LoadingState, ErrorState, EmptyState, Alert } from '../components/States.jsx';
import { formatDateTime, formatRelative, truncate } from '../utils/format.js';

export default function ApprovalPage() {
  useDocumentTitle('Approval queue');

  const toast = useToast();
  const { user } = useAuth();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput, 350);
  const [showOwn, setShowOwn] = useState(true);

  const [viewing, setViewing] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [approving, setApproving] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

  const queue = useAsync(
    ({ signal }) =>
      approvalApi.list(
        { page, pageSize, search: search || undefined, includeOwn: showOwn ? 'true' : 'false' },
        { signal }
      ),
    [page, pageSize, search, showOwn]
  );

  const items = queue.data ? queue.data.data : [];
  const pagination = queue.data ? queue.data.pagination : null;

  async function openPost(item) {
    setViewLoading(true);
    try {
      const response = await newsApi.get(item.id);
      setViewing(response.data);
    } catch (error) {
      toast.error('Could not open the post', error.message);
    } finally {
      setViewLoading(false);
    }
  }

  async function approve(item) {
    setApproving(item.id);
    try {
      await newsApi.approve(item.id);
      toast.success('Post approved', `"${truncate(item.headline, 60)}" is ready to publish.`);
      setViewing(null);
      queue.reload();
    } catch (error) {
      toast.error('Could not approve', error.message);
    } finally {
      setApproving(null);
    }
  }

  async function reject() {
    if (!rejectTarget) return;
    if (rejectReason.trim().length < 5) {
      toast.warning('Reason required', 'Tell the author what needs to change.');
      return;
    }
    setRejecting(true);
    try {
      await newsApi.reject(rejectTarget.id, rejectReason.trim());
      toast.success('Post rejected', 'The author can edit it and submit again.');
      setRejectTarget(null);
      setRejectReason('');
      setViewing(null);
      queue.reload();
    } catch (error) {
      toast.error('Could not reject', error.message);
    } finally {
      setRejecting(false);
    }
  }

  const ownCount = items.filter((item) => !item.can_approve).length;

  return (
    <div className="stack">
      <div className="page-head">
        <div className="page-head__text">
          <h1>Approval queue</h1>
          <p className="page-head__subtitle">
            Posts waiting for a decision. One approval is enough - and nobody can approve their own post.
          </p>
        </div>
        <div className="page-head__actions">
          <Button onClick={() => queue.reload()} loading={queue.isRefreshing}>
            Refresh
          </Button>
        </div>
      </div>

      <div className="card">
        <div className="card__body">
          <div className="filters">
            <div className="field field--grow">
              <label className="field__label" htmlFor="tv-approval-search">
                Search
              </label>
              <input
                id="tv-approval-search"
                className="input"
                type="search"
                placeholder="Headline or content..."
                value={searchInput}
                onChange={(event) => {
                  setSearchInput(event.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="tv-approval-scope">
                Show
              </label>
              <select
                id="tv-approval-scope"
                className="select"
                value={showOwn ? 'all' : 'reviewable'}
                onChange={(event) => {
                  setShowOwn(event.target.value === 'all');
                  setPage(1);
                }}
              >
                <option value="all">Everything pending</option>
                <option value="reviewable">Only what I can review</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {showOwn && ownCount > 0 && (
        <Alert tone="info">
          {ownCount} post{ownCount === 1 ? '' : 's'} in this list {ownCount === 1 ? 'was' : 'were'} created by you.
          You can open {ownCount === 1 ? 'it' : 'them'}, but another editor or an administrator has to approve.
        </Alert>
      )}

      {queue.isLoading && !queue.data ? (
        <LoadingState label="Loading the approval queue..." />
      ) : queue.error ? (
        <ErrorState error={queue.error} onRetry={() => queue.reload()} />
      ) : items.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={'\u{2705}'}
            title="Nothing waiting for approval"
            text="Every submitted post has been reviewed. New submissions appear here immediately."
            action={
              <Link className="btn btn--primary" to="/posts/new">
                Create a post
              </Link>
            }
          />
        </div>
      ) : (
        <div className="stack">
          {items.map((item) => (
            <article className="review-card" key={item.id}>
              <div className="review-card__head">
                <div className="review-card__title">
                  <Link to={`/posts/${item.id}`}>{item.headline}</Link>
                  <div className="byline mt-1">
                    <span>
                      Created by <strong>{item.created_by_name || 'unknown'}</strong>
                    </span>
                    <span>
                      Submitted <strong>{formatRelative(item.submitted_at || item.created_at)}</strong>
                    </span>
                    <span>{item.category || 'Uncategorised'}</span>
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
                <span className="small muted">#{item.id}</span>
                <div className="btn-row">
                  <Button size="sm" onClick={() => openPost(item)} loading={viewLoading && !viewing}>
                    View
                  </Button>
                  {item.can_approve ? (
                    <>
                      <Button
                        size="sm"
                        variant="success"
                        onClick={() => approve(item)}
                        loading={approving === item.id}
                      >
                        Approve
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => setRejectTarget(item)}>
                        Reject
                      </Button>
                    </>
                  ) : (
                    <span className="badge badge--warning" title="You created this post">
                      Your own post - another reviewer must approve
                    </span>
                  )}
                </div>
              </div>
            </article>
          ))}

          {pagination && (
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
        </div>
      )}

      <Modal
        open={Boolean(viewing)}
        title={viewing ? viewing.headline : ''}
        onClose={() => setViewing(null)}
        wide
        footer={
          viewing && (
            <>
              <Link className="btn" to={`/posts/${viewing.id}`}>
                Open full editor
              </Link>
              {Number(viewing.created_by) !== Number(user.id) ? (
                <>
                  <Button
                    variant="danger"
                    onClick={() => setRejectTarget({ id: viewing.id, headline: viewing.headline })}
                  >
                    Reject
                  </Button>
                  <Button
                    variant="success"
                    onClick={() => approve({ id: viewing.id, headline: viewing.headline })}
                    loading={approving === viewing.id}
                  >
                    Approve
                  </Button>
                </>
              ) : (
                <span className="small muted">You cannot approve a post you created.</span>
              )}
            </>
          )
        }
      >
        {viewing && (
          <div className="stack">
            <div className="byline">
              <span>
                Created by <strong>{viewing.created_by_name}</strong>
              </span>
              <span>{formatDateTime(viewing.created_at)}</span>
              <span>{viewing.category}</span>
              <span>
                {viewing.district ? `${viewing.district}, ` : ''}
                {viewing.state}
              </span>
            </div>

            <PlatformChips codes={(viewing.platforms || []).map((platform) => platform.code)} />

            {viewing.summary && (
              <div>
                <h3>Summary</h3>
                <p className="muted">{viewing.summary}</p>
              </div>
            )}

            <div>
              <h3>Content</h3>
              <div className="prose prose--clamped">{viewing.content}</div>
            </div>

            {viewing.source && (
              <p className="small muted">
                Source: <strong>{viewing.source}</strong>
              </p>
            )}

            {viewing.media && viewing.media.length > 0 && (
              <div>
                <h3>Media ({viewing.media.length})</h3>
                <div className="media-grid mt-1">
                  {viewing.media.map((item) => (
                    <MediaTile key={item.id} item={item} readOnly />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(rejectTarget)}
        title="Reject this post"
        confirmLabel="Reject post"
        busy={rejecting}
        onConfirm={reject}
        onCancel={() => {
          setRejectTarget(null);
          setRejectReason('');
        }}
      >
        <p className="small muted mb-1">{rejectTarget ? rejectTarget.headline : ''}</p>
        <Field
          label="Reason for rejection"
          required
          hint="Required. The author sees this and can edit before resubmitting."
        >
          {(props) => (
            <TextArea
              {...props}
              rows={4}
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              placeholder="Poster needs correction."
              maxLength={1000}
            />
          )}
        </Field>
      </ConfirmDialog>
    </div>
  );
}
