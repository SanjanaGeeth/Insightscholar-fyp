import React, { useState, useEffect } from 'react';
import { getBookmarks, removeBookmark, getPaper } from '../services/api';

function BookmarksList() {
  const [bookmarks, setBookmarks] = useState([]);
  const [paperDetails, setPaperDetails] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBookmarks();
  }, []);

  const loadBookmarks = async () => {
    setLoading(true);
    try {
      const data = await getBookmarks();
      setBookmarks(data);

      const details = {};
      for (const bm of data) {
        try {
          const paper = await getPaper(bm.paper_id);
          details[bm.paper_id] = paper;
        } catch (e) {
        }
      }
      setPaperDetails(details);
    } catch (err) {
      console.error('Failed to load bookmarks:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (paperId) => {
    try {
      await removeBookmark(paperId);
      setBookmarks(bookmarks.filter((b) => b.paper_id !== paperId));
    } catch (err) {
      console.error('Failed to remove bookmark:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="animate-spin w-6 h-6 border-2 border-surface-300 border-t-scholar-500 rounded-full mb-3"></div>
        <p className="text-sm text-surface-400">Loading saved papers...</p>
      </div>
    );
  }

  if (bookmarks.length === 0) {
    return (
      <div className="text-center py-16 animate-fade-in">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-amber-50 flex items-center justify-center">
          <svg className="w-8 h-8 text-accent-amber" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
        </div>
        <p className="text-surface-700 font-medium">No saved papers yet</p>
        <p className="text-surface-400 text-sm mt-1">
          Bookmark papers during search to collect them here
        </p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-semibold text-surface-900">Saved Papers</h2>
          <p className="text-sm text-surface-400 mt-0.5">{bookmarks.length} saved papers</p>
        </div>
      </div>

      <div className="space-y-3">
        {bookmarks.map((bookmark) => {
          const paper = paperDetails[bookmark.paper_id];
          return (
            <div key={bookmark.id} className="paper-card bg-white rounded-2xl border border-surface-200 shadow-card hover:shadow-card-hover p-5">
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-surface-900 leading-snug">
                    {paper ? paper.title : bookmark.paper_id}
                  </h3>
                  {paper && (
                    <>
                      <p className="text-sm text-surface-500 mt-1 line-clamp-2">
                        {paper.authors?.join(', ')}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        {paper.year && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-surface-100 text-xs font-medium text-surface-600">
                            {paper.year}
                          </span>
                        )}
                        {paper.venue && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-surface-100 text-xs font-medium text-surface-600 max-w-[200px] truncate">
                            {paper.venue}
                          </span>
                        )}
                        {paper.citations > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface-100 text-xs font-medium text-surface-600">
                            {paper.citations} cited
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-surface-600 mt-2 leading-relaxed">
                        {paper.abstract}
                      </p>
                    </>
                  )}
                  <div className="flex items-center gap-3 mt-3 text-xs text-surface-400">
                    {bookmark.query && (
                      <span>From search: "{bookmark.query}"</span>
                    )}
                    <span>Saved {new Date(bookmark.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-2 flex-shrink-0">
                  {paper?.url && (
                    <a
                      href={paper.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-surface-100 text-surface-600 hover:bg-surface-200 transition"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      Open
                    </a>
                  )}
                  <button
                    onClick={() => handleRemove(bookmark.paper_id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-50 text-accent-coral hover:bg-red-100 transition"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Remove
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default BookmarksList;
