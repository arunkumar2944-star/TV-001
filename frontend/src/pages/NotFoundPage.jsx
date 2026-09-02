import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { EmptyState } from '../components/States.jsx';

export default function NotFoundPage() {
  useDocumentTitle('Page not found');

  return (
    <div className="card">
      <EmptyState
        icon={'\u{1F9ED}'}
        title="That page does not exist"
        text="The link may be out of date, or the post or job may have been removed."
        action={
          <Link className="btn btn--primary" to="/dashboard">
            Back to the dashboard
          </Link>
        }
      />
    </div>
  );
}
