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


module.exports = {
  createClient,
  getClientById,
  listClients,
  setClientActiveStatus,
};