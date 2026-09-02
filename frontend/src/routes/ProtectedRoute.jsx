import {
  Navigate,
  useLocation,
} from 'react-router-dom';

import {
  useAuth,
} from '../context/AuthContext.jsx';

import {
  LoadingState,
} from '../components/States.jsx';

/**
 * Any signed-in application user.
 *
 * If the user is using a temporary password,
 * they must change it before accessing the
 * rest of the application.
 */
export function ProtectedRoute({
  children,
}) {
  const {
    isAuthenticated,
    isLoading,
    mustChangePassword,
  } = useAuth();

  const location =
    useLocation();

  /**
   * Wait until /api/auth/me finishes.
   */
  if (isLoading) {
    return (
      <LoadingState
        label="Checking your session..."
      />
    );
  }

  /**
   * Not logged in.
   */
  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from:
            location.pathname,
        }}
      />
    );
  }

  /**
   * User is authenticated but is still
   * using the temporary password.
   *
   * Do not allow access to normal pages.
   */
  if (
    mustChangePassword &&
    location.pathname !==
      '/change-password'
  ) {
    return (
      <Navigate
        to="/change-password"
        replace
        state={{
          from:
            location.pathname,
        }}
      />
    );
  }

  /**
   * Password has already been changed.
   *
   * Prevent the forced-change page from
   * being opened manually.
   */
  if (
    !mustChangePassword &&
    location.pathname ===
      '/change-password'
  ) {
    return (
      <Navigate
        to="/dashboard"
        replace
      />
    );
  }

  return children;
}

/**
 * PLATFORM_ADMIN only.
 *
 * Backend authorization remains the actual
 * security boundary. This only controls UI
 * navigation.
 */
export function AdminRoute({
  children,
}) {
  const {
    isAuthenticated,
    isAdmin,
    isLoading,
    mustChangePassword,
  } = useAuth();

  const location =
    useLocation();

  /**
   * Wait for session restoration.
   */
  if (isLoading) {
    return (
      <LoadingState
        label="Checking your permissions..."
      />
    );
  }

  /**
   * Not authenticated.
   */
  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from:
            location.pathname,
        }}
      />
    );
  }

  /**
   * Even PLATFORM_ADMIN must complete
   * a forced password change before
   * accessing protected application pages.
   */
  if (
    mustChangePassword &&
    location.pathname !==
      '/change-password'
  ) {
    return (
      <Navigate
        to="/change-password"
        replace
        state={{
          from:
            location.pathname,
        }}
      />
    );
  }

  /**
   * Authenticated, but not PLATFORM_ADMIN.
   */
  if (!isAdmin) {
    return (
      <Navigate
        to="/dashboard"
        replace
        state={{
          denied:
            'user-management',
        }}
      />
    );
  }

  return children;
}


/**
 * CLIENT_ADMIN only.
 *
 * Used for client-owned functionality such as
 * social account connections.
 */
export function ClientAdminRoute({
  children,
}) {
  const {
    user,
    isAuthenticated,
    isLoading,
    mustChangePassword,
  } = useAuth();

  const location =
    useLocation();

  if (isLoading) {
    return (
      <LoadingState
        label="Checking your permissions..."
      />
    );
  }

  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from: location.pathname,
        }}
      />
    );
  }

  /**
   * Temporary-password users must
   * complete password change first.
   */
  if (mustChangePassword) {
    return (
      <Navigate
        to="/change-password"
        replace
        state={{
          from: location.pathname,
        }}
      />
    );
  }

  /**
   * Social connection management belongs
   * exclusively to CLIENT_ADMIN.
   */
  if (
    user?.role !== 'CLIENT_ADMIN'
  ) {
    return (
      <Navigate
        to="/dashboard"
        replace
        state={{
          denied:
            'social-connections',
        }}
      />
    );
  }

  return children;
}

/**
 * PLATFORM_ADMIN or CLIENT_ADMIN.
 *
 * Used for:
 * - Client details
 * - Client user management
 *
 * Social Connections must NOT use this.
 */
export function ClientManagementRoute({
  children,
}) {
  const {
    user,
    isAuthenticated,
    isLoading,
    mustChangePassword,
  } = useAuth();

  const location =
    useLocation();

  if (isLoading) {
    return (
      <LoadingState
        label="Checking your permissions..."
      />
    );
  }

  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from: location.pathname,
        }}
      />
    );
  }

  if (mustChangePassword) {
    return (
      <Navigate
        to="/change-password"
        replace
        state={{
          from: location.pathname,
        }}
      />
    );
  }

  const role =
    String(
      user?.role || ''
    )
      .trim()
      .toUpperCase();

  const allowed =
    [
      'PLATFORM_ADMIN',
      'CLIENT_ADMIN',
    ].includes(role);

  if (!allowed) {
    return (
      <Navigate
        to="/dashboard"
        replace
        state={{
          denied:
            'client-management',
        }}
      />
    );
  }

  return children;
}