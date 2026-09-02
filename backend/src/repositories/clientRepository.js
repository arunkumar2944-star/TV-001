'use strict';

const db =
  require('../database');


// ======================================================
// PUBLIC CLIENT COLUMNS
// ======================================================

const PUBLIC_COLUMNS = `
  client_id,
  client_code,
  business_name,
  contact_name,
  contact_email,
  contact_phone,
  timezone,
  default_language,
  status,
  onboarding_status,
  is_active,
  created_by,
  created_at,
  updated_at
`;


// ======================================================
// LIST ENABLED SOCIAL PLATFORMS
// ======================================================

async function listEnabledPlatforms(
  clientId,
  transactionClient = null
) {
  const rows =
    await db.queryAll(
      `
      SELECT
        LOWER(platform) AS platform

      FROM client_social_platforms

      WHERE client_id = $1
        AND is_enabled = TRUE

      ORDER BY
        LOWER(platform) ASC
      `,
      [clientId],
      transactionClient
    );

  return rows.map(
    (row) =>
      row.platform
  );
}


// ======================================================
// FIND ENABLED SOCIAL PLATFORM ROWS
// ======================================================

async function findEnabledSocialPlatforms(
  clientId,
  transactionClient = null
) {
  return db.queryAll(
    `
    SELECT
      client_social_platform_id,
      client_id,
      LOWER(platform) AS platform,
      is_enabled,
      created_at,
      updated_at

    FROM client_social_platforms

    WHERE client_id = $1
      AND is_enabled = TRUE

    ORDER BY
      LOWER(platform) ASC
    `,
    [clientId],
    transactionClient
  );
}


// ======================================================
// FIND BY ID
// ======================================================

async function findById(
  clientId
) {
  const client =
    await db.queryOne(
      `
      SELECT
        ${PUBLIC_COLUMNS}

      FROM clients

      WHERE client_id = $1

      LIMIT 1
      `,
      [clientId]
    );

  if (!client) {
    return null;
  }

  const socialPlatforms =
    await listEnabledPlatforms(
      clientId
    );

  return {
    ...client,

    social_platforms:
      socialPlatforms,

    // temporary aliases for frontend compatibility
    socialPlatforms:
      socialPlatforms,

    platforms:
      socialPlatforms,

    platform_codes:
      socialPlatforms,
  };
}


// ======================================================
// FIND BY CLIENT CODE
// ======================================================

async function findByCode(
  clientCode
) {
  return db.queryOne(
    `
    SELECT
      ${PUBLIC_COLUMNS}

    FROM clients

    WHERE LOWER(client_code) =
          LOWER($1)

    LIMIT 1
    `,
    [clientCode]
  );
}


// ======================================================
// FIND BY CONTACT EMAIL
// ======================================================

async function findByContactEmail(
  email
) {
  return db.queryOne(
    `
    SELECT
      ${PUBLIC_COLUMNS}

    FROM clients

    WHERE contact_email IS NOT NULL
      AND LOWER(contact_email) =
          LOWER($1)

    LIMIT 1
    `,
    [email]
  );
}


// ======================================================
// CREATE CLIENT
// ======================================================
//
// Creates:
//
// 1. clients
// 2. client_social_platforms
//
// inside ONE PostgreSQL transaction.
//
// If platform insertion fails,
// client creation is rolled back.
//
// ======================================================

async function create({
  clientCode,
  businessName,
  contactName = null,
  contactEmail = null,
  contactPhone = null,
  timezone = 'Asia/Kolkata',
  defaultLanguage = 'en',
  socialPlatforms = [],
  createdBy,
}) {
  return db.withTransaction(
    async (transactionClient) => {

      // ==================================================
      // 1. CREATE CLIENT
      // ==================================================

      const createdClient =
        await db.queryOne(
          `
          INSERT INTO clients
          (
            client_code,
            business_name,
            contact_name,
            contact_email,
            contact_phone,
            timezone,
            default_language,
            status,
            is_active,
            created_by,
            created_at,
            updated_at
          )
          VALUES
          (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            'ACTIVE',
            TRUE,
            $8,
            NOW(),
            NOW()
          )
          RETURNING
            ${PUBLIC_COLUMNS}
          `,
          [
            clientCode,
            businessName,
            contactName,
            contactEmail,
            contactPhone,
            timezone,
            defaultLanguage,
            createdBy,
          ],
          transactionClient
        );


      // ==================================================
      // 2. STORE SOCIAL PLATFORMS
      // ==================================================

      if (
        Array.isArray(
          socialPlatforms
        ) &&
        socialPlatforms.length > 0
      ) {
        await db.query(
          `
          INSERT INTO client_social_platforms
          (
            client_id,
            platform,
            is_enabled,
            created_at,
            updated_at
          )

          SELECT
            $1,
            selected.platform::VARCHAR(30),
            TRUE,
            NOW(),
            NOW()

          FROM UNNEST(
            $2::TEXT[]
          ) AS selected(platform)
          `,
          [
            createdClient.client_id,
            socialPlatforms,
          ],
          transactionClient
        );
      }


      // ==================================================
      // 3. READ SAVED PLATFORMS
      // ==================================================

      const savedPlatforms =
        await listEnabledPlatforms(
          createdClient.client_id,
          transactionClient
        );


      // ==================================================
      // 4. RETURN CREATED CLIENT
      // ==================================================

      return {
        ...createdClient,

        social_platforms:
          savedPlatforms,

        socialPlatforms:
          savedPlatforms,

        platforms:
          savedPlatforms,

        platform_codes:
          savedPlatforms,
      };
    }
  );
}


// ======================================================
// LIST CLIENTS
// ======================================================

async function list({
  search = null,
  isActive = null,
  page = 1,
  pageSize = 25,
}) {
  const safePage =
    Math.max(
      Number(page) || 1,
      1
    );

  const safePageSize =
    Math.min(
      Math.max(
        Number(pageSize) || 25,
        1
      ),
      100
    );

  const offset =
    (
      safePage - 1
    ) *
    safePageSize;

  const searchValue =
    search
      ? `%${String(
          search
        ).trim()}%`
      : null;

  const params = [
    searchValue,
    isActive,
  ];

  const where = `
    WHERE
      (
        $1::TEXT IS NULL

        OR c.client_code
          ILIKE $1

        OR c.business_name
          ILIKE $1

        OR c.contact_name
          ILIKE $1

        OR c.contact_email
          ILIKE $1
      )

      AND
      (
        $2::BOOLEAN IS NULL

        OR c.is_active =
           $2
      )
  `;

  const [
    items,
    countRow,
  ] =
    await Promise.all([

      // ==================================================
      // CLIENT LIST
      // ==================================================

      db.queryAll(
        `
        SELECT
          c.client_id,
          c.client_code,
          c.business_name,
          c.contact_name,
          c.contact_email,
          c.contact_phone,
          c.timezone,
          c.default_language,
          c.onboarding_status,
          c.status,
          c.is_active,
          c.created_by,
          c.created_at,
          c.updated_at,

          COALESCE(
            (
              SELECT
                ARRAY_AGG(
                  LOWER(
                    csp.platform
                  )
                  ORDER BY
                    LOWER(
                      csp.platform
                    )
                )

              FROM
                client_social_platforms csp

              WHERE
                csp.client_id =
                  c.client_id

                AND
                csp.is_enabled =
                  TRUE
            ),

            ARRAY[]::TEXT[]
          )
          AS social_platforms

        FROM clients c

        ${where}

        ORDER BY
          c.created_at DESC,
          c.client_id DESC

        LIMIT $3

        OFFSET $4
        `,
        [
          ...params,
          safePageSize,
          offset,
        ]
      ),


      // ==================================================
      // TOTAL COUNT
      // ==================================================

      db.queryOne(
        `
        SELECT
          COUNT(*)::INT AS total

        FROM clients c

        ${where}
        `,
        params
      ),
    ]);


  // ======================================================
  // NORMALIZE RESPONSE
  // ======================================================

  const normalizedItems =
    items.map(
      (item) => {
        const socialPlatforms =
          Array.isArray(
            item.social_platforms
          )
            ? item.social_platforms
            : [];

        return {
          ...item,

          social_platforms:
            socialPlatforms,

          socialPlatforms:
            socialPlatforms,

          platforms:
            socialPlatforms,

          platform_codes:
            socialPlatforms,
        };
      }
    );


  return {
    items:
      normalizedItems,

    pagination: {
      page:
        safePage,

      pageSize:
        safePageSize,

      total:
        countRow?.total || 0,
    },
  };
}


// ======================================================
// UPDATE ACTIVE STATUS
// ======================================================

async function setActiveStatus({
  clientId,
  isActive,
}) {
  const updatedClient =
    await db.queryOne(
      `
      UPDATE clients

      SET
        is_active = $2,

        status =
          CASE
            WHEN $2 = TRUE
              THEN 'ACTIVE'

            ELSE
              'INACTIVE'
          END,

        updated_at =
          NOW()

      WHERE
        client_id = $1

      RETURNING
        ${PUBLIC_COLUMNS}
      `,
      [
        clientId,
        isActive,
      ]
    );

  if (!updatedClient) {
    return null;
  }

  const socialPlatforms =
    await listEnabledPlatforms(
      clientId
    );

  return {
    ...updatedClient,

    social_platforms:
      socialPlatforms,

    socialPlatforms:
      socialPlatforms,

    platforms:
      socialPlatforms,

    platform_codes:
      socialPlatforms,
  };
}


// ======================================================
// UPDATE CLIENT SOCIAL PLATFORMS
// ======================================================
//
// Example:
//
// Before:
//
// facebook  = true
// instagram = true
//
// New request:
//
// facebook
// youtube
//
// Result:
//
// facebook  = true
// instagram = false
// youtube   = true
//
// ======================================================

async function updateSocialPlatforms({
  clientId,
  socialPlatforms = [],
}) {
  return db.withTransaction(
    async (transactionClient) => {

      // ==================================================
      // 1. DISABLE ALL CURRENT PLATFORMS
      // ==================================================

      await db.query(
        `
        UPDATE
          client_social_platforms

        SET
          is_enabled = FALSE,
          updated_at = NOW()

        WHERE
          client_id = $1
        `,
        [
          clientId,
        ],
        transactionClient
      );


      if (
        Array.isArray(
          socialPlatforms
        ) &&
        socialPlatforms.length > 0
      ) {

        // ==================================================
        // 2. RE-ENABLE EXISTING PLATFORM ROWS
        // ==================================================

        await db.query(
          `
          UPDATE
            client_social_platforms

          SET
            is_enabled = TRUE,
            updated_at = NOW()

          WHERE
            client_id = $1

            AND LOWER(platform) =
                ANY($2::TEXT[])
          `,
          [
            clientId,
            socialPlatforms,
          ],
          transactionClient
        );


        // ==================================================
        // 3. INSERT NEW PLATFORM ROWS
        // ==================================================

        await db.query(
          `
          INSERT INTO
            client_social_platforms
          (
            client_id,
            platform,
            is_enabled,
            created_at,
            updated_at
          )

          SELECT
            $1,
            selected.platform::VARCHAR(30),
            TRUE,
            NOW(),
            NOW()

          FROM UNNEST(
            $2::TEXT[]
          ) AS selected(platform)

          WHERE NOT EXISTS
          (
            SELECT
              1

            FROM
              client_social_platforms existing

            WHERE
              existing.client_id =
                $1

              AND LOWER(
                    existing.platform
                  ) =
                  LOWER(
                    selected.platform
                  )
          )
          `,
          [
            clientId,
            socialPlatforms,
          ],
          transactionClient
        );
      }


      // ==================================================
      // 4. RETURN FINAL ENABLED PLATFORMS
      // ==================================================

      return listEnabledPlatforms(
        clientId,
        transactionClient
      );
    }
  );
}

async function isPlatformEnabled(
  clientId,
  platform
) {
  const normalizedPlatform =
    String(platform || '')
      .trim()
      .toLowerCase();

  if (
    !Number.isInteger(
      Number(clientId)
    ) ||
    Number(clientId) <= 0 ||
    !normalizedPlatform
  ) {
    return false;
  }

  const row =
    await db.queryOne(
      `
      SELECT
        client_social_platform_id

      FROM client_social_platforms

      WHERE client_id = $1
        AND LOWER(platform) = $2
        AND is_enabled = TRUE

      LIMIT 1
      `,
      [
        Number(clientId),
        normalizedPlatform,
      ]
    );

  return Boolean(row);
}



// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  PUBLIC_COLUMNS,

  findById,
  findByCode,
  findByContactEmail,

  list,
  create,

  listEnabledPlatforms,
  findEnabledSocialPlatforms,
  updateSocialPlatforms,

  setActiveStatus,
  isPlatformEnabled,
};