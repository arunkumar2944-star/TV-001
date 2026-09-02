/**
 * Single place where the browser talks to the API.
 *
 * - always sends the HttpOnly session cookie (credentials: 'include')
 * - mirrors the readable tv_csrf cookie into the X-CSRF-Token header
 * - never touches the database directly and never holds a secret
 */

const BASE_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '');
const CSRF_COOKIE = 'tv_csrf';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Raised for any non-2xx response. `message` is safe to show to the user. */
export class ApiError extends Error {
  constructor(message, { status, code, details, requestId, debug } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
    this.debug = debug;
  }

  get isAuthError() {
    return this.status === 401;
  }

  get isForbidden() {
    return this.status === 403;
  }

  /** Field-level messages produced by the backend validators. */
  get fieldErrors() {
    if (!Array.isArray(this.details)) return {};
    return this.details.reduce((acc, item) => {
      if (item && item.field) acc[item.field] = item.message;
      return acc;
    }, {});
  }
}

function readCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/** Broadcast so AuthContext can drop the session when the server rejects it. */
function announceSessionLost() {
  window.dispatchEvent(new CustomEvent('tv:session-expired'));
}

function buildQuery(params) {
  if (!params) return '';
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) value.forEach((item) => search.append(key, item));
    else search.append(key, value);
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

async function request(path, { method = 'GET', body, params, signal, isFormData = false } = {}) {
  const url = `${BASE_URL}${path}${buildQuery(params)}`;
  const headers = {};

  if (!SAFE_METHODS.has(method)) {
    const csrfToken = readCookie(CSRF_COOKIE);
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  }

  let payload;
  if (isFormData) {
    payload = body; // the browser sets the multipart boundary itself
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: payload,
      credentials: 'include',
      signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError('Cannot reach the Trichy Vision server. Check your connection and try again.', {
      status: 0,
    });
  }

  const requestId = response.headers.get('X-Request-Id');

  if (response.status === 204) return null;

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text().catch(() => null);

  if (!response.ok) {
    const message =
      (data && typeof data === 'object' && data.message) ||
      (typeof data === 'string' && data.slice(0, 200)) ||
      `Request failed (${response.status})`;

    if (response.status === 401) announceSessionLost();

    const debug =
      import.meta.env.DEV && data && typeof data === 'object'
        ? data.debug
        : undefined;

    if (import.meta.env.DEV && response.status >= 500 && debug) {
      console.error('API server error:', debug, {
        path,
        status: response.status,
        requestId,
      });
    }

    throw new ApiError(message, {
      status: response.status,
      code: data && data.code,
      details: data && data.details,
      requestId,
      debug,
    });
  }

  return data;
}

export const api = {
  get: (path, options) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
  put: (path, body, options) => request(path, { ...options, method: 'PUT', body }),
  delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
  upload: (path, formData, options) =>
    request(path, { ...options, method: 'POST', body: formData, isFormData: true }),
};

/** Absolute URL for a media file (streamed by the API, session-authenticated). */
export function mediaUrl(mediaId, { download = false } = {}) {
  return `${BASE_URL}/media/${mediaId}/${download ? 'download' : 'file'}`;
}

export { BASE_URL };
