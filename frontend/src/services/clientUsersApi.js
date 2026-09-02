import { api } from './apiClient.js';

/** Client-user API through the server-side active-client context. */
export function getClientUsers({ signal } = {}) {
  return api.get('/client/users', { signal });
}

export function createClientUser(payload) {
  return api.post('/client/users', payload);
}
