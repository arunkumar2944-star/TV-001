import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from 'react-router-dom';

import './layout.css';

import {
  useAuth,
} from '../context/AuthContext.jsx';

import {
  useToast,
} from '../context/ToastContext.jsx';

import {
  useTheme,
} from '../context/ThemeContext.jsx';

import {
  approvalApi,
} from '../services/endpoints.js';

import {
  usePolling,
} from '../hooks/usePolling.js';

import {
  initials,
} from '../utils/format.js';

import {
  Button,
} from '../components/Button.jsx';

import {
  ConfirmDialog,
} from '../components/Modal.jsx';

import {
  ROLES,
  canViewApprovals,
  formatRole,
  getMenuForRole,
  getPageTitleForRole,
  getSidebarTitleForRole,
  normalizeRole,
} from '../config/menuConfig.js';


/**
 * =====================================================
 * APPLICATION LAYOUT
 * =====================================================
 */
export function AppLayout() {
  const {
    user,
    logout,
  } =
    useAuth();

  const toast =
    useToast();

  const {
    theme,
    toggleTheme,
  } =
    useTheme();

  const navigate =
    useNavigate();

  const location =
    useLocation();

  const [
    sidebarOpen,
    setSidebarOpen,
  ] =
    useState(false);

  const [
    pendingCount,
    setPendingCount,
  ] =
    useState(0);

  const [
    confirmLogout,
    setConfirmLogout,
  ] =
    useState(false);

  const [
    signingOut,
    setSigningOut,
  ] =
    useState(false);


  /**
   * ===================================================
   * CURRENT USER ROLE
   * ===================================================
   */
  const role =
    useMemo(
      () =>
        normalizeRole(
          user?.role
        ),
      [
        user?.role,
      ]
    );


  const isPlatformAdmin =
    role ===
    ROLES.PLATFORM_ADMIN;


  /**
   * ===================================================
   * ROLE-BASED MENU
   * ===================================================
   */
  const menuSections =
    useMemo(
      () =>
        getMenuForRole(
          role
        ),
      [
        role,
      ]
    );


  const sidebarTitle =
    useMemo(
      () =>
        getSidebarTitleForRole(
          role
        ),
      [
        role,
      ]
    );


  const pageTitle =
    useMemo(
      () =>
        getPageTitleForRole(
          role,
          location.pathname
        ),
      [
        role,
        location.pathname,
      ]
    );


  /**
   * ===================================================
   * APPROVAL ACCESS
   * ===================================================
   */
  const shouldLoadApprovals =
    useMemo(
      () =>
        canViewApprovals(
          role
        ),
      [
        role,
      ]
    );


  /**
   * ===================================================
   * SIDEBAR
   * ===================================================
   */
  const closeSidebar =
    useCallback(
      () => {
        setSidebarOpen(
          false
        );
      },
      []
    );


  const toggleSidebar =
    useCallback(
      () => {
        setSidebarOpen(
          (
            current
          ) =>
            !current
        );
      },
      []
    );


  /**
   * Close mobile sidebar whenever
   * navigation changes.
   */
  useEffect(() => {
    setSidebarOpen(
      false
    );
  }, [
    location.pathname,
  ]);


  /**
   * ===================================================
   * APPROVAL BADGE
   * ===================================================
   */
  const loadPendingCount =
    useCallback(
      async () => {
        if (
          !shouldLoadApprovals
        ) {
          setPendingCount(
            0
          );

          return;
        }

        try {
          const response =
            await approvalApi
              .list({
                page:
                  1,

                pageSize:
                  1,

                includeOwn:
                  'false',
              });

          setPendingCount(
            Number(
              response
                ?.pagination
                ?.total ??
              0
            )
          );
        } catch {
          /**
           * Badge refresh failure must
           * never interrupt the application.
           */
        }
      },
      [
        shouldLoadApprovals,
      ]
    );


  useEffect(() => {
    loadPendingCount();
  }, [
    loadPendingCount,
    location.pathname,
  ]);


  usePolling(
    loadPendingCount,
    60000,
    shouldLoadApprovals
  );


  /**
   * ===================================================
   * BADGES
   * ===================================================
   */
  const badges =
    useMemo(
      () => ({
        approvals:
          pendingCount,
      }),
      [
        pendingCount,
      ]
    );


  /**
   * ===================================================
   * LOGOUT
   * ===================================================
   */
  const handleLogout =
    useCallback(
      async () => {
        setSigningOut(
          true
        );

        try {
          await logout();

          /**
           * Remove client-specific display
           * information when session ends.
           */
          sessionStorage
            .removeItem(
              'clientName'
            );

          sessionStorage
            .removeItem(
              'userSession'
            );

          toast.info(
            'Signed out',
            'Your session has been closed.'
          );

          navigate(
            '/login',
            {
              replace:
                true,
            }
          );
        } catch {
          toast.error(
            'Sign out failed',
            'Please try again.'
          );
        } finally {
          setSigningOut(
            false
          );

          setConfirmLogout(
            false
          );
        }
      },
      [
        logout,
        navigate,
        toast,
      ]
    );


  /**
   * ===================================================
   * ACCOUNT
   * ===================================================
   */
  const handleAccountClick =
    useCallback(
      () => {
        navigate(
          '/account'
        );
      },
      [
        navigate,
      ]
    );


  /**
   * ===================================================
   * LEGACY SESSION INFORMATION
   * ===================================================
   *
   * Kept temporarily while the application
   * is migrating fully to AuthContext/API data.
   */
  const legacySession =
    useMemo(
      () => {
        try {
          return JSON.parse(
            sessionStorage
              .getItem(
                'userSession'
              ) ||
            '{}'
          );
        } catch {
          return {};
        }
      },
      [
        user,
      ]
    );


  /**
   * ===================================================
   * CLIENT / BRAND NAME
   * ===================================================
   *
   * PLATFORM_ADMIN should always see the
   * platform identity.
   *
   * Client-bound users see their client
   * organization when available.
   */
  const storedClientName =
    sessionStorage
      .getItem(
        'clientName'
      );


  const authenticatedClientName =
    user?.client_name ||
    user?.business_name ||
    null;


  const clientName =
    authenticatedClientName ||
    storedClientName ||
    legacySession
      .clientName ||
    'Content Publishing';


  const brandName =
    isPlatformAdmin
      ? 'Trichy Vision'
      : clientName;


  /**
   * ===================================================
   * BRAND MARK
   * ===================================================
   */
  const brandMark =
    useMemo(
      () => {
        if (
          isPlatformAdmin
        ) {
          return 'TV';
        }

        const mark =
          String(
            brandName ||
            ''
          )
            .split(/\s+/)
            .filter(
              Boolean
            )
            .map(
              (word) =>
                word[0]
            )
            .join('')
            .substring(
              0,
              2
            )
            .toUpperCase();

        return (
          mark ||
          'CP'
        );
      },
      [
        brandName,
        isPlatformAdmin,
      ]
    );


  /**
   * ===================================================
   * RENDER
   * ===================================================
   */
  return (
    <div className="app-shell">

      {/* ============================================= */}
      {/* MOBILE SIDEBAR OVERLAY */}
      {/* ============================================= */}

      {sidebarOpen && (
        <div
          className="sidebar-scrim"
          onClick={
            closeSidebar
          }
          role="presentation"
        />
      )}


      {/* ============================================= */}
      {/* SIDEBAR */}
      {/* ============================================= */}

      <aside
        className={
          `sidebar${
            sidebarOpen
              ? ' is-open'
              : ''
          }`
        }
        aria-label="Main navigation"
      >

        {/* BRAND */}

        <div className="sidebar__brand">

          <span
            className="sidebar__mark"
            aria-hidden="true"
          >
            {brandMark}
          </span>

          <div className="sidebar__brand-text">

            <span className="sidebar__title">
              {brandName}
            </span>

            <span className="sidebar__subtitle">
              {
                sidebarTitle ||
                'Publishing Console'
              }
            </span>

          </div>

        </div>


        {/* NAVIGATION */}

        <nav className="sidebar__nav">

          {menuSections.map(
            (
              section
            ) => (
              <div
                key={
                  section.section
                }
                className="sidebar__group"
              >

                <div className="sidebar__section">
                  {
                    section.section
                  }
                </div>


                {section.items.map(
                  (
                    item
                  ) => {
                    const badgeValue =
                      item.badge
                        ? (
                          badges[
                            item.badge
                          ] ??
                          0
                        )
                        : 0;

                    return (
                      <NavLink
                        key={
                          item.to
                        }
                        to={
                          item.to
                        }
                        end={
                          item.exact ===
                          true
                        }
                        className={({
                          isActive,
                        }) =>
                          `sidebar__link${
                            isActive
                              ? ' is-active'
                              : ''
                          }`
                        }
                        onClick={
                          closeSidebar
                        }
                      >

                        <span
                          className="sidebar__icon"
                          aria-hidden="true"
                        >
                          {
                            item.icon
                          }
                        </span>


                        <span className="sidebar__link-label">
                          {
                            item.label
                          }
                        </span>


                        {badgeValue > 0 && (
                          <span className="sidebar__badge">
                            {
                              badgeValue >
                              99
                                ? '99+'
                                : badgeValue
                            }
                          </span>
                        )}

                      </NavLink>
                    );
                  }
                )}

              </div>
            )
          )}

        </nav>

      </aside>


      {/* ============================================= */}
      {/* MAIN */}
      {/* ============================================= */}

      <div className="main">

        {/* TOP BAR */}

        <header className="topbar">

          <button
            type="button"
            className="hamburger"
            onClick={
              toggleSidebar
            }
            aria-label="Toggle navigation"
            aria-expanded={
              sidebarOpen
            }
          >
            ☰
          </button>


          {/* PAGE INFORMATION */}

          <div className="topbar__heading">

            <span className="topbar__title">
              {pageTitle}
            </span>

            <span className="topbar__context">
              {sidebarTitle}
            </span>

          </div>


          <span className="topbar__spacer" />


          {/* THEME */}

          <button
            type="button"
            className="theme-toggle"
            onClick={
              toggleTheme
            }
            aria-label={
              `Switch to ${
                theme ===
                'dark'
                  ? 'light'
                  : 'dark'
              } theme`
            }
            title={
              `Switch to ${
                theme ===
                'dark'
                  ? 'light'
                  : 'dark'
              } theme`
            }
          >
            <span
              aria-hidden="true"
            >
              {
                theme ===
                'dark'
                  ? '☀'
                  : '☾'
              }
            </span>

            <span className="theme-toggle__label">
              {
                theme ===
                'dark'
                  ? 'Light'
                  : 'Dark'
              }
            </span>
          </button>


          {/* USER */}

          <div className="topbar__user">

            <div className="topbar__meta">

              <div className="topbar__name">
                {
                  user
                    ?.full_name ||
                  ''
                }
              </div>

              <div className="topbar__role">
                {
                  formatRole(
                    role
                  )
                }
              </div>

            </div>


            <span
              className="avatar"
              aria-hidden="true"
            >
              {
                initials(
                  user
                    ?.full_name ||
                  ''
                )
              }
            </span>


            <Button
              size="sm"
              variant="ghost"
              onClick={
                handleAccountClick
              }
            >
              Account
            </Button>


            <Button
              size="sm"
              onClick={() =>
                setConfirmLogout(
                  true
                )
              }
            >
              Sign out
            </Button>

          </div>

        </header>


        {/* =========================================== */}
        {/* ROUTED PAGE */}
        {/* =========================================== */}

        <main className="content">
          <Outlet />
        </main>

      </div>


      {/* ============================================= */}
      {/* LOGOUT CONFIRMATION */}
      {/* ============================================= */}

      <ConfirmDialog
        open={
          confirmLogout
        }
        title="Sign out of Trichy Vision?"
        message="You will need to sign in again to continue working."
        confirmLabel="Sign out"
        tone="primary"
        busy={
          signingOut
        }
        onConfirm={
          handleLogout
        }
        onCancel={() =>
          setConfirmLogout(
            false
          )
        }
      />

    </div>
  );
}