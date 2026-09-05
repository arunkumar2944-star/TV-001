import {
  api,
} from './apiClient.js';


// ======================================================
// HELPERS
// ======================================================

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


function requireString(
  value,
  label,
) {
  const normalized =
    String(
      value ?? '',
    ).trim();

  if (!normalized) {
    throw new Error(
      `${label} is required.`,
    );
  }

  return normalized;
}


/**
 * Supports:
 *
 * Axios response:
 * {
 *   data: {
 *     success: true,
 *     data: {...}
 *   }
 * }
 *
 * Or already-unwrapped response:
 * {
 *   success: true,
 *   data: {...}
 * }
 */
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


// ======================================================
// GET WHATSAPP EMBEDDED SIGNUP CONFIG
// ======================================================
//
// GET
// /api/client/social-connections/whatsapp/config
//
// Expected:
// {
//   appId,
//   configurationId,
//   graphVersion
// }
// ======================================================

export async function getWhatsAppEmbeddedSignupConfig() {
  const response =
    await api.get(
      '/client/social-connections/whatsapp/config',
    );

  const data =
    unwrapApiData(
      response,
    );

  if (!data?.appId) {
    throw new Error(
      'Meta App ID was not returned by the server.',
    );
  }

  if (
    !data?.configurationId
  ) {
    throw new Error(
      'WhatsApp Embedded Signup configuration ID was not returned by the server.',
    );
  }

  return {
    appId:
      String(
        data.appId,
      ).trim(),

    configurationId:
      String(
        data.configurationId,
      ).trim(),

    graphVersion:
      data.graphVersion
        ? String(
            data.graphVersion,
          ).trim()
        : null,
  };
}


// ======================================================
// CONNECT / RECONNECT WHATSAPP
// ======================================================
//
// POST
// /api/client/social-connections/whatsapp/connect
//
// React supplies only:
//
// {
//   code,
//   wabaId,
//   phoneNumberId
// }
//
// Meta App Secret never enters React.
// ======================================================

export async function connectWhatsAppEmbeddedSignup({
  code,
  wabaId,
  phoneNumberId,
}) {
  const safeCode =
    requireString(
      code,
      'WhatsApp authorization code',
    );

  const safeWabaId =
    requireString(
      wabaId,
      'WhatsApp Business Account ID',
    );

  const safePhoneNumberId =
    requireString(
      phoneNumberId,
      'WhatsApp phone number ID',
    );


  const response =
    await api.post(
      '/client/social-connections/whatsapp/connect',
      {
        code:
          safeCode,

        wabaId:
          safeWabaId,

        phoneNumberId:
          safePhoneNumberId,
      },
    );


  return unwrapApiData(
    response,
  );
}


// ======================================================
// GET ONE-TIME CONNECTION RESULT
// ======================================================
//
// GET
// /api/client/social-connections/whatsapp/result
// ======================================================

export async function getWhatsAppConnectionResult() {
  const response =
    await api.get(
      '/client/social-connections/whatsapp/result',
    );

  return unwrapApiData(
    response,
  );
}


// ======================================================
// TEST WHATSAPP CONNECTION
// ======================================================
//
// POST
// /api/client/social-connections/whatsapp/:connectionId/test
// ======================================================

export async function testWhatsAppConnection({
  connectionId,
}) {
  const safeConnectionId =
    requirePositiveId(
      connectionId,
      'Connection ID',
    );


  const response =
    await api.post(
      `/client/social-connections/whatsapp/${safeConnectionId}/test`,
    );


  return unwrapApiData(
    response,
  );
}

export async function connectWhatsAppTestNumber() {
  const response =
    await api.post(
      '/client/social-connections/whatsapp/test-connect'
    );

  const payload =
    response?.data ??
    response;

  return (
    payload?.data ??
    payload ??
    null
  );
}