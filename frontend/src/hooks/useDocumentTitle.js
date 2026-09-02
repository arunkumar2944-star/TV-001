import { useEffect } from 'react';

export function useDocumentTitle(title) {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} - Trichy Vision` : 'Trichy Vision - Newsroom';
    return () => {
      document.title = previous;
    };
  }, [title]);
}
