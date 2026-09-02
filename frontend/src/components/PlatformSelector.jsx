import { PLATFORM_META } from '../utils/constants.js';

/**
 * Checkbox picker for the seven destinations.
 *
 * The selection is saved as rows in news_platform_targets - the backend
 * resolves these codes to platform ids, so nothing here is a free-text field.
 */
export function PlatformSelector({ platforms = [], selected = [], onChange, disabled = false, error }) {
  const selectedSet = new Set(selected);

  function toggle(code) {
    if (disabled) return;
    const next = new Set(selectedSet);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    onChange([...next]);
  }

  return (
    <div>
      <div className="platform-picker" role="group" aria-label="Social media platforms">
        {platforms.map((platform) => {
          const meta = PLATFORM_META[platform.code] || { name: platform.name, glyph: '•' };
          const isSelected = selectedSet.has(platform.code);
          const isDisabled = disabled || platform.is_active === false;

          return (
            <label
              key={platform.code}
              className={`platform-option${isSelected ? ' is-selected' : ''}${isDisabled ? ' is-disabled' : ''}`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                disabled={isDisabled}
                onChange={() => toggle(platform.code)}
                aria-label={meta.name}
              />
              <span className="platform-option__glyph" aria-hidden="true">
                {meta.glyph}
              </span>
              <span className="platform-option__name">{platform.name || meta.name}</span>
            </label>
          );
        })}
      </div>

      {error && (
        <span className="field__error" role="alert">
          {error}
        </span>
      )}

      {!error && (
        <p className="field__hint mt-1">
          {selected.length === 0
            ? 'Select at least one platform before submitting for approval.'
            : `${selected.length} platform${selected.length === 1 ? '' : 's'} selected. Each one publishes and fails independently.`}
        </p>
      )}
    </div>
  );
}
