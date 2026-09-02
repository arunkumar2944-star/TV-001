export const ROLES =
  Object.freeze({
    PLATFORM_ADMIN:
      'PLATFORM_ADMIN',

    CLIENT_ADMIN:
      'CLIENT_ADMIN',

    CONTENT_CREATOR:
      'CONTENT_CREATOR',

    EDITOR:
      'EDITOR',

    APPROVER:
      'APPROVER',
  });


/**
 * =====================================================
 * ROLE UI CONFIGURATION
 * =====================================================
 *
 * This file controls UI visibility only.
 *
 * Backend middleware remains the real security
 * boundary for every API endpoint.
 */
export const ROLE_UI_CONFIG =
  Object.freeze({

    /**
     * =================================================
     * PLATFORM ADMIN
     * =================================================
     *
     * Platform-level administration only.
     *
     * Social account connections belong to
     * CLIENT_ADMIN and are intentionally absent.
     */
    [ROLES.PLATFORM_ADMIN]: {
      sidebarTitle:
        'Platform Administration',

      menu: [
        {
          section:
            'Platform',

          items: [
            {
              to:
                '/dashboard',

              label:
                'Dashboard',

              title:
                'Dashboard',

              icon:
                '▦',

              exact:
                true,
            },

            {
              to:
                '/clients',

              label:
                'Clients',

              title:
                'Clients',

              icon:
                '▤',

              exact:
                true,
            },
          ],
        },

        {
          section:
            'Administration',

          items: [
            {
              to:
                '/platform-users',

              label:
                'Platform Users',

              title:
                'Platform Users',

              icon:
                '♙',
            },

            {
              to:
                '/audit',

              label:
                'System Audit',

              title:
                'System Audit',

              icon:
                '☷',
            },
          ],
        },
      ],
    },


    /**
     * =================================================
     * CLIENT ADMIN
     * =================================================
     *
     * Owns the client workspace.
     *
     * CLIENT_ADMIN can:
     *
     * - view own client
     * - manage client users
     * - connect social accounts
     * - work with posts
     * - access approvals
     * - monitor publishing
     * - view client audit
     */
    [ROLES.CLIENT_ADMIN]: {
      sidebarTitle:
        'Client Administration',

      menu: [
        {
          section:
            'Workspace',

          items: [
            {
              to:
                '/dashboard',

              label:
                'Dashboard',

              title:
                'Dashboard',

              icon:
                '▦',

              exact:
                true,
            },

            {
              to:
                '/client',

              label:
                'My Client',

              title:
                'Client Details',

              icon:
                '▤',

              exact:
                true,
            },

            {
              to:
                '/posts',

              label:
                'Posts',

              title:
                'Posts',

              icon:
                '✎',
            },

            {
              to:
                '/approval',

              label:
                'Approval',

              title:
                'Approval Queue',

              icon:
                '✓',

              badge:
                'approvals',
            },

            {
              to:
                '/publish',

              label:
                'Publish',

              title:
                'Publishing',

              icon:
                '➤',
            },

            {
              to:
                '/audit',

              label:
                'Audit Log',

              title:
                'Audit Log',

              icon:
                '☷',
            },
          ],
        },

        {
          section:
            'Client Administration',

          items: [
            {
              to:
                '/client/users',

              label:
                'Users',

              title:
                'User Management',

              icon:
                '♙',
            },

            {
              to:
                '/client/social-connections',

              label:
                'Social Connections',

              title:
                'Social Connections',

              icon:
                '◎',
            },
          ],
        },
      ],
    },


    /**
     * =================================================
     * CONTENT CREATOR
     * =================================================
     *
     * Creates and manages content.
     *
     * No user administration.
     * No social connection management.
     */
    [ROLES.CONTENT_CREATOR]: {
      sidebarTitle:
        'Content Workspace',

      menu: [
        {
          section:
            'Workspace',

          items: [
            {
              to:
                '/dashboard',

              label:
                'Dashboard',

              title:
                'Dashboard',

              icon:
                '▦',

              exact:
                true,
            },

            {
              to:
                '/posts',

              label:
                'Posts',

              title:
                'Posts',

              icon:
                '✎',
            },
          ],
        },
      ],
    },


    /**
     * =================================================
     * EDITOR
     * =================================================
     */
    [ROLES.EDITOR]: {
      sidebarTitle:
        'Editorial',

      menu: [
        {
          section:
            'Editorial',

          items: [
            {
              to:
                '/dashboard',

              label:
                'Dashboard',

              title:
                'Dashboard',

              icon:
                '▦',

              exact:
                true,
            },

            {
              to:
                '/posts',

              label:
                'Posts',

              title:
                'Posts',

              icon:
                '✎',
            },

            {
              to:
                '/approval',

              label:
                'Review Queue',

              title:
                'Review Queue',

              icon:
                '✓',

              badge:
                'approvals',
            },
          ],
        },
      ],
    },


    /**
     * =================================================
     * APPROVER
     * =================================================
     */
    [ROLES.APPROVER]: {
      sidebarTitle:
        'Approval',

      menu: [
        {
          section:
            'Approval',

          items: [
            {
              to:
                '/dashboard',

              label:
                'Dashboard',

              title:
                'Dashboard',

              icon:
                '▦',

              exact:
                true,
            },

            {
              to:
                '/approval',

              label:
                'Approval Queue',

              title:
                'Approval Queue',

              icon:
                '✓',

              badge:
                'approvals',
            },
          ],
        },
      ],
    },
  });


/**
 * =====================================================
 * NORMALIZE ROLE
 * =====================================================
 */
export function normalizeRole(
  role
) {
  return String(
    role || ''
  )
    .trim()
    .toUpperCase();
}


/**
 * =====================================================
 * GET ROLE CONFIGURATION
 * =====================================================
 */
export function getRoleUiConfig(
  role
) {
  const normalizedRole =
    normalizeRole(role);

  if (
    !normalizedRole
  ) {
    return {
      sidebarTitle:
        'Newsroom',

      menu:
        [],
    };
  }

  return (
    ROLE_UI_CONFIG[
      normalizedRole
    ] ?? {
      sidebarTitle:
        'Newsroom',

      menu:
        [],
    }
  );
}


/**
 * =====================================================
 * GET MENU
 * =====================================================
 */
export function getMenuForRole(
  role
) {
  return getRoleUiConfig(
    role
  ).menu;
}


/**
 * =====================================================
 * GET SIDEBAR TITLE
 * =====================================================
 */
export function getSidebarTitleForRole(
  role
) {
  return getRoleUiConfig(
    role
  ).sidebarTitle;
}


/**
 * =====================================================
 * PAGE TITLE
 * =====================================================
 */
export function getPageTitleForRole(
  role,
  pathname
) {
  const menu =
    getMenuForRole(
      role
    );

  const items =
    menu.flatMap(
      (section) =>
        section.items
    );

  const matchedItem =
    [...items]
      .sort(
        (
          a,
          b
        ) =>
          b.to.length -
          a.to.length
      )
      .find(
        (item) =>
          pathname ===
            item.to ||
          pathname.startsWith(
            `${item.to}/`
          )
      );

  /**
   * Some authenticated routes such as
   * /account and /change-password do not
   * need sidebar menu entries.
   */
  if (
    pathname ===
    '/account'
  ) {
    return 'Account';
  }

  if (
    pathname ===
    '/change-password'
  ) {
    return 'Change Password';
  }

  return (
    matchedItem?.title ??
    'Trichy Vision'
  );
}


/**
 * =====================================================
 * APPROVAL ACCESS
 * =====================================================
 */
export function canViewApprovals(
  role
) {
  const normalizedRole =
    normalizeRole(
      role
    );

  return [
    ROLES.CLIENT_ADMIN,
    ROLES.EDITOR,
    ROLES.APPROVER,
  ].includes(
    normalizedRole
  );
}


/**
 * =====================================================
 * SOCIAL CONNECTION MANAGEMENT
 * =====================================================
 *
 * Only CLIENT_ADMIN owns social account
 * connection functionality.
 */
export function canManageSocialConnections(
  role
) {
  return (
    normalizeRole(
      role
    ) ===
    ROLES.CLIENT_ADMIN
  );
}


/**
 * =====================================================
 * PLATFORM MANAGEMENT
 * =====================================================
 */
export function isPlatformAdminRole(
  role
) {
  return (
    normalizeRole(
      role
    ) ===
    ROLES.PLATFORM_ADMIN
  );
}


/**
 * =====================================================
 * CLIENT ADMIN
 * =====================================================
 */
export function isClientAdminRole(
  role
) {
  return (
    normalizeRole(
      role
    ) ===
    ROLES.CLIENT_ADMIN
  );
}


/**
 * =====================================================
 * FORMAT ROLE
 * =====================================================
 */
export function formatRole(
  role
) {
  const normalizedRole =
    normalizeRole(
      role
    );

  if (!normalizedRole) {
    return '';
  }

  return normalizedRole
    .toLowerCase()
    .split('_')
    .map(
      (word) =>
        word
          .charAt(0)
          .toUpperCase() +
        word.slice(1)
    )
    .join(' ');
}