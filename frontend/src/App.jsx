import {
  Navigate,
  Outlet,
  useLocation, Route, Routes
} from 'react-router-dom';

import { AppLayout } from './layouts/AppLayout.jsx';
import {
  ProtectedRoute,
  AdminRoute,
  ClientAdminRoute,
  ClientManagementRoute,
} from './routes/ProtectedRoute.jsx';

import { Toaster } from './components/Toaster.jsx';

import LoginPage from './pages/LoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import PostsPage from './pages/PostsPage.jsx';
import PostEditorPage from './pages/PostEditorPage.jsx';
import ApprovalPage from './pages/ApprovalPage.jsx';
import PublishPage from './pages/PublishPage.jsx';
import PublishJobPage from './pages/PublishJobPage.jsx';
import AuditPage from './pages/AuditPage.jsx';
import UsersPage from './pages/UsersPage.jsx';
import UserCreatePage from './pages/UserCreatePage.jsx';
import AccountPage from './pages/AccountPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import SocialConnections from './pages/clients/SocialConnections.jsx';
import AddClientPage from './pages/clients/AddClientPage.jsx';
import ClientsPage from './pages/clients/ClientsPage.jsx';
import ClientDetailsPage from './pages/clients/ClientDetailsPage.jsx';
import ClientUsersPage
  from './pages/clients/ClientUsersPage.jsx';
import ChangePasswordPage
  from './pages/ChangePasswordPage.jsx';
export default function App() {
  return (
    <>
      <Routes>

        {/* ============================= */}
        {/* PUBLIC */}
        {/* ============================= */}

        <Route
          path="/login"
          element={<LoginPage />}
        />


        {/* ============================= */}
        {/* PROTECTED APPLICATION */}
        {/* ============================= */}

        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >

          <Route
            path="/"
            element={
              <Navigate
                to="/dashboard"
                replace
              />
            }
          />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/posts"
            element={<PostsPage />}
          />

          <Route
            path="/posts/new"
            element={
              <PostEditorPage mode="create" />
            }
          />

          <Route
            path="/posts/:id"
            element={
              <PostEditorPage mode="edit" />
            }
          />

          <Route
            path="/approval"
            element={<ApprovalPage />}
          />

          <Route
            path="/publish"
            element={<PublishPage />}
          />

          <Route
            path="/publish/:jobId"
            element={<PublishJobPage />}
          />

          <Route
            path="/audit"
            element={<AuditPage />}
          />

          <Route
            path="/account"
            element={<AccountPage />}
          />
          <Route
            path="/clients"
            element={
              <AdminRoute>
                <ClientsPage />
              </AdminRoute>
            }
          />
          <Route
            path="/client"
            element={
              <ClientManagementRoute>
                <ClientDetailsPage />
              </ClientManagementRoute>
            }
          />

          <Route
            path="/client/users"
            element={
              <ClientManagementRoute>
                <ClientUsersPage />
              </ClientManagementRoute>
            }
          />

          <Route
            path="/change-password"
            element={
              <ProtectedRoute>
                <ChangePasswordPage />
              </ProtectedRoute>
            }
          />
          {/* ============================= */}
          {/* ADMIN */}
          {/* ============================= */}

          <Route
            path="/users"
            element={
              <AdminRoute>
                <UsersPage />
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
          <Route
            path="/internal/user-create"
            element={
              <AdminRoute>
                <UserCreatePage />
              </AdminRoute>
            }
          />


          {/* ============================= */}
          {/* SOCIAL CONNECTIONS */}
          {/* ============================= */}

          <Route
            path="/client/social-connections"
            element={
              <ClientAdminRoute>
                <SocialConnections />
              </ClientAdminRoute>}
          />


          {/* ============================= */}
          {/* 404 */}
          {/* ============================= */}

          <Route path="*" element={<NotFoundPage />} />

        </Route>
      </Routes>

      <Toaster />
    </>
  );
}