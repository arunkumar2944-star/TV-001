import {
  api,
} from './apiClient.js';


/**
 * Get the active client.
 *
 * Backend determines the client from:
 *
 * CLIENT_ADMIN:
 *   req.user.client_id
 *
 * PLATFORM_ADMIN:
 *   req.session.activeClientId
 */
export function getActiveClient({
  signal,
} = {}) {
  return api.get(
    '/client',
    {
      signal,
    }
  );
}


/**
 * CLIENT_ADMIN updates the social platforms
 * belonging to their own client.
 *
 * No client ID is sent from the browser.
 */
export function updateActiveClientPlatforms(
  platforms
) {
  return api.put(
    '/client/platforms',
    {
      platforms,
    }
  );
}

// ======================================================
// CLIENT ONBOARDING
// ======================================================

export function getClientOnboardingservice({
  signal,
} = {}) {
  return api.get(
    '/client/onboarding',
    {
      signal,
    }
  );
}


export function startClientOnboarding() {
  return api.post(
    '/client/onboarding/start',
    {}
  );
}

// ======================================================
// COMPLETE CLIENT ONBOARDING
// ======================================================

export function completeClientOnboarding() {
  return api.post(
    '/client/onboarding/complete',
    {}
  );
}