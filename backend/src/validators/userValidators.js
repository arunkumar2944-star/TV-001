'use strict';

const { z, email, text, pagination } = require('./common');
const { ROLE_VALUES, CLIENT_ROLE_VALUES } = require('../config/constants');

const createUserSchema = z.object({
  clientId: z.coerce.number().int().positive('clientId must be a positive integer'),
  fullName: text(2, 120, 'Full name'),
  email,
  username: z.string().trim().min(3).max(100)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Username may only contain letters, numbers, dot, underscore and dash'),
  password: z.string().min(10, 'Password must be at least 10 characters').max(128, 'Password is too long'),
  role: z.enum(CLIENT_ROLE_VALUES, 'Role must be a client role'),
});

const updateUserSchema = z.object({
  fullName: text(2, 120, 'Full name').optional(),
  username: z.string().trim().max(100)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Username may only contain letters, numbers, dot, underscore and dash')
    .optional(),
  role: z.enum(ROLE_VALUES).optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update' });

const statusSchema = z.object({ isActive: z.boolean('isActive must be true or false') });
const resetPasswordSchema = z.object({
  newPassword: z.string().min(10, 'Password must be at least 10 characters').max(128),
});
const listUsersSchema = pagination.extend({
  role: z.enum(ROLE_VALUES).optional(),
  isActive: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
  search: z.string().trim().max(120).optional(),
  clientId: z.coerce.number().int().positive().optional(),
});

module.exports = { createUserSchema, updateUserSchema, statusSchema, resetPasswordSchema, listUsersSchema };
