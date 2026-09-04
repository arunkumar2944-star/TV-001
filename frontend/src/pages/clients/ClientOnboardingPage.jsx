import {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from 'react';

import {
    useNavigate,
} from 'react-router-dom';

import {
    Button,
} from '../../components/Button.jsx';

import {
    getClientOnboardingservice,
    startClientOnboarding,
    completeClientOnboarding,
} from '../../services/clientApi.js';


import {
    useToast,
} from '../../context/ToastContext.jsx';
import './client-onboarding.css';


const PLATFORM_LABELS = {
    facebook: 'Facebook',
    instagram: 'Instagram',
    whatsapp: 'WhatsApp',
    youtube: 'YouTube',
    telegram: 'Telegram',
    x: 'X',
    threads: 'Threads',
};


const STEP_CONFIG = {
    organization: {
        number: 1,
        description:
            'Review your organization and client account information.',
    },

    platforms: {
        number: 2,
        description:
            'Choose the social platforms available for publishing.',
    },

    social_connections: {
        number: 3,
        description:
            'Connect the required social accounts used for publishing.',
    },

    team: {
        number: 4,
        description:
            'Make sure your content creator and approver are ready.',
    },

    review: {
        number: 5,
        description:
            'Review the completed setup requirements and activate your workspace.',
    },
};

function getStepStatusLabel(
    step
) {
    const status =
        String(
            step?.status ||
            ''
        )
            .trim()
            .toUpperCase();

    switch (status) {
        case 'COMPLETED':
            return 'Complete';

        case 'READY':
            return 'Ready to complete';

        case 'NOT_REQUIRED':
            return 'Not required';

        case 'IN_PROGRESS':
            return 'In progress';

        default:
            return 'Pending';
    }
}

export default function ClientOnboardingPage() {
    const navigate =
        useNavigate();
    const toast =
        useToast();

    const [
        onboarding,
        setOnboarding,
    ] = useState(null);
    const [
        completing,
        setCompleting,
    ] = useState(false);
    const [
        loading,
        setLoading,
    ] = useState(true);

    const [
        error,
        setError,
    ] = useState('');

    const [
        refreshing,
        setRefreshing,
    ] = useState(false);


    // ====================================================
    // LOAD ONBOARDING
    // ====================================================

    const loadOnboarding =
        useCallback(
            async ({
                signal,
                silent = false,
                start = false,
            } = {}) => {
                if (!silent) {
                    setLoading(true);
                } else {
                    setRefreshing(true);
                }

                setError('');

                try {
                    /*
                     * First entry into onboarding moves:
                     *
                     * ADMIN_CREATED
                     *      ↓
                     * IN_PROGRESS
                     *
                     * Calling it again is safe because
                     * the backend handles this idempotently.
                     */
                    if (start) {
                        await startClientOnboarding();
                    }


                    const response =
                        await getClientOnboardingservice({
                            signal,
                        });


                    const data =
                        response?.data?.onboarding;


                    if (
                        !data ||
                        !data.client ||
                        !data.progress ||
                        !Array.isArray(
                            data.steps
                        )
                    ) {
                        throw new Error(
                            'The server returned invalid onboarding information.'
                        );
                    }


                    setOnboarding(
                        data
                    );

                } catch (err) {
                    if (
                        err?.name ===
                        'AbortError'
                    ) {
                        return;
                    }

                    console.error(
                        'Load client onboarding failed:',
                        err
                    );

                    setError(
                        getErrorMessage(
                            err,
                            'Unable to load client onboarding.'
                        )
                    );

                } finally {
                    setLoading(false);
                    setRefreshing(false);
                }
            },
            []
        );


    useEffect(() => {
        const controller =
            new AbortController();

        loadOnboarding({
            signal:
                controller.signal,

            start:
                true,
        });

        return () => {
            controller.abort();
        };
    }, [
        loadOnboarding,
    ]);


    // ====================================================
    // DERIVED DATA
    // ====================================================

    const client =
        onboarding?.client ??
        null;

    const progress =
        onboarding?.progress ??
        null;
    const readyToComplete =
        progress?.canComplete ===
        true;

    const onboardingComplete =
        progress?.isComplete ===
        true;

    const steps =
        onboarding?.steps ??
        [];


    const completedCount =
        Number(
            progress?.completedSteps
        ) || 0;

    const totalCount =
        Number(
            progress?.totalSteps
        ) || 0;

    const percentage =
        Number(
            progress?.percentage
        ) || 0;


    const socialStep =
        useMemo(
            () =>
                steps.find(
                    (step) =>
                        step.key ===
                        'social_connections'
                ) ?? null,
            [
                steps,
            ]
        );


    // ====================================================
    // NAVIGATION
    // ====================================================

    function handleStepAction(
        key
    ) {
        switch (key) {
            case 'organization':
                navigate(
                    '/client'
                );
                break;

            case 'platforms':
                navigate(
                    '/client/edit'
                );
                break;

            case 'social_connections':
                navigate(
                    '/client/social-connections'
                );
                break;

            case 'team':
                navigate(
                    '/client/users'
                );
                break;

            default:
                break;
        }
    }


    function handleRefresh() {
        loadOnboarding({
            silent:
                true,
        });
    }

    async function handleCompleteOnboarding() {
        if (
            !progress?.canComplete ||
            completing
        ) {
            return;
        }


        setCompleting(true);


        try {
            const response =
                await completeClientOnboarding();


            const completedOnboarding =
                response?.data?.onboarding;


            if (
                !completedOnboarding ||
                completedOnboarding
                    ?.client
                    ?.onboardingStatus !==
                'COMPLETED'
            ) {
                throw new Error(
                    'The server did not confirm onboarding completion.'
                );
            }


            setOnboarding(
                completedOnboarding
            );


            toast.success(
                'Setup completed',
                'Your client workspace is ready for publishing.'
            );


            navigate(
                '/dashboard',
                {
                    replace: true,
                }
            );

        } catch (err) {
            console.error(
                'Complete client onboarding failed:',
                err
            );


            const message =
                getErrorMessage(
                    err,
                    'Unable to complete client onboarding.'
                );


            toast.error(
                'Setup not completed',
                message
            );


            /*
             * Reload server-side progress in case
             * one requirement changed while the
             * user was completing setup.
             */
            await loadOnboarding({
                silent: true,
                start: false,
            });

        } finally {
            setCompleting(
                false
            );
        }
    }

    // ====================================================
    // LOADING
    // ====================================================

    if (loading) {
        return (
            <PageState>
                <div
                    className="client-onboarding-loader"
                    aria-hidden="true"
                />

                <h2>
                    Preparing your workspace
                </h2>

                <p>
                    Checking your client setup and onboarding progress...
                </p>
            </PageState>
        );
    }


    // ====================================================
    // ERROR
    // ====================================================

    if (error) {
        return (
            <PageState>

                <div
                    className="client-onboarding-error-icon"
                    aria-hidden="true"
                >
                    !
                </div>

                <h2>
                    Unable to load onboarding
                </h2>

                <p>
                    {error}
                </p>

                <Button
                    onClick={() =>
                        loadOnboarding({
                            start:
                                false,
                        })
                    }
                >
                    Try Again
                </Button>

            </PageState>
        );
    }


    if (
        !onboarding ||
        !client ||
        !progress
    ) {
        return null;
    }


    return (
        <main className="client-onboarding-page">

            {/* =============================================
          HERO
          ============================================= */}

            <section className="client-onboarding-hero">

                <div className="client-onboarding-hero__content">

                    <span className="client-onboarding-eyebrow">
                        Client Onboarding
                    </span>

                    <h1>
                        Welcome to your publishing workspace
                    </h1>

                    <p>
                        Complete the remaining setup for{' '}
                        <strong>
                            {
                                client.businessName
                            }
                        </strong>
                        {' '}
                        before your team begins publishing content.
                    </p>

                </div>


                <div className="client-onboarding-progress-card">

                    <div className="client-onboarding-progress-card__header">

                        <div>
                            <span>
                                Setup progress
                            </span>

                            <strong>
                                {
                                    percentage
                                }
                                %
                            </strong>
                        </div>

                        <span
                            className={
                                `client-onboarding-status client-onboarding-status--${formatStatusClass(
                                    client.onboardingStatus
                                )
                                }`
                            }
                        >
                            {
                                formatStatus(
                                    client.onboardingStatus
                                )
                            }
                        </span>

                    </div>


                    <div
                        className="client-onboarding-progress-track"
                        role="progressbar"
                        aria-valuemin="0"
                        aria-valuemax="100"
                        aria-valuenow={
                            percentage
                        }
                    >
                        <span
                            className="client-onboarding-progress-bar"
                            style={{
                                width:
                                    `${percentage}%`,
                            }}
                        />
                    </div>


                    <div className="client-onboarding-progress-card__footer">

                        <span>
                            {
                                completedCount
                            }
                            {' '}
                            of
                            {' '}
                            {
                                totalCount
                            }
                            {' '}
                            setup steps complete
                        </span>

                        <button
                            type="button"
                            className="client-onboarding-refresh"
                            onClick={
                                handleRefresh
                            }
                            disabled={
                                refreshing
                            }
                        >
                            {
                                refreshing
                                    ? 'Refreshing...'
                                    : 'Refresh status'
                            }
                        </button>

                    </div>

                </div>

            </section>


            {/* =============================================
          CLIENT IDENTITY
          ============================================= */}

            <section className="client-onboarding-client">

                <div className="client-onboarding-client__avatar">
                    {
                        getInitials(
                            client.businessName
                        )
                    }
                </div>

                <div>
                    <span>
                        Organization
                    </span>

                    <strong>
                        {
                            client.businessName
                        }
                    </strong>

                    <small>
                        {
                            client.clientCode
                        }
                    </small>
                </div>

            </section>


            {/* =============================================
          SETUP STEPS
          ============================================= */}

            <section className="client-onboarding-section">

                <div className="client-onboarding-section__heading">

                    <div>
                        <h2>
                            Complete your setup
                        </h2>

                        <p>
                            Review each area below. Your progress updates
                            automatically as setup requirements are completed.
                        </p>
                    </div>

                </div>


                <div className="client-onboarding-steps">

                    {
                        steps.map(
                            (step) => (
                                <OnboardingStep
                                    key={
                                        step.key
                                    }
                                    step={
                                        step
                                    }
                                    onAction={() =>
                                        handleStepAction(
                                            step.key
                                        )
                                    }
                                />
                            )
                        )
                    }

                </div>

            </section>


            {/* =============================================
          CONNECTION SUMMARY
          ============================================= */}

            {
                socialStep &&
                socialStep.required &&
                !socialStep.completed &&
                (
                    <section className="client-onboarding-attention">

                        <div className="client-onboarding-attention__icon">
                            <ConnectionIcon />
                        </div>

                        <div className="client-onboarding-attention__content">

                            <span className="client-onboarding-attention__eyebrow">
                                Action required
                            </span>

                            <h2>
                                Connect required social accounts
                            </h2>

                            <p>
                                The following enabled platforms still need
                                an active publishing connection.
                            </p>


                            <div className="client-onboarding-platforms">

                                {
                                    (
                                        socialStep
                                            .missingPlatforms ??
                                        []
                                    ).map(
                                        (
                                            platform
                                        ) => (
                                            <span
                                                key={
                                                    platform
                                                }
                                                className="client-onboarding-platform"
                                            >
                                                {
                                                    formatPlatform(
                                                        platform
                                                    )
                                                }
                                            </span>
                                        )
                                    )
                                }

                            </div>

                        </div>


                        <Button
                            onClick={() =>
                                navigate(
                                    '/client/social-connections'
                                )
                            }
                        >
                            Connect Accounts
                        </Button>

                    </section>
                )
            }


            {/* =============================================
          FINAL REVIEW
          ============================================= */}

            <section className="client-onboarding-final">

                <div>

                    <span className="client-onboarding-eyebrow">
                        Final Step
                    </span>

                    <h2>
                        {
                            onboardingComplete
                                ? 'Workspace setup complete'
                                : readyToComplete
                                    ? 'Your workspace is ready'
                                    : 'Finish the remaining setup'
                        }
                    </h2>

                    <p>
                        {
                            onboardingComplete
                                ? 'All onboarding requirements have been completed.'
                                : readyToComplete
                                    ? 'All required setup checks have passed. Review the configuration and complete onboarding.'
                                    : 'Complete the remaining requirements before activating the workspace.'
                        }
                    </p>

                </div>


                <Button
                    onClick={
                        handleCompleteOnboarding
                    }
                    disabled={
                        onboardingComplete ||
                        !readyToComplete ||
                        completing
                    }
                    title={
                        onboardingComplete
                            ? 'Client onboarding is complete'
                            : readyToComplete
                                ? 'Complete client onboarding'
                                : 'Complete all required setup steps first'
                    }
                >
                    {
                        completing
                            ? 'Completing Setup...'
                            : onboardingComplete
                                ? 'Setup Complete'
                                : 'Complete Setup'
                    }
                </Button>

            </section>

        </main>
    );
}


function OnboardingStep({
    step,
    onAction,
}) {
    const config =
        STEP_CONFIG[
        step.key
        ] ?? {
            number: '•',
            description: '',
        };


    const completed =
        step.completed ===
        true;

    const ready =
        String(
            step.status ||
            ''
        )
            .trim()
            .toUpperCase() ===
        'READY';

    const action =
        getStepAction(
            step.key
        );

    const stepClassName =
        completed
            ? 'client-onboarding-step client-onboarding-step--complete'
            : ready
                ? 'client-onboarding-step client-onboarding-step--ready'
                : 'client-onboarding-step';


    return (
        <article
            className={
                stepClassName
            }
        >
            <span className="client-onboarding-step__number">
                {
                    completed
                        ? '✓'
                        : config.number
                }
            </span>

            <div>
                <h3>
                    {step.title}
                </h3>

                <p>
                    {config.description}
                </p>

                <StepDetails
                    step={
                        step
                    }
                />
            </div>

            <StepStatus
                step={
                    step
                }
            />

            {action && (
                <Button
                    variant="secondary"
                    onClick={
                        onAction
                    }
                >
                    {action}
                </Button>
            )}
        </article>
    );
}


function StepStatus({
    step,
}) {
    const status =
        String(
            step.status ??
            'PENDING'
        )
            .trim()
            .toUpperCase();


    return (
        <span
            className={
                `client-onboarding-step-status client-onboarding-step-status--${status
                    .toLowerCase()
                    .replaceAll(
                        '_',
                        '-'
                    )
                }`
            }
        >
            {
                getStepStatusLabel(
                    step
                )
            }
        </span>
    );
}


function StepDetails({
    step,
}) {
    if (
        step.key ===
        'platforms'
    ) {
        return (
            <div className="client-onboarding-step__meta">
                {
                    Number(
                        step.enabledCount
                    ) || 0
                }
                {' '}
                publishing platforms enabled
            </div>
        );
    }


    if (
        step.key ===
        'social_connections' &&
        step.required
    ) {
        const connected =
            step.connectedPlatforms
                ?.length ??
            0;

        const required =
            step.requiredPlatforms
                ?.length ??
            0;

        return (
            <div className="client-onboarding-step__meta">
                {
                    connected
                }
                {' '}
                of
                {' '}
                {
                    required
                }
                {' '}
                required accounts connected
            </div>
        );
    }


    if (
        step.key ===
        'team'
    ) {
        return (
            <div className="client-onboarding-team-meta">

                <TeamMetric
                    label="Client Admin"
                    value={
                        step.counts
                            ?.clientAdmins ??
                        0
                    }
                />

                <TeamMetric
                    label="Content Creator"
                    value={
                        step.counts
                            ?.contentCreators ??
                        0
                    }
                />

                <TeamMetric
                    label="Approver"
                    value={
                        step.counts
                            ?.approvers ??
                        0
                    }
                />

            </div>
        );
    }


    if (
        step.key ===
        'review'
    ) {
        const status =
            String(
                step.status ||
                ''
            )
                .trim()
                .toUpperCase();

        return (
            <div className="client-onboarding-step__meta">
                {
                    status === 'COMPLETED'
                        ? 'Workspace activated.'
                        : status === 'READY'
                            ? 'All required checks passed. Complete setup when ready.'
                            : 'Complete the remaining setup requirements first.'
                }
            </div>
        );
    }


    return null;
}


function TeamMetric({
    label,
    value,
}) {
    return (
        <span className="client-onboarding-team-metric">
            <strong>
                {
                    value
                }
            </strong>

            {
                label
            }
        </span>
    );
}


function PageState({
    children,
}) {
    return (
        <main className="client-onboarding-page client-onboarding-page--state">
            <section className="client-onboarding-state">
                {
                    children
                }
            </section>
        </main>
    );
}


function CheckIcon() {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
        >
            <path
                d="m6 12.5 4 4L18.5 8"
                stroke="currentColor"
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}


function ConnectionIcon() {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
        >
            <path
                d="M8.5 15.5 15.5 8.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
            />

            <path
                d="m14 6 1.4-1.4a4 4 0 0 1 5.6 5.7L18.3 13a4 4 0 0 1-5.7 0"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
            />

            <path
                d="m10 18-1.4 1.4A4 4 0 1 1 3 13.7L5.7 11a4 4 0 0 1 5.7 0"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
            />
        </svg>
    );
}


function getStepAction(
    key
) {
    const actions = {
        organization:
            'Review Details',

        platforms:
            'Manage Platforms',

        social_connections:
            'Connect Accounts',

        team:
            'Manage Team',
    };

    return (
        actions[key] ??
        null
    );
}


function formatPlatform(
    platform
) {
    const code =
        String(
            platform ??
            ''
        )
            .trim()
            .toLowerCase();

    return (
        PLATFORM_LABELS[
        code
        ] ??
        platform
    );
}


function formatStatus(
    status
) {
    switch (
    String(
        status ??
        ''
    )
        .trim()
        .toUpperCase()
    ) {
        case 'COMPLETED':
            return 'Completed';

        case 'IN_PROGRESS':
            return 'In Progress';

        case 'ADMIN_CREATED':
            return 'Ready to Start';

        case 'PENDING_ADMIN':
            return 'Admin Required';

        default:
            return 'Pending';
    }
}


function formatStatusClass(
    status
) {
    return String(
        status ??
        'pending'
    )
        .trim()
        .toLowerCase()
        .replaceAll(
            '_',
            '-'
        );
}


function getInitials(
    value
) {
    const words =
        String(
            value ??
            ''
        )
            .trim()
            .split(/\s+/)
            .filter(Boolean);

    if (
        words.length === 0
    ) {
        return 'CL';
    }

    return words
        .slice(
            0,
            2
        )
        .map(
            (word) =>
                word[0]
        )
        .join('')
        .toUpperCase();
}


function getErrorMessage(
    error,
    fallback
) {
    return (
        error?.response
            ?.data
            ?.message ??
        error?.data
            ?.message ??
        error?.message ??
        fallback
    );
}