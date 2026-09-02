'use strict';

/**
 * Media requirements per destination.
 *
 * This is a NEWSROOM policy, not a social-network API. The application does not
 * talk to any platform - n8n does - so these rules exist purely to stop an
 * obviously unpublishable post (a YouTube target with no video) from reaching
 * the automation layer and failing there.
 *
 * Editing this table is the supported way to change the policy.
 */

const { MEDIA_TYPE } = require('./constants');

const IMAGE_TYPES = [
  MEDIA_TYPE.MAIN_IMAGE,
  MEDIA_TYPE.NEWS_POSTER,
  MEDIA_TYPE.AD_POSTER,
  MEDIA_TYPE.IMAGE,
];

const REQUIREMENTS = {
  youtube: {
    anyOf: [MEDIA_TYPE.VIDEO],
    message: 'YouTube needs a video attached to this post',
  },
  instagram: {
    anyOf: [...IMAGE_TYPES, MEDIA_TYPE.VIDEO],
    message: 'Instagram needs at least one image or video attached to this post',
  },
  // Facebook, WhatsApp, Telegram, X and Threads accept a text-only post, so the
  // newsroom does not force media on them.
};

/**
 * @param {Array<{code:string}>} platforms selected destinations
 * @param {Array<{media_type:string}>} media attached media rows
 * @returns {string[]} human readable problems (empty when the post is publishable)
 */
function checkMediaRequirements(platforms, media) {
  const present = new Set((media || []).map((item) => item.media_type));
  const problems = [];

  for (const platform of platforms || []) {
    const rule = REQUIREMENTS[String(platform.code || '').toLowerCase()];
    if (!rule) continue;
    const satisfied = rule.anyOf.some((type) => present.has(type));
    if (!satisfied) problems.push(rule.message);
  }

  return problems;
}

module.exports = { REQUIREMENTS, checkMediaRequirements, IMAGE_TYPES };
