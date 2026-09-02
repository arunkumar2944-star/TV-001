import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { newsApi } from '../services/endpoints.js';
import { useAsync } from '../hooks/useAsync.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Button } from '../components/Button.jsx';
import { StatusBadge, PlatformChips } from '../components/Badge.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { ConfirmDialog } from '../components/Modal.jsx';
import { LoadingState, ErrorState, EmptyState } from '../components/States.jsx';
import { formatDateTime, formatRelative, truncate } from '../utils/format.js';
import { NEWS_STATUS_LIST, STATUS_META } from '../utils/constants.js';

export default function PostsPage() {
  useDocumentTitle('Posts');

  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const initialFilters = location.state?.filters || {};

  const [searchInput, setSearchInput] = useState(initialFilters.search || '');
  const search = useDebouncedValue(searchInput, 350);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [filters, setFilters] = useState({
    status: initialFilters.status || '',
    category: initialFilters.category || '',
    district: initialFilters.district || '',
    dateFrom: initialFilters.dateFrom || '',
    dateTo: initialFilters.dateTo || '',
    mine: initialFilters.mine || '',
    page: 1,
    pageSize: 20,
  });

  const options = useAsync(({ signal }) => newsApi.options({ signal }), []);

  const posts = useAsync(
    ({ signal }) =>
      newsApi.list(
        {
          search: search || undefined,
          status: filters.status || undefined,
          category: filters.category || undefined,
          district: filters.district || undefined,
          dateFrom: filters.dateFrom || undefined,
          dateTo: filters.dateTo || undefined,
          mine: filters.mine || undefined,
          page: filters.page,
          pageSize: filters.pageSize,
          sortBy: 'created_at',
          sortDir: 'desc',
        },
        { signal }
      ),
    [
      search,
      filters.status,
      filters.category,
      filters.district,
      filters.dateFrom,
      filters.dateTo,
      filters.mine,
      filters.page,
      filters.pageSize,
    ]
  );

  function updateFilter(key, value) {
    setFilters((current) => ({
      ...current,
      [key]: key === 'page' || key === 'pageSize' ? Number(value) : value,
      ...(key !== 'page' && key !== 'pageSize' ? { page: 1 } : {}),
      ...(key === 'pageSize' ? { page: 1 } : {}),
    }));
  }

  function clearFilters() {
    setSearchInput('');
    setFilters({
      status: '', category: '', district: '', dateFrom: '', dateTo: '', mine: '', page: 1, pageSize: 20,
    });
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await newsApi.remove(pendingDelete.id);
      toast.success('Post deleted', pendingDelete.headline);
      setPendingDelete(null);
      posts.reload();
    } catch (error) {
      toast.error('Could not delete the post', error.message);
    } finally {
      setDeleting(false);
    }
  }

  const items = posts.data ? posts.data.data : [];
  const pagination = posts.data ? posts.data.pagination : null;
  const meta = options.data ? options.data.data : { categories: [], districts: [] };
  const hasFilters = Boolean(
    search || filters.status || filters.category || filters.district || filters.dateFrom || filters.dateTo || filters.mine
  );

  return (
    <div className="stack">
      <div className="page-head">
        <div className="page-head__text">
          <h1>Posts</h1>
          <p className="page-head__subtitle">
            Every news post in the system. Search, filter and open a post to edit or move it through the workflow.
          </p>
        </div>
        <div className="page-head__actions">
          <Link className="btn btn--primary" to="/posts/new">
            New post
          </Link>
        </div>
      </div>

      <div className="card">
        <div className="card__body">
          <div className="filters">
            <div className="field field--grow">
              <label className="field__label" htmlFor="tv-search">
                Search
              </label>
              <input
                id="tv-search"
                className="input"
                type="search"
                placeholder="Headline, summary or content..."
                value={searchInput}
                onChange={(event) => {
                  setSearchInput(event.target.value);
                  setFilters((current) => ({ ...current, page: 1 }));
                }}
              />
            </div>

            <div className="field">
              <label className="field__label" htmlFor="tv-status">
                Status
              </label>
              <select
                id="tv-status"
                className="select"
                value={filters.status}
                onChange={(event) => updateFilter('status', event.target.value)}
              >
                <option value="">All statuses</option>
                {NEWS_STATUS_LIST.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_META[status] ? STATUS_META[status].label : status}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="tv-category">
                Category
              </label>
              <select
                id="tv-category"
                className="select"
                value={filters.category}
                onChange={(event) => updateFilter('category', event.target.value)}
              >
                <option value="">All categories</option>
                {(meta.categories || []).map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="tv-from">
                From
              </label>
              <input
                id="tv-from"
                className="input"
                type="date"
                value={filters.dateFrom}
                onChange={(event) => updateFilter('dateFrom', event.target.value)}
              />
            </div>

            <div className="field">
              <label className="field__label" htmlFor="tv-to">
                To
              </label>
              <input
                id="tv-to"
                className="input"
                type="date"
                value={filters.dateTo}
                onChange={(event) => updateFilter('dateTo', event.target.value)}
              />
            </div>

            <div className="field">
              <label className="field__label" htmlFor="tv-mine">
                Author
              </label>
              <select
                id="tv-mine"
                className="select"
                value={filters.mine}
                onChange={(event) => updateFilter('mine', event.target.value)}
              >
                <option value="">Everyone</option>
                <option value="true">Only my posts</option>
              </select>
            </div>

            <Button onClick={clearFilters} disabled={!hasFilters}>
              Clear
            </Button>
          </div>
        </div>

        <div className="card__body card__body--flush">
          {posts.isLoading && !posts.data ? (
            <LoadingState label="Loading posts..." />
          ) : posts.error ? (
            <ErrorState error={posts.error} onRetry={() => posts.reload()} />
          ) : items.length === 0 ? (
            <EmptyState
              icon={'\u{1F5DE}'}
              title={hasFilters ? 'No posts match these filters' : 'No posts yet'}
              text={
                hasFilters
                  ? 'Try a different search term, status or date range.'
                  : 'Create the first Trichy Vision news post.'
              }
              action={
                hasFilters ? (
                  <Button onClick={clearFilters}>Clear filters</Button>
                ) : (
                  <Link className="btn btn--primary" to="/posts/new">
                    Create a post
                  </Link>
                )
              }
            />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Headline</th>
                    <th>Created by</th>
                    <th>Category</th>
                    <th>Platforms</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Updated</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((post) => {
                    const canDelete =
                      ['DRAFT', 'REJECTED'].includes(post.status) &&
                      (isAdmin || Number(post.created_by) === Number(user.id));

                    return (
                      <tr key={post.id}>
                        <td className="table__id">#{post.id}</td>
                        <td>
                          <div className="headline-cell">
                            <Link className="headline-cell__title" to={`/posts/${post.id}`}>
                              {post.headline}
                            </Link>
                            {post.summary && (
                              <span className="headline-cell__meta">{truncate(post.summary, 90)}</span>
                            )}
                            {post.media_count > 0 && (
                              <span className="headline-cell__meta">
                                {post.media_count} media file{post.media_count === 1 ? '' : 's'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="small">{post.created_by_name || '-'}</td>
                        <td className="small muted">{post.category || '-'}</td>
                        <td>
                          <PlatformChips codes={post.platform_codes} empty="none" />
                        </td>
                        <td>
                          <StatusBadge status={post.status} />
                        </td>
                        <td className="small muted nowrap" title={formatDateTime(post.created_at)}>
                          {formatRelative(post.created_at)}
                        </td>
                        <td className="small muted nowrap" title={formatDateTime(post.updated_at)}>
                          {formatRelative(post.updated_at)}
                        </td>
                        <td>
                          <div className="table__actions">
                            <Link className="btn btn--sm" to={`/posts/${post.id}`}>
                              Open
                            </Link>
                            {canDelete && (
                              <Button size="sm" variant="ghost" onClick={() => setPendingDelete(post)}>
                                Delete
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {pagination && (
          <div className="card__foot">
            <Pagination
              pagination={pagination}
              onPageChange={(page) => updateFilter('page', page)}
              onPageSizeChange={(size) => updateFilter('pageSize', size)}
            />
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete this post?"
        message={
          pendingDelete
            ? `"${pendingDelete.headline}" and all of its media will be permanently removed. Published history is never deleted - only drafts and rejected posts can be removed.`
            : ''
        }
        confirmLabel="Delete post"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
