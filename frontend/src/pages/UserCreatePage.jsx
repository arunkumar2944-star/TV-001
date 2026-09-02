import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { userApi } from '../services/endpoints.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useToast } from '../context/ToastContext.jsx';
import { Field, TextInput, Select } from '../components/Field.jsx';
import { Button } from '../components/Button.jsx';
import { Alert } from '../components/States.jsx';

const EMPTY = { fullName: '', email: '', username: '', password: '', confirmPassword: '', role: 'EDITOR' };

const RULES = [
  { test: (value) => value.length >= 10, label: 'At least 10 characters' },
  { test: (value) => /[a-z]/.test(value), label: 'A lowercase letter' },
  { test: (value) => /[A-Z]/.test(value), label: 'An uppercase letter' },
  { test: (value) => /[0-9]/.test(value), label: 'A number' },
];

/**
 * Internal user creation - reachable only at /internal/user-create and only for
 * ADMIN. The hidden route is convenience; POST /api/internal/users refuses
 * anyone who is not an administrator.
 */
export default function UserCreatePage() {
  useDocumentTitle('Create user');

  const toast = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState(null);

  function change(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function validate() {
    const problems = {};
    if (form.fullName.trim().length < 2) problems.fullName = 'Enter the full name';
    if (!/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(form.email.trim())) problems.email = 'Enter a valid email address';
    if (form.username && !/^[a-zA-Z0-9._-]+$/.test(form.username)) {
      problems.username = 'Letters, numbers, dot, underscore and dash only';
    }
    const failedRule = RULES.find((rule) => !rule.test(form.password));
    if (failedRule) problems.password = failedRule.label;
    if (form.password !== form.confirmPassword) problems.confirmPassword = 'The two passwords do not match';
    setErrors(problems);
    return Object.keys(problems).length === 0;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const response = await userApi.create({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        username: form.username.trim() || undefined,
        password: form.password,
        role: form.role,
      });
      setCreated(response.data);
      setForm(EMPTY);
      toast.success('Account created', `${response.data.email} can now sign in.`);
    } catch (error) {
      setErrors(error.fieldErrors || {});
      toast.error('Could not create the account', error.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div className="page-head__text">
          <div className="flex mb-1">
            <Link className="small muted" to="/users">
              {'←'} Back to users
            </Link>
            <span className="badge badge--warning">Internal - administrators only</span>
          </div>
          <h1>Create a staff account</h1>
          <p className="page-head__subtitle">
            Trichy Vision has no public registration. Accounts exist only because an administrator created them here.
          </p>
        </div>
      </div>

      {created && (
        <Alert tone="success" title={`${created.full_name} added as ${created.role}`}>
          {created.email} can sign in now. Share the password through a secure channel and ask them to change it from
          the Account page after their first sign-in.
          <div className="btn-row mt-1">
            <Link className="btn btn--sm" to="/users">
              View all users
            </Link>
            <Button size="sm" onClick={() => setCreated(null)}>
              Create another
            </Button>
          </div>
        </Alert>
      )}

      <form className="card" onSubmit={handleSubmit} style={{ maxWidth: 720 }}>
        <div className="card__head">
          <h2>Account details</h2>
        </div>

        <div className="card__body">
          <div className="form-grid">
            <Field label="Full name" required error={errors.fullName} className="span-2">
              {(props) => (
                <TextInput
                  {...props}
                  value={form.fullName}
                  onChange={(event) => change('fullName', event.target.value)}
                  placeholder="Kavitha Raman"
                  maxLength={120}
                  invalid={Boolean(errors.fullName)}
                  autoComplete="off"
                />
              )}
            </Field>

            <Field label="Email" required error={errors.email} hint="Used to sign in.">
              {(props) => (
                <TextInput
                  {...props}
                  type="email"
                  value={form.email}
                  onChange={(event) => change('email', event.target.value)}
                  placeholder="kavitha@trichyvision.local"
                  invalid={Boolean(errors.email)}
                  autoComplete="off"
                />
              )}
            </Field>

            <Field label="Username" error={errors.username} hint="Optional display handle.">
              {(props) => (
                <TextInput
                  {...props}
                  value={form.username}
                  onChange={(event) => change('username', event.target.value)}
                  placeholder="kavitha"
                  invalid={Boolean(errors.username)}
                  autoComplete="off"
                />
              )}
            </Field>

            <Field
              label="Role"
              required
              hint="Editors get the full newsroom workflow. Administrators additionally manage users."
              className="span-2"
            >
              {(props) => (
                <Select {...props} value={form.role} onChange={(event) => change('role', event.target.value)}>
                  <option value="EDITOR">EDITOR - create, approve, publish, retry</option>
                  <option value="CLIENT_ADMIN">CLIENT_ADMIN - manages a client workspace</option>
                </Select>
              )}
            </Field>

            <Field label="Password" required error={errors.password}>
              {(props) => (
                <TextInput
                  {...props}
                  type="password"
                  value={form.password}
                  onChange={(event) => change('password', event.target.value)}
                  invalid={Boolean(errors.password)}
                  autoComplete="new-password"
                />
              )}
            </Field>

            <Field label="Confirm password" required error={errors.confirmPassword}>
              {(props) => (
                <TextInput
                  {...props}
                  type="password"
                  value={form.confirmPassword}
                  onChange={(event) => change('confirmPassword', event.target.value)}
                  invalid={Boolean(errors.confirmPassword)}
                  autoComplete="new-password"
                />
              )}
            </Field>

            <div className="span-2">
              <p className="field__hint">Password requirements</p>
              <ul className="small muted" style={{ margin: '0.25rem 0 0', paddingLeft: '1.1rem' }}>
                {RULES.map((rule) => {
                  const ok = rule.test(form.password);
                  return (
                    <li key={rule.label} style={{ color: ok ? 'var(--success)' : undefined }}>
                      {ok ? '✓' : '○'} {rule.label}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>

        <div className="card__foot">
          <div className="btn-row">
            <Button type="submit" variant="primary" loading={submitting}>
              Create account
            </Button>
            <Button onClick={() => navigate('/users')} disabled={submitting}>
              Cancel
            </Button>
          </div>
        </div>
      </form>

      <Alert tone="info" title="The password is never stored in plain text">
        It is hashed with bcrypt before it reaches the database, and no API response ever returns a password hash.
      </Alert>
    </div>
  );
}
