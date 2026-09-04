import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  useLocation,
  useNavigate,
} from 'react-router-dom';

import {
  Button,
} from '../../components/Button.jsx';

import {
  useToast,
} from '../../context/ToastContext.jsx';

import {
  useAuth,
} from '../../context/AuthContext.jsx';

import {
  api,
} from '../../services/apiClient.js';

import './client-details.css';

/**
 * --------------------------------------------------
 * PLATFORM DISPLAY NAME
 * --------------------------------------------------
 */
function formatPlatformName(
  platform
) {
  const labels = {
    facebook: 'Facebook',
    instagram: 'Instagram',
    whatsapp: 'WhatsApp',
    youtube: 'YouTube',
    telegram: 'Telegram',
    x: 'X',
    threads: 'Threads',
  };

  const code =
    String(platform || '')
      .trim()
      .toLowerCase();

  return (
    labels[code] ||
    platform
  );
}

/**
 * --------------------------------------------------
 * CLIENT DETAILS PAGE
 * --------------------------------------------------
 */
export default function ClientDetailsPage() {
  const navigate =
    useNavigate();

  const location =
    useLocation();

  const toast =
    useToast();

  const {
    user: currentUser,
  } = useAuth();

  /**
   * Only CLIENT_ADMIN owns social
   * connection management.
   *
   * PLATFORM_ADMIN can view client
   * information but cannot connect
   * social accounts.
   */
  const isClientAdmin =
    currentUser?.role ===
    'CLIENT_ADMIN';

  const canManageSocialConnections =
    isClientAdmin;

  const [
    client,
    setClient,
  ] = useState(null);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState('');

  const successMessageHandledRef =
    useRef(false);

  /**
   * --------------------------------------------------
   * LOAD ACTIVE CLIENT
   * --------------------------------------------------
   *
   * Backend resolves the client from
   * req.session.activeClientId.
   *
   * No client ID is required in the URL.
   */
  const loadClient =
    useCallback(
      async (
        signal
      ) => {
        setLoading(true);
        setError('');

        try {
          const data =
            await api.get(
              '/client',
              {
                signal,
              }
            );

          const clientData =
            data?.data?.client;

          if (
            !clientData ||
            !clientData.client_id
          ) {
            console.error(
              'Unexpected active-client response:',
              data
            );

            throw new Error(
              'The server returned an invalid client response.'
            );
          }

          setClient(
            clientData
          );

          if (
            clientData.business_name
          ) {
            sessionStorage.setItem(
              'clientName',
              clientData.business_name
            );
          }
        } catch (err) {
          if (
            err?.name ===
            'AbortError'
          ) {
            return;
          }

          console.error(
            'Load active client failed:',
            err
          );

          if (
            err?.status === 409
          ) {
            setError(
              'No client is selected. Return to Clients and select a client.'
            );

            return;
          }

          setError(
            err instanceof Error
              ? err.message
              : 'Unable to load client.'
          );
        } finally {
          setLoading(false);
        }
      },
      []
    );

  /**
   * --------------------------------------------------
   * INITIAL CLIENT LOAD
   * --------------------------------------------------
   */
  useEffect(() => {
    const controller =
      new AbortController();

    const timerId =
      window.setTimeout(
        () => {
          loadClient(
            controller.signal
          );
        },
        0
      );

    return () => {
      window.clearTimeout(
        timerId
      );

      controller.abort();
    };
  }, [
    loadClient,
  ]);

  /**
   * --------------------------------------------------
   * SUCCESS MESSAGE AFTER CLIENT CREATION
   * --------------------------------------------------
   */
  useEffect(() => {
    const successMessage =
      location.state
        ?.successMessage;

    if (!successMessage) {
      return;
    }

    /**
     * Prevent duplicate toast execution.
     */
    if (
      successMessageHandledRef
        .current
    ) {
      return;
    }

    successMessageHandledRef.current =
      true;

    /**
     * Clear navigation state.
     */
    navigate(
      location.pathname,
      {
        replace: true,
        state: null,
      }
    );

    toast.success(
      'Client created',
      successMessage
    );
  }, [
    location.pathname,
    location.state
      ?.successMessage,
    navigate,
    toast,
  ]);

  /**
   * --------------------------------------------------
   * ACTIONS
   * --------------------------------------------------
   */

  function handleRetry() {
    loadClient();
  }

  function handleUsers() {
    navigate(
      '/client/users'
    );
  }

  /**
   * Defensive frontend authorization.
   *
   * Backend must still enforce CLIENT_ADMIN.
   */
  function handleSocialConnections() {
    if (
      !canManageSocialConnections
    ) {
      return;
    }

    navigate(
      '/client/social-connections'
    );
  }

  function handleEditPlatforms() {
    if (
      !isClientAdmin
    ) {
      return;
    }

    navigate(
      '/client/edit'
    );
  }

  /**
   * --------------------------------------------------
   * LOADING
   * --------------------------------------------------
   */
  if (loading) {
    return (
      <PageState>
        <div
          className="client-details-loader"
        />

        <p>
          Loading client information...
        </p>
      </PageState>
    );
  }

  /**
   * --------------------------------------------------
   * ERROR
   * --------------------------------------------------
   */
  if (error) {
    return (
      <PageState>
        <div className="client-details-error">
          <h2>
            Unable to load client
          </h2>

          <p>
            {error}
          </p>

          <div className="client-details-error__actions">
            <Button
              onClick={
                handleRetry
              }
            >
              Retry
            </Button>

            <Button
              variant="secondary"
              onClick={() =>
                navigate(
                  '/clients'
                )
              }
            >
              Back to Clients
            </Button>
          </div>
        </div>
      </PageState>
    );
  }

  if (!client) {
    return null;
  }

  /**
   * Keep platform information visible
   * to Platform Admin.
   *
   * Only management actions are hidden.
   */
  const clientPlatforms =
    Array.isArray(
      client.social_platforms
    )
      ? client.social_platforms
      : [];

  return (
    <main className="client-details-page">

      {/* ============================================
          HEADER
          ============================================ */}

      <ClientHeader
        client={client}
        onBack={() =>
          navigate(
            '/clients'
          )
        }
        onUsers={
          handleUsers
        }
        showBackButton={
          !isClientAdmin
        }
      />

      {/* ============================================
          SUMMARY
          ============================================ */}

      <section
        className="client-summary-grid"
        aria-label="Client summary"
      >
        <SummaryCard
          label="Client Code"
          value={
            client.client_code
          }
        />

        <SummaryCard
          label="Status"
          value={
            client.is_active
              ? 'Active'
              : 'Inactive'
          }
          status={
            client.is_active
              ? 'active'
              : 'inactive'
          }
        />

        <SummaryCard
          label="Timezone"
          value={
            client.timezone ||
            'Not configured'
          }
        />

        <SummaryCard
          label="Language"
          value={
            formatLanguage(
              client.default_language
            )
          }
        />
      </section>

      {/* ============================================
          ORGANIZATION + CONTACT
          ============================================ */}

      <div className="client-overview-grid">

        <InfoCard
          title="Organization"
          description="General information about this client."
        >
          <InfoRow
            label="Business name"
            value={
              client.business_name
            }
          />

          <InfoRow
            label="Client code"
            value={
              client.client_code
            }
          />

          <InfoRow
            label="Timezone"
            value={
              client.timezone
            }
          />

          <InfoRow
            label="Default language"
            value={
              formatLanguage(
                client.default_language
              )
            }
          />
        </InfoCard>

        <InfoCard
          title="Primary Contact"
          description="Main point of contact for this organization."
        >
          <InfoRow
            label="Name"
            value={
              client.contact_name
            }
          />

          <InfoRow
            label="Email"
            value={
              client.contact_email
            }
            type="email"
          />

          <InfoRow
            label="Phone"
            value={
              client.contact_phone
            }
            type="phone"
          />
        </InfoCard>

      </div>

      {/* ============================================
          SOCIAL PLATFORMS
          ============================================ */}

      <section className="client-info-card">

        <div className="client-info-card__header client-info-card__header--platforms">

          <div>
            <div className="client-platform-heading-row">
              <h2>
                Social Platforms
              </h2>

              <span className="client-platform-count">
                {
                  clientPlatforms.length
                }
                {' '}
                enabled
              </span>
            </div>

            <p>
              Control the publishing platforms available
              to this client and manage their connected accounts.
            </p>
          </div>

          {isClientAdmin && (
            <div className="client-info-card__actions">

              <Button
                variant="secondary"
                onClick={
                  handleEditPlatforms
                }
              >
                Edit Platforms
              </Button>

              <Button
                onClick={
                  handleSocialConnections
                }
              >
                Manage Connections
              </Button>

            </div>
          )}

        </div>

        <div className="client-platform-list">

          {clientPlatforms.length > 0
            ? (
              clientPlatforms.map(
                (
                  platform
                ) => (
                  <div
                    key={
                      platform
                    }
                    className="client-platform-badge"
                  >
                    <span
                      className="client-platform-badge__dot"
                      aria-hidden="true"
                    />

                    {
                      formatPlatformName(
                        platform
                      )
                    }
                  </div>
                )
              )
            )
            : (
              <div className="client-platform-empty">
                No social platforms configured.
              </div>
            )}

        </div>

      </section>

      {/* ============================================
          SYSTEM INFORMATION
          ============================================ */}

      <section className="client-meta-card">

        <h2>
          System Information
        </h2>

        <div className="client-meta-grid">

          <InfoRow
            label="Created"
            value={
              formatDate(
                client.created_at
              )
            }
          />

          <InfoRow
            label="Last updated"
            value={
              formatDate(
                client.updated_at
              )
            }
          />

          <InfoRow
            label="Created by"
            value={
              client.created_by ||
              '—'
            }
          />

        </div>

      </section>

    </main>
  );
}

/**
 * --------------------------------------------------
 * CLIENT HEADER
 * --------------------------------------------------
 */
function ClientHeader({
  client,
  onBack,
  onUsers,
  showBackButton,
}) {
  return (
    <header className="client-details-header">

      <div>

        {showBackButton && (
          <button
            type="button"
            className="client-back-button"
            onClick={
              onBack
            }
          >
            ← Back to Clients
          </button>
        )}

        <div className="client-heading">

          <div
            className="client-heading__avatar"
            aria-hidden="true"
          >
            {
              getInitials(
                client.business_name
              )
            }
          </div>

          <div>

            <div className="client-heading__title-row">

              <h1>
                {
                  client.business_name
                }
              </h1>

              <ClientStatus
                active={
                  client.is_active
                }
              />

            </div>

            <p className="client-heading__subtitle">
              {
                client.client_code
              }
            </p>

          </div>

        </div>

      </div>

      <div className="client-details-header__actions">

        <Button
          variant="secondary"
          onClick={
            onUsers
          }
        >
          Manage Users
        </Button>

      </div>

    </header>
  );
}

/**
 * --------------------------------------------------
 * SUMMARY CARD
 * --------------------------------------------------
 */
function SummaryCard({
  label,
  value,
  status,
}) {
  return (
    <article className="client-summary-card">

      <span className="client-summary-card__label">
        {label}
      </span>

      {status
        ? (
          <span
            className={
              `client-status client-status--${status}`
            }
          >
            {value}
          </span>
        )
        : (
          <strong>
            {value || '—'}
          </strong>
        )}

    </article>
  );
}

/**
 * --------------------------------------------------
 * INFO CARD
 * --------------------------------------------------
 */
function InfoCard({
  title,
  description,
  children,
}) {
  return (
    <section className="client-info-card">

      <div className="client-info-card__header">

        <h2>
          {title}
        </h2>

        {description && (
          <p>
            {description}
          </p>
        )}

      </div>

      <div className="client-info-card__body">
        {children}
      </div>

    </section>
  );
}

/**
 * --------------------------------------------------
 * INFO ROW
 * --------------------------------------------------
 */
function InfoRow({
  label,
  value,
  type,
}) {
  let displayValue =
    value || '—';

  if (
    type === 'email' &&
    value
  ) {
    displayValue = (
      <a
        href={
          `mailto:${value}`
        }
      >
        {value}
      </a>
    );
  }

  if (
    type === 'phone' &&
    value
  ) {
    displayValue = (
      <a
        href={
          `tel:${String(value)
            .replace(/\s+/g, '')}`
        }
      >
        {value}
      </a>
    );
  }

  return (
    <div className="client-info-row">

      <span className="client-info-row__label">
        {label}
      </span>

      <div className="client-info-row__value">
        {displayValue}
      </div>

    </div>
  );
}

/**
 * --------------------------------------------------
 * CLIENT STATUS
 * --------------------------------------------------
 */
function ClientStatus({
  active,
}) {
  return (
    <span
      className={
        active
          ? 'client-status client-status--active'
          : 'client-status client-status--inactive'
      }
    >
      <span
        className="client-status__dot"
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

/**
 * --------------------------------------------------
 * PAGE STATE
 * --------------------------------------------------
 */
function PageState({
  children,
}) {
  return (
    <div className="client-details-page">

      <div className="client-page-state">
        {children}
      </div>

    </div>
  );
}

/**
 * --------------------------------------------------
 * CLIENT INITIALS
 * --------------------------------------------------
 */
function getInitials(
  value = ''
) {
  return String(value)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(
      (
        word
      ) =>
        word
          .charAt(0)
          .toUpperCase()
    )
    .join('');
}

/**
 * --------------------------------------------------
 * LANGUAGE
 * --------------------------------------------------
 */
function formatLanguage(
  language
) {
  const languages = {
    en: 'English',
    ta: 'Tamil',
    hi: 'Hindi',
  };

  return (
    languages[language] ||
    language?.toUpperCase() ||
    '—'
  );
}

/**
 * --------------------------------------------------
 * DATE FORMAT
 * --------------------------------------------------
 */
function formatDate(
  value
) {
  if (!value) {
    return '—';
  }

  const date =
    new Date(
      value
    );

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

      timeZone:
        'Asia/Kolkata',
    }
  ).format(
    date
  );
}