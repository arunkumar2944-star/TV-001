import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../services/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { Field, TextInput } from '../components/Field.jsx';
import { Button } from '../components/Button.jsx';
import { Badge } from '../components/Badge.jsx';
import { Alert } from '../components/States.jsx';
import { formatDateTime } from '../utils/format.js';

export default function AccountPage() {
  useDocumentTitle('My account');

  const { user, isAdmin, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    const problems = {};
    if (!currentPassword) problems.currentPassword = 'Enter your current password';
    if (newPassword.length < 10) problems.newPassword = 'At least 10 characters';
    else if (!/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      problems.newPassword = 'Use upper case, lower case and a number';
    }
    if (newPassword !== confirmPassword) problems.confirmPassword = 'The two passwords do not match';
    setErrors(problems);
    if (Object.keys(problems).length > 0) return;

    setSubmitting(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      toast.success('Password changed', 'Please sign in again with your new password.');
      await logout();
      navigate('/login', { replace: true });
    } catch (error) {
      toast.error('Could not change the password', error.message);
      setErrors({ currentPassword: error.status === 401 ? error.message : undefined });
    } finally {
      setSubmitting(false);
    }
  }

  if (!user) return null;

  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <div className="page-head">
        <div className="page-head__text">
          <h1>My account</h1>
          <p className="page-head__subtitle">Your profile and sign-in security.</p>
        </div>
      </div>

      <div className="card">
        <div className="card__head">
          <h2>Profile</h2>
        </div>
        <div className="card__body">
          <div className="meta-list">
            <div className="meta-row">
              <span className="meta-row__label">Name</span>
              <span className="meta-row__value">{user.full_name}</span>
            </div>
            <div className="meta-row">
              <span className="meta-row__label">Email</span>
              <span className="meta-row__value">{user.email}</span>
            </div>
            <div className="meta-row">
              <span className="meta-row__label">Role</span>
              <span className="meta-row__value">
                <Badge tone={isAdmin ? 'primary' : 'neutral'}>{user.role}</Badge>
              </span>
            </div>
            <div className="meta-row">
              <span className="meta-row__label">Last sign-in</span>
              <span className="meta-row__value">{formatDateTime(user.last_login_at)}</span>
            </div>
            <div className="meta-row">
              <span className="meta-row__label">Account created</span>
              <span className="meta-row__value">{formatDateTime(user.created_at)}</span>
            </div>
          </div>

          <Alert tone="info" title="What your role can do">
            {isAdmin
              ? 'Administrators have the complete newsroom workflow plus user management.'
              : 'Editors have the complete newsroom workflow: posts, approval, publishing, retries and the audit log. Only user management is restricted to administrators.'}
          </Alert>
        </div>
      </div>

      <form className="card" onSubmit={handleSubmit}>
        <div className="card__head">
          <h2>Change password</h2>
        </div>
        <div className="card__body">
          <div className="form-grid form-grid--single">
            <Field label="Current password" required error={errors.currentPassword}>
              {(props) => (
                <TextInput
                  {...props}
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  invalid={Boolean(errors.currentPassword)}
                />
              )}
            </Field>

            <Field
              label="New password"
              required
              error={errors.newPassword}
              hint="At least 10 characters with upper case, lower case and a number."
            >
              {(props) => (
                <TextInput
                  {...props}
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  invalid={Boolean(errors.newPassword)}
                />
              )}
            </Field>

            <Field label="Confirm new password" required error={errors.confirmPassword}>
              {(props) => (
                <TextInput
                  {...props}
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  invalid={Boolean(errors.confirmPassword)}
                />
              )}
            </Field>
          </div>
        </div>
        <div className="card__foot">
          <Button type="submit" variant="primary" loading={submitting}>
            Change password and sign out
          </Button>
        </div>
      </form>
    </div>
  );
}
