'use strict';

const clientService =
  require('../services/clientService');


// ======================================================
// CREATE CLIENT
// ======================================================

async function createClient(req, res, next) {
  try {
    const userId =
      req.user?.user_id ??
      req.user?.id;
console.log("User ID :"+ userId);
    const client =
      await clientService.createClient({
        clientCode:
          req.body.clientCode,

        businessName:
          req.body.businessName,

        contactName:
          req.body.contactName,

        contactEmail:
          req.body.contactEmail,

        contactPhone:
          req.body.contactPhone,

        timezone:
          req.body.timezone,

        defaultLanguage:
          req.body.defaultLanguage,
        socialPlatforms: 
          req.body.socialPlatforms,
        createdBy:
          Number(userId),
      });


    return res.status(201).json({
      success: true,

      message:
        'Client created successfully',

      data: {
        client,
      },
    });

  } catch (error) {
    next(error);
  }
}


// ======================================================
// GET CLIENT BY ID
// ======================================================

async function getClientById(
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

    const client =
      await clientService
        .getClientById(
          clientId
        );

    return res.status(200).json({
      success: true,

      data: {
        client,
      },
    });
  } catch (error) {
    next(error);
  }
}


// ======================================================
// LIST CLIENTS
// ======================================================

async function listClients(req, res, next) {
  try {
    const result =
      await clientService.listClients({
        search:
          req.query.search ?? null,

        isActive:
          req.query.isActive ?? null,

        page:
          req.query.page ?? 1,

        pageSize:
          req.query.pageSize ?? 25,
      });


    return res.status(200).json({
      success: true,

      data: result,
    });

  } catch (error) {
    next(error);
  }
}


// ======================================================
// UPDATE CLIENT ACTIVE STATUS
// ======================================================

async function setClientActiveStatus(
  req,
  res,
  next
) {
  try {
    const client =
      await clientService
        .setClientActiveStatus({
          clientId: Number(
            req.clientId ??
            req.params.clientId
          ),

          isActive:
            req.body.isActive,
        });


    return res.status(200).json({
      success: true,

      message:
        client.is_active
          ? 'Client activated successfully'
          : 'Client deactivated successfully',

      data: {
        client,
      },
    });

  } catch (error) {
    next(error);
  }
}


module.exports = {
  createClient,
  getClientById,
  listClients,
  setClientActiveStatus,
};