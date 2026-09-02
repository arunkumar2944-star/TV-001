import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { api } from '../../services/apiClient.js';

import './client.css';
import './add-client-page.css';

const initialForm = {
  clientCode: '',
  businessName: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  timezone: 'Asia/Kolkata',
  defaultLanguage: 'en',
  socialPlatforms: [],
};

const SOCIAL_PLATFORMS = [
  {
    value: 'facebook',
    label: 'Facebook',
    icon: 'f',
    connectionReady: true,
    description: 'Facebook Page publishing and automation.',
  },
  {
    value: 'instagram',
    label: 'Instagram',
    icon: '◎',
    connectionReady: true,
    description: 'Instagram Professional account publishing.',
  },
  {
    value: 'whatsapp',
    label: 'WhatsApp',
    icon: '☎',
    connectionReady: false,
    description: 'WhatsApp Business publishing destination.',
  },
  {
    value: 'youtube',
    label: 'YouTube',
    icon: '▶',
    connectionReady: false,
    description: 'YouTube channel video publishing.',
  },
  {
    value: 'telegram',
    label: 'Telegram',
    icon: '➤',
    connectionReady: false,
    description: 'Telegram channel publishing.',
  },
  {
    value: 'x',
    label: 'X',
    icon: '𝕏',
    connectionReady: false,
    description: 'X account publishing integration.',
  },
  {
    value: 'threads',
    label: 'Threads',
    icon: '@',
    connectionReady: false,
    description: 'Threads publishing integration.',
  },
];

const TIMEZONES = [
  'Asia/Kolkata',
  'UTC',
  'Asia/Singapore',
  'Europe/London',
  'America/New_York',
];

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'ta', label: 'Tamil' },
  { value: 'hi', label: 'Hindi' },
];

function getErrorMessage(error, fallback) {
  return error?.response?.data?.message || error?.message || fallback;
}

export default function AddClientPage() {
  const navigate = useNavigate();

  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');

  const selectedPlatforms = useMemo(
    () =>
      SOCIAL_PLATFORMS.filter((platform) =>
        form.socialPlatforms.includes(platform.value)
      ),
    [form.socialPlatforms]
  );

  function clearFieldError(fieldName) {
    setErrors((previous) => {
      if (!previous[fieldName]) return previous;

      return {
        ...previous,
        [fieldName]: '',
      };
    });
  }

  function handleChange(event) {
    const { name, value } = event.target;

    let nextValue = value;

    if (name === 'clientCode') {
      nextValue = value
        .toUpperCase()
        .replace(/\s+/g, '')
        .replace(/[^A-Z0-9_-]/g, '');
    }

    setForm((previous) => ({
      ...previous,
      [name]: nextValue,
    }));

    clearFieldError(name);
    setServerError('');
  }

  function handlePlatformChange(platformValue) {
    setForm((previous) => {
      const alreadySelected =
        previous.socialPlatforms.includes(platformValue);

      return {
        ...previous,
        socialPlatforms: alreadySelected
          ? previous.socialPlatforms.filter(
              (value) => value !== platformValue
            )
          : [...previous.socialPlatforms, platformValue],
      };
    });

    clearFieldError('platforms');
    setServerError('');
  }

  function validate() {
    const nextErrors = {};

    const clientCode = form.clientCode.trim();
    const businessName = form.businessName.trim();
    const contactName = form.contactName.trim();
    const contactEmail = form.contactEmail.trim();
    const contactPhone = form.contactPhone.trim();

    if (!clientCode) {
      nextErrors.clientCode = 'Client code is required.';
    } else if (!/^[A-Z0-9_-]{2,50}$/.test(clientCode)) {
      nextErrors.clientCode =
        'Use 2-50 letters, numbers, hyphens, or underscores.';
    }

    if (!businessName) {
      nextErrors.businessName = 'Business name is required.';
    } else if (businessName.length > 150) {
      nextErrors.businessName =
        'Business name must not exceed 150 characters.';
    }

    if (contactName.length > 150) {
      nextErrors.contactName =
        'Contact name must not exceed 150 characters.';
    }

    if (
      contactEmail &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)
    ) {
      nextErrors.contactEmail = 'Enter a valid email address.';
    }

    if (
      contactPhone &&
      !/^[+\d\s()-]{7,30}$/.test(contactPhone)
    ) {
      nextErrors.contactPhone = 'Enter a valid phone number.';
    }

    if (!form.socialPlatforms.length) {
      nextErrors.platforms =
        'Select at least one publishing platform for this client.';
    }

    return nextErrors;
  }

  function focusFirstError(validationErrors) {
    const firstField = Object.keys(validationErrors)[0];
    if (!firstField) return;

    const fieldName =
      firstField === 'platforms' ? 'socialPlatforms' : firstField;

    window.requestAnimationFrame(() => {
      const element = document.querySelector(
        `[name="${fieldName}"]`
      );
      element?.focus();
    });
  }

  function buildPayload() {
    return {
      clientCode: form.clientCode.trim(),
      businessName: form.businessName.trim(),
      contactName: form.contactName.trim() || null,
      contactEmail:
        form.contactEmail.trim().toLowerCase() || null,
      contactPhone: form.contactPhone.trim() || null,
      timezone: form.timezone,
      defaultLanguage: form.defaultLanguage,
      socialPlatforms: form.socialPlatforms,
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;

    const validationErrors = validate();

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      focusFirstError(validationErrors);
      return;
    }

    setSubmitting(true);
    setServerError('');

    try {
      const data = await api.post('/clients', buildPayload());
      const client = data?.data?.client;
      const clientId = Number(client?.client_id);

      if (!Number.isInteger(clientId) || clientId <= 0) {
        throw new Error(
          'Client was created, but the server did not return a valid client ID.'
        );
      }

    //   try {
    //     await api.post('/auth/active-client', { clientId });
    //   } catch (activationError) {
    //     console.error('Client created but activation failed:', activationError);

    //     navigate('/clients', {
    //       replace: true,
    //       state: {
    //         successMessage:
    //           'Client created successfully. Select the client to continue setup.',
    //       },
    //     });
    //     return;
    //   }

      if (client.business_name) {
        sessionStorage.setItem('clientName', client.business_name);
      }

      navigate(`/clients/${clientId}/onboarding`, {
        replace: true,
        state: {
          successMessage:
            'Client created successfully. Create the client administrator to continue.',
        },
      });
    } catch (error) {
      console.error('Create client failed:', error);
      setServerError(
        getErrorMessage(error, 'Unable to create client.')
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="add-client-page">
      <header className="add-client-header">
        <div>
          <button
            type="button"
            className="add-client-back"
            onClick={() => navigate('/clients')}
            disabled={submitting}
          >
            <span aria-hidden="true">←</span>
            Back to clients
          </button>

          <p className="add-client-eyebrow">Client Management</p>
          <h1>Create a new client</h1>
          <p className="add-client-subtitle">
            Register the organization, define its publishing preferences,
            and choose the social platforms available to the client.
          </p>
        </div>

        <div className="add-client-header__status" aria-label="Form status">
          <span className="add-client-status-dot" aria-hidden="true" />
          New client setup
        </div>
      </header>

      {serverError && (
        <div
          className="add-client-alert add-client-alert--error"
          role="alert"
          aria-live="polite"
        >
          <span aria-hidden="true">!</span>
          <div>
            <strong>Client could not be created</strong>
            <p>{serverError}</p>
          </div>
        </div>
      )}

      <form
        className="add-client-layout"
        onSubmit={handleSubmit}
        noValidate
      >
        <div className="add-client-main">
          <section className="add-client-card">
            <div className="add-client-card__heading">
              <div className="add-client-section-number">01</div>
              <div>
                <h2>Organization details</h2>
                <p>
                  Core information used to identify this client throughout
                  the publishing platform.
                </p>
              </div>
            </div>

            <div className="add-client-grid add-client-grid--2">
              <div className="add-client-field">
                <label htmlFor="clientCode">
                  Client code <span>*</span>
                </label>
                <input
                  id="clientCode"
                  name="clientCode"
                  type="text"
                  value={form.clientCode}
                  onChange={handleChange}
                  placeholder="TV001"
                  autoComplete="off"
                  maxLength={50}
                  disabled={submitting}
                  aria-invalid={Boolean(errors.clientCode)}
                  aria-describedby={
                    errors.clientCode
                      ? 'clientCode-error'
                      : 'clientCode-help'
                  }
                  required
                />
                {errors.clientCode ? (
                  <p id="clientCode-error" className="add-client-error">
                    {errors.clientCode}
                  </p>
                ) : (
                  <p id="clientCode-help" className="add-client-help">
                    Unique internal identifier, for example TV001.
                  </p>
                )}
              </div>

              <div className="add-client-field">
                <label htmlFor="businessName">
                  Business name <span>*</span>
                </label>
                <input
                  id="businessName"
                  name="businessName"
                  type="text"
                  value={form.businessName}
                  onChange={handleChange}
                  placeholder="Trichy Vision News"
                  autoComplete="organization"
                  maxLength={150}
                  disabled={submitting}
                  aria-invalid={Boolean(errors.businessName)}
                  aria-describedby={
                    errors.businessName
                      ? 'businessName-error'
                      : undefined
                  }
                  required
                />
                {errors.businessName && (
                  <p id="businessName-error" className="add-client-error">
                    {errors.businessName}
                  </p>
                )}
              </div>
            </div>
          </section>

          <section className="add-client-card">
            <div className="add-client-card__heading">
              <div className="add-client-section-number">02</div>
              <div>
                <h2>Primary contact</h2>
                <p>
                  Contact information for the person responsible for this
                  client account.
                </p>
              </div>
            </div>

            <div className="add-client-grid add-client-grid--3">
              <div className="add-client-field">
                <label htmlFor="contactName">Contact name</label>
                <input
                  id="contactName"
                  name="contactName"
                  type="text"
                  value={form.contactName}
                  onChange={handleChange}
                  placeholder="Arun Kumar"
                  autoComplete="name"
                  maxLength={150}
                  disabled={submitting}
                  aria-invalid={Boolean(errors.contactName)}
                />
                {errors.contactName && (
                  <p className="add-client-error">
                    {errors.contactName}
                  </p>
                )}
              </div>

              <div className="add-client-field">
                <label htmlFor="contactEmail">Contact email</label>
                <input
                  id="contactEmail"
                  name="contactEmail"
                  type="email"
                  value={form.contactEmail}
                  onChange={handleChange}
                  placeholder="admin@example.com"
                  autoComplete="email"
                  maxLength={255}
                  disabled={submitting}
                  aria-invalid={Boolean(errors.contactEmail)}
                />
                {errors.contactEmail && (
                  <p className="add-client-error">
                    {errors.contactEmail}
                  </p>
                )}
              </div>

              <div className="add-client-field">
                <label htmlFor="contactPhone">Contact phone</label>
                <input
                  id="contactPhone"
                  name="contactPhone"
                  type="tel"
                  value={form.contactPhone}
                  onChange={handleChange}
                  placeholder="+91 98765 43210"
                  autoComplete="tel"
                  maxLength={30}
                  disabled={submitting}
                  aria-invalid={Boolean(errors.contactPhone)}
                />
                {errors.contactPhone && (
                  <p className="add-client-error">
                    {errors.contactPhone}
                  </p>
                )}
              </div>
            </div>
          </section>

          <section className="add-client-card">
            <div className="add-client-card__heading">
              <div className="add-client-section-number">03</div>
              <div>
                <h2>Regional preferences</h2>
                <p>
                  Defaults used when preparing and scheduling client content.
                </p>
              </div>
            </div>

            <div className="add-client-grid add-client-grid--2">
              <div className="add-client-field">
                <label htmlFor="timezone">Timezone</label>
                <select
                  id="timezone"
                  name="timezone"
                  value={form.timezone}
                  onChange={handleChange}
                  disabled={submitting}
                >
                  {TIMEZONES.map((timezone) => (
                    <option key={timezone} value={timezone}>
                      {timezone}
                    </option>
                  ))}
                </select>
              </div>

              <div className="add-client-field">
                <label htmlFor="defaultLanguage">Default language</label>
                <select
                  id="defaultLanguage"
                  name="defaultLanguage"
                  value={form.defaultLanguage}
                  onChange={handleChange}
                  disabled={submitting}
                >
                  {LANGUAGES.map((language) => (
                    <option key={language.value} value={language.value}>
                      {language.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <section className="add-client-card">
            <div className="add-client-card__heading add-client-card__heading--platforms">
              <div className="add-client-section-number">04</div>
              <div>
                <h2>Publishing platforms</h2>
                <p>
                  Select the channels this client has approved. Only these
                  platforms should appear in the Social Connections workspace.
                </p>
              </div>
              <span className="add-client-count-pill">
                {form.socialPlatforms.length} selected
              </span>
            </div>

            <div
              className="add-client-platform-grid"
              role="group"
              aria-label="Client social platforms"
            >
              {SOCIAL_PLATFORMS.map((platform) => {
                const selected = form.socialPlatforms.includes(
                  platform.value
                );

                return (
                  <label
                    key={platform.value}
                    className={`add-client-platform${
                      selected ? ' is-selected' : ''
                    }`}
                  >
                    <input
                      name="socialPlatforms"
                      type="checkbox"
                      value={platform.value}
                      checked={selected}
                      onChange={() =>
                        handlePlatformChange(platform.value)
                      }
                      disabled={submitting}
                    />

                    <span
                      className={`add-client-platform__icon add-client-platform__icon--${platform.value}`}
                      aria-hidden="true"
                    >
                      {platform.icon}
                    </span>

                    <span className="add-client-platform__content">
                      <strong>{platform.label}</strong>
                      <small>{platform.description}</small>
                      <span
                        className={`add-client-platform__availability${
                          platform.connectionReady ? ' is-ready' : ''
                        }`}
                      >
                        {platform.connectionReady
                          ? 'Connection available'
                          : 'Publishing roadmap'}
                      </span>
                    </span>

                    <span
                      className="add-client-platform__check"
                      aria-hidden="true"
                    >
                      ✓
                    </span>
                  </label>
                );
              })}
            </div>

            {errors.platforms && (
              <p className="add-client-error add-client-error--platforms" role="alert">
                {errors.platforms}
              </p>
            )}

            <div className="add-client-platform-note">
              <span aria-hidden="true">i</span>
              <p>
                Facebook and Instagram connection flows are available now.
                Other platforms can still be assigned to the client and enabled
                as their integrations are completed.
              </p>
            </div>
          </section>
        </div>

        <aside className="add-client-sidebar">
          <section className="add-client-summary-card">
            <p className="add-client-summary-card__eyebrow">Setup summary</p>
            <h2>
              {form.businessName.trim() || 'New client'}
            </h2>
            <p className="add-client-summary-card__code">
              {form.clientCode.trim() || 'Client code pending'}
            </p>

            <div className="add-client-summary-list">
              <div>
                <span>Timezone</span>
                <strong>{form.timezone}</strong>
              </div>
              <div>
                <span>Language</span>
                <strong>
                  {LANGUAGES.find(
                    (item) => item.value === form.defaultLanguage
                  )?.label || form.defaultLanguage}
                </strong>
              </div>
              <div>
                <span>Platforms</span>
                <strong>{selectedPlatforms.length}</strong>
              </div>
            </div>

            <div className="add-client-summary-platforms">
              {selectedPlatforms.length ? (
                selectedPlatforms.map((platform) => (
                  <span key={platform.value}>
                    {platform.label}
                  </span>
                ))
              ) : (
                <p>No publishing platforms selected yet.</p>
              )}
            </div>
          </section>

          {/* <section className="add-client-next-card">
            <span className="add-client-next-card__icon" aria-hidden="true">
              ↗
            </span>
            <div>
              <strong>What happens next?</strong>
              <p>
                After creation, this client becomes active and you can configure
                Facebook and Instagram from Social Connections.
              </p>
            </div>
          </section> */}
        </aside>

        <footer className="add-client-footer">
          <div>
            <strong>Ready to create this client?</strong>
            <p>
              Required fields and publishing platform selection will be
              validated before saving.
            </p>
          </div>

          <div className="add-client-footer__actions">
            <button
              type="button"
              className="add-client-button add-client-button--secondary"
              onClick={() => navigate('/clients')}
              disabled={submitting}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="add-client-button add-client-button--primary"
              disabled={submitting}
              aria-busy={submitting}
            >
              {submitting ? (
                <>
                  <span className="add-client-spinner" aria-hidden="true" />
                  Creating client…
                </>
              ) : (
                <>
                  <span aria-hidden="true">+</span>
                  Create client
                </>
              )}
            </button>
          </div>
        </footer>
      </form>
    </main>
  );
}
