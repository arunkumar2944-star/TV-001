'use strict';

const ApiError =
  require('../utils/ApiError');

const socialConnectionRepository =
  require(
    '../repositories/socialConnections.repository'
  );

const {
  verifyFacebookConnection,
} =
  require('./facebook.service');

const {
  verifyInstagramConnection,
} =
  require('./instagram.service');


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
      ? { code }
      : {}
  );
}


// ==========================================================
// SAFE PUBLIC CONNECTION
// ==========================================================
//
// Never expose:
// - encrypted token
// - IV
// - auth tag
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
// Never return this object directly to React.
// ==========================================================

async function getConnection(
  connectionId,
  clientId
) {
  return socialConnectionRepository
    .findByIdAndClientId(
      connectionId,
      clientId
    );
}

async function assertPlatformEnabled({
  clientId,
  platform,
}) {
  const enabled =
    await clientRepository
      .isPlatformEnabled(
        Number(clientId),
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
// Generic platform router:
//
// FACEBOOK
//     ↓
// verifyFacebookConnection()
//
// INSTAGRAM
//     ↓
// verifyInstagramConnection()
//
// Future platforms are added here.
// ==========================================================

async function verifyConnection({
  clientId,
  connectionId,
}) {
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

  await assertPlatformEnabled({
    clientId,
    platform:
      connection.platform,
  });

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

  const platform =
    String(
      connection.platform || ''
    )
      .trim()
      .toUpperCase();

  switch (platform) {
    case 'FACEBOOK':
      return verifyFacebookConnection(
        connection
      );

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
// ==========================================================

async function disconnectConnection({
  clientId,
  connectionId,
}) {
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

  await assertPlatformEnabled({
    clientId,
    platform:
      existing.platform,
  });

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