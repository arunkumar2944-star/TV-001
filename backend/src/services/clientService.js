'use strict';

const clientRepository =
  require('../repositories/clientRepository');

const ApiError =
  require('../utils/ApiError');


const ALLOWED_SOCIAL_PLATFORMS =
  new Set([
    'facebook',
    'instagram',
    'whatsapp',
    'youtube',
    'telegram',
    'x',
    'threads',
  ]);


const ALLOWED_LANGUAGES =
  new Set([
    'en',
    'ta',
    'hi',
  ]);
const ONBOARDING_CONNECTION_PLATFORMS =
  new Set([
    'facebook',
    'instagram',
    'telegram',
  ]);

// ======================================================
// HELPERS
// ======================================================

function normalizeString(value) {
  return String(
    value ?? ''
  ).trim();
}


function normalizeEmail(value) {
  return String(
    value ?? ''
  )
    .trim()
    .toLowerCase();
}


function normalizeClientCode(value) {
  return String(
    value ?? ''
  )
    .trim()
    .toUpperCase();
}


function normalizeSocialPlatforms(
  value
) {
  if (!Array.isArray(value)) {
    throw ApiError.badRequest(
      'socialPlatforms must be an array'
    );
  }


  const platforms =
    [
      ...new Set(
        value
          .map(
            (platform) =>
              String(
                platform ?? ''
              )
                .trim()
                .toLowerCase()
          )
          .filter(Boolean)
      ),
    ];


  if (!platforms.length) {
    throw ApiError.badRequest(
      'Select at least one social platform'
    );
  }


  const invalid =
    platforms.filter(
      (platform) =>
        !ALLOWED_SOCIAL_PLATFORMS
          .has(platform)
    );


  if (invalid.length) {
    throw ApiError.badRequest(
      `Unsupported social platform: ${invalid.join(', ')}`
    );
  }


  return platforms;
}


// ======================================================
// CREATE CLIENT
// ======================================================
//
// IMPORTANT:
//
// Existing controller calls:
//
// createClient(req.body, userId)
//
// Therefore keep this signature.
//
// ======================================================

async function createClient(input) {
  const clientCode =
    String(
      input.clientCode || ''
    )
      .trim()
      .toUpperCase();

  const businessName =
    String(
      input.businessName || ''
    ).trim();

  const contactName =
    input.contactName
      ? String(
          input.contactName
        ).trim()
      : null;

  const contactEmail =
    input.contactEmail
      ? String(
          input.contactEmail
        )
          .trim()
          .toLowerCase()
      : null;

  const contactPhone =
    input.contactPhone
      ? String(
          input.contactPhone
        ).trim()
      : null;

  const timezone =
    input.timezone
      ? String(
          input.timezone
        ).trim()
      : 'Asia/Kolkata';

  const defaultLanguage =
    input.defaultLanguage
      ? String(
          input.defaultLanguage
        )
          .trim()
          .toLowerCase()
      : 'en';

  // ==========================================
  // AUTHENTICATED USER WHO CREATES THE CLIENT
  // ==========================================

  const createdBy =
    Number(
      input.createdBy
    );

  // ==========================================
  // SOCIAL PLATFORMS
  // ==========================================

  const socialPlatforms =
    normalizeSocialPlatforms(
      input.socialPlatforms
    );

  // ==========================================
  // VALIDATION
  // ==========================================

  if (!clientCode) {
    throw ApiError.badRequest(
      'Client code is required.'
    );
  }

  if (
    !/^[A-Z0-9_-]{2,50}$/.test(
      clientCode
    )
  ) {
    throw ApiError.badRequest(
      'Client code may contain only letters, numbers, underscores, and hyphens.'
    );
  }

  if (!businessName) {
    throw ApiError.badRequest(
      'Business name is required.'
    );
  }

  if (
    businessName.length > 150
  ) {
    throw ApiError.badRequest(
      'Business name must not exceed 150 characters.'
    );
  }

  if (
    contactName &&
    contactName.length > 150
  ) {
    throw ApiError.badRequest(
      'Contact name must not exceed 150 characters.'
    );
  }

  if (
    contactEmail &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      contactEmail
    )
  ) {
    throw ApiError.badRequest(
      'Contact email is not valid.'
    );
  }

  if (
    contactPhone &&
    !/^[+\d\s()-]{7,30}$/.test(
      contactPhone
    )
  ) {
    throw ApiError.badRequest(
      'Contact phone is not valid.'
    );
  }

  // ==========================================
  // CREATED BY VALIDATION
  // ==========================================

  if (
    !Number.isInteger(
      createdBy
    ) ||
    createdBy <= 0
  ) {
    throw ApiError.badRequest(
      'A valid creator user is required.'
    );
  }

  // ==========================================
  // PLATFORM VALIDATION
  // ==========================================

  if (
    !socialPlatforms.length
  ) {
    throw ApiError.badRequest(
      'Select at least one social platform for the client.'
    );
  }

  const invalidPlatforms =
    socialPlatforms.filter(
      (platform) =>
        !ALLOWED_SOCIAL_PLATFORMS.has(
          platform
        )
    );

  if (
    invalidPlatforms.length
  ) {
    throw ApiError.badRequest(
      `Unsupported social platform: ${invalidPlatforms.join(', ')}`
    );
  }

  // ==========================================
  // CREATE CLIENT
  // ==========================================

  try {
    return await clientRepository.create({
      clientCode,
      businessName,
      contactName,
      contactEmail,
      contactPhone,
      timezone,
      defaultLanguage,
      socialPlatforms,
      createdBy,
    });
  } catch (error) {
    if (
      error?.code === '23505'
    ) {
      throw ApiError.conflict(
        'A client with this code already exists.'
      );
    }

    throw error;
  }
}

// ======================================================
// GET CLIENT
// ======================================================

async function getClientById(
  clientId
) {
  const parsedClientId =
    Number(clientId);


  if (
    !Number.isInteger(
      parsedClientId
    ) ||
    parsedClientId <= 0
  ) {
    throw ApiError.badRequest(
      'Invalid client id'
    );
  }


  const client =
    await clientRepository
      .findById(
        parsedClientId
      );


  if (!client) {
    throw ApiError.notFound(
      'Client not found'
    );
  }


  return client;
}


// ======================================================
// LIST CLIENTS
// ======================================================

async function listClients({
  search = null,
  isActive = null,
  page = 1,
  pageSize = 25,
} = {}) {
  let normalizedIsActive =
    isActive;


  if (
    typeof isActive ===
    'string'
  ) {
    if (
      isActive === 'true'
    ) {
      normalizedIsActive =
        true;
    }
    else if (
      isActive === 'false'
    ) {
      normalizedIsActive =
        false;
    }
    else {
      normalizedIsActive =
        null;
    }
  }


  return clientRepository.list({
    search:
      normalizeString(search) ||
      null,

    isActive:
      normalizedIsActive,

    page,
    pageSize,
  });
}


// ======================================================
// SET ACTIVE STATUS
// ======================================================

async function setClientActiveStatus({
  clientId,
  isActive,
}) {
  const parsedClientId =
    Number(clientId);


  if (
    !Number.isInteger(
      parsedClientId
    ) ||
    parsedClientId <= 0
  ) {
    throw ApiError.badRequest(
      'Invalid client id'
    );
  }


  if (
    typeof isActive !==
    'boolean'
  ) {
    throw ApiError.badRequest(
      'isActive must be true or false'
    );
  }


  const updated =
    await clientRepository
      .setActiveStatus({
        clientId:
          parsedClientId,

        isActive,
      });


  if (!updated) {
    throw ApiError.notFound(
      'Client not found'
    );
  }


  return updated;
}
// ======================================================
// UPDATE CLIENT SOCIAL PLATFORMS
// ======================================================

async function setClientPlatforms({
  clientId,
  platforms,
}) {
  const id =
    Number(
      clientId
    );


  // ====================================================
  // CLIENT VALIDATION
  // ====================================================

  if (
    !Number.isInteger(
      id
    ) ||
    id <= 0
  ) {
    throw ApiError.badRequest(
      'A valid client is required.'
    );
  }


  // ====================================================
  // NORMALIZE PLATFORMS
  // ====================================================

  const socialPlatforms =
    normalizeSocialPlatforms(
      platforms
    );


  if (
    socialPlatforms.length ===
    0
  ) {
    throw ApiError.badRequest(
      'Select at least one social platform.'
    );
  }


  // ====================================================
  // VALIDATE PLATFORM CODES
  // ====================================================

  const invalidPlatforms =
    socialPlatforms.filter(
      (platform) =>
        !ALLOWED_SOCIAL_PLATFORMS.has(
          platform
        )
    );


  if (
    invalidPlatforms.length >
    0
  ) {
    throw ApiError.badRequest(
      `Unsupported social platform: ${invalidPlatforms.join(
        ', '
      )}`
    );
  }


  // ====================================================
  // VERIFY CLIENT EXISTS
  // ====================================================

  const existingClient =
    await clientRepository
      .findById(
        id
      );


  if (
    !existingClient
  ) {
    throw ApiError.notFound(
      'Client not found.'
    );
  }


  // ====================================================
  // UPDATE CLIENT SOCIAL PLATFORMS
  // ====================================================

  await clientRepository
    .updateSocialPlatforms({
      clientId:
        id,

      socialPlatforms,
    });


  // ====================================================
  // RETURN UPDATED CLIENT
  // ====================================================

  return getClientById(
    id
  );
}
// ======================================================
// START CLIENT ONBOARDING
// ======================================================
//
// Allowed:
//
// ADMIN_CREATED
//      ↓
// IN_PROGRESS
//
// Idempotent:
//
// IN_PROGRESS
//      ↓
// IN_PROGRESS
//
// COMPLETED
//      ↓
// COMPLETED
//
// Blocked:
//
// PENDING_ADMIN
//      ↓
// ❌ cannot start onboarding
//
// ======================================================

async function startClientOnboarding({
  clientId,
}) {
  const parsedClientId =
    Number(
      clientId
    );


  // ====================================================
  // VALIDATE CLIENT ID
  // ====================================================

  if (
    !Number.isInteger(
      parsedClientId
    ) ||
    parsedClientId <= 0
  ) {
    throw ApiError.badRequest(
      'Invalid client id'
    );
  }


  // ====================================================
  // LOAD CLIENT
  // ====================================================

  const client =
    await clientRepository
      .findById(
        parsedClientId
      );


  if (!client) {
    throw ApiError.notFound(
      'Client not found'
    );
  }


  // ====================================================
  // CLIENT MUST BE ACTIVE
  // ====================================================

  if (
    client.is_active !==
    true
  ) {
    throw ApiError.conflict(
      'Client is inactive and cannot begin onboarding'
    );
  }


  const currentStatus =
    String(
      client.onboarding_status ||
      ''
    )
      .trim()
      .toUpperCase();


  // ====================================================
  // CLIENT ADMIN NOT CREATED YET
  // ====================================================

  if (
    currentStatus ===
    'PENDING_ADMIN'
  ) {
    throw ApiError.conflict(
      'Client administrator must be created before onboarding can begin'
    );
  }


  // ====================================================
  // FIRST ONBOARDING START
  // ====================================================

  if (
    currentStatus ===
    'ADMIN_CREATED'
  ) {
    const updatedClient =
      await clientRepository
        .setOnboardingStatus({
          clientId:
            parsedClientId,

          onboardingStatus:
            'IN_PROGRESS',
        });


    if (!updatedClient) {
      throw ApiError.notFound(
        'Client not found'
      );
    }


    return updatedClient;
  }


  // ====================================================
  // ALREADY IN PROGRESS
  // ====================================================

  if (
    currentStatus ===
    'IN_PROGRESS'
  ) {
    return client;
  }


  // ====================================================
  // ALREADY COMPLETED
  // ====================================================

  if (
    currentStatus ===
    'COMPLETED'
  ) {
    return client;
  }


  // ====================================================
  // UNKNOWN / INVALID DATABASE STATE
  // ====================================================

  throw ApiError.conflict(
    `Unsupported client onboarding status: ${
      currentStatus ||
      'UNKNOWN'
    }`
  );
}

// ======================================================
// GET CLIENT ONBOARDING PROGRESS
// ======================================================

async function getClientOnboardingProgress({
  clientId,
  clientAdminUserId,
}) {
  const parsedClientId =
    Number(clientId);

  const parsedClientAdminUserId =
    Number(clientAdminUserId);


  // ====================================================
  // VALIDATE
  // ====================================================

  if (
    !Number.isInteger(
      parsedClientId
    ) ||
    parsedClientId <= 0
  ) {
    throw ApiError.badRequest(
      'Invalid client id'
    );
  }


  if (
    !Number.isInteger(
      parsedClientAdminUserId
    ) ||
    parsedClientAdminUserId <= 0
  ) {
    throw ApiError.badRequest(
      'Invalid client administrator'
    );
  }


  // ====================================================
  // LOAD RAW ONBOARDING FACTS
  // ====================================================

  const snapshot =
    await clientRepository
      .getOnboardingSnapshot({
        clientId:
          parsedClientId,

        clientAdminUserId:
          parsedClientAdminUserId,
      });


  if (!snapshot) {
    throw ApiError.notFound(
      'Client not found'
    );
  }


  // ====================================================
  // NORMALIZE PLATFORMS
  // ====================================================

  const enabledPlatforms =
    Array.isArray(
      snapshot.enabled_platforms
    )
      ? snapshot.enabled_platforms
          .map(
            (platform) =>
              String(
                platform || ''
              )
                .trim()
                .toLowerCase()
          )
          .filter(Boolean)
      : [];


  const connectedPlatforms =
    Array.isArray(
      snapshot.connected_platforms
    )
      ? snapshot.connected_platforms
          .map(
            (platform) =>
              String(
                platform || ''
              )
                .trim()
                .toLowerCase()
          )
          .filter(Boolean)
      : [];


  // ====================================================
  // ORGANIZATION
  // ====================================================

  const organizationComplete =
    snapshot.is_active ===
    true;


  // ====================================================
  // PUBLISHING PLATFORMS
  // ====================================================

  const platformsComplete =
    enabledPlatforms.length >
    0;


  // ====================================================
  // SOCIAL CONNECTIONS
  // ====================================================

  /*
   * Only platforms that currently require
   * an OAuth/account connection belong here.
   *
   * Telegram, WhatsApp, YouTube, X, Threads,
   * etc. can receive their own connection
   * requirements later without changing the
   * onboarding architecture.
   */
  const connectionRequiredPlatforms =
    enabledPlatforms.filter(
      (platform) =>
        ONBOARDING_CONNECTION_PLATFORMS
          .has(platform)
    );


  const socialConnectionsRequired =
    connectionRequiredPlatforms.length >
    0;


  const missingConnections =
    connectionRequiredPlatforms.filter(
      (platform) =>
        !connectedPlatforms.includes(
          platform
        )
    );


  const socialConnectionsComplete =
    !socialConnectionsRequired ||
    missingConnections.length ===
      0;


  // ====================================================
  // TEAM
  // ====================================================

  const clientAdminCount =
    Number(
      snapshot.client_admin_count
    ) || 0;

  const contentCreatorCount =
    Number(
      snapshot.content_creator_count
    ) || 0;

  const approverCount =
    Number(
      snapshot.approver_count
    ) || 0;

  const activeUserCount =
    Number(
      snapshot.active_user_count
    ) || 0;


  const teamComplete =
    clientAdminCount >= 1 &&
    contentCreatorCount >= 1 &&
    approverCount >= 1;


  // ====================================================
  // SECURITY
  // ====================================================

  /*
   * Security is REQUIRED for onboarding completion,
   * but it is not a separate visible onboarding step.
   */
  const securityComplete =
    snapshot
      .client_admin_password_ready ===
    true;


  // ====================================================
  // CURRENT ONBOARDING STATUS
  // ====================================================

  const onboardingStatus =
    String(
      snapshot.onboarding_status ||
      ''
    )
      .trim()
      .toUpperCase();


  const onboardingCompleted =
    onboardingStatus ===
    'COMPLETED';


  // ====================================================
  // ALL PREREQUISITES
  // ====================================================

  const prerequisitesComplete =
    organizationComplete &&
    platformsComplete &&
    socialConnectionsComplete &&
    teamComplete &&
    securityComplete;


  const reviewReady =
    prerequisitesComplete &&
    !onboardingCompleted;


  // ====================================================
  // VISIBLE BUSINESS STEPS
  // ====================================================

  const steps = [
    {
      key:
        'organization',

      title:
        'Organization Details',

      completed:
        organizationComplete,

      status:
        organizationComplete
          ? 'COMPLETED'
          : 'PENDING',
    },


    {
      key:
        'platforms',

      title:
        'Publishing Platforms',

      completed:
        platformsComplete,

      status:
        platformsComplete
          ? 'COMPLETED'
          : 'PENDING',

      enabledCount:
        enabledPlatforms.length,
    },


    {
      key:
        'social_connections',

      title:
        'Social Connections',

      completed:
        socialConnectionsComplete,

      status:
        socialConnectionsComplete
          ? (
              socialConnectionsRequired
                ? 'COMPLETED'
                : 'NOT_REQUIRED'
            )
          : 'IN_PROGRESS',

      required:
        socialConnectionsRequired,

      requiredPlatforms:
        connectionRequiredPlatforms,

      connectedPlatforms:
        connectedPlatforms.filter(
          (platform) =>
            connectionRequiredPlatforms
              .includes(platform)
        ),

      missingPlatforms:
        missingConnections,
    },


    {
      key:
        'team',

      title:
        'Team Members',

      completed:
        teamComplete,

      status:
        teamComplete
          ? 'COMPLETED'
          : 'IN_PROGRESS',

      counts: {
        clientAdmins:
          clientAdminCount,

        contentCreators:
          contentCreatorCount,

        approvers:
          approverCount,

        activeUsers:
          activeUserCount,
      },
    },


    {
      key:
        'review',

      title:
        'Review & Complete',

      completed:
        onboardingCompleted,

      status:
        onboardingCompleted
          ? 'COMPLETED'
          : reviewReady
            ? 'READY'
            : 'PENDING',
    },
  ];


  // ====================================================
  // PROGRESS
  // ====================================================

  const completedSteps =
    steps.filter(
      (step) =>
        step.completed === true
    ).length;


  const totalSteps =
    steps.length;


  const percentage =
    Math.round(
      (
        completedSteps /
        totalSteps
      ) *
      100
    );


  const canComplete =
    prerequisitesComplete &&
    !onboardingCompleted;


  // ====================================================
  // RESPONSE
  // ====================================================

  return {
    client: {
      clientId:
        snapshot.client_id,

      clientCode:
        snapshot.client_code,

      businessName:
        snapshot.business_name,

      onboardingStatus:
        onboardingStatus,

      isActive:
        snapshot.is_active,
    },


    progress: {
      completedSteps,
      totalSteps,
      percentage,
      canComplete,

      isComplete:
        onboardingCompleted,
    },


    platforms: {
      enabled:
        enabledPlatforms,

      connected:
        connectedPlatforms,

      connectionRequired:
        connectionRequiredPlatforms,

      missingConnections:
        missingConnections,
    },


    /*
     * Security remains available to the frontend
     * if we ever want to display an informational
     * security badge/banner.
     */
    security: {
      completed:
        securityComplete,

      passwordChanged:
        securityComplete,
    },


    /*
     * Useful for server-side completion validation.
     */
    requirements: {
      organization:
        organizationComplete,

      platforms:
        platformsComplete,

      socialConnections:
        socialConnectionsComplete,

      team:
        teamComplete,

      security:
        securityComplete,

      allSatisfied:
        prerequisitesComplete,
    },


    steps,
  };
}

// ======================================================
// COMPLETE CLIENT ONBOARDING
// ======================================================
//
// Allowed:
//
// IN_PROGRESS
//      ↓
// COMPLETED
//
// The server recalculates all requirements.
// The frontend cannot force completion.
//
// ======================================================

async function completeClientOnboarding({
  clientId,
  clientAdminUserId,
}) {
  const parsedClientId =
    Number(clientId);

  const parsedUserId =
    Number(clientAdminUserId);


  // ====================================================
  // VALIDATE IDS
  // ====================================================

  if (
    !Number.isInteger(parsedClientId) ||
    parsedClientId <= 0
  ) {
    throw ApiError.badRequest(
      'Invalid client id'
    );
  }


  if (
    !Number.isInteger(parsedUserId) ||
    parsedUserId <= 0
  ) {
    throw ApiError.badRequest(
      'Invalid client administrator'
    );
  }


  // ====================================================
  // RECALCULATE CURRENT ONBOARDING STATE
  // ====================================================

  const onboarding =
    await getClientOnboardingProgress({
      clientId:
        parsedClientId,

      clientAdminUserId:
        parsedUserId,
    });


  const currentStatus =
    String(
      onboarding
        ?.client
        ?.onboardingStatus ||
      ''
    )
      .trim()
      .toUpperCase();


  // ====================================================
  // ALREADY COMPLETED
  // ====================================================

  if (
    currentStatus ===
    'COMPLETED'
  ) {
    return onboarding;
  }


  // ====================================================
  // MUST HAVE STARTED ONBOARDING
  // ====================================================

  if (
    currentStatus !==
    'IN_PROGRESS'
  ) {
    throw ApiError.conflict(
      'Client onboarding must be started before it can be completed'
    );
  }


  // ====================================================
  // CLIENT MUST BE ACTIVE
  // ====================================================

  if (
    onboarding
      ?.client
      ?.isActive !==
    true
  ) {
    throw ApiError.conflict(
      'Inactive clients cannot complete onboarding'
    );
  }


  // ====================================================
  // ALL REQUIREMENTS MUST PASS
  // ====================================================

  if (
    onboarding
      ?.progress
      ?.canComplete !==
    true
  ) {
    const incompleteSteps =
      (
        onboarding.steps ||
        []
      )
        .filter(
          (step) =>
            step.completed !==
            true
        )
        .map(
          (step) =>
            step.title
        );


    throw ApiError.conflict(
      incompleteSteps.length > 0
        ? `Complete the remaining onboarding requirements: ${incompleteSteps.join(', ')}`
        : 'Complete all onboarding requirements before finishing setup'
    );
  }


  // ====================================================
  // MARK COMPLETED
  // ====================================================

  const updatedClient =
    await clientRepository
      .setOnboardingStatus({
        clientId:
          parsedClientId,

        onboardingStatus:
          'COMPLETED',
      });


  if (!updatedClient) {
    throw ApiError.notFound(
      'Client not found'
    );
  }


  // ====================================================
  // RETURN FRESH ONBOARDING MODEL
  // ====================================================

  return getClientOnboardingProgress({
    clientId:
      parsedClientId,

    clientAdminUserId:
      parsedUserId,
  });
}
module.exports = {
  createClient,
  getClientById,
  listClients,
  setClientActiveStatus,
  startClientOnboarding,
  setClientPlatforms,
  getClientOnboardingProgress,
  completeClientOnboarding,
};