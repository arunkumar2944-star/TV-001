'use strict';

const clientAdminService =
  require(
    '../services/clientAdmin.service'
  );


function resolveActiveClientId(
  req
) {
  return Number(
    req.clientId ??
    req.activeClientId ??
    req.session?.activeClientId ??
    req.session?.active_client_id
  );
}


function resolveAuthenticatedUserId(
  req
) {
  return Number(
    req.user?.user_id ??
    req.user?.id ??
    req.user?.userId
  );
}


async function createClientAdmin(
  req,
  res,
  next
) {
  try {
    const clientId =
      resolveActiveClientId(
        req
      );

    const createdBy =
      resolveAuthenticatedUserId(
        req
      );

    const user =
      await clientAdminService
        .createClientAdmin({
          clientId,

          createdBy,

          username:
            req.body.username,

          fullName:
            req.body.fullName,

          email:
            req.body.email,

          password:
            req.body.password,
        });

    return res
      .status(201)
      .json({
        success: true,

        message:
          'Client Admin created successfully.',

        data: {
          user,
        },
      });

  } catch (error) {
    next(error);
  }
}


module.exports = {
  createClientAdmin,
};