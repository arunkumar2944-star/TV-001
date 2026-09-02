import { Link } from 'react-router-dom';

export function StatCard({ label, value, hint, tone = 'draft', to, state }) {
  const body = (
    <>
      <div className="stat__label">{label}</div>
      <div className="stat__value">{value ?? 0}</div>
      {hint && <div className="stat__hint">{hint}</div>}
    </>
  );

  if (to) {
    return (
      <Link className={`stat stat--${tone}`} to={to} state={state}>
        {body}
      </Link>
    );
  }

  return <div className={`stat stat--${tone}`}>{body}</div>;
}
