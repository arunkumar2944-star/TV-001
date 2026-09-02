import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  authApi,
} from '../services/endpoints.js';

import {
  ROLES,
} from '../utils/constants.js';

const AuthContext =
  createContext(null);

/**
 * Holds the signed-in user.
 *
 * Authentication lives in the server-side
 * session referenced by an HttpOnly cookie.
 *
 * The frontend restores the authenticated
 * user through GET /api/auth/me.
 */
export function AuthProvider({
  children,
}) {
  const [
    user,
    setUser,
  ] = useState(null);

  const [
    permissions,
    setPermissions,
  ] = useState(null);

  const [
    status,
    setStatus,
  ] = useState('loading');

  /**
   * --------------------------------------------------
   * LOAD / REFRESH AUTHENTICATED SESSION
   * --------------------------------------------------
   *
   * /auth/me is the canonical source for:
   *
   * - user
   * - role
   * - client_id
   * - permissions
   * - must_change_password
   */
  const loadSession =
    useCallback(
      async () => {
        try {
          const response =
            await authApi.me();

          const sessionUser =
            response?.data?.user ??
            null;

          const sessionPermissions =
            response?.data
              ?.permissions ??
            null;

          if (!sessionUser) {
            setUser(null);
            setPermissions(null);
            setStatus(
              'anonymous'
            );

            return null;
          }

          setUser(
            sessionUser
          );

          setPermissions(
            sessionPermissions
          );

          setStatus(
            'authenticated'
          );

          return sessionUser;
        } catch (error) {
          setUser(null);

          setPermissions(
            null
          );

          setStatus(
            'anonymous'
          );

          return null;
        }
      },
      []
    );

  /**
   * --------------------------------------------------
   * RESTORE SESSION ON APP START
   * --------------------------------------------------
   */
  useEffect(() => {
    /**
     * Ensure CSRF cookie exists before
     * the first mutating request.
     */
    authApi
      .csrf()
      .catch(() => {});

    loadSession();
  }, [
    loadSession,
  ]);

  /**
   * --------------------------------------------------
   * HANDLE SESSION EXPIRY
   * --------------------------------------------------
   */
  useEffect(() => {
    function handleExpiry() {
      setUser(null);

      setPermissions(
        null
      );

      setStatus(
        'anonymous'
      );
    }

    window.addEventListener(
      'tv:session-expired',
      handleExpiry
    );

    return () => {
      window.removeEventListener(
        'tv:session-expired',
        handleExpiry
      );
    };
  }, []);

  /**
   * --------------------------------------------------
   * LOGIN
   * --------------------------------------------------
   *
   * After login succeeds, immediately call
   * /auth/me.
   *
   * This prevents login response data and
   * session data from drifting apart.
   */
  const login =
    useCallback(
      async (
        email,
        password
      ) => {
        await authApi.login(
          email,
          password
        );

        /**
         * Use /auth/me as the canonical
         * authenticated-user response.
         */
        const sessionUser =
          await loadSession();

        if (!sessionUser) {
          throw new Error(
            'Login succeeded, but the authenticated session could not be loaded.'
          );
        }

        return sessionUser;
      },
      [
        loadSession,
      ]
    );

  /**
   * --------------------------------------------------
   * LOGOUT
   * --------------------------------------------------
   */
  const logout =
    useCallback(
      async () => {
        try {
          await authApi.logout();
        } finally {
          setUser(null);

          setPermissions(
            null
          );

          setStatus(
            'anonymous'
          );

          /**
           * Refresh CSRF state after
           * destroying the session.
           */
          await authApi
            .csrf()
            .catch(() => {});
        }
      },
      []
    );

  /**
   * --------------------------------------------------
   * DERIVED AUTH STATE
   * --------------------------------------------------
   */

  const isAuthenticated =
    status ===
      'authenticated' &&
    Boolean(user);

  const isAdmin =
    Boolean(
      user &&
      user.role ===
        ROLES.PLATFORM_ADMIN
    );

  /**
   * Newly created client users are forced
   * to change their temporary password.
   */
  const mustChangePassword =
    Boolean(
      user
        ?.must_change_password ===
        true
    );

  /**
   * --------------------------------------------------
   * CONTEXT VALUE
   * --------------------------------------------------
   */

  const value =
    useMemo(
      () => ({
        user,

        permissions,

        status,

        isLoading:
          status ===
          'loading',

        isAuthenticated,

        isAdmin,

        mustChangePassword,

        login,

        logout,

        /**
         * Keep both names available:
         *
         * refresh()
         * refreshUser()
         *
         * refreshUser is clearer for the
         * password-change page.
         */
        refresh:
          loadSession,

        refreshUser:
          loadSession,
      }),
      [
        user,
        permissions,
        status,
        isAuthenticated,
        isAdmin,
        mustChangePassword,
        login,
        logout,
        loadSession,
      ]
    );

  return (
    <AuthContext.Provider
      value={value}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context =
    useContext(
      AuthContext
    );

  if (!context) {
    throw new Error(
      'useAuth must be used inside <AuthProvider>'
    );
  }

  return context;
}