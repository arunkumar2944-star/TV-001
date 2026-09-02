import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  useLocation,
  useNavigate,
} from 'react-router-dom';

import { Button } from '../../components/Button.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { api } from '../../services/apiClient.js';

import './client-list.css';

const DEFAULT_PAGE_SIZE = 25;

const DEFAULT_PAGINATION = {
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  total: 0,
};

export default function ClientsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const [clients, setClients] =
    useState([]);

  const [pagination, setPagination] =
    useState(DEFAULT_PAGINATION);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState('');

  const [search, setSearch] =
    useState('');

  const [
    statusFilter,
    setStatusFilter,
  ] = useState('ALL');

  const [sortBy, setSortBy] =
    useState('NEWEST');

  const [clientSelection, setClientSelection] =
    useState({
      clientId: null,
      target: null,
    });

  const loadClients = useCallback(
    async ({
      page = 1,
      pageSize = DEFAULT_PAGE_SIZE,
      signal,
    } = {}) => {
      setLoading(true);
      setError('');

      try {
        const data =
          await api.get(
            '/clients',
            {
              params: {
                page,
                pageSize,
              },
              signal,
            }
          );

        /*
         * Expected API:
         *
         * {
         *   success: true,
         *   data: {
         *     items: [],
         *     pagination: {
         *       page: 1,
         *       pageSize: 25,
         *       total: 7
         *     }
         *   }
         * }
         */

        const items =
          data?.data?.items;

        const apiPagination =
          data?.data?.pagination;

        if (!Array.isArray(items)) {
          console.error(
            'Unexpected clients response:',
            data
          );

          throw new Error(
            'The server returned an invalid client list.'
          );
        }

        setClients(items);

        setPagination({
          page:
            Number(
              apiPagination?.page
            ) || page,

          pageSize:
            Number(
              apiPagination?.pageSize
            ) || pageSize,

          total:
            Number(
              apiPagination?.total
            ) || 0,
        });
      } catch (err) {
        if (
          err?.name === 'AbortError'
        ) {
          return;
        }

        console.error(
          'Load clients failed:',
          err
        );

        setClients([]);

        setError(
          err instanceof Error
            ? err.message
            : 'Unable to load clients.'
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

    const timerId =
      window.setTimeout(
        () => {
          loadClients({
            page: 1,
            pageSize:
              DEFAULT_PAGE_SIZE,
            signal:
              controller.signal,
          });
        },
        0
      );

    return () => {
      window.clearTimeout(
        timerId
      );
      controller.abort();
    };
  }, [loadClients]);

  useEffect(() => {
    const successMessage =
      location.state
        ?.successMessage;

    if (!successMessage) {
      return;
    }

    toast.success(
      'Success',
      successMessage
    );

    navigate(
      location.pathname,
      {
        replace: true,
        state: {},
      }
    );
  }, [
    location.pathname,
    location.state,
    navigate,
    toast,
  ]);

  const filteredClients =
    useMemo(() => {
      const normalizedSearch =
        search
          .trim()
          .toLowerCase();

      let result =
        [...clients];

      if (normalizedSearch) {
        result =
          result.filter(
            (client) => {
              const searchable =
                [
                  client.business_name,
                  client.client_code,
                  client.contact_name,
                  client.contact_email,
                  client.contact_phone,
                ]
                  .filter(Boolean)
                  .join(' ')
                  .toLowerCase();

              return searchable.includes(
                normalizedSearch
              );
            }
          );
      }

      if (
        statusFilter !== 'ALL'
      ) {
        result =
          result.filter(
            (client) =>
              getClientStatus(
                client
              ) ===
              statusFilter
          );
      }

      result.sort(
        createClientSorter(
          sortBy
        )
      );

      return result;
    }, [
      clients,
      search,
      statusFilter,
      sortBy,
    ]);

  const activeOnPage =
    clients.filter(
      (client) =>
        client.is_active === true
    ).length;

  const inactiveOnPage =
    clients.length -
    activeOnPage;

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        pagination.total /
          pagination.pageSize
      )
    );

  function handleRefresh() {
    loadClients({
      page:
        pagination.page,

      pageSize:
        pagination.pageSize,
    });
  }

  function handlePreviousPage() {
    if (
      pagination.page <= 1
    ) {
      return;
    }

    loadClients({
      page:
        pagination.page - 1,

      pageSize:
        pagination.pageSize,
    });
  }

  function handleNextPage() {
    if (
      pagination.page >=
      totalPages
    ) {
      return;
    }

    loadClients({
      page:
        pagination.page + 1,

      pageSize:
        pagination.pageSize,
    });
  }

  async function selectClientAndNavigate(
    clientId,
    destination,
    target
  ) {
    const numericClientId =
      Number(clientId);

    if (
      !Number.isInteger(
        numericClientId
      ) ||
      numericClientId <= 0
    ) {
      toast.error(
        'Unable to open client',
        'The selected client is invalid.'
      );
      return;
    }

    if (
      clientSelection.clientId !==
      null
    ) {
      return;
    }

    setClientSelection({
      clientId: numericClientId,
      target,
    });

    try {
      /*
       * The client ID is sent only in the POST body.
       * The backend stores it in req.session.activeClientId.
       * It is never placed in the browser URL.
       */
      await api.post(
        '/auth/active-client',
        {
          clientId:
            numericClientId,
        }
      );

      const selectedClient = clients.find(
        (item) => Number(item.client_id) === numericClientId
      );
      if (selectedClient?.business_name) {
        sessionStorage.setItem(
          'clientName',
          selectedClient.business_name
        );
      }

      navigate(destination);
    } catch (err) {
      console.error(
        'Select active client failed:',
        err
      );

      toast.error(
        'Unable to open client',
        err instanceof Error
          ? err.message
          : 'Unable to select this client.'
      );
    } finally {
      setClientSelection({
        clientId: null,
        target: null,
      });
    }
  }

  function handleViewClient(
    clientId
  ) {
    return selectClientAndNavigate(
      clientId,
      '/client',
      'view'
    );
  }

  function handleUsers(
    clientId
  ) {
    return selectClientAndNavigate(
      clientId,
      '/client/users',
      'users'
    );
  }

  function handleSocialConnections(
    clientId
  ) {
    return selectClientAndNavigate(
      clientId,
      '/client/social-connections',
      'connections'
    );
  }

  return (
    <main className="clients-page">

      <ClientsHeader
        onAddClient={() =>
          navigate('/clients/new')
        }
      />

      <section
        className="clients-summary"
        aria-label="Client summary"
      >
        <SummaryCard
          label="Total Clients"
          value={
            pagination.total
          }
          description=
            "Registered organizations"
        />

        <SummaryCard
          label="Visible"
          value={
            filteredClients.length
          }
          description=
            "Current search results"
        />

        <SummaryCard
          label="Active"
          value={
            activeOnPage
          }
          description=
            "Active on this page"
        />

        <SummaryCard
          label="Inactive"
          value={
            inactiveOnPage
          }
          description=
            "Inactive on this page"
        />
      </section>

      <section className="clients-panel">

        <ClientsToolbar
          search={search}
          onSearchChange={
            setSearch
          }
          statusFilter={
            statusFilter
          }
          onStatusFilterChange={
            setStatusFilter
          }
          sortBy={sortBy}
          onSortChange={
            setSortBy
          }
          loading={loading}
          onRefresh={
            handleRefresh
          }
        />

        {loading && (
          <ClientsLoading />
        )}

        {!loading &&
          error && (
            <ClientsError
              message={error}
              onRetry={
                handleRefresh
              }
            />
          )}

        {!loading &&
          !error &&
          filteredClients.length ===
            0 && (
            <EmptyClients
              hasFilters={
                Boolean(
                  search.trim()
                ) ||
                statusFilter !==
                  'ALL'
              }
              onCreate={() =>
                navigate(
                  '/clients/new'
                )
              }
            />
          )}

        {!loading &&
          !error &&
          filteredClients.length >
            0 && (
            <>
              <ClientsTable
                clients={
                  filteredClients
                }
                onView={
                  handleViewClient
                }
                onUsers={
                  handleUsers
                }
                onSocialConnections={
                  handleSocialConnections
                }
                clientSelection={
                  clientSelection
                }
              />

              <ClientsPagination
                visibleCount={
                  filteredClients.length
                }
                pagination={
                  pagination
                }
                totalPages={
                  totalPages
                }
                onPrevious={
                  handlePreviousPage
                }
                onNext={
                  handleNextPage
                }
              />
            </>
          )}

      </section>

    </main>
  );
}

function ClientsHeader({
  onAddClient,
}) {
  return (
    <header className="clients-header">

      <div>
        <p className="clients-header__eyebrow">
          Platform Administration
        </p>

        <h1>
          Clients
        </h1>

        <p className="clients-header__description">
          Manage organizations,
          client users and social
          publishing connections.
        </p>
      </div>

      <Button
        onClick={onAddClient}
      >
        + Add Client
      </Button>

    </header>
  );
}

function ClientsToolbar({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  sortBy,
  onSortChange,
  loading,
  onRefresh,
}) {
  return (
    <div className="clients-toolbar">

      <div className="clients-search">

        <label
          htmlFor="clientSearch"
          className="sr-only"
        >
          Search clients
        </label>

        <input
          id="clientSearch"
          type="search"
          value={search}
          onChange={(event) =>
            onSearchChange(
              event.target.value
            )
          }
          placeholder="Search clients, codes, contacts or email..."
        />

      </div>

      <div className="clients-toolbar__controls">

        <div className="clients-filter">
          <label
            htmlFor="statusFilter"
          >
            Status
          </label>

          <select
            id="statusFilter"
            value={statusFilter}
            onChange={(event) =>
              onStatusFilterChange(
                event.target.value
              )
            }
          >
            <option value="ALL">
              All
            </option>

            <option value="ACTIVE">
              Active
            </option>

            <option value="INACTIVE">
              Inactive
            </option>

            <option value="SUSPENDED">
              Suspended
            </option>
          </select>
        </div>

        <div className="clients-filter">
          <label htmlFor="sortBy">
            Sort
          </label>

          <select
            id="sortBy"
            value={sortBy}
            onChange={(event) =>
              onSortChange(
                event.target.value
              )
            }
          >
            <option value="NEWEST">
              Newest
            </option>

            <option value="OLDEST">
              Oldest
            </option>

            <option value="NAME_ASC">
              Name A-Z
            </option>

            <option value="NAME_DESC">
              Name Z-A
            </option>
          </select>
        </div>

        <Button
          variant="ghost"
          disabled={loading}
          onClick={onRefresh}
        >
          {loading
            ? 'Refreshing...'
            : 'Refresh'}
        </Button>

      </div>

    </div>
  );
}

function ClientsTable({
  clients,
  onView,
  onUsers,
  onSocialConnections,
  clientSelection,
}) {
  return (
    <div className="clients-table-wrapper">

      <table className="clients-table">

        <thead>
          <tr>
            <th>Client</th>

            <th>
              Primary Contact
            </th>

            <th>
              Region
            </th>

            <th>Status</th>

            <th>Created</th>

            <th className="text-right">
              Actions
            </th>
          </tr>
        </thead>

        <tbody>
          {clients.map(
            (client) => (
              <ClientRow
                key={
                  client.client_id
                }
                client={client}
                onView={onView}
                onUsers={onUsers}
                onSocialConnections={
                  onSocialConnections
                }
                clientSelection={
                  clientSelection
                }
              />
            )
          )}
        </tbody>

      </table>

    </div>
  );
}

function ClientRow({
  client,
  onView,
  onUsers,
  onSocialConnections,
  clientSelection,
}) {
  const status =
    getClientStatus(client);

  const clientId =
    Number(client.client_id);

  const anyClientOpening =
    clientSelection?.clientId !==
    null;

  const thisClientOpening =
    clientSelection?.clientId ===
    clientId;

  return (
    <tr>

      <td>
        <div className="client-identity">

          <div
            className="client-avatar"
            aria-hidden="true"
          >
            {getInitials(
              client.business_name
            )}
          </div>

          <div className="client-identity__info">

            <button
              type="button"
              className="client-name-button"
              onClick={() =>
                onView(
                  client.client_id
                )
              }
              disabled={
                anyClientOpening
              }
              aria-busy={
                thisClientOpening &&
                clientSelection?.target ===
                  'view'
                  ? true
                  : undefined
              }
            >
              {
                client.business_name
              }
            </button>

            <span>
              {
                client.client_code
              }
            </span>

          </div>

        </div>
      </td>

      <td>
        <div className="client-contact">

          <strong>
            {
              client.contact_name ||
              'Not provided'
            }
          </strong>

          {client.contact_email && (
            <a
              href={`mailto:${client.contact_email}`}
            >
              {
                client.contact_email
              }
            </a>
          )}

          {client.contact_phone && (
            <span>
              {
                client.contact_phone
              }
            </span>
          )}

        </div>
      </td>

      <td>
        <div className="client-region">

          <span>
            {
              client.timezone ||
              '—'
            }
          </span>

          <small>
            {formatLanguage(
              client.default_language
            )}
          </small>

        </div>
      </td>

      <td>
        <ClientStatus
          status={status}
        />
      </td>

      <td>
        <div className="client-created">

          <strong>
            {formatDate(
              client.created_at
            )}
          </strong>

          <span>
            {formatTime(
              client.created_at
            )}
          </span>

        </div>
      </td>

      <td>
        <div className="client-actions">

          <Button
            size="sm"
            variant="ghost"
            loading={
              thisClientOpening &&
              clientSelection?.target ===
                'view'
            }
            disabled={
              anyClientOpening
            }
            onClick={() =>
              onView(
                client.client_id
              )
            }
          >
            View
          </Button>

          <Button
            size="sm"
            variant="ghost"
            loading={
              thisClientOpening &&
              clientSelection?.target ===
                'users'
            }
            disabled={
              anyClientOpening
            }
            onClick={() =>
              onUsers(
                client.client_id
              )
            }
          >
            Users
          </Button>

          <Button
            size="sm"
            variant="ghost"
            loading={
              thisClientOpening &&
              clientSelection?.target ===
                'connections'
            }
            disabled={
              anyClientOpening
            }
            onClick={() =>
              onSocialConnections(
                client.client_id
              )
            }
          >
            Connections
          </Button>

        </div>
      </td>

    </tr>
  );
}

function ClientStatus({
  status,
}) {
  return (
    <span
      className={
        `client-status ` +
        `client-status--${status.toLowerCase()}`
      }
    >
      <span
        className="client-status__dot"
        aria-hidden="true"
      />

      {formatStatus(status)}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  description,
}) {
  return (
    <article className="client-summary-card">

      <span className="client-summary-card__label">
        {label}
      </span>

      <strong>
        {value}
      </strong>

      <span className="client-summary-card__description">
        {description}
      </span>

    </article>
  );
}

function ClientsPagination({
  visibleCount,
  pagination,
  totalPages,
  onPrevious,
  onNext,
}) {
  return (
    <footer className="clients-panel__footer">

      <span>
        Showing{' '}
        <strong>
          {visibleCount}
        </strong>{' '}
        client
        {visibleCount !== 1
          ? 's'
          : ''}
        {' · '}
        Total{' '}
        <strong>
          {pagination.total}
        </strong>
      </span>

      <div className="clients-pagination">

        <Button
          size="sm"
          variant="ghost"
          disabled={
            pagination.page <= 1
          }
          onClick={onPrevious}
        >
          Previous
        </Button>

        <span>
          Page{' '}
          <strong>
            {pagination.page}
          </strong>{' '}
          of{' '}
          <strong>
            {totalPages}
          </strong>
        </span>

        <Button
          size="sm"
          variant="ghost"
          disabled={
            pagination.page >=
            totalPages
          }
          onClick={onNext}
        >
          Next
        </Button>

      </div>

    </footer>
  );
}

function ClientsError({
  message,
  onRetry,
}) {
  return (
    <div
      className="clients-state"
      role="alert"
    >
      <h2>
        Unable to load clients
      </h2>

      <p>
        {message}
      </p>

      <Button
        onClick={onRetry}
      >
        Retry
      </Button>
    </div>
  );
}

function EmptyClients({
  hasFilters,
  onCreate,
}) {
  return (
    <div className="clients-state">

      <h2>
        {hasFilters
          ? 'No matching clients'
          : 'No clients yet'}
      </h2>

      <p>
        {hasFilters
          ? 'Try changing your search or filter criteria.'
          : 'Create your first client organization to begin onboarding.'}
      </p>

      {!hasFilters && (
        <Button
          onClick={onCreate}
        >
          + Add Client
        </Button>
      )}

    </div>
  );
}

function ClientsLoading() {
  return (
    <div
      className="clients-loading"
      aria-label=
        "Loading clients"
    >
      {[1, 2, 3, 4].map(
        (row) => (
          <div
            key={row}
            className="clients-loading__row"
          >
            <span />
            <span />
            <span />
            <span />
          </div>
        )
      )}
    </div>
  );
}

function createClientSorter(
  sortBy
) {
  return (a, b) => {
    if (
      sortBy === 'NAME_ASC'
    ) {
      return String(
        a.business_name || ''
      ).localeCompare(
        String(
          b.business_name || ''
        )
      );
    }

    if (
      sortBy === 'NAME_DESC'
    ) {
      return String(
        b.business_name || ''
      ).localeCompare(
        String(
          a.business_name || ''
        )
      );
    }

    const dateA =
      new Date(
        a.created_at || 0
      ).getTime();

    const dateB =
      new Date(
        b.created_at || 0
      ).getTime();

    if (
      sortBy === 'OLDEST'
    ) {
      return dateA - dateB;
    }

    return dateB - dateA;
  };
}

function getClientStatus(
  client
) {
  if (
    client.status ===
    'SUSPENDED'
  ) {
    return 'SUSPENDED';
  }

  if (
    client.is_active ===
    false
  ) {
    return 'INACTIVE';
  }

  return (
    client.status ||
    'ACTIVE'
  );
}

function getInitials(
  value = ''
) {
  return String(value)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) =>
      word
        .charAt(0)
        .toUpperCase()
    )
    .join('');
}

function formatLanguage(
  language
) {
  const languages = {
    en: 'English',
    ta: 'Tamil',
    hi: 'Hindi',
  };

  return (
    languages[language] ||
    language?.toUpperCase() ||
    '—'
  );
}

function formatStatus(
  status
) {
  return String(
    status || ''
  )
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(
      /\b\w/g,
      (character) =>
        character.toUpperCase()
    );
}

function formatDate(
  value
) {
  if (!value) {
    return '—';
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return '—';
  }

  return new Intl.DateTimeFormat(
    'en-IN',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }
  ).format(date);
}

function formatTime(
  value
) {
  if (!value) {
    return '';
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return '';
  }

  return new Intl.DateTimeFormat(
    'en-IN',
    {
      hour: '2-digit',
      minute: '2-digit',
    }
  ).format(date);
}