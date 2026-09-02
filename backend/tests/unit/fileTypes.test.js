'use strict';

require('../helpers/env');

const test = require('node:test');
const assert = require('node:assert/strict');

const fileTypes = require('../../src/utils/fileTypes');
const { MEDIA_TYPE } = require('../../src/config/constants');

test('accepts a genuine JPEG for an image role', () => {
  const result = fileTypes.validateDeclaredType(MEDIA_TYPE.MAIN_IMAGE, 'trichy-rally.jpg', 'image/jpeg');
  assert.equal(result.ok, true);
});

test('rejects an executable however it is labelled', () => {
  const result = fileTypes.validateDeclaredType(MEDIA_TYPE.IMAGE, 'payload.exe', 'image/jpeg');
  assert.equal(result.ok, false);
  assert.match(result.reason, /not allowed/i);
});

test('rejects SVG - it can carry script', () => {
  const result = fileTypes.validateDeclaredType(MEDIA_TYPE.IMAGE, 'logo.svg', 'image/svg+xml');
  assert.equal(result.ok, false);
});

test('rejects a video file offered as the main image', () => {
  const result = fileTypes.validateDeclaredType(MEDIA_TYPE.MAIN_IMAGE, 'clip.mp4', 'video/mp4');
  assert.equal(result.ok, false);
});

test('rejects an extension that contradicts the MIME type', () => {
  const result = fileTypes.validateDeclaredType(MEDIA_TYPE.IMAGE, 'photo.png', 'image/jpeg');
  assert.equal(result.ok, false);
  assert.match(result.reason, /does not match/i);
});

test('magic bytes must agree with the declared type', () => {
  const realPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
  assert.equal(fileTypes.verifyMagicBytes('image/png', realPng).ok, true);

  const notAPng = Buffer.from('<?php system($_GET[0]); ?>', 'utf8');
  const check = fileTypes.verifyMagicBytes('image/png', notAPng);
  assert.equal(check.ok, false);
  assert.match(check.reason, /does not look like/i);
});

test('filenames are stripped of path traversal', () => {
  assert.equal(fileTypes.sanitizeFilename('../../../etc/passwd'), 'passwd');
  assert.equal(fileTypes.sanitizeFilename('C:\\Windows\\System32\\cmd.exe'), 'cmd.exe');
  assert.equal(fileTypes.sanitizeFilename('news photo (1).jpg'), 'news_photo_1_.jpg');
  assert.ok(fileTypes.sanitizeFilename('').length > 0);
});

test('video and audio roles accept their own formats only', () => {
  assert.equal(fileTypes.validateDeclaredType(MEDIA_TYPE.VIDEO, 'report.mp4', 'video/mp4').ok, true);
  assert.equal(fileTypes.validateDeclaredType(MEDIA_TYPE.AUDIO, 'byte.mp3', 'audio/mpeg').ok, true);
  assert.equal(fileTypes.validateDeclaredType(MEDIA_TYPE.AUDIO, 'report.mp4', 'video/mp4').ok, false);
});
