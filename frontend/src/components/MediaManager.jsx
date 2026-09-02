import { useRef, useState } from 'react';
import { mediaApi } from '../services/endpoints.js';
import { MEDIA_TYPES } from '../utils/constants.js';
import { useToast } from '../context/ToastContext.jsx';
import { Button } from './Button.jsx';
import { Modal, ConfirmDialog } from './Modal.jsx';
import { MediaTile, MediaViewer } from './MediaPreview.jsx';
import { EmptyState, Alert } from './States.jsx';

/**
 * Reads duration (and dimensions for video) in the browser so the metadata can
 * be stored alongside the file. The API validates whatever is sent; it is a
 * hint, not a trusted value, and it never replaces server-side detection.
 */
function probeMedia(file) {
  return new Promise((resolve) => {
    const isVideo = file.type.startsWith('video/');
    const isAudio = file.type.startsWith('audio/');
    if (!isVideo && !isAudio) {
      resolve({});
      return;
    }

    const element = document.createElement(isVideo ? 'video' : 'audio');
    const url = URL.createObjectURL(file);
    const done = (result) => {
      URL.revokeObjectURL(url);
      resolve(result);
    };

    element.preload = 'metadata';
    element.onloadedmetadata = () => {
      done({
        durationSeconds: Number.isFinite(element.duration) ? element.duration : undefined,
        width: element.videoWidth || undefined,
        height: element.videoHeight || undefined,
      });
    };
    element.onerror = () => done({});
    setTimeout(() => done({}), 6000);
    element.src = url;
  });
}

export function MediaManager({ newsId, media = [], onChange, readOnly = false }) {
  const toast = useToast();
  const inputRef = useRef(null);
  const [activeType, setActiveType] = useState(MEDIA_TYPES[0].value);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  const typeConfig = MEDIA_TYPES.find((type) => type.value === activeType) || MEDIA_TYPES[0];

  async function uploadFiles(fileList) {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    setUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      // mediaType is appended FIRST so the server can validate each file as it
      // streams in, before any byte is written to disk.
      formData.append('mediaType', activeType);

      const probe = await probeMedia(files[0]);
      if (probe.durationSeconds) formData.append('durationSeconds', String(probe.durationSeconds));
      if (probe.width) formData.append('width', String(probe.width));
      if (probe.height) formData.append('height', String(probe.height));

      const selected = typeConfig.multiple ? files : files.slice(0, 1);
      selected.forEach((file) => formData.append('files', file));

      const response = await mediaApi.upload(newsId, formData);
      const uploaded = response.data || [];
      toast.success(
        `${uploaded.length} file${uploaded.length === 1 ? '' : 's'} uploaded`,
        typeConfig.label
      );

      const refreshed = await mediaApi.list(newsId);
      onChange(refreshed.data || []);
    } catch (error) {
      setUploadError(error.message);
      toast.error('Upload failed', error.message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await mediaApi.remove(pendingDelete.id);
      const refreshed = await mediaApi.list(newsId);
      onChange(refreshed.data || []);
      toast.success('File removed', pendingDelete.original_filename);
      setPendingDelete(null);
    } catch (error) {
      toast.error('Could not remove the file', error.message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="stack">
      {!readOnly && (
        <>
          <div className="filters">
            <div className="field field--grow">
              <label className="field__label" htmlFor="tv-media-type">
                Media type
              </label>
              <select
                id="tv-media-type"
                className="select"
                value={activeType}
                onChange={(event) => setActiveType(event.target.value)}
                disabled={uploading}
              >
                {MEDIA_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div
            className={`dropzone${dragging ? ' is-dragging' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => !uploading && inputRef.current && inputRef.current.click()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                if (!uploading && inputRef.current) inputRef.current.click();
              }
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              if (!uploading) uploadFiles(event.dataTransfer.files);
            }}
          >
            <div className="dropzone__title">
              {uploading ? 'Uploading...' : `Add ${typeConfig.label.toLowerCase()}`}
            </div>
            <div className="dropzone__hint">
              Drag files here or click to browse.
              {typeConfig.multiple ? ' Multiple files allowed.' : ' A new file replaces the current one.'}
            </div>
            {uploading && (
              <div className="mt-1">
                <span className="spinner" aria-hidden="true" />
              </div>
            )}
          </div>

          <input
            ref={inputRef}
            type="file"
            accept={typeConfig.accept}
            multiple={typeConfig.multiple}
            className="sr-only"
            onChange={(event) => uploadFiles(event.target.files)}
            disabled={uploading}
          />

          {uploadError && <Alert tone="error">{uploadError}</Alert>}
        </>
      )}

      {media.length === 0 ? (
        <EmptyState
          icon={'\u{1F4C1}'}
          title="No media yet"
          text={
            readOnly
              ? 'This post has no attachments.'
              : 'Upload the main image, posters, advertisement, video or audio for this post.'
          }
        />
      ) : (
        <div className="media-grid">
          {media.map((item) => (
            <MediaTile
              key={item.id}
              item={item}
              readOnly={readOnly}
              onOpen={setPreview}
              onRemove={setPendingDelete}
            />
          ))}
        </div>
      )}

      <Modal open={Boolean(preview)} title={preview ? preview.original_filename : ''} onClose={() => setPreview(null)} wide>
        <MediaViewer item={preview} />
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Remove this file?"
        message={
          pendingDelete
            ? `"${pendingDelete.original_filename}" will be deleted from storage. This cannot be undone.`
            : ''
        }
        confirmLabel="Remove file"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
