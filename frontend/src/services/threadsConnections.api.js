import { api } from './apiClient.js';

function requirePositiveId(value, label) {
  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`${label} is required.`);
  }

  return id;
}

/**
 * Supports both forms used by Axios clients:
 *
 * 1. raw Axios response:     { data: { success, data: {...} } }
 * 2. response-body unwrap:   { success, data: {...} }
 */
function unwrapApiData(response) {
  const payload = response?.data ?? response;
  return payload?.data ?? payload ?? null;
}

export async function getThreadsOAuthStartUrl(clientId) {
  const safeClientId = requirePositiveId(
    clientId,
    'Client ID',
  );

  const response = await api.get(
    `/clients/${safeClientId}/social-connections/threads/oauth/start`,
  );

  const data = unwrapApiData(response);
  const authorizationUrl = data?.authorizationUrl;

  if (!authorizationUrl) {
    throw new Error(
      'Threads authorization URL was not returned by the server.',
    );
  }

  return authorizationUrl;
}

export async function getThreadsOAuthResult(clientId) {
  const safeClientId = requirePositiveId(
    clientId,
    'Client ID',
  );

  const response = await api.get(
    `/clients/${safeClientId}/social-connections/threads/oauth/result`,
  );

  return unwrapApiData(response);
}

export async function testThreadsConnection({
  clientId,
  connectionId,
}) {
  const safeClientId = requirePositiveId(
    clientId,
    'Client ID',
  );

  const safeConnectionId = requirePositiveId(
    connectionId,
    'Connection ID',
  );

  const response = await api.post(
    `/clients/${safeClientId}/social-connections/threads/${safeConnectionId}/test`,
  );

  return unwrapApiData(response);
}
