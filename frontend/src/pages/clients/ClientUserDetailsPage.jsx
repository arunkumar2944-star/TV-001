import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  useNavigate,
  useParams,
} from 'react-router-dom';

import {
  Button,
} from '../../components/Button.jsx';

import {
  useAuth,
} from '../../context/AuthContext.jsx';

import {
  useToast,
} from '../../context/ToastContext.jsx';

import {
  getClientUserDetails,
  updateClientUserProfile,
  updateClientUserStatus,
} from '../../services/clientUsersApi.js';

import './client-user-details.css';


const ROLE_LABELS = {
  CLIENT_ADMIN:
    'Client Admin',

  CONTENT_CREATOR:
    'Content Creator',

  APPROVER:
    'Approver',
};


export default function ClientUserDetailsPage() {
  const navigate =
    useNavigate();

  const {
    userId,
  } = useParams();

  const {
    user: currentUser,
  } = useAuth();

  const toast =
    useToast();


  const [client, setClient] =
    useState(null);

  const [user, setUser] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState('');

  const [
    updatingStatus,
    setUpdatingStatus,
  ] = useState(false);

  const [
    showStatusConfirm,
    setShowStatusConfirm,
  ] = useState(false);

  const [
    showEditModal,
    setShowEditModal,
  ] = useState(false);


  // ====================================================
  // CURRENT ACTOR
  // ====================================================

  const actorRole =
    String(
      currentUser?.role ??
      ''
    )
      .trim()
      .toUpperCase();


  const isPlatformAdmin =
    actorRole ===
    'PLATFORM_ADMIN';

  const isClientAdmin =
    actorRole ===
    'CLIENT_ADMIN';


  // ====================================================
  // LOAD USER
  // ====================================================

  const loadUser =
    useCallback(
      async ({
        signal,
      } = {}) => {
        setLoading(true);
        setError('');

        try {
          const numericUserId =
            Number(userId);

          if (
            !Number.isInteger(
              numericUserId
            ) ||
            numericUserId <= 0
          ) {
            throw new Error(
              'Invalid user.'
            );
          }


          const response =
            await getClientUserDetails(
              numericUserId,
              {
                signal,
              }
            );


          const payload =
            response?.data;


          if (
            !payload?.user
          ) {
            throw new Error(
              'Client user information was not returned by the server.'
            );
          }


          setClient(
            payload.client ??
            null
          );

          setUser(
            payload.user
          );

        } catch (err) {
          if (
            err?.name ===
            'AbortError'
          ) {
            return;
          }


          console.error(
            'Load client user details failed:',
            err
          );


          setError(
            getErrorMessage(
              err,
              'Unable to load client user.'
            )
          );

        } finally {
          setLoading(false);
        }
      },
      [
        userId,
      ]
    );


  useEffect(() => {
    const controller =
      new AbortController();


    loadUser({
      signal:
        controller.signal,
    });


    return () => {
      controller.abort();
    };
  }, [
    loadUser,
  ]);


  // ====================================================
  // STATUS PERMISSION
  // ====================================================

  const canManageStatus =
    useMemo(() => {
      if (!user) {
        return false;
      }


      const targetRole =
        String(
          user.role ??
          ''
        )
          .trim()
          .toUpperCase();


      /*
       * PLATFORM_ADMIN manages only CLIENT_ADMIN.
       */
      if (
        isPlatformAdmin
      ) {
        return (
          targetRole ===
          'CLIENT_ADMIN'
        );
      }


      /*
       * CLIENT_ADMIN manages only:
       *
       * CONTENT_CREATOR
       * APPROVER
       */
      if (
        isClientAdmin
      ) {
        return [
          'CONTENT_CREATOR',
          'APPROVER',
        ].includes(
          targetRole
        );
      }


      return false;
    }, [
      user,
      isPlatformAdmin,
      isClientAdmin,
    ]);


  const nextStatus =
    user
      ? !user.is_active
      : false;


  // ====================================================
  // STATUS UPDATE
  // ====================================================

  async function handleStatusUpdate() {
    if (
      !user ||
      updatingStatus ||
      !canManageStatus
    ) {
      return;
    }


    setUpdatingStatus(true);
    setError('');


    try {
      const response =
        await updateClientUserStatus(
          user.user_id,
          nextStatus
        );


      const updatedUser =
        response?.data?.user;


      if (!updatedUser) {
        throw new Error(
          'The server did not return the updated user.'
        );
      }


      setUser(
        updatedUser
      );

      setShowStatusConfirm(
        false
      );


      toast.success(
        nextStatus
          ? 'User activated'
          : 'User deactivated',

        `${
          updatedUser.full_name ||
          updatedUser.username ||
          'User'
        } was ${
          nextStatus
            ? 'activated'
            : 'deactivated'
        } successfully.`
      );

    } catch (err) {
      console.error(
        'Update client user status failed:',
        err
      );


      const message =
        getErrorMessage(
          err,
          nextStatus
            ? 'Unable to activate user.'
            : 'Unable to deactivate user.'
        );


      setError(
        message
      );


      toast.error(
        'Status update failed',
        message
      );

    } finally {
      setUpdatingStatus(
        false
      );
    }
  }


  // ====================================================
  // LOADING
  // ====================================================

  if (loading) {
    return (
      <PageState>
        <div className="client-user-details-loader" />

        <p>
          Loading client user...
        </p>
      </PageState>
    );
  }


  // ====================================================
  // ERROR
  // ====================================================

  if (
    !user &&
    error
  ) {
    return (
      <PageState>

        <h2>
          Unable to load user
        </h2>

        <p>
          {error}
        </p>

        <div className="client-user-details-state-actions">

          <Button
            onClick={() =>
              loadUser()
            }
          >
            Retry
          </Button>

          <Button
            variant="secondary"
            onClick={() =>
              navigate(
                '/client/users'
              )
            }
          >
            Back to Client Users
          </Button>

        </div>

      </PageState>
    );
  }


  if (!user) {
    return null;
  }


  // ====================================================
  // PAGE
  // ====================================================

  return (
    <main className="client-user-details-page">

      {/* ============================================== */}
      {/* HEADER */}
      {/* ============================================== */}

      <header className="client-user-details-header">

        <div>

          <button
            type="button"
            className="client-user-details-back"
            onClick={() =>
              navigate(
                '/client/users'
              )
            }
          >
            ← Back to Client Users
          </button>


          <p className="client-user-details-eyebrow">
            Client Management
          </p>


          <h1>
            Client User Details
          </h1>


          {client && (
            <p className="client-user-details-description">
              User account for{' '}
              <strong>
                {
                  client.business_name
                }
              </strong>
            </p>
          )}

        </div>

      </header>


      {/* ============================================== */}
      {/* INLINE ERROR */}
      {/* ============================================== */}

      {error && (
        <div
          className="client-user-details-alert"
          role="alert"
        >
          {error}
        </div>
      )}


      {/* ============================================== */}
      {/* PROFILE */}
      {/* ============================================== */}

      <section className="client-user-details-profile">

        <div className="client-user-details-avatar">
          {getInitials(
            user.full_name
          )}
        </div>


        <div className="client-user-details-profile-info">

          <h2>
            {
              user.full_name
            }
          </h2>

          <a
            href={`mailto:${user.email}`}
          >
            {
              user.email
            }
          </a>

          <span>
            @
            {
              user.username
            }
          </span>

        </div>


        <div className="client-user-details-status">
          <StatusBadge
            active={
              user.is_active
            }
          />
        </div>

      </section>


      {/* ============================================== */}
      {/* ACCOUNT DETAILS */}
      {/* ============================================== */}

      <section className="client-user-details-card">

        <div className="client-user-details-card__header">

          <div>
            <span className="client-user-details-section-eyebrow">
              Account
            </span>

            <h2>
              Account Information
            </h2>

            <p>
              Basic account and access
              information for this user.
            </p>
          </div>

          {canManageStatus && (
            <button
              type="button"
              className="client-user-edit-button"
              onClick={() =>
                setShowEditModal(
                  true
                )
              }
              aria-haspopup="dialog"
            >
              <span
                className="client-user-edit-button__icon"
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
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" />
                </svg>
              </span>

              <span>
                Edit User
              </span>
            </button>
          )}

        </div>


        <div className="client-user-details-grid">

          <DetailItem
            label="Full Name"
            value={
              user.full_name
            }
          />


          <DetailItem
            label="Username"
            value={
              user.username
            }
          />


          <DetailItem
            label="Email Address"
            value={
              user.email
            }
          />


          <DetailItem
            label="Role"
            value={
              ROLE_LABELS[
                user.role
              ] ||
              user.role
            }
          />


          <DetailItem
            label="Account Status"
            value={
              user.is_active
                ? 'Active'
                : 'Inactive'
            }
          />


          <DetailItem
            label="Password Status"
            value={
              user.must_change_password
                ? 'Password change required'
                : 'Password updated'
            }
          />


          <DetailItem
            label="Email Verification"
            value={
              user.email_verified_at
                ? formatDateTime(
                    user.email_verified_at
                  )
                : 'Not verified'
            }
          />


          <DetailItem
            label="Last Login"
            value={
              formatDateTime(
                user.last_login_at
              )
            }
          />


          <DetailItem
            label="Created"
            value={
              formatDateTime(
                user.created_at
              )
            }
          />


          <DetailItem
            label="Last Updated"
            value={
              formatDateTime(
                user.updated_at
              )
            }
          />

        </div>

      </section>


      {/* ============================================== */}
      {/* ACCOUNT MANAGEMENT */}
      {/* ============================================== */}

      <section className="client-user-details-card">

        <div className="client-user-details-card__header">

          <div>

            <span className="client-user-details-section-eyebrow">
              Access Control
            </span>

            <h2>
              Account Management
            </h2>

            <p>
              Control whether this user
              can access the client workspace.
            </p>

          </div>

        </div>


        <div className="client-user-status-management">

          <div className="client-user-status-management__info">

            <StatusBadge
              active={
                user.is_active
              }
            />


            <div>

              <strong>
                {
                  user.is_active
                    ? 'Account is active'
                    : 'Account is inactive'
                }
              </strong>


              <p>
                {
                  user.is_active
                    ? 'This user can sign in and access the features allowed by their role.'
                    : 'This user cannot sign in or access this client workspace.'
                }
              </p>

            </div>

          </div>


          {canManageStatus ? (

            <button
              type="button"
              className={
                user.is_active
                  ? 'client-user-status-action client-user-status-action--danger'
                  : 'client-user-status-action client-user-status-action--activate'
              }
              onClick={() =>
                setShowStatusConfirm(
                  true
                )
              }
              disabled={
                updatingStatus
              }
            >

              {
                user.is_active
                  ? 'Deactivate User'
                  : 'Activate User'
              }

            </button>

          ) : (

            <div className="client-user-status-management__restricted">
              You do not have permission
              to change this user&apos;s status.
            </div>

          )}

        </div>

      </section>


      {/* ============================================== */}
      {/* CONFIRMATION MODAL */}
      {/* ============================================== */}

      {showStatusConfirm && (
        <StatusConfirmationModal
          user={
            user
          }
          activating={
            nextStatus
          }
          submitting={
            updatingStatus
          }
          onCancel={() =>
            setShowStatusConfirm(
              false
            )
          }
          onConfirm={
            handleStatusUpdate
          }
        />
      )}

      {showEditModal && (
        <EditUserModal
          user={
            user
          }
          onCancel={() =>
            setShowEditModal(
              false
            )
          }
          onUpdated={(
            updatedUser
          ) => {
            setUser(
              updatedUser
            );

            setShowEditModal(
              false
            );
          }}
          toast={
            toast
          }
        />
      )}

    </main>
  );
}


// ======================================================
// EDIT USER MODAL
// ======================================================

function EditUserModal({
  user,
  onCancel,
  onUpdated,
  toast,
}) {
  const [form, setForm] =
    useState({
      username:
        user.username ??
        '',

      fullName:
        user.full_name ??
        '',

      email:
        user.email ??
        '',
    });


  const [errors, setErrors] =
    useState({});

  const [
    serverError,
    setServerError,
  ] = useState('');

  const [
    submitting,
    setSubmitting,
  ] = useState(false);


  useEffect(() => {
    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      'hidden';


    function handleKeyDown(
      event
    ) {
      if (
        event.key ===
          'Escape' &&
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
  }, [
    onCancel,
    submitting,
  ]);


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
        [name]:
          value,
      })
    );


    if (
      errors[name]
    ) {
      setErrors(
        (current) => ({
          ...current,
          [name]:
            '',
        })
      );
    }


    if (
      serverError
    ) {
      setServerError('');
    }
  }


  function validate() {
    const nextErrors = {};


    const username =
      form.username
        .trim();

    const fullName =
      form.fullName
        .trim();

    const email =
      form.email
        .trim()
        .toLowerCase();


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


    return nextErrors;
  }


  async function handleSubmit(
    event
  ) {
    event.preventDefault();


    if (
      submitting
    ) {
      return;
    }


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


    setSubmitting(true);
    setErrors({});
    setServerError('');


    try {
      const response =
        await updateClientUserProfile(
          user.user_id,
          {
            username:
              form.username
                .trim()
                .toLowerCase(),

            fullName:
              form.fullName
                .trim(),

            email:
              form.email
                .trim()
                .toLowerCase(),
          }
        );


      const updatedUser =
        response?.data?.user;


      if (
        !updatedUser
      ) {
        throw new Error(
          'The server did not return the updated user.'
        );
      }


      onUpdated(
        updatedUser
      );


      toast.success(
        'User updated',
        `${
          updatedUser.full_name ||
          updatedUser.username ||
          'User'
        } was updated successfully.`
      );

    } catch (err) {
      console.error(
        'Update client user profile failed:',
        err
      );


      const message =
        getErrorMessage(
          err,
          'Unable to update client user.'
        );


      setServerError(
        message
      );

    } finally {
      setSubmitting(
        false
      );
    }
  }


  function handleBackdrop(
    event
  ) {
    if (
      event.target ===
        event.currentTarget &&
      !submitting
    ) {
      onCancel();
    }
  }


  return (
    <div
      className="client-user-edit-backdrop"
      onMouseDown={
        handleBackdrop
      }
      role="presentation"
    >

      <section
        className="client-user-edit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-user-title"
      >

        <header className="client-user-edit-modal__header">

          <div>
            <span>
              User Management
            </span>

            <h2 id="edit-user-title">
              Edit Client User
            </h2>

            <p>
              Update account information
              without changing this
              user&apos;s role.
            </p>
          </div>


          <button
            type="button"
            className="client-user-edit-modal__close"
            onClick={
              onCancel
            }
            disabled={
              submitting
            }
            aria-label="Close edit user form"
          >
            ×
          </button>

        </header>


        <form
          onSubmit={
            handleSubmit
          }
          noValidate
        >

          <div className="client-user-edit-modal__body">

            {serverError && (
              <div
                className="client-user-edit-modal__error"
                role="alert"
                aria-live="polite"
              >
                {serverError}
              </div>
            )}


            <EditField
              label="Full Name"
              name="fullName"
              value={
                form.fullName
              }
              error={
                errors.fullName
              }
              onChange={
                handleChange
              }
              disabled={
                submitting
              }
              autoComplete="name"
            />


            <EditField
              label="Username"
              name="username"
              value={
                form.username
              }
              error={
                errors.username
              }
              onChange={
                handleChange
              }
              disabled={
                submitting
              }
              autoComplete="username"
            />


            <EditField
              label="Email Address"
              name="email"
              type="email"
              value={
                form.email
              }
              error={
                errors.email
              }
              onChange={
                handleChange
              }
              disabled={
                submitting
              }
              autoComplete="email"
            />


            <div className="client-user-edit-role">

              <span>
                Role
              </span>

              <strong>
                {
                  ROLE_LABELS[
                    user.role
                  ] ||
                  user.role
                }
              </strong>

              <p>
                Role changes are not
                part of profile editing.
              </p>

            </div>

          </div>


          <footer className="client-user-edit-modal__footer">

            <button
              type="button"
              className="client-user-edit-modal__button client-user-edit-modal__button--secondary"
              onClick={
                onCancel
              }
              disabled={
                submitting
              }
            >
              Cancel
            </button>


            <button
              type="submit"
              className="client-user-edit-modal__button client-user-edit-modal__button--primary"
              disabled={
                submitting
              }
            >
              {
                submitting
                  ? 'Saving...'
                  : 'Save Changes'
              }
            </button>

          </footer>

        </form>

      </section>

    </div>
  );
}


// ======================================================
// EDIT FIELD
// ======================================================

function EditField({
  label,
  name,
  type = 'text',
  value,
  error,
  onChange,
  disabled,
  autoComplete,
}) {
  const errorId =
    `edit-${name}-error`;


  return (
    <div
      className={
        error
          ? 'client-user-edit-field client-user-edit-field--invalid'
          : 'client-user-edit-field'
      }
    >

      <label
        htmlFor={
          `edit-${name}`
        }
      >
        {label}
      </label>


      <input
        id={
          `edit-${name}`
        }
        name={
          name
        }
        type={
          type
        }
        value={
          value
        }
        onChange={
          onChange
        }
        disabled={
          disabled
        }
        autoComplete={
          autoComplete
        }
        aria-invalid={
          Boolean(
            error
          )
        }
        aria-describedby={
          error
            ? errorId
            : undefined
        }
      />


      {error && (
        <span
          id={
            errorId
          }
          role="alert"
        >
          {error}
        </span>
      )}

    </div>
  );
}


// ======================================================
// CONFIRMATION MODAL
// ======================================================

function StatusConfirmationModal({
  user,
  activating,
  submitting,
  onCancel,
  onConfirm,
}) {

  useEffect(() => {
    function handleKeyDown(
      event
    ) {
      if (
        event.key ===
          'Escape' &&
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
      window.removeEventListener(
        'keydown',
        handleKeyDown
      );
    };
  }, [
    onCancel,
    submitting,
  ]);


  function handleBackdrop(
    event
  ) {
    if (
      event.target ===
        event.currentTarget &&
      !submitting
    ) {
      onCancel();
    }
  }


  return (
    <div
      className="client-user-status-modal-backdrop"
      onMouseDown={
        handleBackdrop
      }
      role="presentation"
    >

      <section
        className="client-user-status-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="status-modal-title"
      >

        <div
          className={
            activating
              ? 'client-user-status-modal__icon client-user-status-modal__icon--activate'
              : 'client-user-status-modal__icon client-user-status-modal__icon--danger'
          }
          aria-hidden="true"
        >
          {activating
            ? '✓'
            : '!'}
        </div>


        <h2 id="status-modal-title">
          {
            activating
              ? 'Activate user?'
              : 'Deactivate user?'
          }
        </h2>


        <p>
          {activating
            ? (
              <>
                <strong>
                  {
                    user.full_name ||
                    user.username
                  }
                </strong>
                {' '}
                will be able to sign in
                and access the client
                workspace again.
              </>
            )
            : (
              <>
                <strong>
                  {
                    user.full_name ||
                    user.username
                  }
                </strong>
                {' '}
                will no longer be able
                to sign in or access this
                client workspace.
              </>
            )}
        </p>


        <div className="client-user-status-modal__actions">

          <button
            type="button"
            className="client-user-status-modal__button client-user-status-modal__button--secondary"
            onClick={
              onCancel
            }
            disabled={
              submitting
            }
          >
            Cancel
          </button>


          <button
            type="button"
            className={
              activating
                ? 'client-user-status-modal__button client-user-status-modal__button--activate'
                : 'client-user-status-modal__button client-user-status-modal__button--danger'
            }
            onClick={
              onConfirm
            }
            disabled={
              submitting
            }
          >

            {submitting
              ? (
                <>
                  <span className="client-user-status-modal__spinner" />

                  Updating...
                </>
              )
              : (
                activating
                  ? 'Activate User'
                  : 'Deactivate User'
              )}

          </button>

        </div>

      </section>

    </div>
  );
}


// ======================================================
// DETAIL ITEM
// ======================================================

function DetailItem({
  label,
  value,
}) {
  return (
    <div className="client-user-detail-item">

      <span>
        {label}
      </span>

      <strong>
        {
          value ||
          '—'
        }
      </strong>

    </div>
  );
}


// ======================================================
// STATUS BADGE
// ======================================================

function StatusBadge({
  active,
}) {
  return (
    <span
      className={
        active
          ? 'client-user-detail-status client-user-detail-status--active'
          : 'client-user-detail-status client-user-detail-status--inactive'
      }
    >

      <span
        className="client-user-detail-status__dot"
        aria-hidden="true"
      />

      {
        active
          ? 'Active'
          : 'Inactive'
      }

    </span>
  );
}


// ======================================================
// PAGE STATE
// ======================================================

function PageState({
  children,
}) {
  return (
    <main className="client-user-details-page">

      <div className="client-user-details-state">
        {children}
      </div>

    </main>
  );
}


// ======================================================
// HELPERS
// ======================================================

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
    return '—';
  }


  return new Intl.DateTimeFormat(
    'en-IN',
    {
      dateStyle:
        'medium',

      timeStyle:
        'short',
    }
  ).format(date);
}


function getErrorMessage(
  error,
  fallback
) {
  return (
    error?.response
      ?.data?.message ||
    error?.data
      ?.message ||
    error?.message ||
    fallback
  );
}