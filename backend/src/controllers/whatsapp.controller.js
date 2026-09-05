'use strict';

const whatsappService =
  require(
    '../services/whatsapp.service'
  );


// ======================================================
// HELPERS
// ======================================================

function getClientId(
  req
) {
  const clientId =
    Number(
      req.clientId ??
      req.activeClientId ??
      req.session
        ?.activeClientId ??
      req.session
        ?.active_client_id
    );

  return (
    Number.isInteger(clientId) &&
    clientId > 0
  )
    ? clientId
    : null;
}


function getUserId(
  req
) {
  const userId =
    Number(
      req.user?.user_id ??
      req.user?.id ??
      req.user?.userId
    );

  return (
    Number.isInteger(userId) &&
    userId > 0
  )
    ? userId
    : null;
}


function getConnectionId(
  req
) {
  const connectionId =
    Number(
      req.params
        ?.connectionId
    );

  return (
    Number.isInteger(
      connectionId
    ) &&
    connectionId > 0
  )
    ? connectionId
    : null;
}


// ======================================================
// GET EMBEDDED SIGNUP CONFIG
// ======================================================
//
// GET
// /api/client/social-connections/whatsapp/config
//
// Returns ONLY public browser-safe values:
//
// {
//   appId,
//   configurationId,
//   graphVersion
// }
//
// META_APP_SECRET is NEVER returned.
// ======================================================

async function getWhatsAppConfig(
  req,
  res,
  next
) {
  try {
    const clientId =
      getClientId(
        req
      );

    if (!clientId) {
      return res
        .status(400)
        .json({
          success: false,

          message:
            'A valid active client is required.',
        });
    }

    const config =
      whatsappService
        .getEmbeddedSignupConfig();

    return res
      .status(200)
      .json({
        success: true,

        data: {
          appId:
            config.appId,

          configurationId:
            config
              .configurationId,

          graphVersion:
            config
              .graphVersion,
        },
      });

  } catch (error) {
    return next(
      error
    );
  }
}


// ======================================================
// CONNECT / RECONNECT WHATSAPP
// ======================================================
//
// POST
// /api/client/social-connections/whatsapp/connect
//
// Body:
//
// {
//   "code": "...",
//   "wabaId": "...",
//   "phoneNumberId": "..."
// }
//
// React never sends:
// - app secret
// - stored access token
//
// Embedded Signup gives React the temporary code
// and WhatsApp resource IDs.
// ======================================================

async function connectWhatsApp(
  req,
  res,
  next
) {
  try {
    const clientId =
      getClientId(
        req
      );

    const userId =
      getUserId(
        req
      );


    if (!clientId) {
      return res
        .status(400)
        .json({
          success: false,

          message:
            'A valid active client is required.',
        });
    }


    if (!userId) {
      return res
        .status(401)
        .json({
          success: false,

          message:
            'Authenticated user information is missing.',
        });
    }


    const {
      code,
      wabaId,
      phoneNumberId,
    } =
      req.body || {};


    if (
      !String(
        code || ''
      ).trim()
    ) {
      return res
        .status(400)
        .json({
          success: false,

          message:
            'WhatsApp authorization code is required.',
        });
    }


    if (
      !String(
        wabaId || ''
      ).trim()
    ) {
      return res
        .status(400)
        .json({
          success: false,

          message:
            'WhatsApp Business Account ID is required.',
        });
    }


    if (
      !String(
        phoneNumberId || ''
      ).trim()
    ) {
      return res
        .status(400)
        .json({
          success: false,

          message:
            'WhatsApp phone number ID is required.',
        });
    }


    const result =
      await whatsappService
        .connectEmbeddedSignup({
          clientId,
          userId,

          code:
            String(
              code
            ).trim(),

          wabaId:
            String(
              wabaId
            ).trim(),

          phoneNumberId:
            String(
              phoneNumberId
            ).trim(),

          session:
            req.session,
        });


    return res
      .status(200)
      .json({
        success: true,

        message:
          result
            .externalAccountName
            ? `${result.externalAccountName} connected successfully.`
            : 'WhatsApp connected successfully.',

        data:
          result,
      });

  } catch (error) {
    return next(
      error
    );
  }
}


// ======================================================
// GET CONNECTION RESULT
// ======================================================
//
// GET
// /api/client/social-connections/whatsapp/result
//
// This is useful after Embedded Signup completes.
//
// Result is consumed once, just like our OAuth
// outcome handling for other platforms.
// ======================================================

async function getWhatsAppResult(
  req,
  res,
  next
) {
  try {
    const clientId =
      getClientId(
        req
      );

    if (!clientId) {
      return res
        .status(400)
        .json({
          success: false,

          message:
            'A valid active client is required.',
        });
    }


    const outcome =
      whatsappService
        .consumeConnectionOutcome(
          req.session
        );


    // --------------------------------------------------
    // NO PENDING RESULT
    // --------------------------------------------------

    if (!outcome) {
      return res
        .status(200)
        .json({
          success: true,

          data: null,
        });
    }


    // --------------------------------------------------
    // SECURITY: RESULT MUST BELONG TO ACTIVE CLIENT
    // --------------------------------------------------

    if (
      outcome.clientId &&
      Number(
        outcome.clientId
      ) !==
      clientId
    ) {
      return res
        .status(200)
        .json({
          success: true,

          data: null,
        });
    }


    return res
      .status(200)
      .json({
        success: true,

        data: {
          status:
            outcome.status,

          message:
            outcome.message,

          reason:
            outcome.reason,

          connectionId:
            outcome.connectionId,

          externalAccountId:
            outcome
              .externalAccountId,

          externalAccountName:
            outcome
              .externalAccountName,

          wabaId:
            outcome.wabaId,
        },
      });

  } catch (error) {
    return next(
      error
    );
  }
}


// ======================================================
// TEST WHATSAPP CONNECTION
// ======================================================
//
// POST
// /api/client/social-connections/whatsapp/:connectionId/test
//
// Uses the encrypted access token stored in PostgreSQL.
// React never receives/decrypts the token.
// ======================================================

async function testWhatsAppConnection(
  req,
  res,
  next
) {
  try {
    const clientId =
      getClientId(
        req
      );

    const connectionId =
      getConnectionId(
        req
      );


    if (!clientId) {
      return res
        .status(400)
        .json({
          success: false,

          message:
            'A valid active client is required.',
        });
    }


    if (!connectionId) {
      return res
        .status(400)
        .json({
          success: false,

          message:
            'A valid WhatsApp connection ID is required.',
        });
    }


    const result =
      await whatsappService
        .verifyConnection({
          clientId,
          connectionId,
        });


    return res
      .status(200)
      .json({
        success: true,

        message:
          'WhatsApp connection verified successfully.',

        data:
          result,
      });

  } catch (error) {
    return next(
      error
    );
  }
}
async function connectWhatsAppTestNumber(
  req,
  res,
  next
) {
  try {
    const clientId =
      Number(
        req.clientId ??
        req.activeClientId ??
        req.session?.activeClientId ??
        req.session?.active_client_id
      );

    const userId =
      Number(
        req.user?.userId ??
        req.user?.user_id ??
        req.user?.id
      );


    if (
      !Number.isInteger(clientId) ||
      clientId <= 0
    ) {
      return res
        .status(400)
        .json({
          success: false,
          message:
            'A valid active client is required.',
        });
    }


    if (
      !Number.isInteger(userId) ||
      userId <= 0
    ) {
      return res
        .status(401)
        .json({
          success: false,
          message:
            'Authenticated user information is missing.',
        });
    }


    const result =
      await whatsappService
        .connectTestNumber({
          clientId,
          userId,
        });


    return res
      .status(200)
      .json({
        success: true,
        message:
          'WhatsApp Cloud API test number connected successfully.',
        data:
          result,
      });

  } catch (error) {
    return next(
      error
    );
  }
}


// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  getWhatsAppConfig,
  connectWhatsApp,
  getWhatsAppResult,
  testWhatsAppConnection,
    // Cloud API development mode
    connectWhatsAppTestNumber,
    
};