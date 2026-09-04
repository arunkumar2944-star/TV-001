'use strict';

const {
  config,
} = require('./env');


const youtubeConfig =
  Object.freeze({
    clientId:
      process.env
        .YOUTUBE_CLIENT_ID ||
      config.google
        ?.youtubeClientId ||
      config.google
        ?.clientId ||
      null,

    clientSecret:
      process.env
        .YOUTUBE_CLIENT_SECRET ||
      config.google
        ?.youtubeClientSecret ||
      config.google
        ?.clientSecret ||
      null,

    callbackUrl:
      process.env
        .YOUTUBE_CALLBACK_URI ||
      config.google
        ?.youtubeCallbackUrl ||
      null,

    frontendUrl:
      config.frontendUrl ||
      config.frontendUrls?.[0] ||
      process.env.FRONTEND_URL ||
      'http://localhost:5173',

    authorizationUrl:
      'https://accounts.google.com/o/oauth2/v2/auth',

    tokenUrl:
      'https://oauth2.googleapis.com/token',

    apiUrl:
      'https://www.googleapis.com/youtube/v3',

    scopes:
      Object.freeze([
        'https://www.googleapis.com/auth/youtube.readonly',

        'https://www.googleapis.com/auth/youtube.upload',
      ]),
  });


module.exports = {
  youtubeConfig,
};