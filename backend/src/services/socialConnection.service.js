'use strict';

const ApiError =
  require('../utils/ApiError');

const socialConnectionRepository =
  require(
    '../repositories/socialConnections.repository'
  );

const clientRepository =
  require(
    '../repositories/clientRepository'
  );

const {
  verifyFacebookConnection,
} =
  require(
    './facebook.service'
  );

const {
  verifyInstagramConnection,
} =
  require(
    './instagram.service'
  );

const {
  verifyStoredTelegramConnection,
} =
  require(
    './telegram.service'
  );
const {
  verifyStoredThreadsConnection,
} = require(
  './threads.service'
);

// ==========================================================
// SERVICE ERROR
// ==========================================================

function createServiceError(
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


// ==========================================================
// SAFE PUBLIC CONNECTION
// ==========================================================
//
// Never expose:
//
// - encrypted token
// - IV
// - auth tag
//
// ==========================================================

function toPublicConnection(
  row
) {
  return {
    connectionId:
      row.connection_id,

    clientId:
      row.client_id,

    platform:
      row.platform,

    externalAccountId:
      row.external_account_id,

    externalAccountName:
      row.external_account_name,

    connectionStatus:
      row.connection_status,

    clientConnectionActive:
      row.client_connection_active !==
      false,

    tokenExpiresAt:
      row.token_expires_at,

    tokenType:
      row.token_type,

    permissions:
      row.permissions,

    metadata:
      row.metadata,

    connectedAt:
      row.connected_at,

    verifiedAt:
      row.verified_at,

    lastVerifiedAt:
      row.last_verified_at,

    reconnectRequired:
      Boolean(
        row.reconnect_required
      ),

    lastErrorCode:
      row.last_error_code,

    lastErrorMessage:
      row.last_error_message,

    updatedAt:
      row.updated_at,
  };
}


// ==========================================================
// GET CLIENT CONNECTIONS
// ==========================================================

async function getClientConnections(
  clientId
) {
  const rows =
    await socialConnectionRepository
      .findByClientId(
        clientId
      );

  return rows.map(
    toPublicConnection
  );
}


// ==========================================================
// GET ONE INTERNAL CONNECTION
// ==========================================================
//
// Backend only.
//
// This may include encrypted token fields.
//
// Never return this object directly to React.
//
// ==========================================================

async function getConnection(
  connectionId,
  clientId
) {
  return (
    socialConnectionRepository
      .findByIdAndClientId(
        connectionId,
        clientId
      )
  );
}


// ==========================================================
// ASSERT PLATFORM ENABLED
// ==========================================================
//
// A stored connection must not be used if the platform
// has been disabled for the current client.
//
// ==========================================================

async function assertPlatformEnabled({
  clientId,
  platform,
}) {
  const enabled =
    await clientRepository
      .isPlatformEnabled(
        Number(
          clientId
        ),
        platform
      );

  if (!enabled) {
    throw createServiceError(
      `${platform} is not enabled for this client.`,
      409,
      'CLIENT_PLATFORM_NOT_ENABLED'
    );
  }
}


// ==========================================================
// VERIFY SOCIAL CONNECTION
// ==========================================================
//
// Generic platform verification router:
//
// FACEBOOK
//     ↓
// verifyFacebookConnection()
//
// INSTAGRAM
//     ↓
// verifyInstagramConnection()
//
// TELEGRAM
//     ↓
// verifyStoredTelegramConnection()
//
// Additional platforms will be added here later.
//
// ==========================================================

async function verifyConnection({
  clientId,
  connectionId,
}) {

  // ========================================================
  // 1. GET CONNECTION BELONGING TO CLIENT
  // ========================================================

  const connection =
    await socialConnectionRepository
      .findByIdAndClientId(
        connectionId,
        clientId
      );


  if (!connection) {
    throw createServiceError(
      'Social connection not found.',
      404,
      'SOCIAL_CONNECTION_NOT_FOUND'
    );
  }


  // ========================================================
  // 2. VERIFY PLATFORM IS STILL ENABLED
  // ========================================================

  await assertPlatformEnabled({
    clientId,

    platform:
      connection.platform,
  });


  // ========================================================
  // 3. VERIFY CLIENT CONNECTION IS ACTIVE
  // ========================================================

  if (
    connection
      .client_connection_active ===
    false
  ) {
    throw createServiceError(
      'This social connection is disconnected for the selected client.',
      409,
      'SOCIAL_CONNECTION_DISCONNECTED'
    );
  }


  // ========================================================
  // 4. NORMALIZE PLATFORM
  // ========================================================

  const platform =
    String(
      connection.platform ||
      ''
    )
      .trim()
      .toUpperCase();


  // ========================================================
  // 5. PLATFORM VERIFICATION ROUTER
  // ========================================================

  switch (
  platform
  ) {

    // ------------------------------------------------------
    // FACEBOOK
    // ------------------------------------------------------

    case 'FACEBOOK':
      return (
        verifyFacebookConnection(
          connection
        )
      );


    // ------------------------------------------------------
    // INSTAGRAM
    // ------------------------------------------------------

    case 'INSTAGRAM':
      return (
        verifyInstagramConnection(
          connection
        )
      );


    // ------------------------------------------------------
    // TELEGRAM
    // ------------------------------------------------------

    case 'TELEGRAM':
      return (
        verifyStoredTelegramConnection(
          connection
        )
      );
// ------------------------------------------------------
    // THREADS
    // ------------------------------------------------------

    case 'THREADS':
      return verifyStoredThreadsConnection(
        connection
      );
    // ------------------------------------------------------
    // UNSUPPORTED PLATFORM
    // ------------------------------------------------------

    default:
      throw createServiceError(
        `Connection verification is not supported for platform: ${platform}`,
        400,
        'PLATFORM_VERIFICATION_NOT_SUPPORTED'
      );
  }
}


// ==========================================================
// DISCONNECT SOCIAL CONNECTION
// ==========================================================
//
// Important:
//
// This disconnects only:
//
// client
//   ↕
// connection
//
// It does NOT delete the global token/account record.
//
// ==========================================================

async function disconnectConnection({
  clientId,
  connectionId,
}) {

  // ========================================================
  // 1. VERIFY CONNECTION EXISTS FOR CLIENT
  // ========================================================

  const existing =
    await socialConnectionRepository
      .findByIdAndClientId(
        connectionId,
        clientId
      );


  if (!existing) {
    throw createServiceError(
      'Social connection not found for this client.',
      404,
      'SOCIAL_CONNECTION_NOT_FOUND'
    );
  }


  // ========================================================
  // 2. VERIFY PLATFORM IS ENABLED
  // ========================================================

  await assertPlatformEnabled({
    clientId,

    platform:
      existing.platform,
  });


  // ========================================================
  // 3. SOFT DISCONNECT CLIENT RELATIONSHIP
  // ========================================================

  const connection =
    await socialConnectionRepository
      .disconnectConnection({
        clientId,
        connectionId,
      });


  if (!connection) {
    throw createServiceError(
      'Social connection could not be disconnected.',
      500,
      'SOCIAL_CONNECTION_DISCONNECT_FAILED'
    );
  }


  // ========================================================
  // 4. SAFE RESPONSE
  // ========================================================

  return {
    connectionId:
      connection.connection_id,

    clientId:
      connection.client_id,

    platform:
      connection.platform,

    externalAccountId:
      connection.external_account_id,

    externalAccountName:
      connection.external_account_name,

    connectionStatus:
      connection.connection_status,

    clientConnectionActive:
      connection
        .client_connection_active !==
      false,

    updatedAt:
      connection.updated_at,
  };
}


// ==========================================================
// EXPORTS
// ==========================================================

module.exports = {
  getClientConnections,
  getConnection,
  verifyConnection,
  disconnectConnection,
};