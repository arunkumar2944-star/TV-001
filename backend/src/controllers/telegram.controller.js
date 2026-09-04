'use strict';

const telegramService =
  require(
    '../services/telegram.service'
  );


function resolveClientId(
  req
) {
  return Number(
    req.clientId ??
    req.activeClientId ??
    req.session?.activeClientId ??
    req.session?.active_client_id ??
    req.user?.client_id
  );
}


function resolveUserId(
  req
) {
  return Number(
    req.user?.user_id ??
    req.user?.id ??
    req.user?.userId
  );
}


// ======================================================
// CONNECT TELEGRAM
// ======================================================

async function connectTelegram(
  req,
  res,
  next
) {
  try {
    const clientId =
      resolveClientId(
        req
      );

    const connectedBy =
      resolveUserId(
        req
      );


    if (
      !Number.isInteger(
        clientId
      ) ||
      clientId <= 0
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            'A valid active client is required.',
        });
    }


    if (
      !Number.isInteger(
        connectedBy
      ) ||
      connectedBy <= 0
    ) {
      return res
        .status(401)
        .json({
          success:
            false,

          message:
            'Authenticated user information is missing.',
        });
    }


    const botToken =
      String(
        req.body?.botToken ||
        ''
      ).trim();

    const channelId =
      String(
        req.body?.channelId ||
        ''
      ).trim();


    if (!botToken) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            'Telegram bot token is required.',
        });
    }


    if (!channelId) {
      return res
        .status(400)
        .json({
          success:
            false,

          message:
            'Telegram channel ID or username is required.',
        });
    }


    const connection =
      await telegramService
        .connectTelegram({
          clientId,

          connectedBy,

          botToken,

          channelId,
        });


    return res
      .status(200)
      .json({
        success:
          true,

        message:
          'Telegram connected successfully.',

        data: {
          connection,
        },
      });

  } catch (error) {
    return next(
      error
    );
  }
}


module.exports = {
  connectTelegram,
};