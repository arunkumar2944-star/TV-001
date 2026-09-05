import { api } from './apiClient.js';


/**
 * Supports both API-client response formats:
 *
 * 1.
 * {
 *   data: {
 *     success: true,
 *     authorizationUrl: '...'
 *   }
 * }
 *
 * 2.
 * {
 *   success: true,
 *   authorizationUrl: '...'
 * }
 */
function unwrapApiResponse(response) {
  return (
    response?.data ??
    response ??
    null
  );
}


/**
 * Start X OAuth for the currently active client.
 *
 * Backend resolves client from the authenticated session.
 * No clientId is sent from React.
 */
export async function getXOAuthStartUrl() {
  const response =
    await api.get(
      '/client/social-connections/x/oauth/start'
    );


  const payload =
    unwrapApiResponse(
      response
    );


  const authorizationUrl =
    payload?.authorizationUrl ||
    payload?.authorization_url ||
    payload?.url;


  if (!authorizationUrl) {
    console.error(
      'Invalid X OAuth start response:',
      response
    );

    throw new Error(
      'X authorization URL was not returned by the server.'
    );
  }


  return authorizationUrl;
}


/**
 * Read and clear X OAuth result after
 * the backend callback completes.
 */
export async function getXOAuthResult() {
  const response =
    await api.get(
      '/client/social-connections/x/oauth/result'
    );


  return (
    unwrapApiResponse(
      response
    )
  );
}


/**
 * Verify an already stored X connection.
 */
export async function testXConnection({
  connectionId,
}) {
  const normalizedConnectionId =
    Number(
      connectionId
    );


  if (
    !Number.isInteger(
      normalizedConnectionId
    ) ||
    normalizedConnectionId <= 0
  ) {
    throw new Error(
      'A valid X connection ID is required.'
    );
  }


  const response =
    await api.post(
      `/client/social-connections/x/${normalizedConnectionId}/test`
    );


  return (
    unwrapApiResponse(
      response
    )
  );
}