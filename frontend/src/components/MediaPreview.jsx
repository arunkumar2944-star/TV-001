import { mediaUrl } from '../services/apiClient.js';
import { MEDIA_TYPE_LABEL } from '../utils/constants.js';
import { formatBytes, formatDuration } from '../utils/format.js';
import { Button } from './Button.jsx';

const GLYPHS = { VIDEO: '\u{1F3AC}', AUDIO: '\u{1F3A7}' };

function isImage(item) {
  return String(item.mime_type || '').startsWith('image/');
}
function isVideo(item) {
  return String(item.mime_type || '').startsWith('video/');
}
function isAudio(item) {
  return String(item.mime_type || '').startsWith('audio/');
}

/** One media tile: thumbnail, name, size and (optionally) a remove button. */
export function MediaTile({ item, onRemove, onOpen, removing = false, readOnly = false }) {
  const url = mediaUrl(item.id);

  return (
    <figure className="media-tile" style={{ margin: 0 }}>
      <button
        type="button"
        className="media-tile__frame"
        onClick={() => onOpen && onOpen(item)}
        aria-label={`Preview ${item.original_filename}`}
        style={{ border: 'none', padding: 0, cursor: onOpen ? 'zoom-in' : 'default', width: '100%' }}
      >
        {isImage(item) && <img src={url} alt={item.original_filename} loading="lazy" />}
        {isVideo(item) && <video src={url} preload="metadata" muted />}
        {!isImage(item) && !isVideo(item) && (
          <span className="media-tile__glyph" aria-hidden="true">
            {GLYPHS[item.media_type] || '\u{1F4C4}'}
          </span>
        )}
      </button>

      <figcaption className="media-tile__info">
        <div className="media-tile__name" title={item.original_filename}>
          {item.original_filename}
        </div>
        <div className="media-tile__meta">
          <span>{MEDIA_TYPE_LABEL[item.media_type] || item.media_type}</span>
          <span>{formatBytes(item.file_size)}</span>
        </div>
        {(item.width || item.duration_seconds) && (
          <div className="media-tile__meta">
            {item.width ? (
              <span>
                {item.width}
                {'×'}
                {item.height}
              </span>
            ) : (
              <span />
            )}
            {item.duration_seconds ? <span>{formatDuration(item.duration_seconds)}</span> : <span />}
          </div>
        )}
      </figcaption>

      {isAudio(item) && (
        <div style={{ padding: '0 0.5rem 0.4rem' }}>
            <audio src={url} controls preload="none" />
        </div>
      )}

      <div className="media-tile__foot">
        <a className="small" href={mediaUrl(item.id, { download: true })} target="_blank" rel="noreferrer">
          Download
        </a>
        {!readOnly && onRemove && (
          <Button size="sm" variant="ghost" onClick={() => onRemove(item)} loading={removing}>
            Remove
          </Button>
        )}
      </div>
    </figure>
  );
}

/** Full-size viewer used inside a modal. */
export function MediaViewer({ item }) {
  if (!item) return null;
  const url = mediaUrl(item.id);

  return (
    <div className="media-viewer">
      {isImage(item) && <img src={url} alt={item.original_filename} />}
      {isVideo(item) && (
        <video src={url} controls preload="metadata" style={{ width: '100%' }} />
      )}
      {isAudio(item) && (
        <audio src={url} controls style={{ width: '100%' }} />
      )}
      <div className="small muted mt-2">
        {item.original_filename} - {formatBytes(item.file_size)} - {item.mime_type}
      </div>
    </div>
  );
}
