'use strict';

const axios =
  require('axios');

const ApiError =
  require('../utils/ApiError');

const clientRepository =
  require(
    '../repositories/clientRepository'
  );

const whatsappRepository =
  require(
    '../repositories/whatsapp.repository'
  );

const {
  whatsappConfig,
  validateWhatsAppGraphConfig,
  validateWhatsAppConfig,
  validateWhatsAppTestConfig,
} = require(
  '../config/whatsapp'
);
const {
  encryptToken,
  decryptToken,
} = require(
  '../utils/tokenEncryption'
);


// ======================================================
// CONSTANTS
// ======================================================

const PLATFORM =
  'WHATSAPP';

const REQUEST_TIMEOUT_MS =
  15000;

const OAUTH_OUTCOME_TTL_MS =
  10 * 60 * 1000;


// ======================================================
// ERROR HELPER
// ======================================================

function serviceError(
  message,
  statusCode = 500,
  code = null
) {
  return new ApiError(
    statusCode,
    message,
    code
      ? {
          code,
        }
      : {}
  );
}


// ======================================================
// NORMALIZERS
// ======================================================

function normalizePositiveInteger(
  value
) {
  const number =
    Number(value);

  return (
    Number.isInteger(number) &&
    number > 0
  )
    ? number
    : null;
}


function normalizeMetaId(
  value
) {
  const id =
    String(
      value ?? ''
    ).trim();

  return id || null;
}


// ======================================================
// GRAPH API URL
// ======================================================

function getGraphApiUrl() {
  validateWhatsAppGraphConfig();

  const base =
    String(
      whatsappConfig.graphBaseUrl
    ).replace(
      /\/+$/,
      ''
    );

  const version =
    String(
      whatsappConfig.graphVersion
    ).replace(
      /^\/+/,
      ''
    );

  return `${base}/${version}`;
}


// ======================================================
// TOKEN EXPIRY
// ======================================================

function calculateTokenExpiry(
  expiresIn
) {
  const seconds =
    Number(expiresIn);

  if (
    !Number.isFinite(seconds) ||
    seconds <= 0
  ) {
    return null;
  }

  return new Date(
    Date.now() +
    seconds * 1000
  );
}


// ======================================================
// META ERROR HELPERS
// ======================================================

function getMetaError(
  error
) {
  return (
    error?.response
      ?.data
      ?.error ||
    null
  );
}


function getSafeMetaErrorMessage(
  error,
  fallback
) {
  const metaError =
    getMetaError(
      error
    );

  return (
    metaError?.message ||
    error?.message ||
    fallback
  );
}


function getSafeMetaErrorCode(
  error
) {
  const metaError =
    getMetaError(
      error
    );

  return (
    metaError?.code ??
    error?.code ??
    null
  );
}


function isReauthError(
  error
) {
  const metaError =
    getMetaError(
      error
    );

  const status =
    Number(
      error?.response
        ?.status
    );

  const code =
    Number(
      metaError?.code
    );

  const message =
    String(
      metaError?.message ||
      error?.message ||
      ''
    )
      .trim()
      .toLowerCase();

  return (
    status === 401 ||
    code === 190 ||
    (
      message.includes(
        'access token'
      ) &&
      (
        message.includes(
          'expired'
        ) ||
        message.includes(
          'invalid'
        ) ||
        message.includes(
          'revoked'
        )
      )
    )
  );
}


// ======================================================
// CLIENT VALIDATION
// ======================================================

async function assertClient(
  clientId
) {
  const safeClientId =
    normalizePositiveInteger(
      clientId
    );

  if (!safeClientId) {
    throw serviceError(
      'Invalid client ID.',
      400,
      'INVALID_CLIENT_ID'
    );
  }

  const client =
    await clientRepository
      .findById(
        safeClientId
      );

  if (!client) {
    throw serviceError(
      'Client not found.',
      404,
      'CLIENT_NOT_FOUND'
    );
  }

  if (
    client.is_active === false ||
    client.active === false
  ) {
    throw serviceError(
      'Client is inactive.',
      409,
      'CLIENT_INACTIVE'
    );
  }

  return safeClientId;
}


// ======================================================
// CHECK WHATSAPP IS ENABLED FOR CLIENT
// ======================================================

async function assertWhatsAppEnabled(
  clientId
) {
  let enabled =
    null;

  if (
    typeof clientRepository
      .isPlatformEnabled ===
    'function'
  ) {
    enabled =
      await clientRepository
        .isPlatformEnabled(
          clientId,
          'whatsapp'
        );
  } else if (
    typeof clientRepository
      .listEnabledPlatforms ===
    'function'
  ) {
    const platforms =
      await clientRepository
        .listEnabledPlatforms(
          clientId
        );

    enabled =
      Array.isArray(platforms)
        ? platforms.some(
            (platform) =>
              String(
                platform
              )
                .trim()
                .toLowerCase() ===
              'whatsapp'
          )
        : false;
  }

  if (enabled === false) {
    throw serviceError(
      'WhatsApp is not enabled for this client.',
      409,
      'CLIENT_PLATFORM_NOT_ENABLED'
    );
  }

  return true;
}


// ======================================================
// EMBEDDED SIGNUP CONFIG FOR FRONTEND
// ======================================================
//
// Never return META_APP_SECRET.
//
// appId + configurationId are required by the
// Facebook JavaScript SDK Embedded Signup flow.
// ======================================================

function getEmbeddedSignupConfig() {
  validateWhatsAppConfig();

  return {
    appId:
      whatsappConfig.appId,

    configurationId:
      whatsappConfig
        .embeddedSignupConfigId,

    graphVersion:
      whatsappConfig
        .graphVersion,
  };
}


// ======================================================
// EXCHANGE EMBEDDED SIGNUP CODE
// ======================================================

async function exchangeCodeForAccessToken(
  code
) {
  validateWhatsAppConfig();

  const safeCode =
    String(
      code || ''
    ).trim();

  if (!safeCode) {
    throw serviceError(
      'WhatsApp Embedded Signup authorization code is required.',
      400,
      'WHATSAPP_AUTH_CODE_REQUIRED'
    );
  }

  const graphUrl =
    getGraphApiUrl();

  try {
    const response =
      await axios.get(
        `${graphUrl}/oauth/access_token`,
        {
          params: {
            client_id:
              whatsappConfig.appId,

            client_secret:
              whatsappConfig
                .appSecret,

            code:
              safeCode,
          },

          timeout:
            REQUEST_TIMEOUT_MS,
        }
      );

    const accessToken =
      response?.data
        ?.access_token;

    if (!accessToken) {
      throw serviceError(
        'Meta did not return a WhatsApp access token.',
        502,
        'WHATSAPP_ACCESS_TOKEN_MISSING'
      );
    }

    return {
      accessToken,

      tokenType:
        response.data
          ?.token_type ||
        'bearer',

      expiresIn:
        response.data
          ?.expires_in ??
        null,
    };

  } catch (error) {
    if (
      error instanceof
      ApiError
    ) {
      throw error;
    }

    throw serviceError(
      getSafeMetaErrorMessage(
        error,
        'WhatsApp authorization code could not be exchanged.'
      ),
      502,
      'WHATSAPP_TOKEN_EXCHANGE_FAILED'
    );
  }
}


// ======================================================
// GET WABA DETAILS
// ======================================================

async function getWhatsAppBusinessAccount({
  wabaId,
  accessToken,
}) {
  const safeWabaId =
    normalizeMetaId(
      wabaId
    );

  if (!safeWabaId) {
    throw serviceError(
      'WhatsApp Business Account ID is required.',
      400,
      'WHATSAPP_WABA_ID_REQUIRED'
    );
  }

  const graphUrl =
    getGraphApiUrl();

  const response =
    await axios.get(
      `${graphUrl}/${encodeURIComponent(
        safeWabaId
      )}`,
      {
        params: {
          fields:
            'id,name',
        },

        headers: {
          Authorization:
            `Bearer ${accessToken}`,
        },

        timeout:
          REQUEST_TIMEOUT_MS,
      }
    );

  return response.data;
}


// ======================================================
// GET PHONE NUMBERS BELONGING TO WABA
// ======================================================

async function getWabaPhoneNumbers({
  wabaId,
  accessToken,
}) {
  const safeWabaId =
    normalizeMetaId(
      wabaId
    );

  if (!safeWabaId) {
    throw serviceError(
      'WhatsApp Business Account ID is required.',
      400,
      'WHATSAPP_WABA_ID_REQUIRED'
    );
  }

  const graphUrl =
    getGraphApiUrl();

  const response =
    await axios.get(
      `${graphUrl}/${encodeURIComponent(
        safeWabaId
      )}/phone_numbers`,
      {
        params: {
          fields: [
            'id',
            'display_phone_number',
            'verified_name',
            'quality_rating',
          ].join(
            ','
          ),

          limit: 100,
        },

        headers: {
          Authorization:
            `Bearer ${accessToken}`,
        },

        timeout:
          REQUEST_TIMEOUT_MS,
      }
    );

  return Array.isArray(
    response?.data?.data
  )
    ? response.data.data
    : [];
}


// ======================================================
// VERIFY PHONE BELONGS TO WABA
// ======================================================

async function getSelectedPhoneNumber({
  wabaId,
  phoneNumberId,
  accessToken,
}) {
  const safePhoneNumberId =
    normalizeMetaId(
      phoneNumberId
    );

  if (!safePhoneNumberId) {
    throw serviceError(
      'WhatsApp phone number ID is required.',
      400,
      'WHATSAPP_PHONE_NUMBER_ID_REQUIRED'
    );
  }

  const phoneNumbers =
    await getWabaPhoneNumbers({
      wabaId,
      accessToken,
    });

  const phone =
    phoneNumbers.find(
      (item) =>
        String(
          item?.id || ''
        ) ===
        safePhoneNumberId
    );

  if (!phone) {
    throw serviceError(
      'The selected WhatsApp phone number does not belong to the selected WhatsApp Business Account.',
      409,
      'WHATSAPP_PHONE_WABA_MISMATCH'
    );
  }

  return phone;
}


// ======================================================
// OAUTH / EMBEDDED SIGNUP OUTCOME
// ======================================================

function setConnectionOutcome(
  session,
  {
    status,
    message = null,
    reason = null,

    clientId = null,
    connectionId = null,

    externalAccountId = null,
    externalAccountName = null,

    wabaId = null,
  }
) {
  if (!session) {
    return;
  }

  session.whatsappConnectionOutcome = {
    status,
    message,
    reason,

    clientId:
      normalizePositiveInteger(
        clientId
      ),

    connectionId:
      normalizePositiveInteger(
        connectionId
      ),

    externalAccountId:
      normalizeMetaId(
        externalAccountId
      ),

    externalAccountName:
      externalAccountName ||
      null,

    wabaId:
      normalizeMetaId(
        wabaId
      ),

    createdAt:
      Date.now(),
  };
}


function consumeConnectionOutcome(
  session
) {
  if (!session) {
    return null;
  }

  const outcome =
    session
      .whatsappConnectionOutcome ||
    null;

  delete session
    .whatsappConnectionOutcome;

  if (!outcome) {
    return null;
  }

  if (
    Date.now() -
      Number(
        outcome.createdAt || 0
      ) >
    OAUTH_OUTCOME_TTL_MS
  ) {
    return null;
  }

  return outcome;
}


// ======================================================
// CONNECT / RECONNECT VIA EMBEDDED SIGNUP
// ======================================================
//
// React will send:
//
// {
//   code,
//   wabaId,
//   phoneNumberId
// }
//
// The access token is NEVER supplied back to React.
// ======================================================

async function connectEmbeddedSignup({
  clientId,
  userId,

  code,
  wabaId,
  phoneNumberId,

  session = null,
}) {
  validateWhatsAppConfig();

  const safeClientId =
    await assertClient(
      clientId
    );

  await assertWhatsAppEnabled(
    safeClientId
  );

  const safeUserId =
    normalizePositiveInteger(
      userId
    );

  if (!safeUserId) {
    throw serviceError(
      'Authenticated user information is missing.',
      401,
      'AUTHENTICATED_USER_MISSING'
    );
  }

  const safeWabaId =
    normalizeMetaId(
      wabaId
    );

  const safePhoneNumberId =
    normalizeMetaId(
      phoneNumberId
    );

  if (!safeWabaId) {
    throw serviceError(
      'WhatsApp Business Account ID is required.',
      400,
      'WHATSAPP_WABA_ID_REQUIRED'
    );
  }

  if (!safePhoneNumberId) {
    throw serviceError(
      'WhatsApp phone number ID is required.',
      400,
      'WHATSAPP_PHONE_NUMBER_ID_REQUIRED'
    );
  }

  try {
    // --------------------------------------------------
    // 1. EXCHANGE EMBEDDED SIGNUP CODE
    // --------------------------------------------------

    const token =
      await exchangeCodeForAccessToken(
        code
      );


    // --------------------------------------------------
    // 2. VERIFY WABA
    // --------------------------------------------------

    const waba =
      await getWhatsAppBusinessAccount({
        wabaId:
          safeWabaId,

        accessToken:
          token.accessToken,
      });

    if (
      !waba?.id ||
      String(waba.id) !==
        safeWabaId
    ) {
      throw serviceError(
        'Meta returned a different WhatsApp Business Account.',
        409,
        'WHATSAPP_WABA_ID_MISMATCH'
      );
    }


    // --------------------------------------------------
    // 3. VERIFY SELECTED PHONE NUMBER
    // --------------------------------------------------

    const phone =
      await getSelectedPhoneNumber({
        wabaId:
          safeWabaId,

        phoneNumberId:
          safePhoneNumberId,

        accessToken:
          token.accessToken,
      });


    // --------------------------------------------------
    // 4. ENCRYPT TOKEN
    // --------------------------------------------------

    const {
      encryptedToken,
      iv,
      authTag,
    } =
      encryptToken(
        token.accessToken
      );


    // --------------------------------------------------
    // 5. BUILD SAFE METADATA
    // --------------------------------------------------

    const metadata = {
      waba_id:
        safeWabaId,

      waba_name:
        waba.name ||
        null,

      phone_number_id:
        safePhoneNumberId,

      display_phone_number:
        phone.display_phone_number ||
        null,

      verified_name:
        phone.verified_name ||
        null,

      quality_rating:
        phone.quality_rating ||
        null,

      graph_version:
        whatsappConfig
          .graphVersion,
    };


    const externalAccountName =
      phone.verified_name ||
      phone.display_phone_number ||
      'WhatsApp Business number';


    // --------------------------------------------------
    // 6. NORMALIZED DB UPSERT
    // --------------------------------------------------

    const connection =
      await whatsappRepository
        .upsertConnection({
          clientId:
            safeClientId,

          externalAccountId:
            safePhoneNumberId,

          externalAccountName,

          accessTokenEncrypted:
            encryptedToken,

          tokenIv:
            iv,

          tokenAuthTag:
            authTag,

          tokenExpiresAt:
            calculateTokenExpiry(
              token.expiresIn
            ),

          permissions: [
            ...whatsappConfig
              .scopes,
          ],

          metadata,

          connectedBy:
            safeUserId,
        });


    if (!connection) {
      throw serviceError(
        'WhatsApp connection could not be saved.',
        500,
        'WHATSAPP_CONNECTION_SAVE_FAILED'
      );
    }


    // --------------------------------------------------
    // 7. SAFE SESSION RESULT
    // --------------------------------------------------

    setConnectionOutcome(
      session,
      {
        status:
          'CONNECTED',

        message:
          `${externalAccountName} is connected and verified.`,

        clientId:
          safeClientId,

        connectionId:
          connection
            .connectionId,

        externalAccountId:
          safePhoneNumberId,

        externalAccountName,

        wabaId:
          safeWabaId,
      }
    );


    // --------------------------------------------------
    // 8. SAFE RESPONSE
    // --------------------------------------------------

    return {
      success: true,

      status:
        'CONNECTED',

      connectionId:
        connection
          .connectionId,

      clientId:
        safeClientId,

      platform:
        PLATFORM,

      externalAccountId:
        safePhoneNumberId,

      externalAccountName,

      phone: {
        id:
          safePhoneNumberId,

        displayPhoneNumber:
          phone
            .display_phone_number ||
          null,

        verifiedName:
          phone
            .verified_name ||
          null,

        qualityRating:
          phone
            .quality_rating ||
          null,
      },

      whatsappBusinessAccount: {
        id:
          safeWabaId,

        name:
          waba.name ||
          null,
      },
    };

  } catch (error) {
    setConnectionOutcome(
      session,
      {
        status:
          'ERROR',

        message:
          getSafeMetaErrorMessage(
            error,
            'WhatsApp connection could not be completed.'
          ),

        reason:
          getSafeMetaErrorCode(
            error
          ) ||
          error?.details?.code ||
          error?.code ||
          'WHATSAPP_CONNECTION_FAILED',

        clientId:
          safeClientId,

        wabaId:
          safeWabaId,
      }
    );

    throw error;
  }
}

// ======================================================
// CONNECT WHATSAPP CLOUD API TEST NUMBER
// ======================================================
//
// Development / learning mode.
//
// Credentials are read only from backend .env:
//
// WHATSAPP_TEST_ACCESS_TOKEN
// WHATSAPP_TEST_WABA_ID
// WHATSAPP_TEST_PHONE_NUMBER_ID
//
// Nothing sensitive is supplied by React.
// ======================================================

async function connectTestNumber({
  clientId,
  userId,
}) {
  validateWhatsAppTestConfig();


  // --------------------------------------------------
  // 1. VALIDATE ACTIVE CLIENT
  // --------------------------------------------------

  const safeClientId =
    await assertClient(
      clientId
    );


  await assertWhatsAppEnabled(
    safeClientId
  );


  // --------------------------------------------------
  // 2. VALIDATE AUTHENTICATED USER
  // --------------------------------------------------

  const safeUserId =
    normalizePositiveInteger(
      userId
    );


  if (!safeUserId) {
    throw serviceError(
      'Authenticated user information is missing.',
      401,
      'AUTHENTICATED_USER_MISSING'
    );
  }


  // --------------------------------------------------
  // 3. READ BACKEND-ONLY TEST CREDENTIALS
  // --------------------------------------------------

  const accessToken =
    String(
      whatsappConfig
        .testAccessToken ||
      ''
    ).trim();


  const wabaId =
    String(
      whatsappConfig
        .testWabaId ||
      ''
    ).trim();


  const phoneNumberId =
    String(
      whatsappConfig
        .testPhoneNumberId ||
      ''
    ).trim();


  try {

    // ------------------------------------------------
    // 4. VERIFY WABA
    // ------------------------------------------------

    const waba =
      await getWhatsAppBusinessAccount({
        wabaId,
        accessToken,
      });


    if (
      !waba?.id ||
      String(
        waba.id
      ) !==
      wabaId
    ) {
      throw serviceError(
        'Meta returned a different WhatsApp Business Account.',
        409,
        'WHATSAPP_WABA_ID_MISMATCH'
      );
    }


    // ------------------------------------------------
    // 5. VERIFY PHONE NUMBER BELONGS TO WABA
    // ------------------------------------------------

    const phone =
      await getSelectedPhoneNumber({
        wabaId,
        phoneNumberId,
        accessToken,
      });


    // ------------------------------------------------
    // 6. ENCRYPT ACCESS TOKEN
    // ------------------------------------------------

    const {
      encryptedToken,
      iv,
      authTag,
    } =
      encryptToken(
        accessToken
      );


    // ------------------------------------------------
    // 7. BUILD SAFE METADATA
    // ------------------------------------------------

    const metadata = {
      connection_mode:
        'CLOUD_API_TEST',

      test_number:
        true,

      waba_id:
        wabaId,

      waba_name:
        waba.name ||
        null,

      phone_number_id:
        phoneNumberId,

      display_phone_number:
        phone
          ?.display_phone_number ||
        null,

      verified_name:
        phone
          ?.verified_name ||
        null,

      quality_rating:
        phone
          ?.quality_rating ||
        null,

      graph_version:
        whatsappConfig
          .graphVersion,
    };


    const externalAccountName =
      phone
        ?.verified_name ||
      phone
        ?.display_phone_number ||
      'WhatsApp Cloud API test number';


    // ------------------------------------------------
    // 8. UPSERT NORMALIZED CONNECTION
    // ------------------------------------------------

    const connection =
      await whatsappRepository
        .upsertConnection({
          clientId:
            safeClientId,

          externalAccountId:
            phoneNumberId,

          externalAccountName,

          accessTokenEncrypted:
            encryptedToken,

          tokenIv:
            iv,

          tokenAuthTag:
            authTag,

          /*
           * Temporary dashboard tokens expire,
           * but Meta does not always provide us
           * an expiry timestamp here.
           *
           * Verification will detect expiry.
           */
          tokenExpiresAt:
            null,

          permissions: [
            'whatsapp_business_management',
            'whatsapp_business_messaging',
          ],

          metadata,

          connectedBy:
            safeUserId,
        });


    if (!connection) {
      throw serviceError(
        'WhatsApp test connection could not be saved.',
        500,
        'WHATSAPP_TEST_CONNECTION_SAVE_FAILED'
      );
    }


    // ------------------------------------------------
    // 9. RETURN SAFE RESPONSE
    // ------------------------------------------------

    return {
      success: true,

      status:
        'CONNECTED',

      connectionId:
        connection
          .connectionId,

      clientId:
        safeClientId,

      platform:
        PLATFORM,

      connectionMode:
        'CLOUD_API_TEST',

      externalAccountId:
        phoneNumberId,

      externalAccountName,

      phone: {
        id:
          phoneNumberId,

        displayPhoneNumber:
          phone
            ?.display_phone_number ||
          null,

        verifiedName:
          phone
            ?.verified_name ||
          null,

        qualityRating:
          phone
            ?.quality_rating ||
          null,
      },

      whatsappBusinessAccount: {
        id:
          wabaId,

        name:
          waba.name ||
          null,
      },
    };

  } catch (error) {

    // ------------------------------------------------
    // TEMPORARY TOKEN EXPIRED / REVOKED
    // ------------------------------------------------

    if (
      isReauthError(
        error
      )
    ) {
      throw serviceError(
        'The WhatsApp Cloud API test access token is invalid or expired. Generate a new temporary token in Meta Developers and restart the backend.',
        409,
        'WHATSAPP_TEST_TOKEN_EXPIRED'
      );
    }


    throw error;
  }
}
// ======================================================
// TEST / VERIFY SAVED CONNECTION
// ======================================================

async function verifyConnection({
  clientId,
  connectionId,
}) {
  const safeClientId =
    await assertClient(
      clientId
    );

  await assertWhatsAppEnabled(
    safeClientId
  );

  const safeConnectionId =
    normalizePositiveInteger(
      connectionId
    );

  if (!safeConnectionId) {
    throw serviceError(
      'Invalid WhatsApp connection ID.',
      400,
      'INVALID_CONNECTION_ID'
    );
  }


  const connection =
    await whatsappRepository
      .findCredentialByIdAndClientId({
        connectionId:
          safeConnectionId,

        clientId:
          safeClientId,
      });


  if (!connection) {
    throw serviceError(
      'WhatsApp connection was not found for this client.',
      404,
      'WHATSAPP_CONNECTION_NOT_FOUND'
    );
  }


  if (
    connection
      .client_connection_active ===
    false
  ) {
    throw serviceError(
      'WhatsApp is disconnected. Reconnect WhatsApp before testing the connection.',
      409,
      'WHATSAPP_CONNECTION_DISCONNECTED'
    );
  }


  if (
    !connection
      .access_token_encrypted ||
    !connection
      .token_iv ||
    !connection
      .token_auth_tag
  ) {
    throw serviceError(
      'Stored WhatsApp access token is incomplete.',
      500,
      'WHATSAPP_TOKEN_STORAGE_INVALID'
    );
  }


  if (
    connection
      .token_expires_at
  ) {
    const expiresAt =
      new Date(
        connection
          .token_expires_at
      );

    if (
      !Number.isNaN(
        expiresAt.getTime()
      ) &&
      expiresAt.getTime() <=
        Date.now()
    ) {
      const message =
        'WhatsApp access token has expired. Please reconnect WhatsApp.';

      await whatsappRepository
        .markReauthRequired({
          connectionId:
            safeConnectionId,

          errorCode:
            'WHATSAPP_TOKEN_EXPIRED',

          errorMessage:
            message,
        });

      throw serviceError(
        message,
        409,
        'WHATSAPP_REAUTH_REQUIRED'
      );
    }
  }


  try {
    // --------------------------------------------------
    // DECRYPT SERVER-SIDE ONLY
    // --------------------------------------------------

    const accessToken =
      decryptToken({
        encryptedToken:
          connection
            .access_token_encrypted,

        iv:
          connection
            .token_iv,

        authTag:
          connection
            .token_auth_tag,
      });


    if (!accessToken) {
      throw serviceError(
        'Stored WhatsApp access token could not be decrypted.',
        500,
        'WHATSAPP_TOKEN_DECRYPT_FAILED'
      );
    }


    const metadata =
      connection.metadata &&
      typeof connection.metadata ===
        'object'
        ? connection.metadata
        : {};


    const wabaId =
      normalizeMetaId(
        metadata.waba_id ??
        metadata.wabaId
      );


    if (!wabaId) {
      throw serviceError(
        'Stored WhatsApp Business Account ID is missing.',
        500,
        'WHATSAPP_WABA_ID_MISSING'
      );
    }


    const storedPhoneNumberId =
      normalizeMetaId(
        connection
          .external_account_id
      );


    if (!storedPhoneNumberId) {
      throw serviceError(
        'Stored WhatsApp phone number ID is missing.',
        500,
        'WHATSAPP_PHONE_NUMBER_ID_MISSING'
      );
    }


    // --------------------------------------------------
    // VERIFY WABA STILL ACCESSIBLE
    // --------------------------------------------------

    const waba =
      await getWhatsAppBusinessAccount({
        wabaId,
        accessToken,
      });


    // --------------------------------------------------
    // VERIFY PHONE STILL BELONGS TO WABA
    // --------------------------------------------------

    const phone =
      await getSelectedPhoneNumber({
        wabaId,
        phoneNumberId:
          storedPhoneNumberId,

        accessToken,
      });


    const updatedMetadata = {
      ...metadata,

      waba_id:
        wabaId,

      waba_name:
        waba.name ||
        metadata.waba_name ||
        null,

      phone_number_id:
        storedPhoneNumberId,

      display_phone_number:
        phone
          .display_phone_number ||
        null,

      verified_name:
        phone
          .verified_name ||
        null,

      quality_rating:
        phone
          .quality_rating ||
        null,

      graph_version:
        whatsappConfig
          .graphVersion,
    };


    await whatsappRepository
      .markVerified({
        connectionId:
          safeConnectionId,

        metadata:
          updatedMetadata,
      });


    const externalAccountName =
      phone.verified_name ||
      phone.display_phone_number ||
      connection
        .external_account_name ||
      'WhatsApp Business number';


    return {
      success: true,

      verified: true,

      status:
        'CONNECTED',

      connectionId:
        safeConnectionId,

      clientId:
        safeClientId,

      platform:
        PLATFORM,

      externalAccountId:
        storedPhoneNumberId,

      externalAccountName,

      phone: {
        id:
          storedPhoneNumberId,

        displayPhoneNumber:
          phone
            .display_phone_number ||
          null,

        verifiedName:
          phone
            .verified_name ||
          null,

        qualityRating:
          phone
            .quality_rating ||
          null,
      },

      whatsappBusinessAccount: {
        id:
          wabaId,

        name:
          waba.name ||
          null,
      },
    };

  } catch (error) {
    const errorMessage =
      getSafeMetaErrorMessage(
        error,
        'WhatsApp connection verification failed.'
      );

    const errorCode =
      getSafeMetaErrorCode(
        error
      );


    // --------------------------------------------------
    // TOKEN INVALID / REVOKED
    // --------------------------------------------------

    if (
      isReauthError(
        error
      )
    ) {
      await whatsappRepository
        .markReauthRequired({
          connectionId:
            safeConnectionId,

          errorCode:
            errorCode ||
            'WHATSAPP_REAUTH_REQUIRED',

          errorMessage,
        });

      throw serviceError(
        'WhatsApp authorization is no longer valid. Please reconnect WhatsApp.',
        409,
        'WHATSAPP_REAUTH_REQUIRED'
      );
    }


    // --------------------------------------------------
    // OTHER VERIFICATION FAILURE
    // --------------------------------------------------

    await whatsappRepository
      .markVerificationFailed({
        connectionId:
          safeConnectionId,

        errorCode:
          errorCode ||
          'WHATSAPP_VERIFICATION_FAILED',

        errorMessage,
      });


    throw error;
  }
}


// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  getEmbeddedSignupConfig,

  exchangeCodeForAccessToken,

  getWhatsAppBusinessAccount,
  getWabaPhoneNumbers,
  getSelectedPhoneNumber,

  connectEmbeddedSignup,

  // Cloud API development mode
  connectTestNumber,

  verifyConnection,

  consumeConnectionOutcome,
};