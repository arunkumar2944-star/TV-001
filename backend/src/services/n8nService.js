'use strict';

/**
 * n8n integration boundary.
 *
 * This application NEVER calls a social network. It hands n8n a small payload
 * ({ jobId, newsId, platforms, callbackUrl }) and n8n fetches the full content
 * through the authenticated /api/n8n/jobs/:jobId endpoint. Results come back to
 * /api/n8n/publish-result.
 *
 * Outbound requests carry both a shared secret header and an HMAC-SHA256
 * signature of the exact body; inbound requests must present one of the two.
 */

const crypto = require('crypto');
const { config } = require('../config/env');
const logger = require('../utils/logger');

const SECRET_HEADER = 'x-n8n-secret';
const SIGNATURE_HEADER = 'x-trichyvision-signature';

function isConfigured() {
  return Boolean(config.n8n.webhookUrl);
}

function sign(body) {
  if (!config.n8n.webhookSecret) return null;
  return crypto.createHmac('sha256', config.n8n.webhookSecret).update(body, 'utf8').digest('hex');
}

function safeEquals(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length === 0 || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/**
 * Authenticates an inbound n8n request.
 * Accepts either the shared secret header or a valid HMAC signature over the
 * raw request body (so n8n can use whichever is easier to configure).
 */
function verifyInbound(req) {
  if (!config.n8n.webhookSecret) {
    return { ok: false, reason: 'N8N_WEBHOOK_SECRET is not configured on the server' };
  }

  const presentedSecret = req.get(SECRET_HEADER);
  if (presentedSecret && safeEquals(presentedSecret, config.n8n.webhookSecret)) {
    return { ok: true, method: 'secret' };
  }

  const presentedSignature = req.get(SIGNATURE_HEADER);
  if (presentedSignature && req.rawBody) {
    const expected = crypto
      .createHmac('sha256', config.n8n.webhookSecret)
      .update(req.rawBody)
      .digest('hex');
    if (safeEquals(presentedSignature.replace(/^sha256=/i, ''), expected)) {
      return { ok: true, method: 'signature' };
    }
  }

  return { ok: false, reason: 'Missing or invalid n8n credentials' };
}

function apiBaseUrl(req) {
  if (config.n8n.publicApiUrl) return config.n8n.publicApiUrl;
  if (req) return `${req.protocol}://${req.get('host')}`;
  return `http://localhost:${config.port}`;
}

/**
 * The trigger payload. Deliberately small - no content, no media, no secrets.
 * n8n pulls what it needs from contentUrl using the same shared secret.
 */
function buildPayload({ job, news, platforms }, req) {
  const base = apiBaseUrl(req);
  return {
    jobId: job.id,
    newsId: job.news_id,
    jobType: job.job_type,
    attempt: job.attempt_count,
    platforms: platforms.map((platform) => platform.code),
    headline: news ? news.headline : undefined,
    contentUrl: `${base}/api/n8n/jobs/${job.id}`,
    callbackUrl: `${base}/api/n8n/publish-result`,
    triggeredAt: new Date().toISOString(),
  };
}

/**
 * POSTs the trigger to the n8n webhook.
 *
 * @returns {Promise<{delivered:boolean, ambiguous:boolean, status?:number, error?:string}>}
 *  ambiguous=true means the request may or may not have arrived (timeout).
 *  The caller must NOT mark the job failed in that case, or a retry could
 *  publish the same post twice.
 */
async function dispatch(payload) {
  if (!isConfigured()) {
    return { delivered: false, ambiguous: false, error: 'N8N_WEBHOOK_URL is not configured' };
  }

  const body = JSON.stringify(payload);
  const headers = { 'content-type': 'application/json', 'user-agent': 'trichy-vision-api' };
  if (config.n8n.webhookSecret) {
    headers[SECRET_HEADER] = config.n8n.webhookSecret;
    headers[SIGNATURE_HEADER] = sign(body);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.n8n.timeoutMs);

  try {
    const response = await fetch(config.n8n.webhookUrl, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });

    let parsed = null;
    const text = await response.text().catch(() => '');
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { raw: text.slice(0, 500) };
      }
    }

    if (!response.ok) {
      return {
        delivered: false,
        ambiguous: false,
        status: response.status,
        error: `n8n responded ${response.status}`,
        body: parsed,
      };
    }

    return {
      delivered: true,
      ambiguous: false,
      status: response.status,
      executionId: parsed && (parsed.executionId || parsed.execution_id) ? String(parsed.executionId || parsed.execution_id) : null,
      workflowName: parsed && parsed.workflowName ? String(parsed.workflowName) : null,
      body: parsed,
    };
  } catch (error) {
    const timedOut = error.name === 'AbortError' || error.name === 'TimeoutError';
    logger.error('n8n dispatch failed', {
      jobId: payload.jobId,
      timedOut,
      error: error.message,
      cause: error.cause ? String(error.cause.code || error.cause.message) : undefined,
    });
    return {
      delivered: false,
      ambiguous: timedOut,
      error: timedOut ? `n8n did not respond within ${config.n8n.timeoutMs}ms` : error.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  isConfigured,
  sign,
  verifyInbound,
  buildPayload,
  dispatch,
  apiBaseUrl,
  SECRET_HEADER,
  SIGNATURE_HEADER,
};
