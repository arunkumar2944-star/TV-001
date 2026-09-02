import { useState } from 'react';
import { Link } from 'react-router-dom';
import { userApi } from '../services/endpoints.js';
import { useAsync } from '../hooks/useAsync.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Button } from '../components/Button.jsx';
import { Badge } from '../components/Badge.jsx';
import { Field, TextInput } from '../components/Field.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { ConfirmDialog } from '../components/Modal.jsx';
import { LoadingState, ErrorState, EmptyState, Alert } from '../components/States.jsx';
import { formatDateTime, formatRelative } from '../utils/format.js';

export default function UsersPage() {
  useDocumentTitle('Users');

  const { user: currentUser } = useAuth();
  const toast = useToast();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [roleFilter, setRoleFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput, 350);

  const [statusTarget, setStatusTarget] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const users = useAsync(
    ({ signal }) =>
      userApi.list(
        {
          page,
          pageSize,
          role: roleFilter || undefined,
          isActive: activeFilter || undefined,
          search: search || undefined,
        },
        { signal }
      ),
    [page, pageSize, roleFilter, activeFilter, search]
  );

  const items = users.data ? users.data.data : [];
  const pagination = users.data ? users.data.pagination : null;

  async function toggleStatus() {
    if (!statusTarget) return;
    setBusy(true);
    try {
      await userApi.setStatus(statusTarget.id, !statusTarget.is_active);
      toast.success(
        statusTarget.is_active ? 'Account deactivated' : 'Account activated',
        statusTarget.email
      );
      setStatusTarget(null);
      users.reload();
    } catch (error) {
      toast.error('Could not change the account status', error.message);
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    if (!resetTarget) return;
    if (newPassword.length < 10) {
      toast.warning('Password too short', 'Use at least 10 characters with upper, lower and a number.');
      return;
    }
    setBusy(true);
    try {
      await userApi.resetPassword(resetTarget.id, newPassword);
      toast.success('Password reset', `Hand the new password to ${resetTarget.full_name} securely.`);
      setResetTarget(null);
      setNewPassword('');
    } catch (error) {
      toast.error('Could not reset the password', error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div className="page-head__text">
          <h1>User management</h1>
          <p className="page-head__subtitle">
            Administrators only. Editors have the full newsroom workflow but cannot create or deactivate accounts.
          </p>
        </div>
        <div className="page-head__actions">
          <Link className="btn btn--primary" to="/internal/user-create">
            Create user
          </Link>
        </div>
      </div>

      <Alert tone="info" title="There is no public registration">
        New accounts are only created here, by an administrator. The API rejects account creation from anyone else,
        regardless of what the browser sends.
      </Alert>

      <div className="card">
        <div className="card__body">
          <div className="filters">
            <div className="field field--grow">
              <label className="field__label" htmlFor="tv-user-search">
                Search
              </label>
              <input
                id="tv-user-search"
                className="input"
                type="search"
                placeholder="Name, email or username..."
                value={searchInput}
                onChange={(event) => {
                  setSearchInput(event.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="tv-user-role">
                Role
              </label>
              <select
                id="tv-user-role"
                className="select"
                value={roleFilter}
                onChange={(event) => {
                  setRoleFilter(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">All roles</option>
                <option value="PLATFORM_ADMIN">Platform administrator</option>
                <option value="EDITOR">Editor</option>
              </select>
            </div>
            <div className="field">
              <label className="field__label" htmlFor="tv-user-active">
                Status
              </label>
              <select
                id="tv-user-active"
                className="select"
                value={activeFilter}
                onChange={(event) => {
                  setActiveFilter(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">All</option>
                <option value="true">Active</option>
                <option value="false">Deactivated</option>
              </select>
            </div>
          </div>
        </div>

        <div className="card__body card__body--flush">
          {users.isLoading && !users.data ? (
            <LoadingState label="Loading users..." />
          ) : users.error ? (
            <ErrorState error={users.error} onRetry={() => users.reload()} />
          ) : items.length === 0 ? (
            <EmptyState icon={'\u{1F465}'} title="No users found" text="Adjust the filters or create a new account." />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Last sign-in</th>
                    <th>Created</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((account) => {
                    const isSelf = Number(account.id) === Number(currentUser.id);
                    return (
                      <tr key={account.id}>
                        <td>
                          <strong>{account.full_name}</strong>
                          {isSelf && <span className="small muted"> (you)</span>}
                          {account.username && <div className="small muted">@{account.username}</div>}
                        </td>
                        <td className="small">{account.email}</td>
                        <td>
                          <Badge tone={account.role === 'PLATFORM_ADMIN' ? 'primary' : 'neutral'}>{account.role}</Badge>
                        </td>
                        <td>
                          <Badge tone={account.is_active ? 'success' : 'danger'} dot>
                            {account.is_active ? 'Active' : 'Deactivated'}
                          </Badge>
                        </td>
                        <td className="small muted nowrap">
                          {account.last_login_at ? formatRelative(account.last_login_at) : 'never'}
                        </td>
                        <td className="small muted nowrap" title={formatDateTime(account.created_at)}>
                          {formatRelative(account.created_at)}
                        </td>
                        <td>
                          <div className="table__actions">
                            <Button size="sm" onClick={() => setResetTarget(account)}>
                              Reset password
                            </Button>
                            <Button
                              size="sm"
                              variant={account.is_active ? 'ghost' : 'success'}
                              onClick={() => setStatusTarget(account)}
                              disabled={isSelf}
                              title={isSelf ? 'You cannot deactivate your own account' : undefined}
                            >
                              {account.is_active ? 'Deactivate' : 'Activate'}
                            </Button>
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
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(statusTarget)}
        title={statusTarget && statusTarget.is_active ? 'Deactivate this account?' : 'Activate this account?'}
        message={
          statusTarget
            ? statusTarget.is_active
              ? `${statusTarget.full_name} will be signed out and blocked from signing in again. Their posts and history stay intact.`
              : `${statusTarget.full_name} will be able to sign in again.`
            : ''
        }
        confirmLabel={statusTarget && statusTarget.is_active ? 'Deactivate' : 'Activate'}
        tone={statusTarget && statusTarget.is_active ? 'danger' : 'success'}
        busy={busy}
        onConfirm={toggleStatus}
        onCancel={() => setStatusTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(resetTarget)}
        title="Reset password"
        confirmLabel="Set new password"
        tone="primary"
        busy={busy}
        onConfirm={resetPassword}
        onCancel={() => {
          setResetTarget(null);
          setNewPassword('');
        }}
      >
        <p className="small muted mb-1">
          {resetTarget ? `${resetTarget.full_name} (${resetTarget.email})` : ''}
        </p>
        <Field
          label="New password"
          required
          hint="At least 10 characters with an uppercase letter, a lowercase letter and a number. Share it securely and ask them to change it."
        >
          {(props) => (
            <TextInput
              {...props}
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          )}
        </Field>
      </ConfirmDialog>
    </div>
  );
}
