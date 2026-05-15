import React, { useState, useEffect } from 'react';
import { getSearchHistory, clearSearchHistory, deleteSearchHistoryEntry } from '../services/api';

function SearchHistory({ refreshKey = 0, onRerunSearch }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, [refreshKey]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const data = await getSearchHistory(50);
      setHistory(data);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    try {
      await clearSearchHistory();
      setHistory([]);
    } catch (err) {
      console.error('Failed to clear history:', err);
    }
  };

  const handleDeleteEntry = async (e, id) => {
    e.stopPropagation();
    try {
      await deleteSearchHistoryEntry(id);
      setHistory((prev) => prev.filter((entry) => entry.id !== id));
    } catch (err) {
      console.error('Failed to delete history entry:', err);
    }
  };

  const formatSearchedDate = (dateStr) => {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="animate-spin w-6 h-6 border-2 border-surface-300 border-t-scholar-500 rounded-full mb-3"></div>
        <p className="text-sm text-surface-400">Loading recent searches...</p>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="text-center py-16 animate-fade-in">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-scholar-50 flex items-center justify-center">
          <svg className="w-8 h-8 text-scholar-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-surface-700 font-medium">No recent searches</p>
        <p className="text-surface-400 text-sm mt-1">
          Recent searches will appear here after you run a search
        </p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-semibold text-surface-900">Recent Searches</h2>
          <p className="text-sm text-surface-400 mt-0.5">{history.length} queries</p>
        </div>
        <button
          onClick={handleClear}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-50 text-accent-coral hover:bg-red-100 transition"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Clear All
        </button>
      </div>

      <div className="space-y-2">
        {history.map((entry) => (
          <div
            key={entry.id}
            className="group bg-white rounded-xl border border-surface-200 p-4 hover:shadow-card hover:border-scholar-200 transition-all duration-200 cursor-pointer flex items-center gap-4"
            onClick={() => onRerunSearch && onRerunSearch(entry.query)}
          >
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-surface-100 group-hover:bg-scholar-50 flex items-center justify-center transition-colors">
              <svg className="w-4 h-4 text-surface-400 group-hover:text-scholar-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-surface-800 group-hover:text-scholar-700 transition-colors">
                {entry.query}
              </p>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs text-surface-400">
                  {entry.result_count} results
                </span>
                <span className="w-1 h-1 rounded-full bg-surface-300"></span>
                <span className="text-xs text-surface-400">
                  {entry.model_used}
                </span>
              </div>
            </div>

            <div className="flex-shrink-0 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <svg className="w-4 h-4 text-scholar-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <button
                onClick={(e) => handleDeleteEntry(e, entry.id)}
                title="Remove this search"
                className="p-1 rounded-md hover:bg-red-50 text-surface-300 hover:text-accent-coral transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {formatSearchedDate(entry.searched_at) && (
              <div className="flex-shrink-0 rounded-full bg-surface-100 px-2.5 py-1 text-[11px] font-medium text-surface-500">
                {formatSearchedDate(entry.searched_at)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default SearchHistory;
