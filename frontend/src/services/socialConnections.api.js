import { api, BASE_URL } from './apiClient.js';

const CONNECTIONS_PATH = '/client/social-connections';

export async function getClientSocialConnections({ signal } = {}) {
  const response = await api.get(CONNECTIONS_PATH, { signal });
  return Array.isArray(response?.data) ? response.data : [];
}

export function verifySocialConnection(connectionId) {
  return api.post(`${CONNECTIONS_PATH}/${Number(connectionId)}/verify`, {});
}

export function disconnectSocialConnection(connectionId) {
  return api.delete(`${CONNECTIONS_PATH}/${Number(connectionId)}`);
}

export async function getFacebookOAuthResult() {
  const response = await api.get(`${CONNECTIONS_PATH}/facebook/oauth-result`);
  return response?.data || { status: 'NONE' };
}

export function cancelFacebookOAuth() {
  return api.delete(`${CONNECTIONS_PATH}/facebook/oauth-result`);
}

export async function getFacebookOAuthPages() {
  const response = await api.get(`${CONNECTIONS_PATH}/facebook/pages`);
  return Array.isArray(response?.pages) ? response.pages : [];
}

export function connectFacebookPage(pageId) {
  return api.post(`${CONNECTIONS_PATH}/facebook/connect`, { pageId: String(pageId) });
}

export function getFacebookOAuthStartUrl() {
  return `${BASE_URL}${CONNECTIONS_PATH}/facebook/oauth/start`;
}


// ======================================================
// INSTAGRAM
// ======================================================

export function getInstagramOAuthStartUrl() {
  const apiBaseUrl =
    import.meta.env.VITE_API_BASE_URL ||
    'http://localhost:4000/api';

  return (
    `${apiBaseUrl}` +
    '/client/social-connections/instagram/oauth/start'
  );
}


// ======================================================
// INSTAGRAM OAUTH RESULT
// ======================================================

export async function getInstagramOAuthResult() {
  const response =
    await api.get(
      '/client/social-connections/instagram/oauth-result'
    );

  /*
   * apiClient already returns:
   *
   * {
   *   success: true,
   *   data: {
   *     status: 'SELECT_ACCOUNT',
   *     ...
   *   }
   * }
   */

  return (
    response?.data || {
      status: 'IDLE',
      reason: null,
      message: null,
      totalAccounts: 0,
    }
  );
}


// ======================================================
// INSTAGRAM DISCOVERED ACCOUNTS
// ======================================================

export async function getInstagramOAuthAccounts() {
  const response =
    await api.get(
      '/client/social-connections/instagram/accounts'
    );

  /*
   * Backend response:
   *
   * {
   *   success: true,
   *   totalAccounts: 1,
   *   accounts: [...]
   * }
   */

  return Array.isArray(
    response?.accounts
  )
    ? response.accounts
    : [];
}


// ======================================================
// CONNECT SELECTED INSTAGRAM ACCOUNT
// ======================================================

export async function connectInstagramAccount(
  instagramUserId
) {
  if (!instagramUserId) {
    throw new Error(
      'Instagram account ID is required.'
    );
  }

  const response =
    await api.post(
      '/client/social-connections/instagram/connect',
      {
        instagramUserId:
          String(instagramUserId),
      }
    );

  /*
   * Backend:
   *
   * {
   *   success: true,
   *   data: {...connection...}
   * }
   */

  return response?.data;
}


// ======================================================
// CANCEL INSTAGRAM OAUTH
// ======================================================

export async function cancelInstagramOAuth() {
  const response =
    await api.post(
      '/client/social-connections/instagram/oauth/cancel'
    );

  return response?.data;
}


// =====================================================
// CONNECT TELEGRAM
// =====================================================

export async function connectTelegram({
  botToken,
  channelId,
}) {
  const response =
    await api.post(
      '/client/social-connections/telegram/connect',
      {
        botToken,
        channelId,
      }
    );

  return (
    response?.data?.data?.connection ??
    response?.data?.data ??
    response?.data ??
    null
  );
}