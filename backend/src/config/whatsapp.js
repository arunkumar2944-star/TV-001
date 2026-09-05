'use strict';


// ======================================================
// ENV HELPERS
// ======================================================

function readEnv(
  name,
  fallback = null
) {
  const value =
    process.env[name];

  if (
    value === undefined ||
    value === null ||
    String(value).trim() === ''
  ) {
    return fallback;
  }

  return String(value).trim();
}


function readBoolean(
  name,
  fallback = false
) {
  const value =
    readEnv(
      name,
      null
    );

  if (value === null) {
    return fallback;
  }

  return [
    'true',
    '1',
    'yes',
    'on',
  ].includes(
    String(value)
      .trim()
      .toLowerCase()
  );
}


// ======================================================
// WHATSAPP CONFIGURATION
// ======================================================

const whatsappConfig =
  Object.freeze({

    // --------------------------------------------------
    // META APP
    // --------------------------------------------------

    appId:
      readEnv(
        'META_APP_ID'
      ),

    appSecret:
      readEnv(
        'META_APP_SECRET'
      ),

    graphVersion:
      readEnv(
        'META_GRAPH_VERSION'
      ),

    graphBaseUrl:
      'https://graph.facebook.com',


    // --------------------------------------------------
    // EMBEDDED SIGNUP
    // --------------------------------------------------

    embeddedSignupConfigId:
      readEnv(
        'WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID'
      ),

    frontendUrl:
      readEnv(
        'FRONTEND_URL',
        'http://localhost:5173'
      ),


    // --------------------------------------------------
    // WHATSAPP PERMISSIONS
    // --------------------------------------------------

    scopes:
      Object.freeze([
        'whatsapp_business_management',
        'whatsapp_business_messaging',
        'business_management',
      ]),


    // --------------------------------------------------
    // CLOUD API TEST MODE
    // --------------------------------------------------
    //
    // Development only.
    //
    // Credentials stay in Express backend .env.
    // Never expose these values to React.
    // --------------------------------------------------

    testMode:
      readBoolean(
        'WHATSAPP_TEST_MODE',
        false
      ),

    testAccessToken:
      readEnv(
        'WHATSAPP_TEST_ACCESS_TOKEN'
      ),

    testWabaId:
      readEnv(
        'WHATSAPP_TEST_WABA_ID'
      ),

    testPhoneNumberId:
      readEnv(
        'WHATSAPP_TEST_PHONE_NUMBER_ID'
      ),
  });


// ======================================================
// GENERIC VALIDATION HELPER
// ======================================================

function throwMissingConfig(
  missing,
  code,
  prefix
) {
  if (
    !Array.isArray(missing) ||
    missing.length === 0
  ) {
    return true;
  }

  const error =
    new Error(
      `${prefix}: ${missing.join(
        ', '
      )}`
    );

  error.code =
    code;

  throw error;
}


// ======================================================
// GRAPH API CONFIG VALIDATION
// ======================================================
//
// Any WhatsApp Graph API request needs the Graph version.
//
// Important:
// Cloud API test mode does NOT require Embedded Signup.
// ======================================================

function validateWhatsAppGraphConfig() {
  const missing = [];

  if (
    !whatsappConfig.graphVersion
  ) {
    missing.push(
      'META_GRAPH_VERSION'
    );
  }

  return throwMissingConfig(
    missing,
    'WHATSAPP_GRAPH_CONFIG_MISSING',
    'WhatsApp Graph API configuration is incomplete'
  );
}


// ======================================================
// EMBEDDED SIGNUP CONFIG VALIDATION
// ======================================================
//
// Used later for real client onboarding.
// ======================================================

function validateWhatsAppConfig() {
  const missing = [];

  if (
    !whatsappConfig.appId
  ) {
    missing.push(
      'META_APP_ID'
    );
  }

  if (
    !whatsappConfig.appSecret
  ) {
    missing.push(
      'META_APP_SECRET'
    );
  }

  if (
    !whatsappConfig.graphVersion
  ) {
    missing.push(
      'META_GRAPH_VERSION'
    );
  }

  if (
    !whatsappConfig
      .embeddedSignupConfigId
  ) {
    missing.push(
      'WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID'
    );
  }

  return throwMissingConfig(
    missing,
    'WHATSAPP_CONFIG_MISSING',
    'WhatsApp Embedded Signup configuration is incomplete'
  );
}


// ======================================================
// CLOUD API TEST CONFIG VALIDATION
// ======================================================
//
// Used for the current learning/testing flow.
//
// Required:
//
// WHATSAPP_TEST_MODE=true
// WHATSAPP_TEST_ACCESS_TOKEN=...
// WHATSAPP_TEST_WABA_ID=...
// WHATSAPP_TEST_PHONE_NUMBER_ID=...
// META_GRAPH_VERSION=...
// ======================================================

function validateWhatsAppTestConfig() {

  if (
    !whatsappConfig.testMode
  ) {
    const error =
      new Error(
        'WhatsApp Cloud API test mode is disabled.'
      );

    error.code =
      'WHATSAPP_TEST_MODE_DISABLED';

    throw error;
  }


  const missing = [];


  if (
    !whatsappConfig.graphVersion
  ) {
    missing.push(
      'META_GRAPH_VERSION'
    );
  }


  if (
    !whatsappConfig.testAccessToken
  ) {
    missing.push(
      'WHATSAPP_TEST_ACCESS_TOKEN'
    );
  }


  if (
    !whatsappConfig.testWabaId
  ) {
    missing.push(
      'WHATSAPP_TEST_WABA_ID'
    );
  }


  if (
    !whatsappConfig
      .testPhoneNumberId
  ) {
    missing.push(
      'WHATSAPP_TEST_PHONE_NUMBER_ID'
    );
  }


  return throwMissingConfig(
    missing,
    'WHATSAPP_TEST_CONFIG_MISSING',
    'WhatsApp Cloud API test configuration is incomplete'
  );
}


// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  whatsappConfig,

  validateWhatsAppGraphConfig,

  validateWhatsAppConfig,

  validateWhatsAppTestConfig,
};