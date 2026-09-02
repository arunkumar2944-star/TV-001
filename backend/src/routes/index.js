'use strict';

const express = require('express');

const healthRoutes = require('./healthRoutes');
const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const newsRoutes = require('./newsRoutes');
const mediaRoutes = require('./mediaRoutes');
const approvalRoutes = require('./approvalRoutes');
const publishRoutes = require('./publishRoutes');
const dashboardRoutes = require('./dashboardRoutes');
const platformRoutes = require('./platformRoutes');
const n8nRoutes = require('./n8nRoutes');

const router = express.Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);

// User management is mounted twice on purpose:
//   /api/users          - listing and administration
//   /api/internal/users - the non-public internal user creation page
// Both share the same PLATFORM_ADMIN-only guard inside userRoutes.
router.use('/users', userRoutes);
router.use('/internal/users', userRoutes);

router.use('/news', newsRoutes);
router.use('/media', mediaRoutes);
router.use('/approvals', approvalRoutes);
router.use('/publish', publishRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/platforms', platformRoutes);

// n8n boundary - shared-secret authentication, no cookies, no CSRF.
router.use('/n8n', n8nRoutes);

module.exports = router;
