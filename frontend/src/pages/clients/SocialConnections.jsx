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
  connectTelegram,
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

import {
  getThreadsOAuthResult,
  getThreadsOAuthStartUrl,
  testThreadsConnection,
} from '../../services/threadsConnections.api.js';

import {
  getYouTubeOAuthResult,
  getYouTubeOAuthStartUrl,
  testYouTubeConnection,
} from '../../services/youtubeConnections.api.js';

import {
  getXOAuthResult,
  getXOAuthStartUrl,
  testXConnection,
} from '../../services/xConnections.api.js';


import {
  connectWhatsAppEmbeddedSignup,
  connectWhatsAppTestNumber,
  getWhatsAppEmbeddedSignupConfig,
  testWhatsAppConnection,

} from '../../services/whatsappConnections.api.js';

import {
  launchWhatsAppEmbeddedSignup,
  loadFacebookSdk,
} from '../../services/whatsappEmbeddedSignup.js';

import { formatDateTime } from '../../utils/format.js';
import { getConnectionUiState } from '../../utils/socialConnectionState.js';
import './social-connections.css';


// =====================================================
// PLATFORM CONFIGURATION
// =====================================================
//
// Facebook, Instagram, WhatsApp, Telegram, YouTube, X, and Threads are currently implemented.
// Any remaining platforms stay visible as roadmap items until
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
    available: true,
  },
  {
    code: 'youtube',
    name: 'YouTube',
    description:
      'Connect and verify a YouTube channel for future approved video publishing automation.',
    icon: FaYoutube,
    available: true,
  },
  {
    code: 'telegram',
    name: 'Telegram',
    description:
      'Telegram channel publishing integration.',
    icon: FaTelegramPlane,
    available: true,
  },
  {
    code: 'x',
    name: 'X',
    description:
      'Connect an X account for approved content publishing and automation.',
    icon: FaXTwitter,
    available: true,
  },
  {
    code: 'threads',
    name: 'Threads',
    description:
      'Connect a Threads account for approved content publishing and automation.',
    icon: FaThreads,
    available: true,
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
  DISCONNECTED: {
    label: 'Not connected',
    tone: 'neutral',
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


function getClientId(
  client,
) {
  const value =
    client?.client_id ??
    client?.clientId ??
    client?.id;

  const clientId =
    Number(value);

  return (
    Number.isInteger(clientId) &&
    clientId > 0
  )
    ? clientId
    : null;
}


function getAccountTypeLabel(
  platformCode,
) {
  switch (platformCode) {
    case 'facebook':
      return 'Facebook Page';

    case 'instagram':
      return 'Instagram Professional account';

    case 'telegram':
      return 'Telegram channel';

    case 'youtube':
      return 'YouTube channel';

    case 'threads':
      return 'Threads account';

    case 'x':
      return 'X account';

    case 'whatsapp':
      return 'WhatsApp Business phone number';
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
  // TELEGRAM CONNECTION STATE
  // ===================================================

  const [
    telegramModalOpen,
    setTelegramModalOpen,
  ] = useState(false);

  const [
    telegramBotToken,
    setTelegramBotToken,
  ] = useState('');

  const [
    telegramChannelId,
    setTelegramChannelId,
  ] = useState('');

  const [
    showTelegramToken,
    setShowTelegramToken,
  ] = useState(false);

  const [
    whatsappSignupConfig,
    setWhatsAppSignupConfig,
  ] = useState(null);

  const [
    whatsappSdkReady,
    setWhatsAppSdkReady,
  ] = useState(false);
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
  // PREPARE WHATSAPP EMBEDDED SIGNUP
  // ===================================================

  useEffect(() => {
    let active =
      true;


    async function prepareWhatsApp() {
      const enabled =
        getClientEnabledPlatforms(
          client,
        );


      if (
        !enabled.includes(
          'whatsapp',
        )
      ) {
        return;
      }


      try {
        const config =
          await getWhatsAppEmbeddedSignupConfig();


        if (!active) {
          return;
        }


        setWhatsAppSignupConfig(
          config,
        );


        await loadFacebookSdk({
          appId:
            config.appId,

          graphVersion:
            config.graphVersion,
        });


        if (!active) {
          return;
        }


        setWhatsAppSdkReady(
          true,
        );

      } catch (sdkError) {
        if (!active) {
          return;
        }


        setWhatsappSdkReadySafe(
          false,
        );


        setError(
          getErrorMessage(
            sdkError,
            'WhatsApp Embedded Signup could not be initialized.',
          ),
        );
      }
    }


    function setWhatsappSdkReadySafe(
      value,
    ) {
      if (active) {
        setWhatsAppSdkReady(
          value,
        );
      }
    }


    if (client) {
      void prepareWhatsApp();
    }


    return () => {
      active =
        false;
    };
  }, [client]);

  // ===================================================
  // WHATSAPP CONNECT / RECONNECT
  // ===================================================

  const beginWhatsAppEmbeddedSignup =
    useCallback(
      async () => {
        if (
          !whatsappSignupConfig
        ) {
          setError(
            'WhatsApp Embedded Signup configuration is not ready.',
          );

          return;
        }


        if (
          !whatsappSdkReady ||
          !window.FB
        ) {
          setError(
            'Meta login is still loading. Please try again in a moment.',
          );

          return;
        }


        try {
          setBusyAction(
            'whatsapp-connect',
          );

          setError('');
          setNotice('');


          /*
           * launchWhatsAppEmbeddedSignup()
           * invokes FB.login synchronously before
           * waiting for Meta results.
           */
          const signup =
            await launchWhatsAppEmbeddedSignup({
              configurationId:
                whatsappSignupConfig
                  .configurationId,
            });


          const connection =
            await connectWhatsAppEmbeddedSignup({
              code:
                signup.code,

              wabaId:
                signup.wabaId,

              phoneNumberId:
                signup.phoneNumberId,
            });


          const name =
            connection
              ?.externalAccountName ||
            connection
              ?.phone
              ?.verifiedName ||
            connection
              ?.phone
              ?.displayPhoneNumber ||
            'WhatsApp Business number';


          setNotice(
            `${name} is connected and verified.`,
          );


          await loadWorkspace();

        } catch (whatsappError) {
          setError(
            getErrorMessage(
              whatsappError,
              'WhatsApp Business connection could not be completed.',
            ),
          );
        } finally {
          setBusyAction('');
        }
      },
      [
        loadWorkspace,
        whatsappSdkReady,
        whatsappSignupConfig,
      ],
    );

async function beginWhatsAppTestConnection() {
  try {
    setBusyAction(
      'whatsapp-connect'
    );

    setError('');
    setNotice('');


    const result =
      await connectWhatsAppTestNumber();


    if (
      !result ||
      String(
        result.status || ''
      ).toUpperCase() !==
        'CONNECTED'
    ) {
      throw new Error(
        'WhatsApp test connection did not return CONNECTED status.'
      );
    }


    const accountName =
      result.externalAccountName ||
      result.phone
        ?.verifiedName ||
      result.phone
        ?.displayPhoneNumber ||
      'WhatsApp Cloud API test number';


    setNotice(
      `${accountName} is connected and verified.`
    );


    await loadWorkspace();

  } catch (connectError) {
    setError(
      getErrorMessage(
        connectError,
        'WhatsApp Cloud API test number could not be connected.'
      )
    );

  } finally {
    setBusyAction('');
  }
}
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



      if (!active) {
        return;
      }


      // -----------------------------------------------
      // YOUTUBE OAUTH RESULT
      // -----------------------------------------------

      if (
        enabledPlatforms.includes(
          'youtube',
        )
      ) {
        try {
          const youtubeOutcome =
            await getYouTubeOAuthResult();

          if (!active) {
            return;
          }

          if (
            youtubeOutcome
              ?.status ===
            'CONNECTED'
          ) {
            setNotice(
              youtubeOutcome
                .message ||
              'YouTube is connected and verified.',
            );

            await loadWorkspace();
          } else if (
            youtubeOutcome
              ?.status ===
            'ERROR'
          ) {
            setError(
              youtubeOutcome
                .message ||
              'YouTube authorization could not be completed.',
            );
          }
        } catch (youtubeError) {
          if (active) {
            setError(
              getErrorMessage(
                youtubeError,
                'Unable to read the YouTube connection result.',
              ),
            );
          }
        }
      }


      if (!active) {
        return;
      }


      // -----------------------------------------------
      // X OAUTH RESULT
      // -----------------------------------------------

      if (
        enabledPlatforms.includes(
          'x',
        )
      ) {
        try {
          const xOutcome =
            await getXOAuthResult();

          if (!active) {
            return;
          }

          if (
            xOutcome
              ?.status ===
            'CONNECTED'
          ) {
            setNotice(
              xOutcome
                .message ||
              'X is connected and verified.',
            );

            await loadWorkspace();
          } else if (
            xOutcome
              ?.status ===
            'ERROR'
          ) {
            setError(
              xOutcome
                .message ||
              'X authorization could not be completed.',
            );
          }
        } catch (xError) {
          if (active) {
            setError(
              getErrorMessage(
                xError,
                'Unable to read the X connection result.',
              ),
            );
          }
        }
      }


      if (!active) {
        return;
      }


      // -----------------------------------------------
      // THREADS OAUTH RESULT
      // -----------------------------------------------

      if (
        enabledPlatforms.includes(
          'threads',
        )
      ) {
        const clientId =
          getClientId(
            loadedClient,
          );

        if (clientId) {
          try {
            const threadsOutcome =
              await getThreadsOAuthResult(
                clientId,
              );

            if (!active) {
              return;
            }

            if (
              threadsOutcome
                ?.status ===
              'CONNECTED'
            ) {
              setNotice(
                threadsOutcome
                  .message ||
                'Threads is connected and verified.',
              );

              await loadWorkspace();
            } else if (
              threadsOutcome
                ?.status ===
              'ERROR'
            ) {
              setError(
                threadsOutcome
                  .message ||
                'Threads authorization could not be completed.',
              );
            }
          } catch (threadsError) {
            if (active) {
              setError(
                getErrorMessage(
                  threadsError,
                  'Unable to read the Threads connection result.',
                ),
              );
            }
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
  // START THREADS OAUTH / RECONNECT
  // ===================================================

  const beginThreadsOAuth =
    useCallback(
      async () => {
        const clientId =
          getClientId(client);

        if (!clientId) {
          setError(
            'A valid active client is required to connect Threads.',
          );
          return;
        }

        try {
          setBusyAction(
            'threads-oauth',
          );

          setError('');
          setNotice('');

          const authorizationUrl =
            await getThreadsOAuthStartUrl(
              clientId,
            );

          window.location.assign(
            authorizationUrl,
          );
        } catch (threadsError) {
          setError(
            getErrorMessage(
              threadsError,
              'Unable to start Threads authorization.',
            ),
          );

          setBusyAction('');
        }
      },
      [client],
    );

  // ===================================================
  // START YOUTUBE OAUTH / RECONNECT
  // ===================================================

  const beginYouTubeOAuth =
    useCallback(
      async () => {
        try {
          setBusyAction(
            'youtube-oauth',
          );

          setError('');
          setNotice('');

          const authorizationUrl =
            await getYouTubeOAuthStartUrl();

          window.location.assign(
            authorizationUrl,
          );
        } catch (youtubeError) {
          setError(
            getErrorMessage(
              youtubeError,
              'Unable to start YouTube authorization.',
            ),
          );

          setBusyAction('');
        }
      },
      [],
    );


  // ===================================================
  // START X OAUTH / RECONNECT
  // ===================================================

 const beginXOAuth =
  useCallback(
    async () => {
      try {
        setBusyAction(
          'x-oauth'
        );

        setError('');
        setNotice('');


        const authorizationUrl =
          await getXOAuthStartUrl();


        if (!authorizationUrl) {
          throw new Error(
            'X authorization URL was not returned by the server.'
          );
        }


        window.location.assign(
          authorizationUrl
        );

      } catch (xError) {
        console.error(
          'X OAuth start failed:',
          xError
        );


        const message =
          getErrorMessage(
            xError,
            'Unable to start X authorization.'
          );


        setError(
          message
        );


        setBusyAction('');


        /*
         * Error alert is at the top of the page.
         * Scroll there so the user sees it.
         */
        window.requestAnimationFrame(
          () => {
            window.scrollTo({
              top: 0,
              behavior:
                'smooth',
            });
          }
        );
      }
    },
    []
  );

  // ===================================================
  // TELEGRAM CONNECT / RECONNECT
  // ===================================================

  const beginTelegramConnect =
    useCallback(
      (platform = null) => {
        setError('');
        setNotice('');

        // Bot tokens are never returned by the backend.
        // Always require the user to enter the current token.
        setTelegramBotToken('');

        // Reuse the stored numeric channel ID during reconnect.
        // This avoids relying on a public @username.
        setTelegramChannelId(
          platform
            ?.connection
            ?.externalAccountId
            ? String(
              platform
                .connection
                .externalAccountId,
            )
            : '',
        );

        setShowTelegramToken(false);
        setTelegramModalOpen(true);
      },
      [],
    );


  const closeTelegramModal =
    useCallback(() => {
      if (
        busyAction ===
        'telegram-connect'
      ) {
        return;
      }

      setTelegramModalOpen(false);

      // Remove the credential from component memory when closed.
      setTelegramBotToken('');
      setTelegramChannelId('');
      setShowTelegramToken(false);
      setError('');
    }, [busyAction]);


  const handleTelegramConnect =
    useCallback(
      async (event) => {
        event?.preventDefault();

        const botToken =
          String(
            telegramBotToken ||
            '',
          ).trim();

        const channelId =
          String(
            telegramChannelId ||
            '',
          ).trim();

        if (!botToken) {
          setError(
            'Telegram bot token is required.',
          );
          return;
        }

        if (!channelId) {
          setError(
            'Telegram channel ID or username is required.',
          );
          return;
        }

        try {
          setBusyAction(
            'telegram-connect',
          );

          setError('');
          setNotice('');

          const connection =
            await connectTelegram({
              botToken,
              channelId,
            });

          const channelName =
            connection
              ?.channel
              ?.title ||
            connection
              ?.externalAccountName ||
            connection
              ?.external_account_name ||
            'Telegram channel';

          setTelegramModalOpen(false);

          // Never retain the bot token after a successful request.
          setTelegramBotToken('');
          setTelegramChannelId('');
          setShowTelegramToken(false);

          setNotice(
            `${channelName} is connected and verified.`,
          );

          await loadWorkspace();
        } catch (connectError) {
          setError(
            getErrorMessage(
              connectError,
              'Telegram channel could not be connected.',
            ),
          );
        } finally {
          setBusyAction('');
        }
      },
      [
        loadWorkspace,
        telegramBotToken,
        telegramChannelId,
      ],
    );


  // ===================================================
  // GENERIC VERIFY
  // ===================================================
  //
  // Used by Facebook and Telegram. Instagram is already
  // verified during its account-selection flow.
  // ===================================================

  const handleVerify =
  useCallback(
    async (platform) => {
      const connectionId =
        platform.connection
          ?.connectionId;


      if (!connectionId) {
        setError(
          `${platform.name} connection ID is missing.`
        );

        window.scrollTo({
          top: 0,
          behavior: 'smooth',
        });

        return;
      }


      try {
        setBusyAction(
          `verify-${connectionId}`
        );

        setError('');
        setNotice('');


        let result = null;


        // ===============================================
        // THREADS
        // ===============================================

        if (
          platform.code ===
          'threads'
        ) {
          const clientId =
            getClientId(
              client
            );


          if (!clientId) {
            throw new Error(
              'A valid active client is required to test Threads.'
            );
          }


          result =
            await testThreadsConnection({
              clientId,
              connectionId,
            });
        }


        // ===============================================
        // X
        // ===============================================

        else if (
          platform.code ===
          'x'
        ) {
          result =
            await testXConnection({
              connectionId,
            });
        }


        // ===============================================
        // YOUTUBE
        // ===============================================

        else if (
          platform.code ===
          'youtube'
        ) {
          result =
            await testYouTubeConnection({
              connectionId,
            });
        }


        // ===============================================
        // WHATSAPP
        // ===============================================

        else if (
          platform.code ===
          'whatsapp'
        ) {
          result =
            await testWhatsAppConnection({
              connectionId,
            });
        }


        // ===============================================
        // FACEBOOK / TELEGRAM / OTHER GENERIC
        // ===============================================

        else {
          result =
            await verifySocialConnection(
              connectionId
            );
        }


        // ===============================================
        // SUCCESS MESSAGE
        // ===============================================

        const successMessage =
          result?.message ||
          result?.data?.message ||
          `${platform.name} connection verified successfully.`;


        setNotice(
          successMessage
        );


        await loadWorkspace();


        /*
         * Alert is located near the top of
         * Social Connections page.
         *
         * Make the success message visible
         * after clicking Test connection.
         */
        window.requestAnimationFrame(
          () => {
            window.scrollTo({
              top: 0,
              behavior:
                'smooth',
            });
          }
        );

      } catch (verifyError) {
        console.error(
          `${platform.name} verification failed:`,
          verifyError
        );


        setError(
          getErrorMessage(
            verifyError,
            `${platform.name} verification failed.`
          )
        );


        await loadWorkspace();


        window.requestAnimationFrame(
          () => {
            window.scrollTo({
              top: 0,
              behavior:
                'smooth',
            });
          }
        );

      } finally {
        setBusyAction('');
      }
    },
    [
      client,
      loadWorkspace,
    ]
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
              'DISCONNECTED' ||
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
                                beginInstagramOAuth
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
                  {/* WHATSAPP */}

                  {platform.code ===
                    'whatsapp' && (
                      <>
                        {reconnect && (
                          <button
                            type="button"
                            className="social-button social-button--primary"
                            onClick={
                              beginWhatsAppTestConnection
                            }
                            disabled={
                              busyAction ===
                              'whatsapp-connect' ||
                              !whatsappSdkReady
                            }
                          >
                            <FaWhatsapp />

                            {' '}

                            {busyAction ===
                              'whatsapp-connect'
                              ? 'Connecting…'
                              : !whatsappSdkReady
                                ? 'Preparing Meta…'
                                : platform.connection
                                  ? 'Reconnect WhatsApp'
                                  : 'Connect WhatsApp'}
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
                                beginWhatsAppEmbeddedSignup
                              }
                              disabled={
                                busyAction ===
                                'whatsapp-connect' ||
                                !whatsappSdkReady
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
                  {/* YOUTUBE */}

                  {platform.code ===
                    'youtube' && (
                      <>
                        {reconnect && (
                          <button
                            type="button"
                            className="social-button social-button--primary"
                            onClick={
                              beginYouTubeOAuth
                            }
                            disabled={
                              busyAction ===
                              'youtube-oauth'
                            }
                          >
                            <FaYoutube />

                            {' '}

                            {busyAction ===
                              'youtube-oauth'
                              ? 'Opening Google…'
                              : platform.connection
                                ? 'Reconnect YouTube'
                                : 'Connect YouTube'}
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
                                beginYouTubeOAuth
                              }
                              disabled={
                                busyAction ===
                                'youtube-oauth'
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


                  {/* TELEGRAM */}

                  {platform.code ===
                    'telegram' && (
                      <>
                        {reconnect && (
                          <button
                            type="button"
                            className="social-button social-button--primary"
                            onClick={() =>
                              beginTelegramConnect(
                                platform,
                              )
                            }
                          >
                            <FaTelegramPlane />

                            {' '}

                            {platform.connection
                              ? 'Reconnect Telegram'
                              : 'Connect Telegram'}
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
                              onClick={() =>
                                beginTelegramConnect(
                                  platform,
                                )
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

                  {/* X */}

                  {platform.code ===
                    'x' && (
                      <>
                        {reconnect && (
                          <button
                            type="button"
                            className="social-button social-button--primary"
                            onClick={
                              beginXOAuth
                            }
                            disabled={
                              busyAction ===
                              'x-oauth'
                            }
                          >
                            <FaXTwitter />

                            {' '}

                            {busyAction ===
                              'x-oauth'
                              ? 'Opening X…'
                              : platform.connection
                                ? 'Reconnect X'
                                : 'Connect X'}
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
                                beginXOAuth
                              }
                              disabled={
                                busyAction ===
                                'x-oauth'
                              }
                            >
                              <FaRotate />

                              {' '}

                              {busyAction ===
                                'x-oauth'
                                ? 'Opening X…'
                                : 'Change / reconnect'}
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


                  {/* THREADS */}

                  {platform.code ===
                    'threads' && (
                      <>
                        {reconnect && (
                          <button
                            type="button"
                            className="social-button social-button--primary"
                            onClick={
                              beginThreadsOAuth
                            }
                            disabled={
                              busyAction ===
                              'threads-oauth'
                            }
                          >
                            <FaThreads />

                            {' '}

                            {busyAction ===
                              'threads-oauth'
                              ? 'Opening Threads…'
                              : platform.connection
                                ? 'Reconnect Threads'
                                : 'Connect Threads'}
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
                                beginThreadsOAuth
                              }
                              disabled={
                                busyAction ===
                                'threads-oauth'
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


      {/* ============================================= */}
      {/* TELEGRAM CONNECTION MODAL */}
      {/* ============================================= */}

      {telegramModalOpen && (
        <div
          className="social-modal-backdrop"
          role="presentation"
        >
          <section
            className="social-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="telegram-connect-title"
          >
            <header className="social-modal__header">
              <div>
                <p className="social-eyebrow">
                  Telegram publishing
                </p>

                <h2 id="telegram-connect-title">
                  Connect Telegram channel
                </h2>

                <p>
                  Enter the bot token issued by BotFather and the
                  target Telegram channel. The bot must be a channel
                  administrator with permission to post messages.
                </p>
              </div>

              <button
                type="button"
                className="social-modal__close"
                onClick={closeTelegramModal}
                disabled={
                  busyAction ===
                  'telegram-connect'
                }
                aria-label="Close Telegram connection dialog"
              >
                ×
              </button>
            </header>


            <form
              onSubmit={handleTelegramConnect}
            >
              <div className="social-modal__body">
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

                <div
                  style={{
                    display: 'grid',
                    gap: '18px',
                  }}
                >
                  <div
                    style={{
                      display: 'grid',
                      gap: '8px',
                    }}
                  >
                    <label
                      htmlFor="telegram-bot-token"
                      style={{
                        fontWeight: 700,
                      }}
                    >
                      Bot token
                    </label>

                    <input
                      id="telegram-bot-token"
                      type={
                        showTelegramToken
                          ? 'text'
                          : 'password'
                      }
                      value={telegramBotToken}
                      onChange={(event) =>
                        setTelegramBotToken(
                          event.target.value,
                        )
                      }
                      autoComplete="off"
                      spellCheck="false"
                      placeholder="123456789:AA..."
                      disabled={
                        busyAction ===
                        'telegram-connect'
                      }
                      required
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        minHeight: '46px',
                        padding: '10px 12px',
                        border: '1px solid #d0d5dd',
                        borderRadius: '8px',
                        font: 'inherit',
                      }}
                    />

                    <label
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        width: 'fit-content',
                        fontSize: '0.9rem',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={showTelegramToken}
                        onChange={(event) =>
                          setShowTelegramToken(
                            event.target.checked,
                          )
                        }
                        disabled={
                          busyAction ===
                          'telegram-connect'
                        }
                      />

                      Show bot token
                    </label>

                    <small>
                      The token is sent directly to the backend,
                      encrypted before storage, and never returned
                      to the browser.
                    </small>
                  </div>


                  <div
                    style={{
                      display: 'grid',
                      gap: '8px',
                    }}
                  >
                    <label
                      htmlFor="telegram-channel-id"
                      style={{
                        fontWeight: 700,
                      }}
                    >
                      Channel ID or username
                    </label>

                    <input
                      id="telegram-channel-id"
                      type="text"
                      value={telegramChannelId}
                      onChange={(event) =>
                        setTelegramChannelId(
                          event.target.value,
                        )
                      }
                      autoComplete="off"
                      spellCheck="false"
                      placeholder="-1001234567890 or @channel_username"
                      disabled={
                        busyAction ===
                        'telegram-connect'
                      }
                      required
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        minHeight: '46px',
                        padding: '10px 12px',
                        border: '1px solid #d0d5dd',
                        borderRadius: '8px',
                        font: 'inherit',
                      }}
                    />

                    <small>
                      For reconnecting, the saved numeric channel ID
                      is filled automatically when available.
                    </small>
                  </div>


                  <div
                    className="social-security-banner"
                    style={{
                      margin: 0,
                    }}
                  >
                    <span className="social-security-banner__icon">
                      <FaShieldHalved />
                    </span>

                    <div>
                      <strong>
                        Server-side verification
                      </strong>

                      <p>
                        Before saving, the backend validates the bot,
                        channel, administrator membership, and posting
                        permission with Telegram.
                      </p>
                    </div>
                  </div>
                </div>
              </div>


              <footer className="social-modal__footer">
                <button
                  type="button"
                  className="social-button social-button--secondary"
                  onClick={closeTelegramModal}
                  disabled={
                    busyAction ===
                    'telegram-connect'
                  }
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="social-button social-button--primary"
                  disabled={
                    !telegramBotToken.trim() ||
                    !telegramChannelId.trim() ||
                    busyAction ===
                    'telegram-connect'
                  }
                >
                  <FaTelegramPlane />

                  {' '}

                  {busyAction ===
                    'telegram-connect'
                    ? 'Connecting…'
                    : 'Connect Telegram'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

    </main>
  );
}
