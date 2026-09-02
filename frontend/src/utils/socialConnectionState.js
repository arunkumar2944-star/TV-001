export function getConnectionUiState(connection) {
  if (!connection) {
    return 'NOT_CONNECTED';
  }

  if (connection.reconnectRequired === true) {
    return 'RECONNECT_REQUIRED';
  }

  if (
    connection.tokenExpiresAt &&
    new Date(connection.tokenExpiresAt) <= new Date()
  ) {
    return 'RECONNECT_REQUIRED';
  }

  switch (String(connection.connectionStatus || '').toUpperCase()) {
    case 'CONNECTED':
      return 'CONNECTED';

    case 'PENDING_VERIFICATION':
      return 'PENDING';

    case 'ERROR':
      return 'ERROR';

    default:
      return 'NOT_CONNECTED';
  }
}