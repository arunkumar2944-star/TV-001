'use strict';

const axios =
  require('axios');

const ApiError =
  require('../utils/ApiError');

const {
  encryptToken,
  decryptToken,
} =
  require('../utils/tokenEncryption');

const clientRepository =
  require(
    '../repositories/clientRepository'
  );

const socialConnectionRepository =
  require(
    '../repositories/socialConnections.repository'
  );


const TELEGRAM_API_URL =
  'https://api.telegram.org';


function serviceError(
  message,
  status = 500,
  code
) {
  return new ApiError(
    status,
    message,
    code
      ? {
          code,
        }
      : {}
  );
}


function normalizeBotToken(
  value
) {
  const token =
    String(
      value || ''
    ).trim();

  return (
    token ||
    null
  );
}


function normalizeChannelId(
  value
) {
  const channelId =
    String(
      value || ''
    ).trim();

  return (
    channelId ||
    null
  );
}


function getTelegramErrorMessage(
  error
) {
  return (
    error?.response
      ?.data
      ?.description ||

    error?.message ||

    'Telegram request failed.'
  );
}


// ======================================================
// TELEGRAM API
// ======================================================

async function getTelegramBot({
  botToken,
}) {
  const response =
    await axios.get(
      `${TELEGRAM_API_URL}/bot${botToken}/getMe`,
      {
        timeout:
          15000,
      }
    );

  if (
    response.data?.ok !==
    true
  ) {
    throw serviceError(
      'Telegram bot token is invalid.',
      400,
      'TELEGRAM_INVALID_BOT_TOKEN'
    );
  }


  return (
    response.data.result
  );
}


async function getTelegramChannel({
  botToken,
  channelId,
}) {
  const response =
    await axios.get(
      `${TELEGRAM_API_URL}/bot${botToken}/getChat`,
      {
        params: {
          chat_id:
            channelId,
        },

        timeout:
          15000,
      }
    );


  if (
    response.data?.ok !==
    true
  ) {
    throw serviceError(
      'Telegram channel could not be found.',
      400,
      'TELEGRAM_CHANNEL_NOT_FOUND'
    );
  }


  return (
    response.data.result
  );
}


async function getTelegramBotMembership({
  botToken,
  channelId,
  botUserId,
}) {
  const response =
    await axios.get(
      `${TELEGRAM_API_URL}/bot${botToken}/getChatMember`,
      {
        params: {
          chat_id:
            channelId,

          user_id:
            botUserId,
        },

        timeout:
          15000,
      }
    );


  if (
    response.data?.ok !==
    true
  ) {
    throw serviceError(
      'Unable to verify Telegram bot channel membership.',
      400,
      'TELEGRAM_MEMBERSHIP_CHECK_FAILED'
    );
  }


  return (
    response.data.result
  );
}


// ======================================================
// VERIFY TELEGRAM
// ======================================================

async function verifyTelegramConnection({
  botToken,
  channelId,
}) {
  const normalizedToken =
    normalizeBotToken(
      botToken
    );

  const normalizedChannelId =
    normalizeChannelId(
      channelId
    );


  if (!normalizedToken) {
    throw serviceError(
      'Telegram bot token is required.',
      400,
      'TELEGRAM_BOT_TOKEN_REQUIRED'
    );
  }


  if (!normalizedChannelId) {
    throw serviceError(
      'Telegram channel ID or username is required.',
      400,
      'TELEGRAM_CHANNEL_ID_REQUIRED'
    );
  }


  try {

    // ==================================================
    // 1. BOT
    // ==================================================

    const bot =
      await getTelegramBot({
        botToken:
          normalizedToken,
      });


    if (!bot?.id) {
      throw serviceError(
        'Telegram returned an invalid bot.',
        400,
        'TELEGRAM_INVALID_BOT'
      );
    }


    // ==================================================
    // 2. CHANNEL
    // ==================================================

    const channel =
      await getTelegramChannel({
        botToken:
          normalizedToken,

        channelId:
          normalizedChannelId,
      });


    if (!channel?.id) {
      throw serviceError(
        'Telegram returned an invalid channel.',
        400,
        'TELEGRAM_INVALID_CHANNEL'
      );
    }


    /*
     * Our platform requirement is specifically
     * Telegram CHANNEL publishing.
     */
    if (
      String(
        channel.type || ''
      )
        .trim()
        .toLowerCase() !==
      'channel'
    ) {
      throw serviceError(
        'The selected Telegram chat must be a channel.',
        400,
        'TELEGRAM_CHANNEL_REQUIRED'
      );
    }


    // ==================================================
    // 3. BOT ADMIN MEMBERSHIP
    // ==================================================

    const membership =
      await getTelegramBotMembership({
        botToken:
          normalizedToken,

        channelId:
          channel.id,

        botUserId:
          bot.id,
      });


    const membershipStatus =
      String(
        membership?.status ||
        ''
      )
        .trim()
        .toLowerCase();


    const isAdministrator =
      membershipStatus ===
        'administrator' ||
      membershipStatus ===
        'creator';


    if (!isAdministrator) {
      throw serviceError(
        'Telegram bot must be an administrator of the channel.',
        400,
        'TELEGRAM_BOT_NOT_ADMIN'
      );
    }


    const canPostMessages =
      membershipStatus ===
        'creator' ||
      membership
        ?.can_post_messages ===
        true;


    if (!canPostMessages) {
      throw serviceError(
        'Telegram bot does not have permission to post messages.',
        400,
        'TELEGRAM_POST_PERMISSION_REQUIRED'
      );
    }


    return {
      botToken:
        normalizedToken,

      bot: {
        id:
          bot.id,

        username:
          bot.username ||
          null,

        firstName:
          bot.first_name ||
          null,
      },

      channel: {
        id:
          String(
            channel.id
          ),

        title:
          channel.title ||
          null,

        username:
          channel.username ||
          null,

        type:
          channel.type ||
          null,
      },

      permissions: {
        status:
          membershipStatus,

        canPostMessages:
          true,
      },
    };

  } catch (error) {
    if (
      error instanceof
      ApiError
    ) {
      throw error;
    }


    throw serviceError(
      getTelegramErrorMessage(
        error
      ),
      400,
      'TELEGRAM_VERIFICATION_FAILED'
    );
  }
}


// ======================================================
// CONNECT TELEGRAM
// ======================================================

async function connectTelegram({
  clientId,
  connectedBy,
  botToken,
  channelId,
}) {
  const normalizedClientId =
    Number(clientId);


  if (
    !Number.isInteger(
      normalizedClientId
    ) ||
    normalizedClientId <= 0
  ) {
    throw serviceError(
      'A valid active client is required.',
      400,
      'INVALID_CLIENT'
    );
  }


  // ====================================================
  // VERIFY TELEGRAM IS ENABLED FOR CLIENT
  // ====================================================

  const enabledPlatforms =
    await clientRepository
      .findEnabledSocialPlatforms(
        normalizedClientId
      );


  const telegramEnabled =
    enabledPlatforms.some(
      (row) =>
        String(
          row?.platform ||
          ''
        )
          .trim()
          .toLowerCase() ===
        'telegram'
    );


  if (!telegramEnabled) {
    throw serviceError(
      'Telegram is not enabled for this client.',
      409,
      'TELEGRAM_NOT_ENABLED'
    );
  }


  // ====================================================
  // VERIFY WITH TELEGRAM
  // ====================================================

  const verified =
    await verifyTelegramConnection({
      botToken,
      channelId,
    });


  // ====================================================
  // ENCRYPT BOT TOKEN
  // ====================================================

  const {
    encryptedToken,
    iv,
    authTag,
  } =
    encryptToken(
      verified.botToken
    );


  /*
   * We never use verified.botToken after
   * this point except as encrypted storage.
   */


  // ====================================================
  // SAVE CONNECTION
  // ====================================================

  const connection =
    await socialConnectionRepository
      .upsertTelegramConnection({
        clientId:
          normalizedClientId,

        connectedBy,

        externalAccountId:
          verified.channel.id,

        externalAccountName:
          verified.channel.title,

        encryptedToken,

        iv,

        authTag,

        permissions: [
          'can_post_messages',
        ],

        metadata: {
          botId:
            String(
              verified.bot.id
            ),

          botUsername:
            verified.bot.username,

          channelUsername:
            verified.channel.username,

          channelType:
            verified.channel.type,

          administratorStatus:
            verified.permissions.status,
        },
      });


  if (!connection) {
    throw serviceError(
      'Telegram connection could not be saved.',
      500,
      'TELEGRAM_CONNECTION_SAVE_FAILED'
    );
  }


  // ====================================================
  // MARK VERIFIED
  // ====================================================

  const verifiedConnection =
    await socialConnectionRepository
      .markVerified({
        connectionId:
          connection.connection_id,

        externalAccountName:
          verified.channel.title,
      });


  if (!verifiedConnection) {
    throw serviceError(
      'Telegram connection status could not be updated.',
      500,
      'TELEGRAM_CONNECTION_UPDATE_FAILED'
    );
  }


  // ====================================================
  // SAFE RESPONSE
  // ====================================================

  return {
    connectionId:
      verifiedConnection.connection_id,

    clientId:
      normalizedClientId,

    platform:
      'TELEGRAM',

    externalAccountId:
      verified.channel.id,

    externalAccountName:
      verified.channel.title,

    connectionStatus:
      verifiedConnection
        .connection_status,

    verifiedAt:
      verifiedConnection
        .verified_at,

    lastVerifiedAt:
      verifiedConnection
        .last_verified_at,

    reconnectRequired:
      Boolean(
        verifiedConnection
          .reconnect_required
      ),

    bot: {
      username:
        verified.bot.username,
    },

    channel: {
      id:
        verified.channel.id,

      title:
        verified.channel.title,

      username:
        verified.channel.username,
    },
  };
}

// ======================================================
// VERIFY STORED TELEGRAM CONNECTION
// ======================================================

async function verifyStoredTelegramConnection(
  connection
) {
  if (!connection) {
    throw serviceError(
      'Telegram connection is missing.',
      404,
      'TELEGRAM_CONNECTION_MISSING'
    );
  }


  if (
    connection
      .client_connection_active ===
      false ||
    String(
      connection
        .connection_status ||
      ''
    )
      .trim()
      .toUpperCase() ===
      'DISCONNECTED'
  ) {
    throw serviceError(
      'Telegram is disconnected. Connect Telegram again before verification.',
      409,
      'TELEGRAM_CONNECTION_DISCONNECTED'
    );
  }


  const connectionId =
    Number(
      connection.connection_id
    );


  if (
    !Number.isInteger(
      connectionId
    ) ||
    connectionId <= 0
  ) {
    throw serviceError(
      'Stored Telegram connection is invalid.',
      500,
      'TELEGRAM_CONNECTION_INVALID'
    );
  }


  if (
    !connection
      .external_account_id
  ) {
    throw serviceError(
      'Stored Telegram channel ID is missing.',
      500,
      'TELEGRAM_CHANNEL_ID_MISSING'
    );
  }


  if (
    !connection
      .access_token_encrypted ||
    !connection.token_iv ||
    !connection.token_auth_tag
  ) {
    throw serviceError(
      'Stored Telegram bot token is incomplete.',
      500,
      'TELEGRAM_TOKEN_STORAGE_INVALID'
    );
  }


  try {

    // ==================================================
    // 1. DECRYPT BOT TOKEN
    // ==================================================

    const botToken =
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


    // ==================================================
    // 2. VERIFY AGAINST TELEGRAM
    // ==================================================

    const verified =
      await verifyTelegramConnection({
        botToken,

        channelId:
          connection
            .external_account_id,
      });


    // ==================================================
    // 3. VERIFY SAME CHANNEL
    // ==================================================

    if (
      String(
        verified
          ?.channel
          ?.id ||
        ''
      ) !==
      String(
        connection
          .external_account_id
      )
    ) {
      throw serviceError(
        'Telegram returned a different channel than the stored connection.',
        409,
        'TELEGRAM_CHANNEL_ID_MISMATCH'
      );
    }


    // ==================================================
    // 4. UPDATE VERIFIED STATUS
    // ==================================================

    const updated =
      await socialConnectionRepository
        .markVerified({
          connectionId,

          externalAccountName:
            verified
              .channel
              .title,
        });


    if (!updated) {
      throw serviceError(
        'Telegram connection status could not be updated.',
        500,
        'TELEGRAM_CONNECTION_UPDATE_FAILED'
      );
    }


    // ==================================================
    // 5. SAFE RESPONSE
    // ==================================================

    return {
      connectionId:
        updated
          .connection_id,

      clientId:
        connection.client_id,

      platform:
        'TELEGRAM',

      externalAccountId:
        verified
          .channel
          .id,

      externalAccountName:
        verified
          .channel
          .title,

      connectionStatus:
        updated
          .connection_status,

      verifiedAt:
        updated
          .verified_at,

      lastVerifiedAt:
        updated
          .last_verified_at,

      reconnectRequired:
        Boolean(
          updated
            .reconnect_required
        ),

      verified:
        true,

      bot: {
        username:
          verified
            .bot
            .username,
      },

      channel: {
        id:
          verified
            .channel
            .id,

        title:
          verified
            .channel
            .title,

        username:
          verified
            .channel
            .username,
      },
    };

  } catch (error) {

    const errorMessage =
      error?.message ||
      'Telegram verification failed.';


    /*
     * If Telegram says Unauthorized,
     * the bot token was normally revoked
     * or regenerated.
     */
    const reconnectRequired =
      /unauthorized|invalid bot token|token.*invalid|token.*revoked/i
        .test(
          errorMessage
        );


    try {
      await socialConnectionRepository
        .markVerificationFailed({
          connectionId,

          errorCode:
            reconnectRequired
              ? 'TELEGRAM_TOKEN_INVALID'
              : 'TELEGRAM_VERIFICATION_ERROR',

          errorMessage,

          reconnectRequired,
        });

    } catch (
      databaseError
    ) {
      console.error(
        'Unable to store Telegram verification failure:',
        databaseError.message
      );
    }


    if (
      reconnectRequired
    ) {
      throw serviceError(
        'Telegram bot authorization is no longer valid. Please reconnect Telegram.',
        409,
        'TELEGRAM_RECONNECT_REQUIRED'
      );
    }


    if (
      error instanceof
      ApiError
    ) {
      throw error;
    }


    throw serviceError(
      errorMessage,
      502,
      'TELEGRAM_VERIFICATION_FAILED'
    );
  }
}

module.exports = {
  verifyTelegramConnection,
  verifyStoredTelegramConnection,
  connectTelegram,
};