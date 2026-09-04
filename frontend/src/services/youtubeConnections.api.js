import {
  api,
} from './apiClient.js';


function requirePositiveId(
  value,
  label,
) {
  const id =
    Number(value);

  if (
    !Number.isInteger(id) ||
    id <= 0
  ) {
    throw new Error(
      `${label} is required.`,
    );
  }

  return id;
}


function unwrapApiData(
  response,
) {
  const payload =
    response?.data ??
    response;

  return (
    payload?.data ??
    payload ??
    null
  );
}


/**
 * =====================================================
 * START YOUTUBE OAUTH
 * =====================================================
 *
 * Client is resolved by backend from
 * req.session.activeClientId.
 *
 * No client ID in URL.
 */
export async function getYouTubeOAuthStartUrl() {
  const response =
    await api.get(
      '/client/social-connections/youtube/oauth/start',
    );

  const data =
    unwrapApiData(
      response,
    );

  if (
    !data?.authorizationUrl
  ) {
    throw new Error(
      'YouTube authorization URL was not returned by the server.',
    );
  }

  return data.authorizationUrl;
}


/**
 * =====================================================
 * GET OAUTH RESULT
 * =====================================================
 */
export async function getYouTubeOAuthResult() {
  const response =
    await api.get(
      '/client/social-connections/youtube/oauth/result',
    );

  return unwrapApiData(
    response,
  );
}


/**
 * =====================================================
 * TEST CONNECTION
 * =====================================================
 */
export async function testYouTubeConnection({
  connectionId,
}) {
  const safeConnectionId =
    requirePositiveId(
      connectionId,
      'Connection ID',
    );

  const response =
    await api.post(
      `/client/social-connections/youtube/${safeConnectionId}/test`,
    );

  return unwrapApiData(
    response,
  );
}