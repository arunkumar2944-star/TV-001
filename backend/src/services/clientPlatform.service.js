'use strict';

const ApiError =
  require('../utils/ApiError');

const clientRepository =
  require(
    '../repositories/clientRepository'
  );


/**
 * ======================================================
 * NORMALIZE PLATFORM
 * ======================================================
 */

function normalizePlatform(
  platform
) {
  return String(
    platform || ''
  )
    .trim()
    .toLowerCase();
}


/**
 * ======================================================
 * ASSERT PLATFORM ENABLED
 * ======================================================
 *
 * Used by:
 *
 * - Facebook OAuth
 * - Instagram OAuth
 * - Telegram integration
 * - YouTube integration
 * - WhatsApp integration
 * - X integration
 * - Threads integration
 *
 * The client_social_platforms table remains
 * the source of truth.
 */

async function assertPlatformEnabled({
  clientId,
  platform,
}) {
  const safeClientId =
    Number(clientId);

  const safePlatform =
    normalizePlatform(
      platform
    );

  if (
    !Number.isInteger(
      safeClientId
    ) ||
    safeClientId <= 0
  ) {
    throw ApiError.badRequest(
      'Invalid client ID.'
    );
  }

  if (!safePlatform) {
    throw ApiError.badRequest(
      'Social platform is required.'
    );
  }

  const enabled =
    await clientRepository
      .isPlatformEnabled(
        safeClientId,
        safePlatform
      );

  if (!enabled) {
    throw ApiError.forbidden(
      `${formatPlatformName(
        safePlatform
      )} is not enabled for this client.`
    );
  }

  return true;
}


/**
 * ======================================================
 * GET ENABLED PLATFORMS
 * ======================================================
 */

async function getEnabledPlatforms(
  clientId
) {
  const safeClientId =
    Number(clientId);

  if (
    !Number.isInteger(
      safeClientId
    ) ||
    safeClientId <= 0
  ) {
    throw ApiError.badRequest(
      'Invalid client ID.'
    );
  }

  return clientRepository
    .listEnabledPlatforms(
      safeClientId
    );
}


/**
 * ======================================================
 * FORMAT PLATFORM NAME
 * ======================================================
 */

function formatPlatformName(
  platform
) {
  const value =
    normalizePlatform(
      platform
    );

  switch (value) {
    case 'facebook':
      return 'Facebook';

    case 'instagram':
      return 'Instagram';

    case 'whatsapp':
      return 'WhatsApp';

    case 'youtube':
      return 'YouTube';

    case 'telegram':
      return 'Telegram';

    case 'x':
      return 'X';

    case 'threads':
      return 'Threads';

    default:
      return value
        ? (
          value
            .charAt(0)
            .toUpperCase() +
          value.slice(1)
        )
        : 'Platform';
  }
}


module.exports = {
  assertPlatformEnabled,
  getEnabledPlatforms,
  normalizePlatform,
};