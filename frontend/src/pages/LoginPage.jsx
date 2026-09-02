import { useEffect, useState } from 'react';
import {
  Navigate,
  Outlet,
  useLocation, useNavigate
} from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { Field, TextInput } from '../components/Field.jsx';
import { Button } from '../components/Button.jsx';
import { Alert, LoadingState } from '../components/States.jsx';

const WORKFLOW = [
  'Create the post',
  'Submit for approval',
  'A colleague approves',
  'Publish through n8n',
];

export default function LoginPage() {
  useDocumentTitle('Sign in');

  const { login, isAuthenticated, isLoading, mustChangePassword } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.body.classList.add('is-login');

    return () => {
      document.body.classList.remove('is-login');
    };
  }, []);

  if (isLoading) {
    return <LoadingState label="Checking your session..." />;
  }

  if (isAuthenticated) {
    if (mustChangePassword) {
      return (
        <Navigate
          to="/change-password"
          replace
        />
      );
    }

    const target =
      location.state?.from ||
      '/dashboard';

    return (
      <Navigate
        to={target}
        replace
      />
    );
  }

  function validate() {
    const problems = {};

    if (!email.trim()) {
      problems.email = 'Email is required';
    } else if (
      !/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(email.trim())
    ) {
      problems.email = 'Enter a valid email address';
    }

    if (!password) {
      problems.password = 'Password is required';
    }

    setFieldErrors(problems);

    return Object.keys(problems).length === 0;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);

    if (!validate()) return;

    setSubmitting(true);

    try {
      const user =
        await login(
          email.trim(),
          password
        );

      toast.success(
        `Welcome back, ${user.full_name}`,
        'You are signed in to the newsroom.'
      );

      const target =
        location.state?.from ||
        '/dashboard';

      /**
       * First login:
       * force user to replace temporary password.
       */
      if (
        user.must_change_password === true
      ) {
        navigate(
          '/change-password',
          {
            replace: true,
            state: {
              from: target,
            },
          }
        );

        return;
      }

      navigate(
        target,
        {
          replace: true,
        }
      );
    } catch (caught) {
      setError(caught.message);
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <style>{`
        /* =========================================================
           LOGIN PAGE RESPONSIVE LAYOUT
           ========================================================= */

        .login-page {
          min-height: 100vh;
          width: 100%;
          display: grid;
          grid-template-columns: 1fr;
          overflow-x: hidden;
        }

        /*
         * Current state:
         * login-hero is commented out.
         * Therefore login-panel becomes the complete page
         * and the login card is centered.
         */

        .login-page > .login-panel {
          min-height: 100vh;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 32px 24px;
          box-sizing: border-box;
        }

        .login-page > .login-panel > .login-card {
          width: 100%;
          max-width: 350px;
          margin: 0 auto;
          box-sizing: border-box;
        }

        /*
         * When login-hero is enabled later:
         * LEFT  = hero
         * RIGHT = login panel
         */

        .login-page:has(.login-hero) {
          grid-template-columns: minmax(0, 1fr) minmax(420px, 520px);
        }

        .login-page:has(.login-hero) > .login-hero {
          min-height: 100vh;
        }

        .login-page:has(.login-hero) > .login-panel {
          min-height: 100vh;
          width: 100%;
        }

        /*
         * Tablet
         */

        @media (max-width: 900px) {
          .login-page:has(.login-hero) {
            grid-template-columns: 1fr;
          }

          .login-page:has(.login-hero) > .login-hero {
            min-height: auto;
          }

          .login-page:has(.login-hero) > .login-panel {
            min-height: 60vh;
          }
        }

        /*
         * Mobile
         */

        @media (max-width: 600px) {
          .login-page {
            min-height: 100dvh;
          }

          .login-page > .login-panel {
            min-height: 100dvh;
            padding: 24px 16px;
          }

          .login-page > .login-panel > .login-card {
            max-width: 100%;
          }

          .login-page:has(.login-hero) > .login-panel {
            min-height: auto;
            padding: 24px 16px;
          }
        }

        /*
         * Small mobile devices
         */

        @media (max-width: 380px) {
          .login-page > .login-panel {
            padding: 20px 12px;
          }
        }
      `}</style>

      <div className="login-page">
        {/*
          LOGIN HERO

          Currently disabled/commented.

          When required in the future, simply uncomment this section.
          The CSS above will automatically change the layout to:

          LEFT  -> login hero
          RIGHT -> login panel
        */}

        {/*
        <section className="login-hero">
          <div className="login-hero__brand">
            <span className="sidebar__mark" aria-hidden="true">
              TV
            </span>

            <div>
              <div className="sidebar__title">Trichy Vision</div>
              <div className="sidebar__subtitle">
                Internal newsroom
              </div>
            </div>
          </div>

          <h1>News publishing management</h1>

          <p>
            One place for the Trichy Vision desk to write, review, approve
            and publish district news across every social channel - with
            a full record of what went out and what failed.
          </p>

          <ul className="login-hero__list">
            {WORKFLOW.map((step, index) => (
              <li key={step}>
                <span
                  className="login-hero__step"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>

                {step}
              </li>
            ))}
          </ul>
        </section>
        */}

        <section className="login-panel">
          <div className="login-card">
            <h2>Sign in</h2>

            <p className="login-card__sub">
              Use the account your administrator created for you.
            </p>

            {error && (
              <div className="mb-2">
                <Alert tone="error">{error}</Alert>
              </div>
            )}

            <form
              className="login-form"
              onSubmit={handleSubmit}
              noValidate
            >
              <Field
                label="Email"
                required
                error={fieldErrors.email}
              >
                {(props) => (
                  <TextInput
                    {...props}
                    type="email"
                    name="email"
                    autoComplete="username"
                    placeholder="you@trichyvision.local"
                    value={email}
                    invalid={Boolean(fieldErrors.email)}
                    onChange={(event) =>
                      setEmail(event.target.value)
                    }
                    disabled={submitting}
                    autoFocus
                  />
                )}
              </Field>

              <Field
                label="Password"
                required
                error={fieldErrors.password}
              >
                {(props) => (
                  <TextInput
                    {...props}
                    type="password"
                    name="password"
                    autoComplete="current-password"
                    placeholder="Your password"
                    value={password}
                    invalid={Boolean(fieldErrors.password)}
                    onChange={(event) =>
                      setPassword(event.target.value)
                    }
                    disabled={submitting}
                  />
                )}
              </Field>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                block
                loading={submitting}
              >
                {submitting ? 'Signing in...' : 'Sign in'}
              </Button>
            </form>

            <p className="login-note">
              Accounts are created by an administrator. There is no
              public registration.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}