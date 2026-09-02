'use strict';

const userService = require('../services/userService');

/**
 * One-time PLATFORM_ADMIN bootstrap endpoint.
 * userService refuses the request once a platform administrator exists.
 */
async function createPlatformAdmin(req, res, next) {
  try {
    const { username, fullName, email, password } = req.body;
    const user = await userService.createPlatformAdmin({ username, fullName, email, password });
    return res.status(201).json({
      success: true,
      message: 'Platform admin created successfully.',
      data: userService.toPublic(user),
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = { createPlatformAdmin };
