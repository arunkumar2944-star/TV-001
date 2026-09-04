import { api } from './apiClient.js';

/** Client-user API through the server-side active-client context. */
export function getClientUsers({ signal } = {}) {
  return api.get('/client/users', { signal });
}

export function createClientUser(payload) {
  return api.post('/client/users', payload);
}

/**
 * PLATFORM_ADMIN creates
 * the CLIENT_ADMIN for the
 * currently selected client.
 */
export function createClientAdmin(
  payload
) {
  return api.post(
    '/client/admin',
    payload
  );
}


export function getClientUserDetails(
  userId,
  {
    signal,
  } = {}
) {
  return api.get(
    `/client/users/${encodeURIComponent(
      userId
    )}`,
    {
      signal,
    }
  );
}


/**
 * Activate / deactivate a client user.
 *
 * PLATFORM_ADMIN:
 *   manages CLIENT_ADMIN
 *
 * CLIENT_ADMIN:
 *   manages CONTENT_CREATOR / APPROVER
 */
export function updateClientUserStatus(
  userId,
  isActive
) {
  return api.patch(
    `/client/users/${encodeURIComponent(
      userId
    )}/status`,
    {
      isActive,
    }
  );
}

export function updateClientUserProfile(
  userId,
  payload
) {
  return api.patch(
    `/client/users/${encodeURIComponent(
      userId
    )}/profile`,
    payload
  );
}