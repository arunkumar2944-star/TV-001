import {
    useMemo,
    useState,
} from 'react';

import {
    useLocation,
    useNavigate,
} from 'react-router-dom';

import {
    useAuth,
} from '../context/AuthContext.jsx';

import {
    userApi,
} from '../services/endpoints.js';

import {
    Button,
} from '../components/Button.jsx';

import {
    Alert,
} from '../components/States.jsx';

import './ChangePasswordPage.css';

export default function ChangePasswordPage() {
    const navigate =
        useNavigate();

    const location =
        useLocation();

    const {
        refreshUser,
    } = useAuth();

    const [
        newPassword,
        setNewPassword,
    ] = useState('');

    const [
        confirmPassword,
        setConfirmPassword,
    ] = useState('');

    const [
        showPassword,
        setShowPassword,
    ] = useState(false);

    const [
        showConfirmPassword,
        setShowConfirmPassword,
    ] = useState(false);

    const [
        touched,
        setTouched,
    ] = useState({
        newPassword: false,
        confirmPassword: false,
    });

    const [
        error,
        setError,
    ] = useState(null);

    const [
        submitting,
        setSubmitting,
    ] = useState(false);

    /*
     * -------------------------------------------------
     * PASSWORD VALIDATION RULES
     * -------------------------------------------------
     */
    const passwordRules =
        useMemo(
            () => ({
                minLength:
                    newPassword.length >= 8,

                lowercase:
                    /[a-z]/.test(
                        newPassword
                    ),

                uppercase:
                    /[A-Z]/.test(
                        newPassword
                    ),

                number:
                    /\d/.test(
                        newPassword
                    ),

                specialCharacter:
                    /[^A-Za-z0-9]/.test(
                        newPassword
                    ),
            }),
            [
                newPassword,
            ]
        );

    const isPasswordValid =
        Object.values(
            passwordRules
        ).every(Boolean);

    const passwordsMatch =
        Boolean(
            confirmPassword
        ) &&
        newPassword ===
            confirmPassword;

    const isFormValid =
        isPasswordValid &&
        passwordsMatch;

    /*
     * -------------------------------------------------
     * PASSWORD STRENGTH
     * -------------------------------------------------
     */
    const passwordStrength =
        useMemo(
            () => {
                if (
                    !newPassword
                ) {
                    return {
                        label: '',
                        level: 0,
                    };
                }

                const passedRules =
                    Object.values(
                        passwordRules
                    ).filter(Boolean)
                        .length;

                if (
                    passedRules <= 2
                ) {
                    return {
                        label: 'Weak',
                        level: 1,
                    };
                }

                if (
                    passedRules === 3
                ) {
                    return {
                        label: 'Fair',
                        level: 2,
                    };
                }

                if (
                    passedRules === 4
                ) {
                    return {
                        label: 'Good',
                        level: 3,
                    };
                }

                return {
                    label: 'Strong',
                    level: 4,
                };
            },
            [
                newPassword,
                passwordRules,
            ]
        );

    function handlePasswordChange(
        event
    ) {
        setNewPassword(
            event.target.value
        );

        /*
         * Remove previous API error
         * while user corrects password.
         */
        if (
            error
        ) {
            setError(null);
        }
    }

    function handleConfirmPasswordChange(
        event
    ) {
        setConfirmPassword(
            event.target.value
        );

        if (
            error
        ) {
            setError(null);
        }
    }

    function handleBlur(
        field
    ) {
        setTouched(
            (
                previous
            ) => ({
                ...previous,
                [field]:
                    true,
            })
        );
    }

    async function handleSubmit(
        event
    ) {
        event.preventDefault();

        setError(null);

        /*
         * Mark both fields touched so
         * validation becomes visible.
         */
        setTouched({
            newPassword: true,
            confirmPassword: true,
        });

        if (
            !isPasswordValid
        ) {
            setError(
                'Please make sure your password meets all security requirements.'
            );

            return;
        }

        if (
            newPassword !==
            confirmPassword
        ) {
            setError(
                'Passwords do not match.'
            );

            return;
        }

        setSubmitting(
            true
        );

        try {
            /*
             * Existing working API call.
             */
            await userApi.changePassword(
                newPassword
            );

            /*
             * Reload /api/auth/me.
             *
             * DB should now contain:
             * must_change_password = false
             */
            await refreshUser();

            /*
             * Preserve your existing
             * redirect functionality.
             */
            const target =
                location.state?.from &&
                location.state.from !==
                    '/change-password'
                    ? location.state.from
                    : '/dashboard';

            navigate(
                target,
                {
                    replace: true,
                }
            );
        } catch (
            caught
        ) {
            setError(
                caught?.message ||
                    'Unable to change password. Please try again.'
            );
        } finally {
            setSubmitting(
                false
            );
        }
    }

    return (
        <main className="change-password-page">
            <div className="change-password-background">
                <div className="change-password-decoration change-password-decoration-one" />

                <div className="change-password-decoration change-password-decoration-two" />
            </div>

            <section
                className="change-password-card"
                aria-labelledby="change-password-title"
            >
                {/* Header */}
                <div className="change-password-header">
                    <div className="change-password-icon">
                        <svg
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                        >
                            <path
                                d="
                                    M7 10V8
                                    a5 5 0 0 1
                                    10 0v2
                                    m-9 0h8
                                    a2 2 0 0 1
                                    2 2v7
                                    a2 2 0 0 1
                                    -2 2H8
                                    a2 2 0 0 1
                                    -2 -2v-7
                                    a2 2 0 0 1
                                    2 -2Z
                                "
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />

                            <path
                                d="
                                    M12 14v3
                                "
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                            />
                        </svg>
                    </div>

                    <div>
                        <h1
                            id="change-password-title"
                            className="change-password-title"
                        >
                            Create a new password
                        </h1>

                        <p className="change-password-description">
                            Your current password is temporary.
                            Create a secure password before
                            continuing to your account.
                        </p>
                    </div>
                </div>

                {error && (
                    <div className="change-password-alert">
                        <Alert tone="error">
                            {error}
                        </Alert>
                    </div>
                )}

                <form
                    className="change-password-form"
                    onSubmit={
                        handleSubmit
                    }
                    noValidate
                >
                    {/* New Password */}
                    <div className="password-field-group">
                        <label
                            className="password-label"
                            htmlFor="newPassword"
                        >
                            New password

                            <span
                                className="required-mark"
                                aria-hidden="true"
                            >
                                *
                            </span>
                        </label>

                        <div
                            className={`password-input-wrapper ${
                                touched.newPassword &&
                                !isPasswordValid
                                    ? 'password-input-error'
                                    : ''
                            }`}
                        >
                            <input
                                id="newPassword"
                                className="password-input"
                                type={
                                    showPassword
                                        ? 'text'
                                        : 'password'
                                }
                                name="newPassword"
                                value={
                                    newPassword
                                }
                                autoComplete="new-password"
                                placeholder="Enter your new password"
                                disabled={
                                    submitting
                                }
                                aria-invalid={
                                    touched.newPassword &&
                                    !isPasswordValid
                                }
                                aria-describedby="password-requirements"
                                onChange={
                                    handlePasswordChange
                                }
                                onBlur={() =>
                                    handleBlur(
                                        'newPassword'
                                    )
                                }
                            />

                            <button
                                className="password-visibility-button"
                                type="button"
                                aria-label={
                                    showPassword
                                        ? 'Hide password'
                                        : 'Show password'
                                }
                                onClick={() =>
                                    setShowPassword(
                                        (
                                            previous
                                        ) =>
                                            !previous
                                    )
                                }
                                disabled={
                                    submitting
                                }
                            >
                                {showPassword
                                    ? 'Hide'
                                    : 'Show'}
                            </button>
                        </div>

                        {/* Password strength */}
                        {newPassword && (
                            <div className="password-strength">
                                <div className="password-strength-header">
                                    <span>
                                        Password strength
                                    </span>

                                    <strong
                                        className={`strength-label strength-${passwordStrength.level}`}
                                    >
                                        {
                                            passwordStrength.label
                                        }
                                    </strong>
                                </div>

                                <div className="strength-bars">
                                    {[
                                        1,
                                        2,
                                        3,
                                        4,
                                    ].map(
                                        (
                                            level
                                        ) => (
                                            <span
                                                key={
                                                    level
                                                }
                                                className={`strength-bar ${
                                                    passwordStrength.level >=
                                                    level
                                                        ? `strength-bar-active strength-${passwordStrength.level}`
                                                        : ''
                                                }`}
                                            />
                                        )
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Rules */}
                        <div
                            id="password-requirements"
                            className="password-requirements"
                        >
                            <p className="requirements-title">
                                Your password must contain:
                            </p>

                            <div className="requirements-grid">
                                <PasswordRule
                                    passed={
                                        passwordRules.minLength
                                    }
                                    label="At least 8 characters"
                                />

                                <PasswordRule
                                    passed={
                                        passwordRules.uppercase
                                    }
                                    label="One uppercase letter"
                                />

                                <PasswordRule
                                    passed={
                                        passwordRules.lowercase
                                    }
                                    label="One lowercase letter"
                                />

                                <PasswordRule
                                    passed={
                                        passwordRules.number
                                    }
                                    label="One number"
                                />

                                <PasswordRule
                                    passed={
                                        passwordRules.specialCharacter
                                    }
                                    label="One special character"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Confirm Password */}
                    <div className="password-field-group">
                        <label
                            className="password-label"
                            htmlFor="confirmPassword"
                        >
                            Confirm password

                            <span
                                className="required-mark"
                                aria-hidden="true"
                            >
                                *
                            </span>
                        </label>

                        <div
                            className={`password-input-wrapper ${
                                touched.confirmPassword &&
                                confirmPassword &&
                                !passwordsMatch
                                    ? 'password-input-error'
                                    : ''
                            } ${
                                passwordsMatch
                                    ? 'password-input-success'
                                    : ''
                            }`}
                        >
                            <input
                                id="confirmPassword"
                                className="password-input"
                                type={
                                    showConfirmPassword
                                        ? 'text'
                                        : 'password'
                                }
                                name="confirmPassword"
                                value={
                                    confirmPassword
                                }
                                autoComplete="new-password"
                                placeholder="Enter your password again"
                                disabled={
                                    submitting
                                }
                                aria-invalid={
                                    touched.confirmPassword &&
                                    !passwordsMatch
                                }
                                onChange={
                                    handleConfirmPasswordChange
                                }
                                onBlur={() =>
                                    handleBlur(
                                        'confirmPassword'
                                    )
                                }
                            />

                            <button
                                className="password-visibility-button"
                                type="button"
                                aria-label={
                                    showConfirmPassword
                                        ? 'Hide confirmation password'
                                        : 'Show confirmation password'
                                }
                                onClick={() =>
                                    setShowConfirmPassword(
                                        (
                                            previous
                                        ) =>
                                            !previous
                                    )
                                }
                                disabled={
                                    submitting
                                }
                            >
                                {showConfirmPassword
                                    ? 'Hide'
                                    : 'Show'}
                            </button>
                        </div>

                        {touched.confirmPassword &&
                            !confirmPassword && (
                                <p className="field-error-message">
                                    Please confirm your password.
                                </p>
                            )}

                        {touched.confirmPassword &&
                            confirmPassword &&
                            !passwordsMatch && (
                                <p className="field-error-message">
                                    Passwords do not match.
                                </p>
                            )}

                        {passwordsMatch && (
                            <p className="field-success-message">
                                ✓ Passwords match
                            </p>
                        )}
                    </div>

                    <Button
                        type="submit"
                        variant="primary"
                        size="lg"
                        block
                        loading={
                            submitting
                        }
                        disabled={
                            submitting ||
                            !isFormValid
                        }
                    >
                        {submitting
                            ? 'Updating password...'
                            : 'Update Password'}
                    </Button>

                    <div className="change-password-security-note">
                        <svg
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                        >
                            <path
                                d="
                                    M12 3
                                    5 5v4
                                    c0 4.2-2.1 7.3-5 9
                                    -2.9-1.7-5-4.8-5-9V8l5-5Z
                                "
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.6"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>

                        <span>
                            Your password is securely
                            transmitted and never displayed
                            after submission.
                        </span>
                    </div>
                </form>
            </section>
        </main>
    );
}

/*
 * -------------------------------------------------
 * PASSWORD RULE COMPONENT
 * -------------------------------------------------
 */
function PasswordRule({
    passed,
    label,
}) {
    return (
        <div
            className={`password-rule ${
                passed
                    ? 'password-rule-passed'
                    : ''
            }`}
        >
            <span
                className="password-rule-icon"
                aria-hidden="true"
            >
                {passed
                    ? '✓'
                    : '○'}
            </span>

            <span>
                {label}
            </span>
        </div>
    );
}