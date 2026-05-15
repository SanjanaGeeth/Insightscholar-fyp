import React, { useEffect, useMemo, useRef, useState } from 'react';
import PaperCard from './PaperCard';

const PAGE_SIZE = 12;

function ResultsList({ results, query, bookmarkedIds = [], onBookmarkChange }) {
  const [visibleCount, setVisibleCount] = useState(Math.min(PAGE_SIZE, results.length));
  const sentinelRef = useRef(null);

  useEffect(() => {
    setVisibleCount(Math.min(PAGE_SIZE, results.length));
  }, [results]);

  useEffect(() => {
    if (!sentinelRef.current || visibleCount >= results.length) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((previous) => Math.min(previous + PAGE_SIZE, results.length));
        }
      },
      { rootMargin: '240px 0px' },
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [results.length, visibleCount]);

  const visibleResults = useMemo(
    () => results.slice(0, visibleCount),
    [results, visibleCount],
  );

  const hasMore = visibleCount < results.length;

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="space-y-3">
        {visibleResults.map((result) => (
          <PaperCard
            key={result.paper.paper_id}
            result={result}
            query={query}
            bookmarkedIds={bookmarkedIds}
            onBookmarkChange={onBookmarkChange}
          />
        ))}
      </div>

      {hasMore && (
        <div className="flex flex-col items-center gap-3 py-2">
          <div ref={sentinelRef} className="h-2 w-full" />
          <button
            type="button"
            onClick={() => setVisibleCount((previous) => Math.min(previous + PAGE_SIZE, results.length))}
            className="rounded-full border border-surface-200 bg-white px-4 py-2 text-sm font-medium text-surface-700 shadow-card transition hover:border-surface-300 hover:text-surface-900"
          >
            Load {Math.min(PAGE_SIZE, results.length - visibleCount)} more papers
          </button>
        </div>
      )}
    </div>
  );
}

export default ResultsList;
