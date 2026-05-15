import React, { useState, useEffect, useCallback } from 'react';
import './App.css';
import SearchBar from './components/SearchBar';
import SortDropdown from './components/SortDropdown';
import ResultsList from './components/ResultsList';
import LoadingSpinner from './components/LoadingSpinner';
import ErrorMessage from './components/ErrorMessage';
import BookmarksList from './components/BookmarksList';
import SearchHistory from './components/SearchHistory';
import { searchPapers, getBookmarks, getHealth } from './services/api';

export const APP_NAME = 'InsightScholar';

function App() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('search');
  const [bookmarkedIds, setBookmarkedIds] = useState([]);
  const [resultCount, setResultCount] = useState(0);
  const [sortBy, setSortBy] = useState('relevance');
  const [lastSearchParams, setLastSearchParams] = useState(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [liveSourceAvailable, setLiveSourceAvailable] = useState(false);
  const [liveSourceEnabled, setLiveSourceEnabled] = useState(true);

  useEffect(() => {
    getHealth().then(data => {
      if (data?.live_source_enabled) setLiveSourceAvailable(true);
    });
  }, []);

  const loadBookmarkedIds = useCallback(async () => {
    try {
      const bookmarks = await getBookmarks();
      setBookmarkedIds(bookmarks.map(b => b.paper_id));
    } catch (err) {
      // Silently fail - bookmarks are optional
    }
  }, []);

  useEffect(() => {
    loadBookmarkedIds();
  }, [loadBookmarkedIds]);

  const handleSearch = async (query, filters, model = 'specter', rankingMethod = 'hybrid', fieldsOfStudy = null, requestedTopK = 48, overrideSortBy = null) => {
    const currentSort = overrideSortBy || sortBy;
    setActiveTab('search');
    setLoading(true);
    setError(null);
    setSearchQuery(query);
    setLastSearchParams({ query, filters, model, rankingMethod, fieldsOfStudy, topK: requestedTopK });

    try {
      const data = await searchPapers(query, requestedTopK, filters, model, rankingMethod, currentSort, fieldsOfStudy, liveSourceEnabled);
      setResults(data.results);
      setResultCount(data.results.length);
      setHistoryVersion((current) => current + 1);
    } catch (err) {
      setError(err.message || 'An error occurred while searching');
      setResults([]);
      setResultCount(0);
    } finally {
      setLoading(false);
    }
  };

  const handleSortChange = (newSort) => {
    setSortBy(newSort);
    if (lastSearchParams) {
      const { query, filters, model, rankingMethod, fieldsOfStudy, topK } = lastSearchParams;
      handleSearch(query, filters, model, rankingMethod, fieldsOfStudy, topK, newSort);
    }
  };

  const tabs = [
    { id: 'search', label: 'Discover', icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    )},
    { id: 'bookmarks', label: 'Bookmarks', icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
      </svg>
    )},
    { id: 'history', label: 'Recent', icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )},
  ];

  return (
    <div className="App min-h-screen bg-surface-50 flex flex-col">
      {/* Navigation Bar */}
      <nav className="sticky top-0 z-50 glass-panel shadow-glass">
        <div className="w-full mx-auto px-4 sm:px-6 lg:px-10">
          <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 py-3 sm:gap-4 sm:py-0">
            {/* Brand - clickable to go home */}
            <button
              onClick={() => { setActiveTab('search'); setSearchQuery(''); setResults([]); setError(null); setResultCount(0); setSortBy('relevance'); setLastSearchParams(null); }}
              className="flex items-center cursor-pointer"
            >
              <h1 className="text-xl font-brand tracking-tight">
                <span className="text-surface-900">Insight</span><span className="text-gradient">Scholar</span>
              </h1>
            </button>

            {/* Tab Navigation */}
            <div className="order-3 flex w-full items-center justify-center rounded-full bg-surface-100 p-1 sm:order-none sm:w-auto">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
                    activeTab === tab.id
                      ? 'bg-white text-scholar-800 shadow-sm'
                      : 'text-surface-500 hover:text-surface-700'
                  }`}
                >
                  {tab.icon}
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Live Source Toggle */}
            {liveSourceAvailable && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-surface-500 hidden sm:inline select-none">Live</span>
                <button
                  onClick={() => setLiveSourceEnabled(v => !v)}
                  title={liveSourceEnabled ? 'Live source: ON — click to disable' : 'Live source: OFF — click to enable'}
                  className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${liveSourceEnabled ? 'bg-green-500' : 'bg-surface-300'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${liveSourceEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </div>
            )}

          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 w-full mx-auto px-4 sm:px-6 lg:px-10">

        {/* Search Tab */}
        {activeTab === 'search' && (
          <>
            {/* Hero Section - Presentation blue gradient */}
            {!searchQuery && !loading && (
              <div className="hero-bg -mx-4 sm:-mx-6 lg:-mx-10 mb-4 flex items-center justify-center rounded-b-[28px] px-4 sm:px-6 lg:px-10 sm:rounded-b-3xl" style={{ background: 'linear-gradient(135deg, #2b3fd4 0%, #3b5bdb 35%, #5c7cfa 70%, #748ffc 100%)', minHeight: 'calc(100vh - 4rem)' }}>
                <div className="relative mx-auto w-full max-w-4xl py-12 text-center sm:py-16">
                  <h2 className="text-4xl sm:text-5xl lg:text-6xl font-brand text-white mb-4 tracking-tight drop-shadow-lg">
                    {APP_NAME}
                  </h2>
                  <p className="text-blue-100 text-lg lg:text-xl max-w-2xl mx-auto mb-10">
                    An Explainable Research Paper Recommendation System Using Transformers
                  </p>
                  {/* Search Bar inside hero */}
                  <div className="mx-auto max-w-3xl px-0 sm:px-4">
                    <SearchBar onSearch={handleSearch} disabled={loading} />
                  </div>
                </div>
              </div>
            )}

            {/* Search Bar (when results shown) */}
            {(searchQuery || loading) && (
              <div className="pb-3 pt-5 sm:pb-4 sm:pt-6">
                <SearchBar onSearch={handleSearch} disabled={loading} initialQuery={searchQuery} />
              </div>
            )}

            {/* Loading State */}
            {loading && (
              <LoadingSpinner message="Finding relevant papers..." />
            )}

            {/* Error State */}
            {error && (
              <ErrorMessage message={error} onDismiss={() => setError(null)} />
            )}

            {/* Results */}
            {!loading && !error && results.length > 0 && (
              <div className="animate-fade-in">
                <div className="mb-4 flex flex-col gap-3 sm:mb-5 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-surface-900">
                      Results for <span className="text-scholar-700">"{searchQuery}"</span>
                    </h2>
                    <p className="mt-1 text-sm text-surface-400">
                      {resultCount} {resultCount === 1 ? 'result' : 'results'}
                    </p>
                  </div>
                  <SortDropdown value={sortBy} onChange={handleSortChange} />
                </div>
                <ResultsList
                  results={results}
                  query={searchQuery}
                  bookmarkedIds={bookmarkedIds}
                  onBookmarkChange={loadBookmarkedIds}
                />
              </div>
            )}

            {/* No Results */}
            {!loading && !error && searchQuery && results.length === 0 && (
              <div className="text-center py-16 animate-fade-in">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-surface-100 flex items-center justify-center">
                  <svg className="w-8 h-8 text-surface-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-surface-700 text-lg font-medium">
                  No Relevant Results Found
                </p>
                <p className="text-surface-400 mt-1.5 text-sm">
                  Try adjusting your keywords or broadening your search terms
                </p>
              </div>
            )}

          </>
        )}

        {/* Bookmarks Tab */}
        {activeTab === 'bookmarks' && (
          <div className="py-6">
            <BookmarksList />
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="py-6">
            <SearchHistory refreshKey={historyVersion} onRerunSearch={(query) => handleSearch(query, {})} />
          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-surface-200 bg-white/80">
        <div className="w-full mx-auto px-4 sm:px-6 lg:px-10 py-6">
          <p className="text-xs text-surface-500 font-brand">
            {APP_NAME}
          </p>
        </div>
      </footer>

    </div>
  );
}

export default App;


