'use strict';

/**
 * Dependency-free image dimension reader for the formats the newsroom uploads
 * (PNG, JPEG, GIF, WebP). Returns null when the header cannot be understood -
 * dimensions are metadata, never a reason to reject a valid upload.
 */

function fromPng(buffer) {
  if (buffer.length < 24) return null;
  if (buffer.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function fromGif(buffer) {
  if (buffer.length < 10) return null;
  if (buffer.toString('ascii', 0, 3) !== 'GIF') return null;
  return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
}

function fromJpeg(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    // SOF0..SOF15 carry the frame size (skipping DHT/DAC/RST markers).
    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isStartOfFrame) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (segmentLength <= 0) return null;
    offset += 2 + segmentLength;
  }
  return null;
}

function fromWebp(buffer) {
  if (buffer.length < 30) return null;
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') {
    return null;
  }
  const format = buffer.toString('ascii', 12, 16);
  if (format === 'VP8 ') {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }
  if (format === 'VP8L') {
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (format === 'VP8X') {
    const width = 1 + (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16));
    const height = 1 + (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16));
    return { width, height };
  }
  return null;
}

/**
 * @param {Buffer} buffer the first kilobytes of an image file
 * @returns {{width:number, height:number}|null}
 */
function read(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 10) return null;
  const result = fromPng(buffer) || fromGif(buffer) || fromWebp(buffer) || fromJpeg(buffer);
  if (!result) return null;
  if (!Number.isFinite(result.width) || !Number.isFinite(result.height)) return null;
  if (result.width <= 0 || result.height <= 0) return null;
  return result;
}

module.exports = { read, fromPng, fromGif, fromJpeg, fromWebp };
