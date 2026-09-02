'use strict';

/**
 * User management - ADMIN only.
 * The route guard enforces the role; these handlers assume it has run.
 */
const {
  changeOwnPassword,
} = require(
  '../services/userService'
);
const userService = require('../services/userService');
const auditService = require('../services/auditService');
const { ok, created, paginated } = require('../utils/respond');
const { AUDIT_STAGE, AUDIT_STATUS } = require('../config/constants');

async function listUsers(req, res) {
  const { page, pageSize, role, isActive, search, clientId } = req.validatedQuery;
  const result = await userService.list({ page, pageSize, role, isActive, search, clientId });
  return paginated(res, result.items, result.pagination);
}

async function getUser(req, res) {
  const user = await userService.findById(req.validatedParams.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  return ok(res, user);
}

/** POST /api/internal/users - the internal user creation page posts here. */
async function createUser(req, res) {
  const user = await userService.create(req.body, req.user.user_id);

  auditService.recordSafe({
    actorUserId: req.user.user_id,
    stage: AUDIT_STAGE.CREATE_USER,
    status: AUDIT_STATUS.SUCCESS,
    message: `${req.user.full_name} created ${user.role} account for ${user.email}`,
    metadata: { newUserId: user.user_id, role: user.role },
  });

  return created(res, user);
}

async function setUserStatus(req, res) {
  const { id } = req.validatedParams;
  const { isActive } = req.body;
  const user = await userService.setActiveStatus(id, isActive, req.user);

  auditService.recordSafe({
    actorUserId: req.user.user_id,
    stage: isActive ? AUDIT_STAGE.ENABLE_USER : AUDIT_STAGE.DISABLE_USER,
    status: AUDIT_STATUS.SUCCESS,
    message: `${req.user.full_name} ${isActive ? 'activated' : 'deactivated'} ${user.email}`,
    metadata: { targetUserId: user.user_id },
  });

  return ok(res, user);
}

async function updateUser(req, res) {
  const { id } = req.validatedParams;
  const user = await userService.updateProfile(id, req.body, req.user);

  auditService.recordSafe({
    actorUserId: req.user.user_id,
    stage: AUDIT_STAGE.UPDATE_USER,
    status: AUDIT_STATUS.SUCCESS,
    message: `${req.user.full_name} updated the account ${user.email}`,
    metadata: { targetUserId: user.user_id, fields: Object.keys(req.body) },
  });

  return ok(res, user);
}

async function resetUserPassword(req, res) {
  const { id } = req.validatedParams;
  const user = await userService.resetPassword(id, req.body.newPassword);

  auditService.recordSafe({
    actorUserId: req.user.user_id,
    stage: AUDIT_STAGE.UPDATE_USER,
    status: AUDIT_STATUS.SUCCESS,
    message: `${req.user.full_name} reset the password for ${user.email}`,
    metadata: { targetUserId: user.user_id },
  });

  return ok(res, { id: user.user_id, passwordReset: true });
}
async function changePassword(
  req,
  res,
  next
) {
  try {
    const userId = Number(
      req.user?.user_id ??
      req.user?.id
    );

    if (
      !Number.isInteger(userId) ||
      userId <= 0
    ) {
      return res.status(401).json({
        success: false,
        message:
          'Authentication required.',
      });
    }

    const user =
      await changeOwnPassword({
        userId,

        newPassword:
          req.body?.newPassword,
      });

    return res.status(200).json({
      success: true,

      message:
        'Password changed successfully.',

      data: {
        user,
      },
    });

  } catch (error) {
    if (error.statusCode) {
      return res
        .status(error.statusCode)
        .json({
          success: false,

          code:
            error.appCode ??
            'PASSWORD_CHANGE_FAILED',

          message:
            error.message,
        });
    }

    next(error);
  }
}


module.exports = { listUsers, getUser, createUser, setUserStatus, updateUser, resetUserPassword, changePassword };
