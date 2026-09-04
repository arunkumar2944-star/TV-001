import {
  Navigate,
  Route,
  Routes,
} from 'react-router-dom';

import {
  AppLayout,
} from './layouts/AppLayout.jsx';

import {
  ProtectedRoute,
  AdminRoute,
  ClientAdminRoute,
  ClientManagementRoute,
} from './routes/ProtectedRoute.jsx';

import {
  Toaster,
} from './components/Toaster.jsx';

import LoginPage
  from './pages/LoginPage.jsx';

import DashboardPage
  from './pages/DashboardPage.jsx';

import PostsPage
  from './pages/PostsPage.jsx';

import PostEditorPage
  from './pages/PostEditorPage.jsx';

import ApprovalPage
  from './pages/ApprovalPage.jsx';

import PublishPage
  from './pages/PublishPage.jsx';

import PublishJobPage
  from './pages/PublishJobPage.jsx';

import AuditPage
  from './pages/AuditPage.jsx';

import UsersPage
  from './pages/UsersPage.jsx';

import UserCreatePage
  from './pages/UserCreatePage.jsx';

import AccountPage
  from './pages/AccountPage.jsx';

import NotFoundPage
  from './pages/NotFoundPage.jsx';

import ChangePasswordPage
  from './pages/ChangePasswordPage.jsx';

import SocialConnections
  from './pages/clients/SocialConnections.jsx';

import AddClientPage
  from './pages/clients/AddClientPage.jsx';

import ClientsPage
  from './pages/clients/ClientsPage.jsx';

import ClientDetailsPage
  from './pages/clients/ClientDetailsPage.jsx';

import ClientUsersPage
  from './pages/clients/ClientUsersPage.jsx';

import ClientUserDetailsPage
  from './pages/clients/ClientUserDetailsPage.jsx';
import ClientEditPage
  from './pages/clients/ClientEditPage.jsx';
import ClientOnboardingPage
  from './pages/clients/ClientOnboardingPage.jsx';

import {
  ClientOnboardingGate,
} from './routes/ClientOnboardingGate.jsx';

export default function App() {
  return (
    <>
      <Routes>

        {/* ============================================= */}
        {/* PUBLIC */}
        {/* ============================================= */}

        <Route
          path="/login"
          element={
            <LoginPage />
          }
        />


        {/* ============================================= */}
        {/* PROTECTED APPLICATION */}
        {/* ============================================= */}

        <Route
          element={
            <ProtectedRoute>

              <ClientOnboardingGate>

                <AppLayout />

              </ClientOnboardingGate>

            </ProtectedRoute>
          }
        >

          {/* ------------------------------------------- */}
          {/* DEFAULT */}
          {/* ------------------------------------------- */}

          <Route
            path="/"
            element={
              <Navigate
                to="/dashboard"
                replace
              />
            }
          />


          {/* ------------------------------------------- */}
          {/* DASHBOARD */}
          {/* ------------------------------------------- */}

          <Route
            path="/dashboard"
            element={
              <DashboardPage />
            }
          />


          {/* ------------------------------------------- */}
          {/* CONTENT */}
          {/* ------------------------------------------- */}

          <Route
            path="/posts"
            element={
              <PostsPage />
            }
          />

          <Route
            path="/posts/new"
            element={
              <PostEditorPage
                mode="create"
              />
            }
          />

          <Route
            path="/posts/:id"
            element={
              <PostEditorPage
                mode="edit"
              />
            }
          />


          {/* ------------------------------------------- */}
          {/* APPROVAL */}
          {/* ------------------------------------------- */}

          <Route
            path="/approval"
            element={
              <ApprovalPage />
            }
          />


          {/* ------------------------------------------- */}
          {/* PUBLISHING */}
          {/* ------------------------------------------- */}

          <Route
            path="/publish"
            element={
              <PublishPage />
            }
          />

          <Route
            path="/publish/:jobId"
            element={
              <PublishJobPage />
            }
          />


          {/* ------------------------------------------- */}
          {/* AUDIT */}
          {/* ------------------------------------------- */}

          <Route
            path="/audit"
            element={
              <AuditPage />
            }
          />


          {/* ------------------------------------------- */}
          {/* ACCOUNT */}
          {/* ------------------------------------------- */}

          <Route
            path="/account"
            element={
              <AccountPage />
            }
          />

          <Route
            path="/change-password"
            element={
              <ChangePasswordPage />
            }
          />


          {/* ============================================= */}
          {/* PLATFORM ADMIN - CLIENT MANAGEMENT */}
          {/* ============================================= */}

          <Route
            path="/clients"
            element={
              <AdminRoute>
                <ClientsPage />
              </AdminRoute>
            }
          />

          <Route
            path="/clients/new"
            element={
              <AdminRoute>
                <AddClientPage />
              </AdminRoute>
            }
          />


          {/* ============================================= */}
          {/* ACTIVE CLIENT */}
          {/* ============================================= */}
          {/*
           *
           * No clientId is exposed in these URLs.
           *
           * Backend determines client through:
           *
           * PLATFORM_ADMIN:
           *   req.session.activeClientId
           *
           * CLIENT_ADMIN:
           *   req.user.client_id
           *
           * requireActiveClient
           *   ↓
           * req.clientId
           *
           */}

          <Route
            path="/client"
            element={
              <ClientManagementRoute>
                <ClientDetailsPage />
              </ClientManagementRoute>
            }
          />
          <Route
            path="/client/onboarding"
            element={
              <ClientOnboardingPage />
            }
          />

          {/* ============================================= */}
          {/* CLIENT USERS */}
          {/* ============================================= */}

          <Route
            path="/client/users"
            element={
              <ClientManagementRoute>
                <ClientUsersPage />
              </ClientManagementRoute>
            }
          />


          {/* ============================================= */}
          {/* CLIENT USER DETAILS */}
          {/* ============================================= */}
          {/*
           *
           * Browser URL contains userId only.
           *
           * Example:
           *
           * /client/users/15
           *
           * Backend still verifies:
           *
           * user_id = 15
           * AND
           * client_id = req.clientId
           *
           */}

          <Route
            path="/client/users/:userId"
            element={
              <ClientManagementRoute>
                <ClientUserDetailsPage />
              </ClientManagementRoute>
            }
          />


          {/* ============================================= */}
          {/* PLATFORM ADMIN USER MANAGEMENT */}
          {/* ============================================= */}

          <Route
            path="/users"
            element={
              <AdminRoute>
                <UsersPage />
              </AdminRoute>
            }
          />

          <Route
            path="/internal/user-create"
            element={
              <AdminRoute>
                <UserCreatePage />
              </AdminRoute>
            }
          />


          {/* ============================================= */}
          {/* SOCIAL CONNECTIONS */}
          {/* ============================================= */}

          <Route
            path="/client/social-connections"
            element={
              <ClientAdminRoute>
                <SocialConnections />
              </ClientAdminRoute>
            }
          />

          <Route
            path="/client/edit"
            element={
              <ClientAdminRoute>
                <ClientEditPage />
              </ClientAdminRoute>
            }
          />
          {/* ============================================= */}
          {/* 404 */}
          {/* ============================================= */}

          <Route
            path="*"
            element={
              <NotFoundPage />
            }
          />

        </Route>

      </Routes>

      <Toaster />
    </>
  );
}