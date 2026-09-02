import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  useNavigate,
} from 'react-router-dom';

import {
  Button,
} from '../../components/Button.jsx';

import {
  useToast,
} from '../../context/ToastContext.jsx';

import {
  createClientUser,
  getClientUsers,
} from '../../services/clientUsersApi.js';
import { useAuth } from '../../context/AuthContext.jsx';

import './client-users.css';

const INITIAL_FORM = {
  username: '',
  fullName: '',
  email: '',
  password: '',
  role: '',
};

const ROLE_LABELS = {
  CLIENT_ADMIN:
    'Client Admin',

  CONTENT_CREATOR:
    'Content Creator',

  APPROVER:
    'Approver',
};

export default function ClientUsersPage() {

  const navigate =
    useNavigate();

  const toast =
    useToast();

  const { user: currentUser } = useAuth();

  const isPlatformAdmin =
    currentUser?.role === 'PLATFORM_ADMIN';

  const isClientAdmin =
    currentUser?.role === 'CLIENT_ADMIN';

  const canCreateUsers =
    isPlatformAdmin || isClientAdmin;

  const [client, setClient] =
    useState(null);

  const [users, setUsers] =
    useState([]);

  const hasActiveClientAdmin =
    useMemo(
      () =>
        users.some(
          (user) =>
            user.role === 'CLIENT_ADMIN' &&
            user.is_active === true
        ),
      [users]
    );

  const canShowAddUser =
    canCreateUsers &&
    (
      !isPlatformAdmin ||
      !hasActiveClientAdmin
    );

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState('');


  const [
    showAddUser,
    setShowAddUser,
  ] = useState(false);

  const [search, setSearch] =
    useState('');

  const [
    roleFilter,
    setRoleFilter,
  ] = useState('ALL');

  const loadUsers = useCallback(
    async ({
      signal,
      silent = false,
    } = {}) => {
      if (!silent) {
        setLoading(true);
      }

      setError('');

      try {
        const responseData =
          await getClientUsers({ signal });

        const payload =
          responseData?.data;

        if (!payload) {
          throw new Error(
            'Client user response data is missing.'
          );
        }

        const clientData =
          payload.client;

        const userList =
          payload.items;

        if (!clientData) {
          throw new Error(
            'Client information was not returned by the server.'
          );
        }

        if (!Array.isArray(userList)) {
          console.error(
            'Invalid client user items:',
            userList
          );

          throw new Error(
            'The server returned an invalid user list.'
          );
        }

        setClient(clientData);
        setUsers(userList);

      } catch (err) {
        if (
          err?.name ===
          'AbortError'
        ) {
          return;
        }

        console.error(
          'Load client users failed:',
          err
        );

        setError(
          err instanceof Error
            ? err.message
            : 'Unable to load client users.'
        );
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    const controller =
      new AbortController();

    const timerId =
      window.setTimeout(() => {
        loadUsers({
          signal:
            controller.signal,
        });
      }, 0);

    return () => {
      window.clearTimeout(timerId);
      controller.abort();
    };
  }, [loadUsers]);

  const filteredUsers =
    useMemo(() => {
      const term =
        search
          .trim()
          .toLowerCase();

      return users.filter(
        (user) => {
          if (
            roleFilter !==
            'ALL' &&
            user.role !==
            roleFilter
          ) {
            return false;
          }

          if (!term) {
            return true;
          }

          const searchable =
            [
              user.username,
              user.full_name,
              user.email,
              user.role,
            ]
              .filter(Boolean)
              .join(' ')
              .toLowerCase();

          return searchable.includes(
            term
          );
        }
      );
    }, [
      users,
      search,
      roleFilter,
    ]);



  const summary =
    useMemo(
      () => ({
        total:
          users.length,

        admins:
          users.filter(
            (user) =>
              user.role ===
              'CLIENT_ADMIN'
          ).length,

        creators:
          users.filter(
            (user) =>
              user.role ===
              'CONTENT_CREATOR'
          ).length,

        approvers:
          users.filter(
            (user) =>
              user.role ===
              'APPROVER'
          ).length,
      }),
      [users]
    );

  function handleUserCreated(
    user
  ) {
    setUsers(
      (current) => [
        user,
        ...current,
      ]
    );

    setShowAddUser(false);

    toast.success(
      'User created',
      `${user.full_name || user.username || 'User'} was added successfully.`
    );
  }

  if (loading) {
    return (
      <PageState>
        <div className="client-users-loader" />

        <p>
          Loading client users...
        </p>
      </PageState>
    );
  }
  if (error && !client) {
    return (
      <PageState>
        <h2>
          Unable to load users
        </h2>

        <p>
          {error}
        </p>

        <div className="client-users-state__actions">
          <Button
            onClick={() =>
              loadUsers()
            }
          >
            Retry
          </Button>

          <Button
            variant="secondary"
            onClick={() =>
              navigate('/clients')
            }
          >
            Back to Clients
          </Button>
        </div>
      </PageState>
    );
  }

  return (
    <main className="client-users-page">

      <header className="client-users-header">

        <div>
          <button
            type="button"
            className="client-users-back"
            onClick={() =>
              navigate('/client')
            }
          >
            ← Back to Client
          </button>

          <p className="client-users-header__eyebrow">
            Client Management
          </p>

          <h1>
            Client Users
          </h1>

          <p className="client-users-header__description">
            Manage users for{' '}
            <strong>
              {
                client
                  ?.business_name
              }
            </strong>
            .
          </p>
        </div>

        {canShowAddUser && (
          <Button
            onClick={() =>
              setShowAddUser(true)
            }
          >
            + Add User
          </Button>
        )}

      </header>

      <section
        className="client-users-summary"
        aria-label="User summary"
      >

        <SummaryCard
          label="Total Users"
          value={
            summary.total
          }
        />

        <SummaryCard
          label="Client Admins"
          value={
            summary.admins
          }
        />

        <SummaryCard
          label="Content Creators"
          value={
            summary.creators
          }
        />

        <SummaryCard
          label="Approvers"
          value={
            summary.approvers
          }
        />

      </section>

      {showAddUser && canShowAddUser && (
        <AddUserPanel
          isPlatformAdmin={isPlatformAdmin}
          onCancel={() =>
            setShowAddUser(false)
          }
          onCreated={
            handleUserCreated
          }
        />
      )}

      <section className="client-users-panel">

        <div className="client-users-toolbar">

          <div className="client-users-search">
            <label
              htmlFor="userSearch"
              className="sr-only"
            >
              Search users
            </label>

            <input
              id="userSearch"
              type="search"
              value={
                search
              }
              onChange={
                (event) =>
                  setSearch(
                    event.target.value
                  )
              }
              placeholder="Search name, username or email..."
            />
          </div>

          {!isPlatformAdmin && (
            <div className="client-users-filter">
              <label htmlFor="roleFilter">
                Role
              </label>

              <select
                id="roleFilter"
                value={roleFilter}
                onChange={(event) =>
                  setRoleFilter(event.target.value)
                }
              >
                <option value="ALL">
                  All Roles
                </option>

                <option value="CLIENT_ADMIN">
                  Client Admin
                </option>

                <option value="CONTENT_CREATOR">
                  Content Creator
                </option>

                <option value="APPROVER">
                  Approver
                </option>
              </select>
            </div>
          )}


          <Button
            variant="ghost"
            onClick={() =>
              loadUsers({
                silent: true,
              })
            }
          >
            Refresh
          </Button>

        </div>

        {error && (
          <div
            className="client-users-inline-error"
            role="alert"
          >
            {error}
          </div>
        )}

        {filteredUsers.length ===
          0 ? (
          <EmptyUsers
            hasFilter={
              Boolean(
                search.trim()
              ) ||
              roleFilter !==
              'ALL'
            }
            onAdd={
              canShowAddUser
                ? () =>
                    setShowAddUser(
                      true
                    )
                : null
            }
          />
        ) : (
          <UsersTable
            users={
              filteredUsers
            }
          />
        )}

      </section>

    </main>
  );
}

function AddUserPanel({
  isPlatformAdmin,
  onCancel,
  onCreated,
}) {
  const [form, setForm] = useState(() => ({
    ...INITIAL_FORM,
    role: isPlatformAdmin
      ? 'CLIENT_ADMIN'
      : 'CONTENT_CREATOR',
  }));

  const [errors, setErrors] =
    useState({});

  const [submitting, setSubmitting] =
    useState(false);

  const [
    serverError,
    setServerError,
  ] = useState('');

  function handleChange(
    event
  ) {
    const {
      name,
      value,
    } = event.target;

    setForm(
      (current) => ({
        ...current,
        [name]: value,
      })
    );

    if (errors[name]) {
      setErrors(
        (current) => ({
          ...current,
          [name]: '',
        })
      );
    }

    if (serverError) {
      setServerError('');
    }
  }

  function validate() {
    const nextErrors = {};

    const username =
      form.username.trim();

    const fullName =
      form.fullName.trim();

    const email =
      form.email
        .trim()
        .toLowerCase();

    const roleToSubmit =
      isPlatformAdmin
        ? 'CLIENT_ADMIN'
        : form.role;

    if (!username) {
      nextErrors.username =
        'Username is required.';
    } else if (
      !/^[a-zA-Z0-9._-]{3,100}$/.test(
        username
      )
    ) {
      nextErrors.username =
        'Use 3-100 letters, numbers, dots, underscores or hyphens.';
    }

    if (!fullName) {
      nextErrors.fullName =
        'Full name is required.';
    }

    if (!email) {
      nextErrors.email =
        'Email is required.';
    } else if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        email
      )
    ) {
      nextErrors.email =
        'Enter a valid email address.';
    }

    if (
      !form.password ||
      form.password.length < 8
    ) {
      nextErrors.password =
        'Password must contain at least 8 characters.';
    }

    if (
      ![
        'CLIENT_ADMIN',
        'CONTENT_CREATOR',
        'APPROVER',
      ].includes(roleToSubmit)
    ) {
      nextErrors.role =
        'Select a valid role.';
    }

    return nextErrors;
  }

  async function handleSubmit(
    event
  ) {
    event.preventDefault();

    if (submitting) {
      return;
    }

    setServerError('');

    const validationErrors =
      validate();

    if (
      Object.keys(
        validationErrors
      ).length > 0
    ) {
      setErrors(
        validationErrors
      );

      return;
    }

    setErrors({});
    setSubmitting(true);

    const roleToSubmit =
      isPlatformAdmin
        ? 'CLIENT_ADMIN'
        : form.role;

    try {
      const data =
        await createClientUser({
          username:
            form.username
              .trim()
              .toLowerCase(),

          fullName:
            form.fullName.trim(),

          email:
            form.email
              .trim()
              .toLowerCase(),

          password:
            form.password,

          role:
            roleToSubmit,
        });

      const user =
        data?.data?.user;

      if (
        !user ||
        !user.user_id
      ) {
        console.error(
          'Unexpected create-user response:',
          data
        );

        throw new Error(
          'User was created, but the server returned an invalid response.'
        );
      }

      onCreated(user);
    } catch (err) {
      console.error(
        'Create client user failed:',
        err
      );

      const message =
        err?.response?.data?.message ||
        err?.data?.message ||
        err?.message ||
        'Unable to create user.';

      setServerError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="client-user-form-card">

      <div className="client-user-form-card__header">

        <div>
          <h2>
            Add Client User
          </h2>

          <p>
            {isPlatformAdmin
              ? 'Create the Client Administrator for this client.'
              : 'Create a Content Creator or Approver for this client.'}
          </p>
        </div>

        <button
          type="button"
          className="client-user-form-close"
          onClick={onCancel}
          disabled={submitting}
          aria-label="Close add user form"
        >
          ×
        </button>

      </div>

      {serverError && (
        <div
          className="client-users-inline-error"
          role="alert"
          aria-live="polite"
        >
          {serverError}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        noValidate
      >

        <div className="client-user-form-grid">

          <FormField
            label="Username"
            name="username"
            value={form.username}
            error={errors.username}
            placeholder="sanjay.creator"
            onChange={handleChange}
            disabled={submitting}
            autoComplete="username"
          />

          <FormField
            label="Full Name"
            name="fullName"
            value={form.fullName}
            error={errors.fullName}
            placeholder="Sanjay Content Creator"
            onChange={handleChange}
            disabled={submitting}
            autoComplete="name"
          />

          <FormField
            label="Email"
            name="email"
            type="email"
            value={form.email}
            error={errors.email}
            placeholder="creator@example.com"
            onChange={handleChange}
            disabled={submitting}
            autoComplete="email"
          />

          <FormField
            label="Temporary Password"
            name="password"
            type="password"
            value={form.password}
            error={errors.password}
            placeholder="Minimum 8 characters"
            onChange={handleChange}
            disabled={submitting}
            autoComplete="new-password"
          />

          {isPlatformAdmin ? (
            <div className="client-user-field">
              <label htmlFor="userRoleDisplay">
                Role
              </label>

              <input
                id="userRoleDisplay"
                type="text"
                value="Client Admin"
                disabled
                readOnly
              />

              <span className="client-user-field__help">
                Platform Admin can create one active Client Admin for this client.
              </span>
            </div>
          ) : (
            <div className="client-user-field">
              <label htmlFor="userRole">
                Role
              </label>

              <select
                id="userRole"
                name="role"
                value={form.role}
                onChange={handleChange}
                disabled={submitting}
              >
                <option value="CONTENT_CREATOR">
                  Content Creator
                </option>

                <option value="APPROVER">
                  Approver
                </option>
              </select>

              <span className="client-user-field__help">
                Client Admin can create Content Creators and Approvers.
              </span>

              {errors.role && (
                <span
                  className="client-user-field__error"
                  role="alert"
                >
                  {errors.role}
                </span>
              )}
            </div>
          )}

        </div>

        <div className="client-user-form-actions">

          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </Button>

          <button
            type="submit"
            className="client-user-submit-button"
            disabled={submitting}
          >
            {submitting
              ? 'Creating...'
              : 'Create User'}
          </button>

        </div>

      </form>

    </section>
  );
}

function UsersTable({
  users,
}) {
  return (
    <div className="client-users-table-wrapper">

      <table className="client-users-table">

        <thead>
          <tr>
            <th>User</th>
            <th>Username</th>
            <th>Role</th>
            <th>Status</th>
            <th>Last Login</th>
            <th>Created</th>
          </tr>
        </thead>

        <tbody>
          {users.map(
            (user) => (
              <UserRow
                key={
                  user.user_id
                }
                user={
                  user
                }
              />
            )
          )}
        </tbody>

      </table>

    </div>
  );
}

function UserRow({
  user,
}) {
  return (
    <tr>

      <td>
        <div className="client-user-identity">

          <div
            className="client-user-avatar"
            aria-hidden="true"
          >
            {getInitials(
              user.full_name
            )}
          </div>

          <div>
            <strong>
              {
                user.full_name
              }
            </strong>

            <a
              href={`mailto:${user.email}`}
            >
              {
                user.email
              }
            </a>
          </div>

        </div>
      </td>

      <td>
        <span className="client-user-username">
          {
            user.username
          }
        </span>
      </td>

      <td>
        <RoleBadge
          role={
            user.role
          }
        />
      </td>

      <td>
        <StatusBadge
          active={
            user.is_active
          }
        />
      </td>

      <td>
        {formatDateTime(
          user.last_login_at
        )}
      </td>

      <td>
        {formatDate(
          user.created_at
        )}
      </td>

    </tr>
  );
}

function RoleBadge({
  role,
}) {
  return (
    <span
      className={`client-user-role client-user-role--${String(
        role
      )
        .toLowerCase()
        .replaceAll(
          '_',
          '-'
        )}`}
    >
      {
        ROLE_LABELS[role] ||
        role
      }
    </span>
  );
}

function StatusBadge({
  active,
}) {
  return (
    <span
      className={
        active
          ? 'client-user-status client-user-status--active'
          : 'client-user-status client-user-status--inactive'
      }
    >
      <span
        className="client-user-status__dot"
        aria-hidden="true"
      />

      {active
        ? 'Active'
        : 'Inactive'}
    </span>
  );
}

function SummaryCard({
  label,
  value,
}) {
  return (
    <article className="client-users-summary-card">

      <span>
        {label}
      </span>

      <strong>
        {value}
      </strong>

    </article>
  );
}

function FormField({
  label,
  name,
  type = 'text',
  value,
  error,
  placeholder,
  onChange,
  disabled,
  autoComplete,
}) {
  const errorId =
    `${name}-error`;

  return (
    <div className="client-user-field">

      <label
        htmlFor={name}
      >
        {label}
      </label>

      <input
        id={name}
        name={name}
        type={type}
        value={value}
        onChange={
          onChange
        }
        placeholder={
          placeholder
        }
        disabled={
          disabled
        }
        autoComplete={
          autoComplete
        }
        aria-invalid={
          Boolean(error)
        }
        aria-describedby={
          error
            ? errorId
            : undefined
        }
      />

      {error && (
        <span
          id={errorId}
          className="client-user-field__error"
        >
          {error}
        </span>
      )}

    </div>
  );
}

function EmptyUsers({
  hasFilter,
  onAdd,
}) {
  return (
    <div className="client-users-empty">

      <h2>
        {hasFilter
          ? 'No matching users'
          : 'No client users yet'}
      </h2>

      <p>
        {hasFilter
          ? 'Try changing your search or role filter.'
          : 'Add a client administrator, content creator or approver.'}
      </p>

      {!hasFilter && onAdd && (
        <Button
          onClick={onAdd}
        >
          + Add User
        </Button>
      )}

    </div>
  );
}

function PageState({
  children,
}) {
  return (
    <div className="client-users-page">
      <div className="client-users-state">
        {children}
      </div>
    </div>
  );
}

function getInitials(
  value = ''
) {
  return String(value)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(
      (word) =>
        word
          .charAt(0)
          .toUpperCase()
    )
    .join('');
}

function formatDate(
  value
) {
  if (!value) {
    return '—';
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return '—';
  }

  return new Intl.DateTimeFormat(
    'en-IN',
    {
      dateStyle: 'medium',
    }
  ).format(date);
}

function formatDateTime(
  value
) {
  if (!value) {
    return 'Never';
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return 'Never';
  }

  return new Intl.DateTimeFormat(
    'en-IN',
    {
      dateStyle: 'medium',
      timeStyle: 'short',
    }
  ).format(date);
}