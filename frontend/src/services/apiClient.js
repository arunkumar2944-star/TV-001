/**
 * =========================================================
 * API CLIENT
 * =========================================================
 *
 * Single place where the browser communicates with the API.
 *
 * Responsibilities:
 *
 * - Uses the configured API base URL
 * - Sends HttpOnly authentication/session cookies
 * - Sends CSRF token for unsafe HTTP methods
 * - Serializes JSON request bodies
 * - Supports FormData uploads
 * - Normalizes API errors
 * - Broadcasts session expiry
 *
 * IMPORTANT:
 *
 * Do NOT place client/user/social-specific business logic here.
 *
 * Domain API files such as:
 *
 *   clientApi.js
 *   clientUsersApi.js
 *   socialConnectionsApi.js
 *
 * should call this generic API client.
 *
 * =========================================================
 */


// =========================================================
// CONFIGURATION
// =========================================================

const BASE_URL =
  (
    import.meta.env.VITE_API_URL ||
    '/api'
  ).replace(
    /\/+$/,
    ''
  );


const CSRF_COOKIE =
  'tv_csrf';


const SAFE_METHODS =
  new Set([
    'GET',
    'HEAD',
    'OPTIONS',
  ]);


// =========================================================
// API ERROR
// =========================================================

/**
 * Raised for every non-2xx API response.
 *
 * `message` is suitable for displaying to the user.
 */
export class ApiError
  extends Error {

  constructor(
    message,
    {
      status,
      code,
      details,
      requestId,
      debug,
    } = {}
  ) {
    super(
      message
    );


    this.name =
      'ApiError';

    this.status =
      status;

    this.code =
      code;

    this.details =
      details;

    this.requestId =
      requestId;

    this.debug =
      debug;
  }


  // -------------------------------------------------------
  // AUTHENTICATION ERROR
  // -------------------------------------------------------

  get isAuthError() {
    return (
      this.status ===
      401
    );
  }


  // -------------------------------------------------------
  // AUTHORIZATION ERROR
  // -------------------------------------------------------

  get isForbidden() {
    return (
      this.status ===
      403
    );
  }


  // -------------------------------------------------------
  // CONFLICT
  // -------------------------------------------------------

  get isConflict() {
    return (
      this.status ===
      409
    );
  }


  // -------------------------------------------------------
  // VALIDATION ERROR
  // -------------------------------------------------------

  get isValidationError() {
    return (
      this.status ===
        400 ||
      this.status ===
        422
    );
  }


  /**
   * Field-level validation messages returned by backend.
   *
   * Expected:
   *
   * details: [
   *   {
   *     field: 'email',
   *     message: 'Email is invalid'
   *   }
   * ]
   */
  get fieldErrors() {
    if (
      !Array.isArray(
        this.details
      )
    ) {
      return {};
    }


    return this.details.reduce(
      (
        result,
        item
      ) => {

        if (
          item &&
          item.field
        ) {
          result[
            item.field
          ] =
            item.message;
        }


        return result;
      },
      {}
    );
  }
}


// =========================================================
// COOKIE HELPER
// =========================================================

function readCookie(
  name
) {
  if (
    typeof document ===
    'undefined'
  ) {
    return null;
  }


  const escapedName =
    String(
      name
    ).replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&'
    );


  const match =
    document.cookie.match(
      new RegExp(
        `(?:^|; )${escapedName}=([^;]*)`
      )
    );


  return match
    ? decodeURIComponent(
        match[1]
      )
    : null;
}


// =========================================================
// SESSION LOST EVENT
// =========================================================

/**
 * AuthContext listens for this event.
 *
 * If the backend returns 401,
 * the current frontend session is cleared.
 */
function announceSessionLost() {
  if (
    typeof window ===
    'undefined'
  ) {
    return;
  }


  window.dispatchEvent(
    new CustomEvent(
      'tv:session-expired'
    )
  );
}


// =========================================================
// QUERY BUILDER
// =========================================================

function buildQuery(
  params
) {
  if (
    !params
  ) {
    return '';
  }


  const search =
    new URLSearchParams();


  Object.entries(
    params
  ).forEach(
    ([
      key,
      value,
    ]) => {

      if (
        value ===
          undefined ||
        value ===
          null ||
        value ===
          ''
      ) {
        return;
      }


      if (
        Array.isArray(
          value
        )
      ) {
        value.forEach(
          (item) => {

            if (
              item ===
                undefined ||
              item ===
                null
            ) {
              return;
            }


            search.append(
              key,
              String(
                item
              )
            );
          }
        );

        return;
      }


      search.append(
        key,
        String(
          value
        )
      );
    }
  );


  const query =
    search.toString();


  return query
    ? `?${query}`
    : '';
}


// =========================================================
// NORMALIZE PATH
// =========================================================

function normalizePath(
  path
) {
  const value =
    String(
      path ??
      ''
    ).trim();


  if (
    !value
  ) {
    throw new Error(
      'API path is required.'
    );
  }


  return value.startsWith(
    '/'
  )
    ? value
    : `/${value}`;
}


// =========================================================
// REQUEST
// =========================================================

async function request(
  path,
  {
    method = 'GET',
    body,
    params,
    signal,
    isFormData = false,
    headers:
      customHeaders = {},
  } = {}
) {

  // -------------------------------------------------------
  // METHOD
  // -------------------------------------------------------

  const normalizedMethod =
    String(
      method ||
      'GET'
    )
      .trim()
      .toUpperCase();


  // -------------------------------------------------------
  // URL
  // -------------------------------------------------------

  const normalizedPath =
    normalizePath(
      path
    );


  const url =
    `${BASE_URL}${normalizedPath}${buildQuery(
      params
    )}`;


  // -------------------------------------------------------
  // HEADERS
  // -------------------------------------------------------

  const headers = {
    ...customHeaders,
  };


  // -------------------------------------------------------
  // CSRF
  // -------------------------------------------------------

  if (
    !SAFE_METHODS.has(
      normalizedMethod
    )
  ) {
    const csrfToken =
      readCookie(
        CSRF_COOKIE
      );


    if (
      csrfToken
    ) {
      headers[
        'X-CSRF-Token'
      ] =
        csrfToken;
    }
  }


  // -------------------------------------------------------
  // REQUEST BODY
  // -------------------------------------------------------

  let payload;


  if (
    isFormData
  ) {

    /*
     * Do NOT manually set Content-Type.
     *
     * Browser must generate:
     *
     * multipart/form-data;
     * boundary=...
     */

    payload =
      body;

  } else if (
    body !==
    undefined
  ) {

    headers[
      'Content-Type'
    ] =
      'application/json';


    payload =
      JSON.stringify(
        body
      );
  }


  // -------------------------------------------------------
  // FETCH
  // -------------------------------------------------------

  let response;


  try {

    response =
      await fetch(
        url,
        {
          method:
            normalizedMethod,

          headers,

          body:
            payload,

          /*
           * Required for authentication cookie.
           */
          credentials:
            'include',

          signal,
        }
      );

  } catch (error) {

    if (
      error?.name ===
      'AbortError'
    ) {
      throw error;
    }


    throw new ApiError(
      'Cannot reach the Trichy Vision server. Check your connection and try again.',
      {
        status: 0,
      }
    );
  }


  // -------------------------------------------------------
  // REQUEST ID
  // -------------------------------------------------------

  const requestId =
    response.headers.get(
      'X-Request-Id'
    );


  // -------------------------------------------------------
  // NO CONTENT
  // -------------------------------------------------------

  if (
    response.status ===
    204
  ) {
    return null;
  }


  // -------------------------------------------------------
  // RESPONSE BODY
  // -------------------------------------------------------

  const contentType =
    response.headers.get(
      'content-type'
    ) ||
    '';


  let data = null;


  if (
    contentType.includes(
      'application/json'
    )
  ) {

    data =
      await response
        .json()
        .catch(
          () => null
        );

  } else {

    data =
      await response
        .text()
        .catch(
          () => null
        );
  }


  // -------------------------------------------------------
  // ERROR RESPONSE
  // -------------------------------------------------------

  if (
    !response.ok
  ) {

    const message =
      (
        data &&
        typeof data ===
          'object' &&
        data.message
      ) ||

      (
        typeof data ===
          'string' &&
        data.slice(
          0,
          200
        )
      ) ||

      `Request failed (${response.status})`;


    // -----------------------------------------------------
    // SESSION EXPIRED
    // -----------------------------------------------------

    if (
      response.status ===
      401
    ) {
      announceSessionLost();
    }


    // -----------------------------------------------------
    // DEV DEBUG DATA
    // -----------------------------------------------------

    const debug =
      (
        import.meta.env.DEV &&
        data &&
        typeof data ===
          'object'
      )
        ? data.debug
        : undefined;


    if (
      import.meta.env.DEV &&
      response.status >=
        500 &&
      debug
    ) {
      console.error(
        'API server error:',
        debug,
        {
          path:
            normalizedPath,

          method:
            normalizedMethod,

          status:
            response.status,

          requestId,
        }
      );
    }


    throw new ApiError(
      message,
      {
        status:
          response.status,

        code:
          data &&
          typeof data ===
            'object'
            ? data.code
            : undefined,

        details:
          data &&
          typeof data ===
            'object'
            ? data.details
            : undefined,

        requestId,

        debug,
      }
    );
  }


  // -------------------------------------------------------
  // SUCCESS
  // -------------------------------------------------------

  return data;
}


// =========================================================
// PUBLIC API CLIENT
// =========================================================

export const api = {

  // -------------------------------------------------------
  // GET
  // -------------------------------------------------------

  get(
    path,
    options
  ) {
    return request(
      path,
      {
        ...options,

        method:
          'GET',
      }
    );
  },


  // -------------------------------------------------------
  // POST
  // -------------------------------------------------------

  post(
    path,
    body,
    options
  ) {
    return request(
      path,
      {
        ...options,

        method:
          'POST',

        body,
      }
    );
  },


  // -------------------------------------------------------
  // PUT
  // -------------------------------------------------------

  put(
    path,
    body,
    options
  ) {
    return request(
      path,
      {
        ...options,

        method:
          'PUT',

        body,
      }
    );
  },


  // -------------------------------------------------------
  // PATCH
  // -------------------------------------------------------

  patch(
    path,
    body,
    options
  ) {
    return request(
      path,
      {
        ...options,

        method:
          'PATCH',

        body,
      }
    );
  },


  // -------------------------------------------------------
  // DELETE
  // -------------------------------------------------------

  delete(
    path,
    options
  ) {
    return request(
      path,
      {
        ...options,

        method:
          'DELETE',
      }
    );
  },


  // -------------------------------------------------------
  // UPLOAD
  // -------------------------------------------------------

  upload(
    path,
    formData,
    options
  ) {
    return request(
      path,
      {
        ...options,

        method:
          'POST',

        body:
          formData,

        isFormData:
          true,
      }
    );
  },
};


// =========================================================
// MEDIA URL
// =========================================================

/**
 * Absolute API URL for media streaming/downloading.
 *
 * Authentication is still session based.
 */
export function mediaUrl(
  mediaId,
  {
    download = false,
  } = {}
) {
  const safeMediaId =
    encodeURIComponent(
      String(
        mediaId ??
        ''
      )
    );


  return (
    `${BASE_URL}/media/${safeMediaId}/${
      download
        ? 'download'
        : 'file'
    }`
  );
}


// =========================================================
// EXPORT
// =========================================================

export {
  BASE_URL,
};