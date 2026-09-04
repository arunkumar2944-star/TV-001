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
  useToast,
} from '../../context/ToastContext.jsx';

import {
  getActiveClient,
  updateActiveClientPlatforms,
} from '../../services/clientApi.js';

import './client-edit.css';


const PLATFORM_OPTIONS = [
  {
    code: 'facebook',
    name: 'Facebook',
    short: 'FB',
    description:
      'Publish posts and media to the client Facebook Page.',
  },
  {
    code: 'instagram',
    name: 'Instagram',
    short: 'IG',
    description:
      'Publish supported media to the connected Instagram account.',
  },
  {
    code: 'whatsapp',
    name: 'WhatsApp',
    short: 'WA',
    description:
      'Enable WhatsApp publishing workflows configured for this client.',
  },
  {
    code: 'youtube',
    name: 'YouTube',
    short: 'YT',
    description:
      'Enable video publishing workflows for the client YouTube channel.',
  },
  {
    code: 'telegram',
    name: 'Telegram',
    short: 'TG',
    description:
      'Publish content to the client Telegram channel.',
  },
  {
    code: 'x',
    name: 'X',
    short: 'X',
    description:
      'Enable publishing to the client X account.',
  },
  {
    code: 'threads',
    name: 'Threads',
    short: 'TH',
    description:
      'Enable publishing workflows for the client Threads account.',
  },
];


export default function ClientEditPage() {
  const navigate =
    useNavigate();

  const toast =
    useToast();


  const [
    client,
    setClient,
  ] = useState(null);

  const [
    selectedPlatforms,
    setSelectedPlatforms,
  ] = useState([]);

  const [
    originalPlatforms,
    setOriginalPlatforms,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState('');

  const [
    showConfirm,
    setShowConfirm,
  ] = useState(false);


  // ====================================================
  // LOAD ACTIVE CLIENT
  // ====================================================

  const loadClient =
    useCallback(
      async ({
        signal,
      } = {}) => {
        setLoading(true);
        setError('');

        try {
          const response =
            await getActiveClient({
              signal,
            });

          const clientData =
            response?.data?.client;

          if (
            !clientData ||
            !clientData.client_id
          ) {
            throw new Error(
              'The server returned an invalid client response.'
            );
          }

          const currentPlatforms =
            normalizePlatforms(
              clientData.social_platforms ??
              clientData.platforms ??
              clientData.platform_codes ??
              []
            );

          setClient(
            clientData
          );

          setSelectedPlatforms(
            currentPlatforms
          );

          setOriginalPlatforms(
            currentPlatforms
          );

        } catch (err) {
          if (
            err?.name ===
            'AbortError'
          ) {
            return;
          }

          console.error(
            'Load client edit data failed:',
            err
          );

          setError(
            getErrorMessage(
              err,
              'Unable to load client information.'
            )
          );

        } finally {
          setLoading(false);
        }
      },
      []
    );


  useEffect(() => {
    const controller =
      new AbortController();

    loadClient({
      signal:
        controller.signal,
    });

    return () => {
      controller.abort();
    };
  }, [
    loadClient,
  ]);


  // ====================================================
  // CHANGE STATE
  // ====================================================

  const selectedSet =
    useMemo(
      () =>
        new Set(
          selectedPlatforms
        ),
      [
        selectedPlatforms,
      ]
    );


  const addedPlatforms =
    useMemo(
      () =>
        selectedPlatforms.filter(
          (code) =>
            !originalPlatforms.includes(
              code
            )
        ),
      [
        selectedPlatforms,
        originalPlatforms,
      ]
    );


  const removedPlatforms =
    useMemo(
      () =>
        originalPlatforms.filter(
          (code) =>
            !selectedPlatforms.includes(
              code
            )
        ),
      [
        selectedPlatforms,
        originalPlatforms,
      ]
    );


  const hasChanges =
    addedPlatforms.length > 0 ||
    removedPlatforms.length > 0;


  function togglePlatform(
    platformCode
  ) {
    if (
      saving
    ) {
      return;
    }

    setError('');

    setSelectedPlatforms(
      (current) =>
        current.includes(
          platformCode
        )
          ? current.filter(
              (code) =>
                code !==
                platformCode
            )
          : [
              ...current,
              platformCode,
            ]
    );
  }


  // ====================================================
  // SAVE
  // ====================================================

  function requestSave() {
    if (
      saving ||
      !hasChanges
    ) {
      return;
    }

    if (
      selectedPlatforms.length ===
      0
    ) {
      setError(
        'Select at least one social platform.'
      );

      return;
    }

    if (
      removedPlatforms.length >
      0
    ) {
      setShowConfirm(
        true
      );

      return;
    }

    void savePlatforms();
  }


  async function savePlatforms() {
    if (
      saving
    ) {
      return;
    }

    setSaving(true);
    setError('');

    try {
      const response =
        await updateActiveClientPlatforms(
          selectedPlatforms
        );

      const updatedClient =
        response?.data?.client;

      if (
        !updatedClient
      ) {
        throw new Error(
          'The server did not return the updated client.'
        );
      }

      const updatedPlatforms =
        normalizePlatforms(
          updatedClient.social_platforms ??
          updatedClient.platforms ??
          updatedClient.platform_codes ??
          selectedPlatforms
        );

      setClient(
        updatedClient
      );

      setSelectedPlatforms(
        updatedPlatforms
      );

      setOriginalPlatforms(
        updatedPlatforms
      );

      setShowConfirm(
        false
      );

      toast.success(
        'Platforms updated',
        'Client social platforms were updated successfully.'
      );

      navigate(
        '/client'
      );

    } catch (err) {
      console.error(
        'Update client platforms failed:',
        err
      );

      setError(
        getErrorMessage(
          err,
          'Unable to update client social platforms.'
        )
      );

    } finally {
      setSaving(
        false
      );
    }
  }


  // ====================================================
  // LOADING
  // ====================================================

  if (
    loading
  ) {
    return (
      <PageState>
        <div className="client-edit-loader" />

        <p>
          Loading client settings...
        </p>
      </PageState>
    );
  }


  // ====================================================
  // LOAD FAILURE
  // ====================================================

  if (
    !client
  ) {
    return (
      <PageState>

        <h2>
          Unable to load client
        </h2>

        <p>
          {
            error ||
            'Client information is unavailable.'
          }
        </p>

        <div className="client-edit-state-actions">

          <button
            type="button"
            className="client-edit-button client-edit-button--primary"
            onClick={() =>
              loadClient()
            }
          >
            Retry
          </button>

          <button
            type="button"
            className="client-edit-button client-edit-button--secondary"
            onClick={() =>
              navigate(
                '/client'
              )
            }
          >
            Back to Client
          </button>

        </div>

      </PageState>
    );
  }


  // ====================================================
  // PAGE
  // ====================================================

  return (
    <main className="client-edit-page">

      <header className="client-edit-header">

        <div>

          <button
            type="button"
            className="client-edit-back"
            onClick={() =>
              navigate(
                '/client'
              )
            }
            disabled={
              saving
            }
          >
            <span
              aria-hidden="true"
            >
              ←
            </span>

            Back to Client
          </button>


          <p className="client-edit-eyebrow">
            Client Administration
          </p>


          <h1>
            Edit Social Platforms
          </h1>


          <p className="client-edit-description">
            Manage which publishing platforms are enabled for{' '}
            <strong>
              {
                client.business_name
              }
            </strong>
            .
          </p>

        </div>


        <div className="client-edit-header__summary">

          <span>
            Selected
          </span>

          <strong>
            {
              selectedPlatforms.length
            }
            {' '}
            /{' '}
            {
              PLATFORM_OPTIONS.length
            }
          </strong>

        </div>

      </header>


      {error && (
        <div
          className="client-edit-alert"
          role="alert"
        >
          <span
            className="client-edit-alert__icon"
            aria-hidden="true"
          >
            !
          </span>

          <span>
            {error}
          </span>
        </div>
      )}


      <section className="client-edit-card">

        <div className="client-edit-card__header">

          <div>

            <span className="client-edit-card__eyebrow">
              Publishing Access
            </span>

            <h2>
              Social platforms
            </h2>

            <p>
              Select the platforms this client can configure and use for publishing.
            </p>

          </div>


          <div className="client-edit-change-badges">

            {addedPlatforms.length > 0 && (
              <span className="client-edit-change-badge client-edit-change-badge--added">
                +{addedPlatforms.length} added
              </span>
            )}

            {removedPlatforms.length > 0 && (
              <span className="client-edit-change-badge client-edit-change-badge--removed">
                -{removedPlatforms.length} removed
              </span>
            )}

          </div>

        </div>


        <div
          className="client-edit-platform-grid"
          role="group"
          aria-label="Social publishing platforms"
        >

          {PLATFORM_OPTIONS.map(
            (platform) => {
              const selected =
                selectedSet.has(
                  platform.code
                );

              const originallySelected =
                originalPlatforms.includes(
                  platform.code
                );

              const newlyAdded =
                selected &&
                !originallySelected;

              const pendingRemoval =
                !selected &&
                originallySelected;


              return (
                <button
                  key={
                    platform.code
                  }
                  type="button"
                  className={
                    [
                      'client-edit-platform',
                      selected
                        ? 'client-edit-platform--selected'
                        : '',
                      newlyAdded
                        ? 'client-edit-platform--added'
                        : '',
                      pendingRemoval
                        ? 'client-edit-platform--removed'
                        : '',
                    ]
                      .filter(
                        Boolean
                      )
                      .join(' ')
                  }
                  aria-pressed={
                    selected
                  }
                  onClick={() =>
                    togglePlatform(
                      platform.code
                    )
                  }
                  disabled={
                    saving
                  }
                >

                  <div className="client-edit-platform__top">

                    <span className="client-edit-platform__logo">
                      {
                        platform.short
                      }
                    </span>


                    <span
                      className={
                        selected
                          ? 'client-edit-platform__check client-edit-platform__check--selected'
                          : 'client-edit-platform__check'
                      }
                      aria-hidden="true"
                    >
                      {
                        selected
                          ? '✓'
                          : ''
                      }
                    </span>

                  </div>


                  <div className="client-edit-platform__content">

                    <div className="client-edit-platform__title-row">

                      <h3>
                        {
                          platform.name
                        }
                      </h3>


                      {newlyAdded && (
                        <span className="client-edit-platform__state client-edit-platform__state--added">
                          New
                        </span>
                      )}


                      {pendingRemoval && (
                        <span className="client-edit-platform__state client-edit-platform__state--removed">
                          Remove
                        </span>
                      )}

                    </div>


                    <p>
                      {
                        platform.description
                      }
                    </p>

                  </div>

                </button>
              );
            }
          )}

        </div>

      </section>


      <section className="client-edit-footer-card">

        <div>

          <strong>
            {
              hasChanges
                ? 'Unsaved changes'
                : 'Everything is up to date'
            }
          </strong>

          <p>
            {
              hasChanges
                ? 'Review the selected platforms and save when ready.'
                : 'Make a selection change to enable saving.'
            }
          </p>

        </div>


        <div className="client-edit-footer-card__actions">

          <button
            type="button"
            className="client-edit-button client-edit-button--secondary"
            onClick={() =>
              navigate(
                '/client'
              )
            }
            disabled={
              saving
            }
          >
            Cancel
          </button>


          <button
            type="button"
            className="client-edit-button client-edit-button--primary"
            onClick={
              requestSave
            }
            disabled={
              saving ||
              !hasChanges
            }
          >

            {saving && (
              <span className="client-edit-button__spinner" />
            )}

            {
              saving
                ? 'Saving Changes...'
                : 'Save Changes'
            }

          </button>

        </div>

      </section>


      {showConfirm && (
        <RemovalConfirmation
          removedPlatforms={
            removedPlatforms
          }
          saving={
            saving
          }
          onCancel={() =>
            setShowConfirm(
              false
            )
          }
          onConfirm={
            savePlatforms
          }
        />
      )}

    </main>
  );
}


// ======================================================
// REMOVAL CONFIRMATION
// ======================================================

function RemovalConfirmation({
  removedPlatforms,
  saving,
  onCancel,
  onConfirm,
}) {
  useEffect(() => {
    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      'hidden';


    function handleKeyDown(
      event
    ) {
      if (
        event.key ===
          'Escape' &&
        !saving
      ) {
        onCancel();
      }
    }


    window.addEventListener(
      'keydown',
      handleKeyDown
    );


    return () => {
      document.body.style.overflow =
        previousOverflow;

      window.removeEventListener(
        'keydown',
        handleKeyDown
      );
    };
  }, [
    onCancel,
    saving,
  ]);


  const names =
    removedPlatforms.map(
      getPlatformName
    );


  return (
    <div
      className="client-edit-modal-backdrop"
      role="presentation"
      onMouseDown={(
        event
      ) => {
        if (
          event.target ===
            event.currentTarget &&
          !saving
        ) {
          onCancel();
        }
      }}
    >

      <section
        className="client-edit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-platform-title"
      >

        <div className="client-edit-modal__icon">
          !
        </div>


        <h2 id="remove-platform-title">
          Remove selected platforms?
        </h2>


        <p>
          You are disabling{' '}
          <strong>
            {
              formatNameList(
                names
              )
            }
          </strong>
          {' '}
          for this client.
        </p>


        <div className="client-edit-modal__notice">

          <strong>
            Existing social connections are preserved.
          </strong>

          <span>
            Disabled platforms will no longer appear as available publishing platforms until they are enabled again.
          </span>

        </div>


        <div className="client-edit-modal__actions">

          <button
            type="button"
            className="client-edit-button client-edit-button--secondary"
            onClick={
              onCancel
            }
            disabled={
              saving
            }
          >
            Keep Platforms
          </button>


          <button
            type="button"
            className="client-edit-button client-edit-button--danger"
            onClick={
              onConfirm
            }
            disabled={
              saving
            }
          >
            {
              saving
                ? 'Saving...'
                : 'Confirm Changes'
            }
          </button>

        </div>

      </section>

    </div>
  );
}


// ======================================================
// PAGE STATE
// ======================================================

function PageState({
  children,
}) {
  return (
    <main className="client-edit-page">
      <section className="client-edit-state">
        {children}
      </section>
    </main>
  );
}


// ======================================================
// HELPERS
// ======================================================

function normalizePlatforms(
  values
) {
  if (
    !Array.isArray(
      values
    )
  ) {
    return [];
  }

  const allowed =
    new Set(
      PLATFORM_OPTIONS.map(
        (platform) =>
          platform.code
      )
    );

  return [
    ...new Set(
      values
        .map(
          (value) =>
            String(
              value ??
              ''
            )
              .trim()
              .toLowerCase()
        )
        .filter(
          (value) =>
            allowed.has(
              value
            )
        )
    ),
  ];
}


function getPlatformName(
  code
) {
  return (
    PLATFORM_OPTIONS.find(
      (platform) =>
        platform.code ===
        code
    )?.name ||
    code
  );
}


function formatNameList(
  values
) {
  if (
    values.length ===
    0
  ) {
    return '';
  }

  if (
    values.length ===
    1
  ) {
    return values[0];
  }

  if (
    values.length ===
    2
  ) {
    return `${
      values[0]
    } and ${
      values[1]
    }`;
  }

  return `${
    values
      .slice(
        0,
        -1
      )
      .join(', ')
  }, and ${
    values[
      values.length -
      1
    ]
  }`;
}


function getErrorMessage(
  error,
  fallback
) {
  return (
    error?.response
      ?.data?.message ||
    error?.data
      ?.message ||
    error?.message ||
    fallback
  );
}
