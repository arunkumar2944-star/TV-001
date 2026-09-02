import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { newsApi, dashboardApi } from '../services/endpoints.js';
import { useAsync } from '../hooks/useAsync.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Field, TextInput, TextArea, Select } from '../components/Field.jsx';
import { Button } from '../components/Button.jsx';
import { PlatformSelector } from '../components/PlatformSelector.jsx';
import { MediaManager } from '../components/MediaManager.jsx';
import { PlatformStatusList } from '../components/PlatformStatusList.jsx';
import { AuditTimeline } from '../components/AuditTimeline.jsx';
import { StatusBadge, JobStatusBadge } from '../components/Badge.jsx';
import { Modal, ConfirmDialog } from '../components/Modal.jsx';
import { LoadingState, ErrorState, Alert } from '../components/States.jsx';
import { formatDateTime, formatRelative } from '../utils/format.js';

const EMPTY_FORM = {
  headline: '',
  summary: '',
  content: '',
  source: '',
  category: '',
  district: '',
  state: 'Tamil Nadu',
  country: 'India',
};

const EDITABLE_STATUSES = ['DRAFT', 'REJECTED', 'PENDING_APPROVAL'];

export default function PostEditorPage({ mode }) {
  const isCreate = mode === 'create';
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user, isAdmin } = useAuth();

  const [form, setForm] = useState(EMPTY_FORM);
  const [platforms, setPlatforms] = useState([]);
  const [media, setMedia] = useState([]);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busyAction, setBusyAction] = useState(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [confirm, setConfirm] = useState(null);

  const options = useAsync(({ signal }) => newsApi.options({ signal }), []);

  const detail = useAsync(
    ({ signal }) => (isCreate ? Promise.resolve(null) : newsApi.get(id, { signal })),
    [id, isCreate],
    { immediate: !isCreate }
  );

  const audit = useAsync(
    ({ signal }) => (isCreate ? Promise.resolve(null) : dashboardApi.audit({ newsId: id, pageSize: 40 }, { signal })),
    [id, isCreate],
    { immediate: !isCreate }
  );

  const post = detail.data ? detail.data.data : null;

  useDocumentTitle(isCreate ? 'New post' : post ? post.headline : 'Post');

  // Fill the form once the post arrives (and after every reload). The form is
  // editable local state seeded from the server, so it has to be copied in.
  useEffect(() => {
    if (!post) return;
    setForm({
      headline: post.headline || '',
      summary: post.summary || '',
      content: post.content || '',
      source: post.source || '',
      category: post.category || '',
      district: post.district || '',
      state: post.state || 'Tamil Nadu',
      country: post.country || 'India',
    });
    setPlatforms((post.platforms || []).map((platform) => platform.code));
    setMedia(post.media || []);
    setDirty(false);
  }, [post]);

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    if (!dirty) return undefined;
    const handler = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const meta = options.data ? options.data.data : { platforms: [], categories: [], districts: [] };

  const permissions = useMemo(() => {
    if (isCreate) return { canEdit: true };
    if (!post) return {};
    const isCreator = Number(post.created_by) === Number(user.id);
    return {
      isCreator,
      canEdit: EDITABLE_STATUSES.includes(post.status),
      canSubmit: ['DRAFT', 'REJECTED'].includes(post.status),
      // Creator can never approve their own post - the API enforces this too.
      canApprove: post.status === 'PENDING_APPROVAL' && !isCreator,
      canPublish: post.status === 'APPROVED',
      canArchive: !['ARCHIVED', 'PUBLISHING'].includes(post.status),
      canDelete: ['DRAFT', 'REJECTED'].includes(post.status) && (isAdmin || isCreator),
    };
  }, [post, user, isAdmin, isCreate]);

  function change(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setDirty(true);
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function validate() {
    const problems = {};
    if (!form.headline.trim() || form.headline.trim().length < 5) {
      problems.headline = 'Headline must be at least 5 characters';
    }
    if (!form.content.trim()) problems.content = 'Content is required';
    if (!form.category) problems.category = 'Choose a category';
    setErrors(problems);
    return Object.keys(problems).length === 0;
  }

  async function handleSave(event) {
    if (event) event.preventDefault();
    if (!validate()) {
      toast.warning('Check the form', 'Some required fields still need attention.');
      return null;
    }

    setSaving(true);
    try {
      const payload = {
        headline: form.headline.trim(),
        summary: form.summary.trim(),
        content: form.content,
        source: form.source.trim(),
        category: form.category,
        district: form.district || null,
        state: form.state || 'Tamil Nadu',
        country: form.country || 'India',
        platforms,
      };

      if (isCreate) {
        const response = await newsApi.create(payload);
        toast.success('Draft created', 'Now add media and submit it for approval.');
        setDirty(false);
        navigate(`/posts/${response.data.id}`, { replace: true });
        return response.data;
      }

      const response = await newsApi.update(id, payload);
      detail.setData(response);
      setDirty(false);
      toast.success('Post saved', 'Your changes are stored.');
      return response.data;
    } catch (error) {
      setErrors(error.fieldErrors || {});
      toast.error('Could not save the post', error.message);
      return null;
    } finally {
      setSaving(false);
    }
  }

  const refreshAll = useCallback(() => {
    detail.reload();
    audit.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runAction(name, action, successMessage) {
    setBusyAction(name);
    try {
      const response = await action();
      if (response && response.data) detail.setData(response);
      toast.success(successMessage.title, successMessage.text);
      refreshAll();
      return response;
    } catch (error) {
      toast.error('Action failed', error.message);
      return null;
    } finally {
      setBusyAction(null);
      setConfirm(null);
    }
  }

  async function handleSubmitForApproval() {
    if (dirty) {
      const saved = await handleSave();
      if (!saved) return;
    }
    await runAction('submit', () => newsApi.submitForApproval(id), {
      title: 'Sent for approval',
      text: 'Another editor or an administrator can now review it.',
    });
  }

  async function handleApprove() {
    await runAction('approve', () => newsApi.approve(id), {
      title: 'Post approved',
      text: 'It is now available on the Publish page.',
    });
  }

  async function handleReject() {
    if (rejectReason.trim().length < 5) {
      toast.warning('Reason required', 'Tell the author what needs to change.');
      return;
    }
    setBusyAction('reject');
    try {
      const response = await newsApi.reject(id, rejectReason.trim());
      detail.setData(response);
      setRejectOpen(false);
      setRejectReason('');
      toast.success('Post rejected', 'The author can edit it and submit again.');
      refreshAll();
    } catch (error) {
      toast.error('Could not reject the post', error.message);
    } finally {
      setBusyAction(null);
    }
  }

  async function handlePublish() {
    setBusyAction('publish');
    try {
      const response = await newsApi.publish(id);
      const dispatch = response.data.dispatch;
      if (dispatch.dispatched) {
        toast.success('Publishing started', `Job #${response.data.job.id} was handed to n8n.`);
      } else {
        toast.warning(`Job #${response.data.job.id} created`, dispatch.message);
      }
      navigate(`/publish/${response.data.job.id}`);
    } catch (error) {
      toast.error('Could not start publishing', error.message);
    } finally {
      setBusyAction(null);
      setConfirm(null);
    }
  }

  async function handleDelete() {
    setBusyAction('delete');
    try {
      await newsApi.remove(id);
      toast.success('Post deleted');
      navigate('/posts', { replace: true });
    } catch (error) {
      toast.error('Could not delete the post', error.message);
    } finally {
      setBusyAction(null);
      setConfirm(null);
    }
  }

  if (!isCreate && detail.isLoading && !detail.data) return <LoadingState label="Loading post..." />;
  if (!isCreate && detail.error) return <ErrorState error={detail.error} onRetry={() => detail.reload()} />;

  const readOnly = !isCreate && !permissions.canEdit;
  const latestApproval = post && post.approvals && post.approvals.length > 0 ? post.approvals[0] : null;

  return (
    <div className="stack">
      <div className="page-head">
        <div className="page-head__text">
          <div className="flex mb-1">
            <Link className="small muted" to="/posts">
              {'←'} Back to posts
            </Link>
            {post && <StatusBadge status={post.status} />}
            {post && <span className="small muted">#{post.id}</span>}
          </div>
          <h1>{isCreate ? 'New news post' : form.headline || 'Untitled post'}</h1>
          {post && (
            <p className="page-head__subtitle">
              Created by {post.created_by_name || 'unknown'} - {formatDateTime(post.created_at)}
              {post.updated_by_name ? ` - last edited by ${post.updated_by_name}` : ''}
            </p>
          )}
        </div>

        <div className="page-head__actions">
          {!readOnly && (
            <Button variant="primary" onClick={handleSave} loading={saving}>
              {isCreate ? 'Create draft' : 'Save changes'}
            </Button>
          )}
          {permissions.canSubmit && (
            <Button
              variant="warning"
              onClick={handleSubmitForApproval}
              loading={busyAction === 'submit'}
            >
              Submit for approval
            </Button>
          )}
          {permissions.canApprove && (
            <>
              <Button variant="success" onClick={handleApprove} loading={busyAction === 'approve'}>
                Approve
              </Button>
              <Button variant="danger" onClick={() => setRejectOpen(true)}>
                Reject
              </Button>
            </>
          )}
          {permissions.canPublish && (
            <Button variant="primary" onClick={() => setConfirm('publish')}>
              Publish
            </Button>
          )}
        </div>
      </div>

      {post && post.status === 'PENDING_APPROVAL' && permissions.isCreator && (
        <Alert tone="info" title="Waiting for a colleague to review">
          You created this post, so you cannot approve it yourself. Any other editor or an administrator can
          approve or reject it.
        </Alert>
      )}

      {post && post.status === 'REJECTED' && latestApproval && latestApproval.rejection_reason && (
        <Alert tone="error" title={`Rejected by ${latestApproval.reviewed_by_name || 'a reviewer'}`}>
          {latestApproval.rejection_reason}
          <div className="small mt-1">Edit the post and submit it for approval again.</div>
        </Alert>
      )}

      {readOnly && (
        <Alert tone="warning" title="This post is locked">
          A post with status {post.status} can no longer be edited. Its content, media and platform selection are
          shown read-only so the published record stays accurate.
        </Alert>
      )}

      <div className="editor-layout">
        <div className="stack">
          <form className="card" onSubmit={handleSave}>
            <div className="card__head">
              <h2>Content</h2>
              {dirty && <span className="badge badge--warning">Unsaved changes</span>}
            </div>
            <div className="card__body">
              <div className="form-grid">
                <Field label="Headline" required error={errors.headline} className="span-2">
                  {(props) => (
                    <TextInput
                      {...props}
                      value={form.headline}
                      onChange={(event) => change('headline', event.target.value)}
                      placeholder="Trichy corporation approves new bus terminus"
                      maxLength={300}
                      disabled={readOnly}
                      invalid={Boolean(errors.headline)}
                    />
                  )}
                </Field>

                <Field
                  label="Summary"
                  hint="A short standfirst used in listings and captions."
                  error={errors.summary}
                  className="span-2"
                >
                  {(props) => (
                    <TextArea
                      {...props}
                      value={form.summary}
                      onChange={(event) => change('summary', event.target.value)}
                      rows={2}
                      maxLength={1000}
                      disabled={readOnly}
                    />
                  )}
                </Field>

                <Field label="Content" required error={errors.content} className="span-2">
                  {(props) => (
                    <TextArea
                      {...props}
                      tall
                      value={form.content}
                      onChange={(event) => change('content', event.target.value)}
                      placeholder="Write the full news story here..."
                      disabled={readOnly}
                      invalid={Boolean(errors.content)}
                    />
                  )}
                </Field>

                <Field label="Source" hint="Reporter, agency or original source." error={errors.source}>
                  {(props) => (
                    <TextInput
                      {...props}
                      value={form.source}
                      onChange={(event) => change('source', event.target.value)}
                      maxLength={300}
                      disabled={readOnly}
                    />
                  )}
                </Field>

                <Field label="Category" required error={errors.category}>
                  {(props) => (
                    <Select
                      {...props}
                      value={form.category}
                      onChange={(event) => change('category', event.target.value)}
                      disabled={readOnly}
                      invalid={Boolean(errors.category)}
                    >
                      <option value="">Select a category</option>
                      {(meta.categories || []).map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>

                <Field label="District" error={errors.district}>
                  {(props) => (
                    <Select
                      {...props}
                      value={form.district}
                      onChange={(event) => change('district', event.target.value)}
                      disabled={readOnly}
                    >
                      <option value="">Select a district</option>
                      {(meta.districts || []).map((district) => (
                        <option key={district} value={district}>
                          {district}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>

                <Field label="State" error={errors.state}>
                  {(props) => (
                    <TextInput
                      {...props}
                      value={form.state}
                      onChange={(event) => change('state', event.target.value)}
                      disabled={readOnly}
                    />
                  )}
                </Field>

                <Field label="Country" error={errors.country}>
                  {(props) => (
                    <TextInput
                      {...props}
                      value={form.country}
                      onChange={(event) => change('country', event.target.value)}
                      disabled={readOnly}
                    />
                  )}
                </Field>
              </div>
            </div>
            {!readOnly && (
              <div className="card__foot">
                <div className="btn-row">
                  <Button type="submit" variant="primary" loading={saving}>
                    {isCreate ? 'Create draft' : 'Save changes'}
                  </Button>
                  {!isCreate && (
                    <Button
                      onClick={() => {
                        detail.reload();
                        setDirty(false);
                      }}
                      disabled={saving}
                    >
                      Discard changes
                    </Button>
                  )}
                </div>
              </div>
            )}
          </form>

          <div className="card">
            <div className="card__head">
              <h2>Social media platforms</h2>
            </div>
            <div className="card__body">
              {isCreate && (
                <p className="muted small mb-1">
                  Pick the destinations now - you can change them until the post is approved.
                </p>
              )}
              <PlatformSelector
                platforms={meta.platforms || []}
                selected={platforms}
                disabled={readOnly}
                onChange={(next) => {
                  setPlatforms(next);
                  setDirty(true);
                }}
              />
            </div>
          </div>

          <div className="card">
            <div className="card__head">
              <h2>Media</h2>
              <span className="small muted">
                Images, posters, advertisement, video and audio
              </span>
            </div>
            <div className="card__body">
              {isCreate ? (
                <Alert tone="info">Create the draft first, then upload media to it.</Alert>
              ) : (
                <MediaManager newsId={id} media={media} onChange={setMedia} readOnly={readOnly} />
              )}
            </div>
          </div>

          {!isCreate && post && post.platformStatuses && post.platformStatuses.length > 0 && (
            <div className="card">
              <div className="card__head">
                <h2>Publishing status</h2>
                {post.publishJobs && post.publishJobs.length > 0 && (
                  <Link className="small" to={`/publish/${post.publishJobs[0].id}`}>
                    Open latest job
                  </Link>
                )}
              </div>
              <div className="card__body">
                <PlatformStatusList statuses={post.platformStatuses} showRetry={false} />
              </div>
            </div>
          )}
        </div>

        <aside className="side-stack">
          {!isCreate && post && (
            <div className="card">
              <div className="card__head">
                <h3>Workflow</h3>
              </div>
              <div className="card__body">
                <div className="meta-list">
                  <div className="meta-row">
                    <span className="meta-row__label">Status</span>
                    <span className="meta-row__value">
                      <StatusBadge status={post.status} />
                    </span>
                  </div>
                  <div className="meta-row">
                    <span className="meta-row__label">Created by</span>
                    <span className="meta-row__value">{post.created_by_name || '-'}</span>
                  </div>
                  <div className="meta-row">
                    <span className="meta-row__label">Created</span>
                    <span className="meta-row__value">{formatDateTime(post.created_at)}</span>
                  </div>
                  {post.approved_by_name && (
                    <>
                      <div className="meta-row">
                        <span className="meta-row__label">Approved by</span>
                        <span className="meta-row__value">{post.approved_by_name}</span>
                      </div>
                      <div className="meta-row">
                        <span className="meta-row__label">Approved at</span>
                        <span className="meta-row__value">{formatDateTime(post.approved_at)}</span>
                      </div>
                    </>
                  )}
                  {post.published_at && (
                    <div className="meta-row">
                      <span className="meta-row__label">Published</span>
                      <span className="meta-row__value">{formatDateTime(post.published_at)}</span>
                    </div>
                  )}
                  <div className="meta-row">
                    <span className="meta-row__label">Media</span>
                    <span className="meta-row__value">{media.length} file(s)</span>
                  </div>
                  <div className="meta-row">
                    <span className="meta-row__label">Platforms</span>
                    <span className="meta-row__value">{platforms.length}</span>
                  </div>
                </div>

                <div className="btn-row mt-2">
                  {permissions.canArchive && (
                    <Button size="sm" onClick={() => setConfirm('archive')}>
                      Archive
                    </Button>
                  )}
                  {permissions.canDelete && (
                    <Button size="sm" variant="ghost" onClick={() => setConfirm('delete')}>
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          {!isCreate && post && post.approvals && post.approvals.length > 0 && (
            <div className="card">
              <div className="card__head">
                <h3>Approval history</h3>
              </div>
              <div className="card__body stack--sm">
                {post.approvals.map((approval) => (
                  <div key={approval.id} className="small">
                    <div className="flex">
                      <span
                        className={`badge badge--${
                          approval.status === 'APPROVED'
                            ? 'success'
                            : approval.status === 'REJECTED'
                              ? 'danger'
                              : 'warning'
                        }`}
                      >
                        {approval.status}
                      </span>
                      <span className="muted">{formatRelative(approval.reviewed_at || approval.submitted_at)}</span>
                    </div>
                    <div className="muted">
                      Submitted by {approval.submitted_by_name || '-'}
                      {approval.reviewed_by_name ? ` - reviewed by ${approval.reviewed_by_name}` : ''}
                    </div>
                    {approval.rejection_reason && <div>Reason: {approval.rejection_reason}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isCreate && post && post.publishJobs && post.publishJobs.length > 0 && (
            <div className="card">
              <div className="card__head">
                <h3>Publish jobs</h3>
              </div>
              <div className="card__body stack--sm">
                {post.publishJobs.map((job) => (
                  <div className="flex-between" key={job.id}>
                    <Link to={`/publish/${job.id}`}>
                      #{job.id} {job.job_type === 'RETRY' ? '(retry)' : ''}
                    </Link>
                    <JobStatusBadge status={job.status} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isCreate && (
            <div className="card">
              <div className="card__head">
                <h3>Activity</h3>
              </div>
              <div className="card__body">
                {audit.isLoading && !audit.data ? (
                  <p className="muted small">Loading...</p>
                ) : (
                  <AuditTimeline entries={audit.data ? audit.data.data : []} />
                )}
              </div>
            </div>
          )}
        </aside>
      </div>

      <Modal
        open={rejectOpen}
        title="Reject this post"
        onClose={() => setRejectOpen(false)}
        footer={
          <>
            <Button onClick={() => setRejectOpen(false)} disabled={busyAction === 'reject'}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleReject} loading={busyAction === 'reject'}>
              Reject post
            </Button>
          </>
        }
      >
        <Field
          label="Reason for rejection"
          required
          hint="The author sees this message and can edit the post before resubmitting."
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
      </Modal>

      <ConfirmDialog
        open={confirm === 'publish'}
        title="Publish this post?"
        message={`This creates a publish job in the database and triggers n8n for ${platforms.length} platform(s). Successful platforms are never republished.`}
        confirmLabel="Publish now"
        tone="primary"
        busy={busyAction === 'publish'}
        onConfirm={handlePublish}
        onCancel={() => setConfirm(null)}
      />

      <ConfirmDialog
        open={confirm === 'archive'}
        title="Archive this post?"
        message="Archived posts stay in the system and keep their publishing history, but drop out of the active workflow."
        confirmLabel="Archive"
        tone="warning"
        busy={busyAction === 'archive'}
        onConfirm={() =>
          runAction('archive', () => newsApi.archive(id), {
            title: 'Post archived',
            text: 'It no longer appears in the active workflow.',
          })
        }
        onCancel={() => setConfirm(null)}
      />

      <ConfirmDialog
        open={confirm === 'delete'}
        title="Delete this post?"
        message="The post and every media file attached to it will be permanently removed."
        confirmLabel="Delete post"
        busy={busyAction === 'delete'}
        onConfirm={handleDelete}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
