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
  createClientAdmin,
  createClientUser,
  getClientUsers,
} from '../../services/clientUsersApi.js';
import { useAuth } from '../../context/AuthContext.jsx';

import './client-users.css';
import './client-users-add-user-panel.css';

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
            onViewUser={
              (user) =>
                navigate(
                  `/client/users/${user.user_id}`
                )
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

  useEffect(() => {
    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      'hidden';

    function handleKeyDown(event) {
      if (
        event.key === 'Escape' &&
        !submitting
      ) {
        onCancel();
      }
    }

    window.addEventListener(
      'keydown',
      handleKeyDown
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;

      window.removeEventListener(
        'keydown',
        handleKeyDown
      );
    };
  }, [onCancel, submitting]);

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

    const basePayload = {
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
    };

    try {
      /*
       * PLATFORM_ADMIN creates the first CLIENT_ADMIN
       * through POST /api/client/admin.
       *
       * CLIENT_ADMIN creates CONTENT_CREATOR / APPROVER
       * through POST /api/client/users.
       */
      const data =
        isPlatformAdmin
          ? await createClientAdmin(
              basePayload
            )
          : await createClientUser({
              ...basePayload,
              role:
                form.role,
            });

      const user =
        data?.data?.user ??
        data?.user ??
        null;

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
        isPlatformAdmin
          ? 'Create client admin failed:'
          : 'Create client user failed:',
        err
      );

      const message =
        err?.response?.data?.message ||
        err?.data?.message ||
        err?.message ||
        (
          isPlatformAdmin
            ? 'Unable to create client administrator.'
            : 'Unable to create user.'
        );

      setServerError(message);
    } finally {
      setSubmitting(false);
    }
  }

  const selectedRole =
    isPlatformAdmin
      ? 'CLIENT_ADMIN'
      : form.role;

  const selectedRoleDescription =
    selectedRole === 'CLIENT_ADMIN'
      ? 'Full client-level administration, including managing client users.'
      : selectedRole === 'APPROVER'
        ? 'Reviews submitted content and approves it before publishing.'
        : 'Creates and submits content for review and approval.';

  function handleBackdropMouseDown(
    event
  ) {
    if (
      event.target === event.currentTarget &&
      !submitting
    ) {
      onCancel();
    }
  }

  return (
    <div
      className="client-user-modal-backdrop"
      role="presentation"
      onMouseDown={
        handleBackdropMouseDown
      }
    >
      <section
        className="client-user-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-client-user-title"
        aria-describedby="add-client-user-description"
        aria-busy={submitting}
      >
        <header className="client-user-modal__header">
          <div className="client-user-modal__heading">
            <div
              className="client-user-modal__icon"
              aria-hidden="true"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="8.5" cy="7" r="4" />
                <path d="M19 8v6" />
                <path d="M22 11h-6" />
              </svg>
            </div>

            <div>
              <span className="client-user-modal__eyebrow">
                User Management
              </span>

              <h2 id="add-client-user-title">
                Add Client User
              </h2>

              <p id="add-client-user-description">
                {isPlatformAdmin
                  ? 'Create the primary administrator account for this client.'
                  : 'Create a user and assign the right level of access for their responsibilities.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            className="client-user-modal__close"
            onClick={onCancel}
            disabled={submitting}
            aria-label="Close add user form"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </header>

        <form
          className="client-user-modal__form"
          onSubmit={handleSubmit}
          noValidate
        >
          <div className="client-user-modal__body">
            {serverError && (
              <div
                className="client-user-modal__alert"
                role="alert"
                aria-live="polite"
              >
                <span
                  className="client-user-modal__alert-icon"
                  aria-hidden="true"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 8v5" />
                    <path d="M12 16.5h.01" />
                  </svg>
                </span>

                <div>
                  <strong>
                    Unable to create user
                  </strong>
                  <p>{serverError}</p>
                </div>
              </div>
            )}

            <section className="client-user-form-section">
              <div className="client-user-form-section__heading">
                <div>
                  <span className="client-user-form-section__number">
                    01
                  </span>

                  <div>
                    <h3>
                      Account details
                    </h3>
                    <p>
                      Enter the information the user will use for their account.
                    </p>
                  </div>
                </div>

                <span className="client-user-form-section__required-note">
                  * Required fields
                </span>
              </div>

              <div className="client-user-modal__grid">
                <FormField
                  label="Username"
                  name="username"
                  value={form.username}
                  error={errors.username}
                  hint="3-100 letters, numbers, dots, underscores or hyphens."
                  placeholder="sanjay.creator"
                  onChange={handleChange}
                  disabled={submitting}
                  autoComplete="username"
                  required
                />

                <FormField
                  label="Full Name"
                  name="fullName"
                  value={form.fullName}
                  error={errors.fullName}
                  placeholder="Sanjay Kumar"
                  onChange={handleChange}
                  disabled={submitting}
                  autoComplete="name"
                  required
                />

                <FormField
                  label="Email Address"
                  name="email"
                  type="email"
                  value={form.email}
                  error={errors.email}
                  hint="Used for account communication and sign-in recovery."
                  placeholder="sanjay@company.com"
                  onChange={handleChange}
                  disabled={submitting}
                  autoComplete="email"
                  required
                />

                <FormField
                  label="Temporary Password"
                  name="password"
                  type="password"
                  value={form.password}
                  error={errors.password}
                  hint="Use at least 8 characters."
                  placeholder="Minimum 8 characters"
                  onChange={handleChange}
                  disabled={submitting}
                  autoComplete="new-password"
                  required
                />
              </div>
            </section>

            <div className="client-user-modal__divider" />

            <section className="client-user-form-section">
              <div className="client-user-form-section__heading">
                <div>
                  <span className="client-user-form-section__number">
                    02
                  </span>

                  <div>
                    <h3>
                      Access & permissions
                    </h3>
                    <p>
                      Assign the role that matches this user&apos;s responsibilities.
                    </p>
                  </div>
                </div>
              </div>

              {isPlatformAdmin ? (
                <div className="client-user-role-fixed">
                  <div className="client-user-role-fixed__icon">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M12 3 4 7v5c0 5 3.4 8 8 9 4.6-1 8-4 8-9V7l-8-4Z" />
                      <path d="m9 12 2 2 4-4" />
                    </svg>
                  </div>

                  <div className="client-user-role-fixed__content">
                    <span className="client-user-role-fixed__label">
                      Assigned role
                    </span>
                    <strong>
                      Client Admin
                    </strong>
                    <p>
                      Platform Admin can create one active Client Admin for this client. This role has client-level user management access.
                    </p>
                  </div>

                  <span className="client-user-role-fixed__badge">
                    Required
                  </span>
                </div>
              ) : (
                <div className="client-user-role-control">
                  <div className="client-user-field client-user-field--role">
                    <label htmlFor="userRole">
                      User Role
                      <span
                        className="client-user-field__required"
                        aria-hidden="true"
                      >
                        *
                      </span>
                    </label>

                    <div className="client-user-select-wrap">
                      <select
                        id="userRole"
                        name="role"
                        value={form.role}
                        onChange={handleChange}
                        disabled={submitting}
                        aria-invalid={Boolean(errors.role)}
                      >
                        <option value="CONTENT_CREATOR">
                          Content Creator
                        </option>

                        <option value="APPROVER">
                          Approver
                        </option>
                      </select>

                      <span
                        className="client-user-select-wrap__icon"
                        aria-hidden="true"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </span>
                    </div>

                    {errors.role && (
                      <span
                        className="client-user-field__error"
                        role="alert"
                      >
                        {errors.role}
                      </span>
                    )}
                  </div>

                  <div className="client-user-role-preview">
                    <div className="client-user-role-preview__top">
                      <span className="client-user-role-preview__badge">
                        {ROLE_LABELS[selectedRole]}
                      </span>

                      <span className="client-user-role-preview__status">
                        Active on creation
                      </span>
                    </div>

                    <p>
                      {selectedRoleDescription}
                    </p>
                  </div>
                </div>
              )}
            </section>
          </div>

          <footer className="client-user-modal__footer">
            <div className="client-user-modal__footer-note">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 11v5" />
                <path d="M12 8h.01" />
              </svg>

              <span>
                Review the details before creating the account.
              </span>
            </div>

            <div className="client-user-modal__actions">
              <button
                type="button"
                className="client-user-modal__button client-user-modal__button--secondary"
                onClick={onCancel}
                disabled={submitting}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="client-user-modal__button client-user-modal__button--primary"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <span
                      className="client-user-modal__spinner"
                      aria-hidden="true"
                    />
                    Creating user...
                  </>
                ) : (
                  <>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="8.5" cy="7" r="4" />
                      <path d="M19 8v6" />
                      <path d="M22 11h-6" />
                    </svg>
                    Create User
                  </>
                )}
              </button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  );
}


function UsersTable({
  users,
  onViewUser,
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
            <th>Action</th>
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
                onView={() =>
                  onViewUser(
                    user
                  )
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
  onView,
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

      <td>
        <Button
          type="button"
          variant="secondary"
          onClick={
            onView
          }
        >
          View
        </Button>
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
  hint,
  placeholder,
  onChange,
  disabled,
  autoComplete,
  required = false,
}) {
  const errorId =
    `${name}-error`;

  const hintId =
    `${name}-hint`;

  const describedBy = [
    hint ? hintId : null,
    error ? errorId : null,
  ]
    .filter(Boolean)
    .join(' ') || undefined;

  return (
    <div
      className={
        error
          ? 'client-user-field client-user-field--invalid'
          : 'client-user-field'
      }
    >
      <label
        htmlFor={name}
      >
        {label}

        {required && (
          <span
            className="client-user-field__required"
            aria-hidden="true"
          >
            *
          </span>
        )}
      </label>

      <input
        id={name}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        required={required}
      />

      {hint && !error && (
        <span
          id={hintId}
          className="client-user-field__help"
        >
          {hint}
        </span>
      )}

      {error && (
        <span
          id={errorId}
          className="client-user-field__error"
          role="alert"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5" />
            <path d="M12 16.5h.01" />
          </svg>
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