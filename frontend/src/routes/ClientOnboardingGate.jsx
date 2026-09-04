import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import {
  Navigate,
  useLocation,
} from 'react-router-dom';

import {
  useAuth,
} from '../context/AuthContext.jsx';

import {
  getClientOnboardingservice,
} from '../services/clientApi.js';


const ONBOARDING_ALLOWED_PATHS = [
  '/client/onboarding',
  '/client',
  '/client/edit',
  '/client/social-connections',
  '/client/users',
];


export function ClientOnboardingGate({
  children,
}) {
  const location =
    useLocation();

  const {
    user,
  } = useAuth();


  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    onboardingStatus,
    setOnboardingStatus,
  ] = useState(null);

  const [
    loadFailed,
    setLoadFailed,
  ] = useState(false);

  /*
   * Stores the route for which the
   * onboarding status was last verified.
   *
   * This prevents a stale IN_PROGRESS
   * value from redirecting the user after
   * onboarding has just been completed.
   */
  const [
    checkedPath,
    setCheckedPath,
  ] = useState(null);


  // ====================================================
  // CURRENT USER ROLE
  // ====================================================

  const role =
    String(
      user?.role ??
      ''
    )
      .trim()
      .toUpperCase();


  const isClientAdmin =
    role ===
    'CLIENT_ADMIN';


  // ====================================================
  // LOAD ONBOARDING STATUS
  // ====================================================

  const loadOnboarding =
    useCallback(
      async (
        signal,
        path
      ) => {

        /*
         * Other roles are not part of
         * client onboarding.
         */
        if (
          !isClientAdmin
        ) {
          setOnboardingStatus(
            'NOT_APPLICABLE'
          );

          setCheckedPath(
            path
          );

          setLoading(
            false
          );

          return;
        }


        /*
         * Password-change security flow
         * always has priority over client
         * onboarding.
         */
        if (
          user
            ?.must_change_password ===
          true
        ) {
          setLoading(
            false
          );

          return;
        }


        setLoading(
          true
        );

        setLoadFailed(
          false
        );


        try {
          const response =
            await getClientOnboardingservice({
              signal,
            });


          const status =
            response
              ?.data
              ?.onboarding
              ?.client
              ?.onboardingStatus;


          if (!status) {
            throw new Error(
              'Client onboarding status was not returned.'
            );
          }


          const normalizedStatus =
            String(
              status
            )
              .trim()
              .toUpperCase();


          /*
           * Save the server status first.
           */
          setOnboardingStatus(
            normalizedStatus
          );


          /*
           * Mark this exact route as having
           * been checked against the server.
           *
           * This is important when moving:
           *
           * /client/onboarding
           *        ↓
           * /dashboard
           *
           * after completion.
           */
          setCheckedPath(
            path
          );

        } catch (error) {
          if (
            error?.name ===
            'AbortError'
          ) {
            return;
          }


          console.error(
            'Unable to check client onboarding:',
            error
          );


          setLoadFailed(
            true
          );

        } finally {
          setLoading(
            false
          );
        }
      },
      [
        isClientAdmin,
        user?.must_change_password,
      ]
    );


  // ====================================================
  // RECHECK ON ROUTE CHANGE
  // ====================================================

  useEffect(() => {
    const controller =
      new AbortController();


    loadOnboarding(
      controller.signal,
      location.pathname
    );


    return () => {
      controller.abort();
    };
  }, [
    loadOnboarding,
    location.pathname,
  ]);


  // ====================================================
  // NON CLIENT ADMIN
  // ====================================================

  if (
    !isClientAdmin
  ) {
    return children;
  }


  // ====================================================
  // FORCE PASSWORD CHANGE FIRST
  // ====================================================

  if (
    user
      ?.must_change_password ===
    true
  ) {
    if (
      location.pathname ===
      '/change-password'
    ) {
      return children;
    }


    return (
      <Navigate
        to="/change-password"
        replace
      />
    );
  }


  // ====================================================
  // WAIT FOR CURRENT ROUTE TO BE VERIFIED
  // ====================================================

  /*
   * Do not use onboardingStatus from a
   * previous route.
   *
   * Example:
   *
   * checkedPath = /client/onboarding
   * onboardingStatus = IN_PROGRESS
   *
   * User completes onboarding and moves to:
   *
   * location.pathname = /dashboard
   *
   * Until /dashboard has been checked against
   * the server, do NOT redirect based on that
   * old IN_PROGRESS value.
   */
  const currentPathChecked =
    checkedPath ===
    location.pathname;


  if (
    loading ||
    onboardingStatus ===
      null ||
    !currentPathChecked
  ) {
    if (
      loadFailed
    ) {
      return (
        <main
          style={{
            padding: '40px',
            textAlign: 'center',
          }}
        >
          <h2>
            Unable to verify workspace setup
          </h2>

          <p>
            Refresh the page and try again.
          </p>
        </main>
      );
    }


    return (
      <main
        style={{
          padding: '40px',
          textAlign: 'center',
        }}
      >
        <p>
          Checking workspace setup...
        </p>
      </main>
    );
  }


  // ====================================================
  // COMPLETED CLIENT
  // ====================================================

  if (
    onboardingStatus ===
    'COMPLETED'
  ) {

    /*
     * Completed clients should not remain
     * on the onboarding screen.
     */
    if (
      location.pathname ===
      '/client/onboarding'
    ) {
      return (
        <Navigate
          to="/dashboard"
          replace
        />
      );
    }


    /*
     * Onboarding is complete.
     *
     * Allow all normal application pages.
     */
    return children;
  }


  // ====================================================
  // ONBOARDING INCOMPLETE
  // ====================================================

  const currentPath =
    location.pathname;


  const setupPathAllowed =
    ONBOARDING_ALLOWED_PATHS
      .some(
        (path) => {

          /*
           * /client should match only
           * the exact /client page.
           *
           * Otherwise /client could
           * accidentally allow every
           * /client/* route.
           */
          if (
            path ===
            '/client'
          ) {
            return (
              currentPath ===
              '/client'
            );
          }


          /*
           * Other setup routes are allowed
           * to have nested pages.
           *
           * Example:
           *
           * /client/users/12
           */
          return (
            currentPath ===
              path ||
            currentPath.startsWith(
              `${path}/`
            )
          );
        }
      );


  if (
    setupPathAllowed
  ) {
    return children;
  }


  // ====================================================
  // BLOCK NORMAL APP UNTIL SETUP COMPLETE
  // ====================================================

  return (
    <Navigate
      to="/client/onboarding"
      replace
    />
  );
}