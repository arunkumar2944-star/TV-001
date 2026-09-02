'use strict';

/** Consistent success envelope used by every controller. */
function ok(res, data, extra = {}) {
  return res.json({ success: true, ...extra, data });
}

function created(res, data, extra = {}) {
  return res.status(201).json({ success: true, ...extra, data });
}

function paginated(res, items, pagination, extra = {}) {
  return res.json({ success: true, ...extra, data: items, pagination });
}

function noContent(res) {
  return res.status(204).end();
}

module.exports = { ok, created, paginated, noContent };
