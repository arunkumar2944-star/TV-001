export function getConnectionUiState(
  connection
) {
  if (!connection) {
    return 'NOT_CONNECTED';
  }

  // Client explicitly disconnected this account.
  if (
    connection.clientConnectionActive ===
    false
  ) {
    return 'DISCONNECTED';
  }

  // Backend is the source of truth for
  // whether OAuth authorization is no
  // longer usable.
  if (
    connection.reconnectRequired ===
    true
  ) {
    return 'RECONNECT_REQUIRED';
  }

  const status =
    String(
      connection.connectionStatus ||
      connection.status ||
      ''
    )
      .trim()
      .toUpperCase();

  switch (status) {
    case 'CONNECTED':
      return 'CONNECTED';

    case 'PENDING':
    case 'PENDING_VERIFICATION':
      return 'PENDING';

    case 'RECONNECT_REQUIRED':
      return 'RECONNECT_REQUIRED';

    case 'ERROR':
      return 'ERROR';

    case 'DISCONNECTED':
      return 'DISCONNECTED';

    default:
      return 'NOT_CONNECTED';
  }
}