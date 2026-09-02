'use strict';

/**
 * Instagram frontend API service.
 *
 * IMPORTANT:
 * - Never send clientId.
 * - Never handle Meta access tokens.
 * - Active client comes from backend session.
 * - Meta tokens stay on backend.
 */
import { api, INSTAGRAM_BASE } from './apiClient.js';
const INSTAGRAM_BASE =
  '/client/social-connections/instagram';


/**
 * ------------------------------------------------------
 * OAuth start URL
 * ------------------------------------------------------
 *
 * This is browser navigation, NOT axios.
 */
export function getInstagramOAuthStartPath() {
  return `${INSTAGRAM_BASE}/oauth/start`;
}



export function startInstagramOAuth() {
  const apiUrl =
    import.meta.env.VITE_API_URL ||
    'http://localhost:4000/api';

  window.location.assign(
    `${apiUrl}${INSTAGRAM_BASE}/oauth/start`
  );
}

/**
 * ------------------------------------------------------
 * Read OAuth result
 * ------------------------------------------------------
 *
 * Possible statuses:
 *
 * IDLE
 * SELECT_ACCOUNT
 * ERROR
 */
export async function getInstagramOAuthResult() {
  const response =
    await api.get(
      `${INSTAGRAM_BASE}/oauth-result`
    );

  return response.data;
}


/**
 * ------------------------------------------------------
 * Get discovered Instagram accounts
 * ------------------------------------------------------
 *
 * Access tokens are NOT returned by backend.
 */
export async function getInstagramAccounts() {
  const response =
    await api.get(
      `${INSTAGRAM_BASE}/accounts`
    );

  return response.data;
}


/**
 * ------------------------------------------------------
 * Connect selected Instagram account
 * ------------------------------------------------------
 *
 * React sends only:
 *
 * {
 *   instagramUserId: "1784..."
 * }
 */
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
      `${INSTAGRAM_BASE}/connect`,
      {
        instagramUserId:
          String(instagramUserId),
      }
    );

  return response.data;
}


/**
 * ------------------------------------------------------
 * Cancel temporary Instagram OAuth flow
 * ------------------------------------------------------
 */
export async function cancelInstagramOAuth() {
  const response =
    await api.post(
      `${INSTAGRAM_BASE}/oauth/cancel`
    );

  return response.data;
}