import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FaFacebookF,
  FaInstagram,
  FaTelegramPlane,
  FaWhatsapp,
  FaYoutube,
} from 'react-icons/fa';
import {
  FaArrowLeft,
  FaCheck,
  FaLink,
  FaRotate,
  FaShieldHalved,
  FaThreads,
  FaTriangleExclamation,
  FaXTwitter,
} from 'react-icons/fa6';

import { api } from '../../services/apiClient.js';
import {
  cancelFacebookOAuth,
  cancelInstagramOAuth,
  connectFacebookPage,
  connectInstagramAccount,
  disconnectSocialConnection,
  getClientSocialConnections,
  getFacebookOAuthPages,
  getFacebookOAuthResult,
  getFacebookOAuthStartUrl,
  getInstagramOAuthAccounts,
  getInstagramOAuthResult,
  getInstagramOAuthStartUrl,
  verifySocialConnection,
} from '../../services/socialConnections.api.js';
import { formatDateTime } from '../../utils/format.js';
import { getConnectionUiState } from '../../utils/socialConnectionState.js';
import './social-connections.css';


// =====================================================
// PLATFORM CONFIGURATION
// =====================================================
//
// Facebook and Instagram are currently implemented.
// Remaining platforms stay visible as roadmap items until
// their backend integrations are completed.
// =====================================================

const PLATFORM_CONFIG = [
  {
    code: 'facebook',
    name: 'Facebook',
    description:
      'Connect a Facebook Page for approved content publishing and automation.',
    icon: FaFacebookF,
    available: true,
  },
  {
    code: 'instagram',
    name: 'Instagram',
    description:
      'Connect an Instagram Professional account linked to a Facebook Page for approved content publishing.',
    icon: FaInstagram,
    available: true,
  },
  {
    code: 'whatsapp',
    name: 'WhatsApp',
    description:
      'WhatsApp Business publishing integration.',
    icon: FaWhatsapp,
    available: false,
  },
  {
    code: 'youtube',
    name: 'YouTube',
    description:
      'YouTube channel publishing integration.',
    icon: FaYoutube,
    available: false,
  },
  {
    code: 'telegram',
    name: 'Telegram',
    description:
      'Telegram channel publishing integration.',
    icon: FaTelegramPlane,
    available: false,
  },
  {
    code: 'x',
    name: 'X',
    description:
      'X account publishing integration.',
    icon: FaXTwitter,
    available: false,
  },
  {
    code: 'threads',
    name: 'Threads',
    description:
      'Threads account publishing integration.',
    icon: FaThreads,
    available: false,
  },
];


// =====================================================
// STATUS DISPLAY
// =====================================================

const STATUS_META = {
  CONNECTED: {
    label: 'Connected',
    tone: 'success',
  },
  PENDING: {
    label: 'Verification pending',
    tone: 'pending',
  },
  RECONNECT_REQUIRED: {
    label: 'Reconnect required',
    tone: 'warning',
  },
  ERROR: {
    label: 'Connection error',
    tone: 'danger',
  },
  NOT_CONNECTED: {
    label: 'Not connected',
    tone: 'neutral',
  },
};


function normalizePlatform(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}


// =====================================================
// CLIENT ENABLED PLATFORM NORMALIZER
// =====================================================
//
// client_social_platforms is the backend source of truth.
// The canonical API field is client.social_platforms.
// Compatibility aliases are kept temporarily while older
// screens are being migrated.
// =====================================================

function getClientEnabledPlatforms(client) {
  const values =
    client?.social_platforms ??
    client?.socialPlatforms ??
    client?.platforms ??
    client?.platform_codes ??
    [];

  if (!Array.isArray(values)) {
    return [];
  }

  return [
    ...new Set(
      values
        .map(normalizePlatform)
        .filter(Boolean),
    ),
  ];
}


function getErrorMessage(
  error,
  fallback,
) {
  return (
    error?.response?.data?.message ||
    error?.message ||
    fallback
  );
}


function getAccountTypeLabel(
  platformCode,
) {
  switch (platformCode) {
    case 'facebook':
      return 'Facebook Page';

    case 'instagram':
      return 'Instagram Professional account';

    default:
      return 'Connected account';
  }
}


// =====================================================
// MAIN COMPONENT
// =====================================================

export default function SocialConnections() {
  const navigate =
    useNavigate();

  const [
    client,
    setClient,
  ] = useState(null);

  const [
    connections,
    setConnections,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    refreshing,
    setRefreshing,
  ] = useState(false);

  const [
    busyAction,
    setBusyAction,
  ] = useState('');

  const [
    error,
    setError,
  ] = useState('');

  const [
    notice,
    setNotice,
  ] = useState('');


  // ===================================================
  // FACEBOOK OAUTH STATE
  // ===================================================

  const [
    facebookPages,
    setFacebookPages,
  ] = useState([]);

  const [
    facebookPagesLoading,
    setFacebookPagesLoading,
  ] = useState(false);

  const [
    pagePickerOpen,
    setPagePickerOpen,
  ] = useState(false);

  const [
    selectedPageId,
    setSelectedPageId,
  ] = useState('');


  // ===================================================
  // INSTAGRAM OAUTH STATE
  // ===================================================

  const [
    instagramAccounts,
    setInstagramAccounts,
  ] = useState([]);

  const [
    instagramAccountsLoading,
    setInstagramAccountsLoading,
  ] = useState(false);

  const [
    instagramPickerOpen,
    setInstagramPickerOpen,
  ] = useState(false);

  const [
    selectedInstagramId,
    setSelectedInstagramId,
  ] = useState('');


  // ===================================================
  // LOAD ACTIVE CLIENT + CONNECTIONS
  // ===================================================

  const loadWorkspace =
    useCallback(
      async ({
        initial = false,
      } = {}) => {
        try {
          if (initial) {
            setLoading(true);
          } else {
            setRefreshing(true);
          }

          setError('');

          const [
            clientResponse,
            rows,
          ] =
            await Promise.all([
              api.get('/client'),
              getClientSocialConnections(),
            ]);

          const clientData =
            clientResponse
              ?.data
              ?.client;

          if (!clientData) {
            throw new Error(
              'The selected client could not be loaded.',
            );
          }

          setClient(
            clientData,
          );

          setConnections(
            Array.isArray(rows)
              ? rows
              : [],
          );

          if (
            clientData
              .business_name
          ) {
            sessionStorage
              .setItem(
                'clientName',
                clientData
                  .business_name,
              );
          }

          return clientData;
        } catch (loadError) {
          setError(
            getErrorMessage(
              loadError,
              'Unable to load social connections.',
            ),
          );

          return null;
        } finally {
          setLoading(false);
          setRefreshing(false);
        }
      },
      [],
    );


  // ===================================================
  // FACEBOOK PAGE PICKER
  // ===================================================

  const openFacebookPagePicker =
    useCallback(
      async () => {
        try {
          setFacebookPagesLoading(
            true,
          );

          setPagePickerOpen(
            true,
          );

          setError('');

          const pages =
            await getFacebookOAuthPages();

          const safePages =
            Array.isArray(pages)
              ? pages
              : [];

          setFacebookPages(
            safePages,
          );

          setSelectedPageId(
            safePages.length === 1
              ? String(
                safePages[0].id ??
                safePages[0]
                  .pageId,
              )
              : '',
          );
        } catch (pagesError) {
          setFacebookPages([]);

          setError(
            getErrorMessage(
              pagesError,
              'Unable to load Facebook Pages. Start the Facebook connection again.',
            ),
          );
        } finally {
          setFacebookPagesLoading(
            false,
          );
        }
      },
      [],
    );


  // ===================================================
  // INSTAGRAM ACCOUNT PICKER
  // ===================================================

  const openInstagramAccountPicker =
    useCallback(
      async () => {
        try {
          setInstagramAccountsLoading(
            true,
          );

          setInstagramPickerOpen(
            true,
          );

          setError('');

          const accounts =
            await getInstagramOAuthAccounts();

          const safeAccounts =
            Array.isArray(accounts)
              ? accounts
              : [];

          setInstagramAccounts(
            safeAccounts,
          );

          setSelectedInstagramId(
            safeAccounts.length === 1
              ? String(
                safeAccounts[0].id ??
                safeAccounts[0]
                  .instagramUserId,
              )
              : '',
          );

          if (
            safeAccounts.length === 0
          ) {
            setError(
              'No Instagram Professional accounts were returned.',
            );
          }
        } catch (accountsError) {
          setInstagramAccounts([]);

          setError(
            getErrorMessage(
              accountsError,
              'Unable to load Instagram accounts. Start Instagram authorization again.',
            ),
          );
        } finally {
          setInstagramAccountsLoading(
            false,
          );
        }
      },
      [],
    );


  // ===================================================
  // INITIAL LOAD + OAUTH RESULT HANDLING
  // ===================================================

  useEffect(() => {
    let active = true;

    async function initialize() {
      const loadedClient =
        await loadWorkspace({
          initial: true,
        });

      if (
        !active ||
        !loadedClient
      ) {
        return;
      }

      const enabledPlatforms =
        getClientEnabledPlatforms(
          loadedClient,
        );


      // -----------------------------------------------
      // FACEBOOK OAUTH RESULT
      // -----------------------------------------------
      //
      // Only inspect OAuth state when Facebook is actually
      // enabled for this client.
      // -----------------------------------------------

      if (
        enabledPlatforms.includes(
          'facebook',
        )
      ) {
        try {
          const facebookOutcome =
            await getFacebookOAuthResult();

          if (!active) {
            return;
          }

          if (
            facebookOutcome
              ?.status ===
            'SELECT_PAGE'
          ) {
            await openFacebookPagePicker();
          } else if (
            facebookOutcome
              ?.status ===
            'ERROR'
          ) {
            setError(
              facebookOutcome
                .message ||
                'Facebook authorization could not be completed.',
            );
          }
        } catch (facebookError) {
          if (active) {
            setError(
              getErrorMessage(
                facebookError,
                'Unable to read the Facebook connection result.',
              ),
            );
          }
        }
      }


      if (!active) {
        return;
      }


      // -----------------------------------------------
      // INSTAGRAM OAUTH RESULT
      // -----------------------------------------------
      //
      // Only inspect Instagram OAuth state when Instagram
      // is enabled for this client.
      // -----------------------------------------------

      if (
        enabledPlatforms.includes(
          'instagram',
        )
      ) {
        try {
          const instagramOutcome =
            await getInstagramOAuthResult();

          if (!active) {
            return;
          }

          if (
            instagramOutcome
              ?.status ===
            'SELECT_ACCOUNT'
          ) {
            await openInstagramAccountPicker();
          } else if (
            instagramOutcome
              ?.status ===
            'ERROR'
          ) {
            setError(
              instagramOutcome
                .message ||
                'Instagram authorization could not be completed.',
            );
          }
        } catch (instagramError) {
          if (active) {
            setError(
              getErrorMessage(
                instagramError,
                'Unable to read the Instagram connection result.',
              ),
            );
          }
        }
      }
    }

    void initialize();

    return () => {
      active = false;
    };
  }, [
    loadWorkspace,
    openFacebookPagePicker,
    openInstagramAccountPicker,
  ]);


  // ===================================================
  // CLIENT-ENABLED PLATFORM CODES
  // ===================================================
  //
  // These values come from client_social_platforms via
  // GET /api/client. The user does not choose platforms
  // again on this page.
  // ===================================================

  const enabledPlatformCodes =
    useMemo(
      () =>
        getClientEnabledPlatforms(
          client,
        ),
      [client],
    );


  // ===================================================
  // MERGE CLIENT CONFIG + CONNECTION DATA
  // ===================================================
  //
  // PLATFORM_CONFIG is only the UI catalogue.
  // enabledPlatformCodes is the client's allowed list.
  // Therefore only platforms selected during client
  // registration are rendered here.
  // ===================================================

  const platforms =
    useMemo(
      () =>
        PLATFORM_CONFIG
          .filter(
            (platform) =>
              enabledPlatformCodes
                .includes(
                  platform.code,
                ),
          )
          .map(
            (platform) => {
              const connection =
                connections.find(
                  (item) =>
                    normalizePlatform(
                      item.platform,
                    ) ===
                    platform.code,
                );

              const status =
                getConnectionUiState(
                  connection,
                );

              return {
                ...platform,
                connection,
                status,
                statusMeta:
                  STATUS_META[
                    status
                  ] ||
                  STATUS_META
                    .NOT_CONNECTED,
              };
            },
          ),
      [
        connections,
        enabledPlatformCodes,
      ],
    );


  // ===================================================
  // SUMMARY
  // ===================================================

  const summary =
    useMemo(
      () => ({
        connected:
          platforms.filter(
            (platform) =>
              platform.status ===
              'CONNECTED',
          ).length,

        attention:
          platforms.filter(
            (platform) =>
              platform.available &&
              [
                'ERROR',
                'RECONNECT_REQUIRED',
                'PENDING',
              ].includes(
                platform.status,
              ),
          ).length,

        configured:
          platforms.length,

        availableNow:
          platforms.filter(
            (platform) =>
              platform.available,
          ).length,
      }),
      [platforms],
    );


  // ===================================================
  // START FACEBOOK OAUTH
  // ===================================================

  const beginFacebookOAuth =
    useCallback(() => {
      setError('');
      setNotice('');

      window.location.assign(
        getFacebookOAuthStartUrl(),
      );
    }, []);


  // ===================================================
  // START INSTAGRAM OAUTH
  // ===================================================

  const beginInstagramOAuth =
    useCallback(() => {
      setError('');
      setNotice('');

      window.location.assign(
        getInstagramOAuthStartUrl(),
      );
    }, []);


  // ===================================================
  // GENERIC VERIFY
  // ===================================================
  //
  // Currently exposed in the UI for Facebook only.
  // Instagram was already verified during account selection.
  // ===================================================

  const handleVerify =
    useCallback(
      async (platform) => {
        const connectionId =
          platform.connection
            ?.connectionId;

        if (!connectionId) {
          return;
        }

        try {
          setBusyAction(
            `verify-${connectionId}`,
          );

          setError('');
          setNotice('');

          await verifySocialConnection(
            connectionId,
          );

          setNotice(
            `${platform.name} connection verified successfully.`,
          );

          await loadWorkspace();
        } catch (verifyError) {
          setError(
            getErrorMessage(
              verifyError,
              `${platform.name} verification failed.`,
            ),
          );

          await loadWorkspace();
        } finally {
          setBusyAction('');
        }
      },
      [loadWorkspace],
    );


  // ===================================================
  // GENERIC DISCONNECT
  // ===================================================

  const handleDisconnect =
    useCallback(
      async (platform) => {
        const connectionId =
          platform.connection
            ?.connectionId;

        if (!connectionId) {
          return;
        }

        const confirmed =
          window.confirm(
            `Disconnect ${platform.name} from this client? The platform account is retained securely so it can be reconnected without creating duplicate credentials.`,
          );

        if (!confirmed) {
          return;
        }

        try {
          setBusyAction(
            `disconnect-${connectionId}`,
          );

          setError('');
          setNotice('');

          await disconnectSocialConnection(
            connectionId,
          );

          setNotice(
            `${platform.name} disconnected. You can reconnect from this same page.`,
          );

          await loadWorkspace();
        } catch (disconnectError) {
          setError(
            getErrorMessage(
              disconnectError,
              `Unable to disconnect ${platform.name}.`,
            ),
          );
        } finally {
          setBusyAction('');
        }
      },
      [loadWorkspace],
    );


  // ===================================================
  // CLOSE FACEBOOK PICKER
  // ===================================================

  const closeFacebookPagePicker =
    useCallback(
      async () => {
        setPagePickerOpen(
          false,
        );

        setFacebookPages([]);

        setSelectedPageId('');

        try {
          await cancelFacebookOAuth();
        } catch {
          // Closing the UI remains safe even if cleanup fails.
        }
      },
      [],
    );


  // ===================================================
  // CONNECT FACEBOOK PAGE
  // ===================================================

  const handleFacebookPageConnect =
    useCallback(
      async () => {
        if (!selectedPageId) {
          setError(
            'Select a Facebook Page before continuing.',
          );

          return;
        }

        try {
          setBusyAction(
            'facebook-connect',
          );

          setError('');
          setNotice('');

          const response =
            await connectFacebookPage(
              selectedPageId,
            );

          const accountName =
            response?.data
              ?.externalAccountName ||
            response?.data
              ?.external_account_name ||
            response
              ?.externalAccountName ||
            response
              ?.external_account_name ||
            'Facebook Page';

          setNotice(
            `${accountName} is connected and verified.`,
          );

          setPagePickerOpen(
            false,
          );

          setFacebookPages([]);

          setSelectedPageId('');

          await loadWorkspace();
        } catch (connectError) {
          setError(
            getErrorMessage(
              connectError,
              'Facebook Page could not be connected. Please start authorization again.',
            ),
          );
        } finally {
          setBusyAction('');
        }
      },
      [
        loadWorkspace,
        selectedPageId,
      ],
    );


  // ===================================================
  // CLOSE INSTAGRAM PICKER
  // ===================================================

  const closeInstagramPicker =
    useCallback(
      async () => {
        setInstagramPickerOpen(
          false,
        );

        setInstagramAccounts([]);

        setSelectedInstagramId('');

        try {
          await cancelInstagramOAuth();
        } catch {
          // Closing the UI remains safe even if cleanup fails.
        }
      },
      [],
    );


  // ===================================================
  // CONNECT INSTAGRAM ACCOUNT
  // ===================================================

  const handleInstagramConnect =
    useCallback(
      async () => {
        if (!selectedInstagramId) {
          setError(
            'Select an Instagram account before continuing.',
          );

          return;
        }

        try {
          setBusyAction(
            'instagram-connect',
          );

          setError('');
          setNotice('');

          const response =
            await connectInstagramAccount(
              selectedInstagramId,
            );

          const connection =
            response?.data ||
            response;

          const accountName =
            connection
              ?.instagram
              ?.username ||
            connection
              ?.externalAccountName ||
            connection
              ?.external_account_name ||
            'Instagram account';

          const displayName =
            accountName ===
              'Instagram account'
              ? accountName
              : `@${String(
                accountName,
              ).replace(
                /^@/,
                '',
              )}`;

          setNotice(
            `${displayName} is connected and verified.`,
          );

          setInstagramPickerOpen(
            false,
          );

          setInstagramAccounts([]);

          setSelectedInstagramId('');

          await loadWorkspace();
        } catch (connectError) {
          setError(
            getErrorMessage(
              connectError,
              'Instagram account could not be connected. Please start authorization again.',
            ),
          );
        } finally {
          setBusyAction('');
        }
      },
      [
        loadWorkspace,
        selectedInstagramId,
      ],
    );


  // ===================================================
  // LOADING STATE
  // ===================================================

  if (loading) {
    return (
      <main className="social-page">
        <div className="social-loading">
          Loading the client connection workspace...
        </div>
      </main>
    );
  }


  // ===================================================
  // UI
  // ===================================================

  return (
    <main className="social-page">

      {/* ============================================= */}
      {/* HEADER */}
      {/* ============================================= */}

      <header className="social-page__header">
        <div>
          <button
            type="button"
            className="social-back"
            onClick={() =>
              navigate('/client')
            }
          >
            <FaArrowLeft
              aria-hidden="true"
            />
            {' '}
            Back to client
          </button>

          <p className="social-eyebrow">
            Publishing infrastructure
          </p>

          <h1>
            Social Connections
          </h1>

          <p className="social-page__subtitle">
            Securely manage publishing accounts for{' '}
            <strong>
              {client
                ?.business_name ||
                'the selected client'}
            </strong>
            .
          </p>
        </div>

        <button
          type="button"
          className="social-button social-button--secondary"
          onClick={() =>
            loadWorkspace()
          }
          disabled={refreshing}
        >
          <FaRotate
            aria-hidden="true"
          />

          {' '}

          {refreshing
            ? 'Refreshing…'
            : 'Refresh status'}
        </button>
      </header>


      {/* ============================================= */}
      {/* SECURITY */}
      {/* ============================================= */}

      <section
        className="social-security-banner"
        aria-label="Connection security"
      >
        <span className="social-security-banner__icon">
          <FaShieldHalved />
        </span>

        <div>
          <strong>
            Credentials stay on the server
          </strong>

          <p>
            Access tokens are encrypted before storage.
            The browser only receives safe account metadata
            and connection status.
          </p>
        </div>

        <span className="social-security-banner__tag">
          AES-256-GCM
        </span>
      </section>


      {/* ============================================= */}
      {/* SUMMARY */}
      {/* ============================================= */}

      <section
        className="social-summary"
        aria-label="Connection summary"
      >
        <article>
          <span className="social-summary__icon">
            <FaLink />
          </span>

          <div>
            <strong>
              {summary.connected}
            </strong>

            <span>
              Connected
            </span>
          </div>
        </article>

        <article>
          <span className="social-summary__icon">
            <FaTriangleExclamation />
          </span>

          <div>
            <strong>
              {summary.attention}
            </strong>

            <span>
              Needs attention
            </span>
          </div>
        </article>

        <article>
          <span className="social-summary__icon">
            <FaCheck />
          </span>

          <div>
            <strong>
              {summary.configured}
            </strong>

            <span>
              Configured platforms
            </span>
          </div>
        </article>
      </section>


      {/* ============================================= */}
      {/* MESSAGES */}
      {/* ============================================= */}

      {error && (
        <div
          className="social-alert social-alert--danger"
          role="alert"
        >
          <FaTriangleExclamation
            aria-hidden="true"
          />

          <span>
            {error}
          </span>
        </div>
      )}

      {notice && (
        <div
          className="social-alert social-alert--success"
          role="status"
        >
          <FaCheck
            aria-hidden="true"
          />

          <span>
            {notice}
          </span>
        </div>
      )}


      {/* ============================================= */}
      {/* SECTION HEADING */}
      {/* ============================================= */}

      <div className="social-section-heading">
        <div>
          <h2>
            Publishing channels
          </h2>

          <p>
            Only platforms enabled during client registration
            are shown here. Connect the approved accounts used
            for automated publishing.
          </p>
        </div>
      </div>


      {/* ============================================= */}
      {/* PLATFORM CARDS */}
      {/* ============================================= */}

      <section className="social-grid">
        {platforms.length === 0 ? (
          <div
            className="social-account-box social-account-box--empty"
            style={{ gridColumn: '1 / -1' }}
          >
            No social platforms are enabled for this client.
            Ask the Platform Admin to update the client's
            platform configuration if publishing access is required.
          </div>
        ) : platforms.map(
          (platform) => {
            const Icon =
              platform.icon;

            const connectionId =
              platform.connection
                ?.connectionId;

            const connected =
              platform.status ===
              'CONNECTED';

            const reconnect =
              platform.status ===
              'RECONNECT_REQUIRED' ||
              platform.status ===
              'ERROR' ||
              platform.status ===
              'NOT_CONNECTED';

            const clientConnectionActive =
              platform.connection
                ?.clientConnectionActive !==
              false;

            return (
              <article
                key={platform.code}
                className={
                  `social-card${platform.available
                    ? ''
                    : ' social-card--disabled'
                  }`
                }
              >

                {/* CARD HEADER */}

                <div className="social-card__top">
                  <span
                    className={
                      `social-platform-icon social-platform-icon--${platform.code}`
                    }
                  >
                    <Icon
                      aria-hidden="true"
                    />
                  </span>

                  <span
                    className={
                      `social-status social-status--${platform.statusMeta.tone}`
                    }
                  >
                    {platform.available
                      ? platform.statusMeta
                        .label
                      : 'Roadmap'}
                  </span>
                </div>


                {/* CARD BODY */}

                <div className="social-card__body">
                  <h3>
                    {platform.name}
                  </h3>

                  <p>
                    {platform.description}
                  </p>


                  {platform.connection ? (
                    <div className="social-account-box">
                      <span className="social-account-box__label">
                        {connected
                          ? 'CONNECTED ACCOUNT'
                          : 'SAVED ACCOUNT'}
                      </span>

                      <strong>
                        {platform.connection
                          .externalAccountName ||
                          platform.name}
                      </strong>

                      <span>
                        {getAccountTypeLabel(
                          platform.code,
                        )}
                      </span>

                      <span>
                        Account ID:{' '}
                        {platform.connection
                          .externalAccountId ||
                          '—'}
                      </span>

                      <span>
                        Last verified:{' '}
                        {platform.connection
                          .lastVerifiedAt
                          ? formatDateTime(
                            platform
                              .connection
                              .lastVerifiedAt,
                          )
                          : 'Not verified yet'}
                      </span>

                      {platform.connection
                        .lastErrorMessage && (
                          <span className="social-account-box__error">
                            {
                              platform
                                .connection
                                .lastErrorMessage
                            }
                          </span>
                        )}
                    </div>
                  ) : (
                    <div className="social-account-box social-account-box--empty">
                      {platform.available
                        ? 'No account connected yet.'
                        : 'Prepared for a future integration phase.'}
                    </div>
                  )}
                </div>


                {/* ACTIONS */}

                <div className="social-card__actions">

                  {/* FACEBOOK */}

                  {platform.code ===
                    'facebook' && (
                      <>
                        {reconnect && (
                          <button
                            type="button"
                            className="social-button social-button--primary"
                            onClick={
                              beginFacebookOAuth
                            }
                          >
                            <FaFacebookF />

                            {' '}

                            {platform
                              .connection
                              ? 'Reconnect Facebook'
                              : 'Connect Facebook'}
                          </button>
                        )}

                        {connected && (
                          <>
                            <button
                              type="button"
                              className="social-button social-button--secondary"
                              onClick={() =>
                                handleVerify(
                                  platform,
                                )
                              }
                              disabled={
                                busyAction ===
                                `verify-${connectionId}`
                              }
                            >
                              <FaRotate />

                              {' '}

                              {busyAction ===
                                `verify-${connectionId}`
                                ? 'Verifying…'
                                : 'Test connection'}
                            </button>

                            <button
                              type="button"
                              className="social-button social-button--secondary"
                              onClick={
                                beginFacebookOAuth
                              }
                            >
                              <FaRotate />

                              {' '}

                              Change / reconnect
                            </button>
                          </>
                        )}

                        {platform.connection &&
                          clientConnectionActive && (
                            <button
                              type="button"
                              className="social-button social-button--danger"
                              onClick={() =>
                                handleDisconnect(
                                  platform,
                                )
                              }
                              disabled={
                                busyAction ===
                                `disconnect-${connectionId}`
                              }
                            >
                              {busyAction ===
                                `disconnect-${connectionId}`
                                ? 'Disconnecting…'
                                : 'Disconnect'}
                            </button>
                          )}
                      </>
                    )}


                  {/* INSTAGRAM */}

                  {platform.code ===
                    'instagram' && (
                      <>
                        {reconnect && (
                          <button
                            type="button"
                            className="social-button social-button--primary"
                            onClick={
                              beginInstagramOAuth
                            }
                          >
                            <FaInstagram />

                            {' '}

                            {platform
                              .connection
                              ? 'Reconnect Instagram'
                              : 'Connect Instagram'}
                          </button>
                        )}

                        {connected && (
                          <button
                            type="button"
                            className="social-button social-button--secondary"
                            onClick={
                              beginInstagramOAuth
                            }
                          >
                            <FaRotate />

                            {' '}

                            Change / reconnect
                          </button>
                        )}

                        {platform.connection &&
                          clientConnectionActive && (
                            <button
                              type="button"
                              className="social-button social-button--danger"
                              onClick={() =>
                                handleDisconnect(
                                  platform,
                                )
                              }
                              disabled={
                                busyAction ===
                                `disconnect-${connectionId}`
                              }
                            >
                              {busyAction ===
                                `disconnect-${connectionId}`
                                ? 'Disconnecting…'
                                : 'Disconnect'}
                            </button>
                          )}
                      </>
                    )}


                  {/* FUTURE PLATFORMS */}

                  {!platform.available && (
                    <button
                      type="button"
                      className="social-button social-button--disabled"
                      disabled
                    >
                      Coming later
                    </button>
                  )}

                </div>
              </article>
            );
          },
        )}
      </section>


      {/* ============================================= */}
      {/* FACEBOOK PAGE PICKER */}
      {/* ============================================= */}

      {pagePickerOpen && (
        <div
          className="social-modal-backdrop"
          role="presentation"
        >
          <section
            className="social-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="facebook-page-title"
          >
            <header className="social-modal__header">
              <div>
                <p className="social-eyebrow">
                  Facebook authorization complete
                </p>

                <h2 id="facebook-page-title">
                  Choose a Page to publish to
                </h2>

                <p>
                  The Page access token stays in the backend
                  session and is encrypted when you confirm
                  the connection.
                </p>
              </div>

              <button
                type="button"
                className="social-modal__close"
                onClick={
                  closeFacebookPagePicker
                }
                aria-label="Close Page selector"
              >
                ×
              </button>
            </header>


            <div className="social-modal__body">
              {facebookPagesLoading ? (
                <div className="social-loading">
                  Loading Facebook Pages...
                </div>
              ) : facebookPages.length ===
                0 ? (
                <div className="social-empty-pages">
                  No publishable Pages were returned.
                </div>
              ) : (
                <div className="facebook-page-list">
                  {facebookPages.map(
                    (page) => {
                      const pageId =
                        String(
                          page.id ??
                          page.pageId,
                        );

                      const pageName =
                        page.name ??
                        page.pageName ??
                        'Facebook Page';

                      return (
                        <label
                          key={pageId}
                          className={
                            `facebook-page-option${selectedPageId ===
                              pageId
                              ? ' is-selected'
                              : ''
                            }`
                          }
                        >
                          <input
                            type="radio"
                            name="facebookPage"
                            value={pageId}
                            checked={
                              selectedPageId ===
                              pageId
                            }
                            onChange={() =>
                              setSelectedPageId(
                                pageId,
                              )
                            }
                          />

                          <span className="facebook-page-option__icon">
                            <FaFacebookF />
                          </span>

                          <span>
                            <strong>
                              {pageName}
                            </strong>

                            <small>
                              {page.category ||
                                'Facebook Page'}
                              {' · '}
                              {pageId}
                            </small>
                          </span>
                        </label>
                      );
                    },
                  )}
                </div>
              )}
            </div>


            <footer className="social-modal__footer">
              <button
                type="button"
                className="social-button social-button--secondary"
                onClick={
                  closeFacebookPagePicker
                }
              >
                Cancel
              </button>

              <button
                type="button"
                className="social-button social-button--primary"
                onClick={
                  handleFacebookPageConnect
                }
                disabled={
                  !selectedPageId ||
                  busyAction ===
                  'facebook-connect'
                }
              >
                <FaCheck />

                {' '}

                {busyAction ===
                  'facebook-connect'
                  ? 'Connecting…'
                  : 'Connect selected Page'}
              </button>
            </footer>
          </section>
        </div>
      )}


      {/* ============================================= */}
      {/* INSTAGRAM ACCOUNT PICKER */}
      {/* ============================================= */}

      {instagramPickerOpen && (
        <div
          className="social-modal-backdrop"
          role="presentation"
        >
          <section
            className="social-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="instagram-account-title"
          >
            <header className="social-modal__header">
              <div>
                <p className="social-eyebrow">
                  Instagram authorization complete
                </p>

                <h2 id="instagram-account-title">
                  Choose an Instagram account
                </h2>

                <p>
                  Select the Instagram Professional account
                  this client will use for publishing.
                  Access tokens remain on the server.
                </p>
              </div>

              <button
                type="button"
                className="social-modal__close"
                onClick={
                  closeInstagramPicker
                }
                aria-label="Close Instagram account selector"
              >
                ×
              </button>
            </header>


            <div className="social-modal__body">
              {instagramAccountsLoading ? (
                <div className="social-loading">
                  Loading Instagram accounts...
                </div>
              ) : instagramAccounts.length ===
                0 ? (
                <div className="social-empty-pages">
                  No Instagram Professional accounts were returned.
                </div>
              ) : (
                <div className="facebook-page-list">
                  {instagramAccounts.map(
                    (account) => {
                      const accountId =
                        String(
                          account.id ??
                          account
                            .instagramUserId,
                        );

                      const username =
                        account.username
                          ? `@${account.username}`
                          : account.name ||
                          'Instagram account';

                      return (
                        <label
                          key={accountId}
                          className={
                            `facebook-page-option${selectedInstagramId ===
                              accountId
                              ? ' is-selected'
                              : ''
                            }`
                          }
                        >
                          <input
                            type="radio"
                            name="instagramAccount"
                            value={accountId}
                            checked={
                              selectedInstagramId ===
                              accountId
                            }
                            onChange={() =>
                              setSelectedInstagramId(
                                accountId,
                              )
                            }
                          />

                          <span className="facebook-page-option__icon">
                            <FaInstagram />
                          </span>

                          <span>
                            <strong>
                              {username}
                            </strong>

                            <small>
                              {account.name ||
                                'Instagram Professional account'}
                            </small>

                            {account
                              .facebookPageName && (
                                <small>
                                  Linked Page:{' '}
                                  {
                                    account
                                      .facebookPageName
                                  }
                                </small>
                              )}

                            <small>
                              Instagram ID:{' '}
                              {accountId}
                            </small>
                          </span>
                        </label>
                      );
                    },
                  )}
                </div>
              )}
            </div>


            <footer className="social-modal__footer">
              <button
                type="button"
                className="social-button social-button--secondary"
                onClick={
                  closeInstagramPicker
                }
              >
                Cancel
              </button>

              <button
                type="button"
                className="social-button social-button--primary"
                onClick={
                  handleInstagramConnect
                }
                disabled={
                  !selectedInstagramId ||
                  busyAction ===
                  'instagram-connect'
                }
              >
                <FaCheck />

                {' '}

                {busyAction ===
                  'instagram-connect'
                  ? 'Connecting…'
                  : 'Connect selected account'}
              </button>
            </footer>
          </section>
        </div>
      )}

    </main>
  );
}
