'use strict';

const { z, email } = require('./common');

const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required').max(200, 'Password is too long'),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required').max(200),
  newPassword: z.string().min(10, 'New password must be at least 10 characters').max(128),
});

module.exports = { loginSchema, changePasswordSchema };
