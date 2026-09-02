'use strict';

/**
 * Approval workflow.
 *
 * THE non-negotiable rule of this system lives here:
 *
 *     the creator of a post can never approve that post
 *
 * It is enforced in the database transaction, so hiding the button in React is
 * only a courtesy - a direct API call, a replayed request or a crafted payload
 * hits the same check.
 */

const db = require('../database');
const ApiError = require('../utils/ApiError');
const newsService = require('./newsService');
const platformService = require('./platformService');
const auditService = require('./auditService');
const { checkMediaRequirements } = require('../config/publishRequirements');
const {
  NEWS_STATUS,
  APPROVAL_STATUS,
  AUDIT_STAGE,
  AUDIT_STATUS,
} = require('../config/constants');

const MIN_CONTENT_LENGTH = 40;
const MIN_REJECTION_REASON = 5;

/** Everything a post must have before it may enter the approval queue. */
async function collectSubmissionProblems(news, client) {
  const problems = [];

  if (!news.headline || news.headline.trim().length < 5) {
    problems.push('Headline is required (at least 5 characters)');
  }
  if (!news.content || news.content.trim().length < MIN_CONTENT_LENGTH) {
    problems.push(`Content is required (at least ${MIN_CONTENT_LENGTH} characters)`);
  }
  if (!news.category) {
    problems.push('Category is required');
  }

  const targets = await platformService.getTargets(news.id, client);
  if (targets.length === 0) {
    problems.push('Select at least one social media platform');
  }

  const media = await newsService.getMedia(news.id, client);
  problems.push(...checkMediaRequirements(targets, media));

  return { problems, targets, media };
}

async function findOpenApproval(newsId, client) {
  return db.queryOne(
    `SELECT * FROM news_approvals
      WHERE news_id = $1 AND status = $2
      ORDER BY id DESC LIMIT 1`,
    [newsId, APPROVAL_STATUS.PENDING],
    client
  );
}

/** DRAFT | REJECTED -> PENDING_APPROVAL. n8n is NOT involved at this stage. */
async function submitForApproval(newsId, actor) {
  return db.withTransaction(async (client) => {
    const news = await newsService.lockById(newsId, client);
    if (!news) throw ApiError.notFound('News post not found');

    if (news.status === NEWS_STATUS.PENDING_APPROVAL) {
      throw ApiError.conflict('This post is already waiting for approval');
    }
    if (![NEWS_STATUS.DRAFT, NEWS_STATUS.REJECTED].includes(news.status)) {
      throw ApiError.conflict(`A post with status ${news.status} cannot be submitted for approval`);
    }

    const { problems, targets } = await collectSubmissionProblems(news, client);
    if (problems.length > 0) {
      throw ApiError.badRequest(problems[0], {
        code: 'SUBMISSION_INCOMPLETE',
        details: problems.map((message) => ({ field: 'post', message })),
      });
    }

    const existing = await findOpenApproval(newsId, client);
    const approval = existing
      ? await db.queryOne(
          `UPDATE news_approvals
              SET submitted_by = $2, submitted_at = now(), reviewed_by = NULL,
                  reviewed_at = NULL, rejection_reason = NULL,
                  status = $3, updated_at = now()
            WHERE id = $1
            RETURNING *`,
          [existing.id, actor.id, APPROVAL_STATUS.PENDING],
          client
        )
      : await db.queryOne(
          `INSERT INTO news_approvals (news_id, submitted_by, submitted_at, status)
           VALUES ($1, $2, now(), $3)
           RETURNING *`,
          [newsId, actor.id, APPROVAL_STATUS.PENDING],
          client
        );

    const updated = await newsService.setStatus(newsId, NEWS_STATUS.PENDING_APPROVAL, client);

    await auditService.record(
      {
        newsId,
        actorUserId: actor.id,
        stage: AUDIT_STAGE.SUBMIT_APPROVAL,
        status: AUDIT_STATUS.SUCCESS,
        message: `Submitted for approval by ${actor.full_name}`,
        metadata: { platforms: targets.map((target) => target.code) },
      },
      client
    );

    return { news: updated, approval };
  });
}

/**
 * Posts awaiting a decision.
 * The viewer's own posts are still listed (they may need to see the queue) but
 * carry can_approve=false, and the API refuses the action regardless.
 */
async function listPending({ page = 1, pageSize = 20, viewerId, includeOwn = true, search = null }) {
  const limit = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;

  const where = `
    WHERE n.status = $1
      AND ($2::boolean IS TRUE OR n.created_by <> $3)
      AND ($4::text IS NULL OR n.headline ILIKE $4 OR n.content ILIKE $4)
  `;
  const params = [
    NEWS_STATUS.PENDING_APPROVAL,
    includeOwn,
    viewerId,
    search ? `%${String(search).trim()}%` : null,
  ];

  const [items, countRow] = await Promise.all([
    db.queryAll(
      `SELECT
         n.id, n.headline, n.summary, n.content, n.category, n.district, n.state,
         n.country, n.source, n.status, n.created_at, n.updated_at,
         n.created_by, cu.full_name AS created_by_name,
         a.id AS approval_id, a.submitted_at, a.submitted_by,
         sb.full_name AS submitted_by_name,
         (n.created_by <> $3) AS can_approve,
         COALESCE(targets.platform_codes, ARRAY[]::text[]) AS platform_codes,
         COALESCE(media.media_count, 0) AS media_count
       FROM news n
       LEFT JOIN client_users cu ON cu.user_id = n.created_by
       LEFT JOIN LATERAL (
         SELECT * FROM news_approvals
          WHERE news_id = n.id AND status = 'PENDING'
          ORDER BY id DESC LIMIT 1
       ) a ON TRUE
       LEFT JOIN client_users sb ON sb.user_id = a.submitted_by
       LEFT JOIN LATERAL (
         SELECT array_agg(p.code ORDER BY p.sort_order) AS platform_codes
         FROM news_platform_targets npt
         JOIN social_platforms p ON p.id = npt.platform_id
         WHERE npt.news_id = n.id
       ) targets ON TRUE
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS media_count FROM news_media WHERE news_id = n.id
       ) media ON TRUE
       ${where}
       ORDER BY a.submitted_at ASC NULLS LAST, n.created_at ASC
       LIMIT $5 OFFSET $6`,
      [...params, limit, offset]
    ),
    db.queryOne(`SELECT COUNT(*)::int AS total FROM news n ${where}`, params),
  ]);

  return {
    items,
    pagination: { page: Math.max(Number(page) || 1, 1), pageSize: limit, total: countRow ? countRow.total : 0 },
  };
}

/**
 * Approves a post.
 * Both ADMIN and EDITOR may approve - but never their own post.
 */
async function approve(newsId, actor, note = null) {
  return db.withTransaction(async (client) => {
    const news = await newsService.lockById(newsId, client);
    if (!news) throw ApiError.notFound('News post not found');

    if (news.status !== NEWS_STATUS.PENDING_APPROVAL) {
      throw ApiError.conflict(
        news.status === NEWS_STATUS.APPROVED
          ? 'This post has already been approved'
          : `Only posts awaiting approval can be approved (this one is ${news.status})`
      );
    }

    // ---- creator != approver -------------------------------------------
    if (Number(news.created_by) === Number(actor.id)) {
      await auditService.record(
        {
          newsId,
          actorUserId: actor.id,
          stage: AUDIT_STAGE.APPROVE_POST,
          status: AUDIT_STATUS.FAILED,
          message: 'Blocked: a user cannot approve their own post',
        },
        client
      );
      throw ApiError.forbidden('You cannot approve a post you created. Another editor or an admin must review it.');
    }
    // --------------------------------------------------------------------

    const approval = await findOpenApproval(newsId, client);
    if (!approval) {
      throw ApiError.conflict('No open approval request found for this post');
    }

    const decided = await db.queryOne(
      `UPDATE news_approvals
          SET status = $2, reviewed_by = $3, reviewed_at = now(),
              rejection_reason = NULL, updated_at = now()
        WHERE id = $1
        RETURNING *`,
      [approval.id, APPROVAL_STATUS.APPROVED, actor.id],
      client
    );

    const updated = await newsService.setStatus(newsId, NEWS_STATUS.APPROVED, client, {
      approvedBy: actor.id,
      approvedAt: new Date(),
    });

    await auditService.record(
      {
        newsId,
        actorUserId: actor.id,
        stage: AUDIT_STAGE.APPROVE_POST,
        status: AUDIT_STATUS.SUCCESS,
        message: `Approved by ${actor.full_name}`,
        metadata: { approvalId: decided.id, submittedBy: approval.submitted_by, note },
      },
      client
    );

    return { news: updated, approval: decided };
  });
}

/** Rejects a post. A reason is mandatory and is stored on the approval record. */
async function reject(newsId, actor, reason) {
  const trimmed = String(reason || '').trim();
  if (trimmed.length < MIN_REJECTION_REASON) {
    throw ApiError.badRequest('A rejection reason is required so the author knows what to fix');
  }

  return db.withTransaction(async (client) => {
    const news = await newsService.lockById(newsId, client);
    if (!news) throw ApiError.notFound('News post not found');

    if (news.status !== NEWS_STATUS.PENDING_APPROVAL) {
      throw ApiError.conflict(`Only posts awaiting approval can be rejected (this one is ${news.status})`);
    }
    if (Number(news.created_by) === Number(actor.id)) {
      throw ApiError.forbidden('You cannot review your own post. Another editor or an admin must review it.');
    }

    const approval = await findOpenApproval(newsId, client);
    if (!approval) throw ApiError.conflict('No open approval request found for this post');

    const decided = await db.queryOne(
      `UPDATE news_approvals
          SET status = $2, reviewed_by = $3, reviewed_at = now(),
              rejection_reason = $4, updated_at = now()
        WHERE id = $1
        RETURNING *`,
      [approval.id, APPROVAL_STATUS.REJECTED, actor.id, trimmed],
      client
    );

    const updated = await newsService.setStatus(newsId, NEWS_STATUS.REJECTED, client);

    await auditService.record(
      {
        newsId,
        actorUserId: actor.id,
        stage: AUDIT_STAGE.REJECT_POST,
        status: AUDIT_STATUS.WARNING,
        message: `Rejected by ${actor.full_name}: ${trimmed.slice(0, 200)}`,
        metadata: { approvalId: decided.id, reason: trimmed },
      },
      client
    );

    return { news: updated, approval: decided };
  });
}

/** Full approval trail for one post. */
async function history(newsId) {
  return newsService.getApprovals(newsId);
}

/** Read-only preview of what submit-for-approval would say. */
async function checkReadiness(newsId) {
  const news = await newsService.findById(newsId);
  if (!news) throw ApiError.notFound('News post not found');
  const { problems } = await collectSubmissionProblems(news);
  return { ready: problems.length === 0, problems };
}

module.exports = {
  submitForApproval,
  listPending,
  approve,
  reject,
  history,
  checkReadiness,
  collectSubmissionProblems,
  MIN_CONTENT_LENGTH,
  MIN_REJECTION_REASON,
};
