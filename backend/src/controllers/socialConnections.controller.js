'use strict';

const socialConnectionService =
  require('../services/socialConnection.service');


/* ==========================================================
 * GET CLIENT CONNECTIONS
 * ========================================================== */

async function getClientSocialConnections(
  req,
  res,
  next
) {
  try {
   const clientId =
  Number(
    req.clientId ??
    req.params.clientId
  );

    if (
      !Number.isInteger(clientId) ||
      clientId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Invalid client ID',
      });
    }

    const connections =
      await socialConnectionService
        .getClientConnections(
          clientId
        );

    return res.status(200).json({
      success: true,
      data:
        connections,
    });

  } catch (error) {
    return next(error);
  }
}


/* ==========================================================
 * VERIFY CONNECTION
 * ========================================================== */

async function verifySocialConnection(
  req,
  res,
  next
) {
  try {
   const clientId =
  Number(
    req.clientId ??
    req.params.clientId
  );

    const connectionId =
      Number(
        req.params.connectionId
      );

    if (
      !Number.isInteger(clientId) ||
      clientId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Invalid client ID',
      });
    }

    if (
      !Number.isInteger(connectionId) ||
      connectionId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Invalid connection ID',
      });
    }

    const result =
      await socialConnectionService
        .verifyConnection({
          clientId,
          connectionId,
        });

    return res.status(200).json({
      success: true,

      message:
        'Social connection verified successfully.',

      data:
        result,
    });

  } catch (error) {
    return next(error);
  }
}


/* ==========================================================
 * DISCONNECT CONNECTION
 * ========================================================== */

async function disconnectConnection(
  req,
  res,
  next
) {
  try {
    const clientId =
  Number(
    req.clientId ??
    req.params.clientId
  );

    const connectionId =
      Number(
        req.params.connectionId
      );

    if (
      !Number.isInteger(clientId) ||
      clientId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Invalid client ID.',
      });
    }

    if (
      !Number.isInteger(connectionId) ||
      connectionId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Invalid connection ID.',
      });
    }

    const connection =
      await socialConnectionService
        .disconnectConnection({
          clientId,
          connectionId,
        });

    return res.status(200).json({
      success: true,

      message:
        `${connection.platform} disconnected successfully.`,

      data: {
        connection,
      },
    });

  } catch (error) {
    return next(error);
  }
}


module.exports = {
  getClientSocialConnections,
  verifySocialConnection,
  disconnectConnection,
};