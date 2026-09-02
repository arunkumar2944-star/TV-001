import { Button } from './Button.jsx';
import { PAGE_SIZES } from '../utils/constants.js';

export function Pagination({ pagination, onPageChange, onPageSizeChange }) {
  if (!pagination) return null;

  const { page = 1, pageSize = 20, total = 0 } = pagination;
  const totalPages = Math.max(Math.ceil(total / pageSize), 1);
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="pagination">
      <div className="pagination__info">
        {total === 0 ? 'No records' : `Showing ${first}-${last} of ${total}`}
      </div>

      <div className="pagination__controls">
        {onPageSizeChange && (
          <>
            <label className="sr-only" htmlFor="tv-page-size">
              Rows per page
            </label>
            <select
              id="tv-page-size"
              className="select"
              style={{ width: 'auto' }}
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size} / page
                </option>
              ))}
            </select>
          </>
        )}

        <Button size="sm" onClick={() => onPageChange(1)} disabled={page <= 1} aria-label="First page">
          {'«'}
        </Button>
        <Button size="sm" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
          Previous
        </Button>
        <span className="small muted nowrap">
          Page {page} of {totalPages}
        </span>
        <Button size="sm" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
          Next
        </Button>
        <Button
          size="sm"
          onClick={() => onPageChange(totalPages)}
          disabled={page >= totalPages}
          aria-label="Last page"
        >
          {'»'}
        </Button>
      </div>
    </div>
  );
}
