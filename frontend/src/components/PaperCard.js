import React, { useEffect, useMemo, useState } from 'react';
import ExplanationView from './ExplanationView';
import { getExplanation, addBookmark, removeBookmark, searchPapers } from '../services/api';

const METHOD_LABELS = {
  keywords: 'Overview',
  ebm: 'EBM terms',
  anchors: 'Anchors',
};

const SOURCE_MAP = {
  serpapi: 'Google Scholar',
  sample: 'Local Corpus',
  seed: 'Seed Corpus',
};

const GENERIC_LIVE_CATEGORIES = new Set(['computerscience']);

function normalizeMetaValue(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/^source:\s*/, '')
    .replace(/^www\./, '')
    .trim();
}

function pluralize(value, singular, plural = `${singular}s`) {
  return `${value} ${value === 1 ? singular : plural}`;
}

function getSourceLabel(paper) {
  if (paper?.url) {
    try {
      const host = new URL(paper.url).hostname.replace(/^www\./, '');
      if (host.includes('scholar.google')) return 'Google Scholar';
      if (host.includes('semanticscholar')) return 'Semantic Scholar';
      return host;
    } catch (error) {
    }
  }

  const normalizedSource = String(paper?.source || '').toLowerCase();
  return SOURCE_MAP[normalizedSource] || 'Research Source';
}

function getVersionsMeta(paper) {
  const versions = paper?.raw_payload?.inline_links?.versions || {};
  return {
    total: Number(versions.total || 0),
    link: versions.link || versions.serpapi_scholar_link || null,
  };
}

function PaperCard({ result, query, bookmarkedIds = [], onBookmarkChange }) {
  const [showExplanation, setShowExplanation] = useState(false);
  const [explanationMethod, setExplanationMethod] = useState('keywords');
  const [detailedExplanation, setDetailedExplanation] = useState(null);
  const [overviewBundle, setOverviewBundle] = useState(null);
  const [loadingExplanation, setLoadingExplanation] = useState(false);
  const [bookmarkError, setBookmarkError] = useState(null);
  const [explanationError, setExplanationError] = useState(null);
  const [showSimilarPapers, setShowSimilarPapers] = useState(false);
  const [similarResults, setSimilarResults] = useState([]);
  const [loadingSimilarPapers, setLoadingSimilarPapers] = useState(false);
  const [similarPapersError, setSimilarPapersError] = useState(null);
  const { paper, explanation } = result;

  const isBookmarked = bookmarkedIds.includes(paper.paper_id);
  const authors = Array.isArray(paper.authors) && paper.authors.length > 0
    ? paper.authors.join(', ')
    : 'Unknown authors';
  const sourceLabel = getSourceLabel(paper);
  const versionsMeta = useMemo(() => getVersionsMeta(paper), [paper]);
  const categories = useMemo(() => {
    const rawCategories = Array.isArray(paper.categories)
      ? paper.categories.map((category) => String(category || '').trim()).filter(Boolean)
      : [];

    if (String(paper.source || '').toLowerCase() !== 'serpapi') {
      return rawCategories;
    }

    return rawCategories.filter((category) => !GENERIC_LIVE_CATEGORIES.has(normalizeMetaValue(category)));
  }, [paper.categories, paper.source]);
  const abstractText = String(paper.abstract || '').trim() || 'Abstract unavailable.';

  useEffect(() => {
    setExplanationMethod('keywords');
    setDetailedExplanation(null);
    setOverviewBundle(null);
    setLoadingExplanation(false);
    setExplanationError(null);
    setShowExplanation(false);
  }, [paper.paper_id, query]);

  const metadataChips = useMemo(() => {
    const chips = [];
    const normalizedSourceLabel = normalizeMetaValue(sourceLabel);
    const normalizedVenue = normalizeMetaValue(paper.venue);

    if (paper.year) {
      chips.push({ key: 'year', label: String(paper.year), tone: 'solid' });
    }

    chips.push({
      key: 'source',
      label: `Source: ${sourceLabel}`,
      tone: 'surface',
      href: paper.url || null,
    });

    if (paper.venue && normalizedVenue && normalizedVenue !== normalizedSourceLabel) {
      chips.push({ key: 'venue', label: paper.venue, tone: 'surface' });
    }

    if (Number(paper.citations || 0) > 0) {
      chips.push({
        key: 'citations',
        label: pluralize(Number(paper.citations), 'citation'),
        tone: 'surface',
        href: paper.url || null,
      });
    }

    if (versionsMeta.total > 1) {
      chips.push({
        key: 'versions',
        label: pluralize(versionsMeta.total, 'version'),
        tone: 'surface',
        href: versionsMeta.link || paper.url || null,
      });
    }

    return chips;
  }, [paper.citations, paper.url, paper.venue, paper.year, sourceLabel, versionsMeta.link, versionsMeta.total]);

  const currentExplanation = useMemo(() => {
    if (explanationMethod === 'keywords') {
      const ebmExplanation = overviewBundle?.ebm || null;
      return {
        ...explanation,
        feature_importance: ebmExplanation?.feature_importance || explanation.feature_importance,
        feature_highlights: ebmExplanation?.feature_highlights || explanation.feature_highlights,
        overview_bundle: overviewBundle,
      };
    }

    return detailedExplanation || explanation;
  }, [detailedExplanation, explanation, explanationMethod, overviewBundle]);

  const loadOverviewBundle = async () => {
    if (overviewBundle?.ebm && overviewBundle?.anchors) {
      return overviewBundle;
    }

    setLoadingExplanation(true);
    setExplanationError(null);
    try {
      const [ebmResult, anchorResult] = await Promise.allSettled([
        getExplanation(paper.paper_id, query, 'ebm'),
        getExplanation(paper.paper_id, query, 'anchors'),
      ]);

      const nextBundle = {
        ebm: ebmResult.status === 'fulfilled' ? ebmResult.value : null,
        anchors: anchorResult.status === 'fulfilled' ? anchorResult.value : null,
      };

      if (!nextBundle.ebm && !nextBundle.anchors) {
        throw new Error('Overview bundle unavailable');
      }

      setOverviewBundle(nextBundle);
      return nextBundle;
    } catch (error) {
      console.error('Failed to get overview details:', error);
      setExplanationError('XAI details could not be loaded right now.');
      return null;
    } finally {
      setLoadingExplanation(false);
    }
  };

  const handleExplanationMethod = async (method) => {
    setExplanationMethod(method);
    setExplanationError(null);

    if (method === 'keywords') {
      setDetailedExplanation(null);
      await loadOverviewBundle();
      return;
    }

    setLoadingExplanation(true);
    try {
      const data = await getExplanation(paper.paper_id, query, method);
      setDetailedExplanation(data);
    } catch (error) {
      console.error('Failed to get explanation:', error);
      setExplanationError('XAI details could not be loaded right now.');
    } finally {
      setLoadingExplanation(false);
    }
  };

  const handleBookmark = async () => {
    try {
      setBookmarkError(null);
      if (isBookmarked) {
        await removeBookmark(paper.paper_id);
      } else {
        await addBookmark(paper.paper_id, query);
      }
      if (onBookmarkChange) {
        onBookmarkChange();
      }
    } catch (error) {
      console.error('Bookmark error:', error);
      setBookmarkError('Bookmarking failed. Please try again.');
      setTimeout(() => setBookmarkError(null), 3000);
    }
  };

  const handleToggleSimilarPapers = async () => {
    const nextValue = !showSimilarPapers;
    setShowSimilarPapers(nextValue);

    if (!nextValue || similarResults.length > 0 || loadingSimilarPapers) {
      return;
    }

    setLoadingSimilarPapers(true);
    setSimilarPapersError(null);

    try {
      const yearMin = paper.year ? Math.max(1900, Number(paper.year) - 8) : undefined;
      const yearMax = paper.year ? Number(paper.year) + 2 : undefined;
      const filters = {};
      if (yearMin) filters.year_min = yearMin;
      if (yearMax) filters.year_max = yearMax;

      const data = await searchPapers(
        paper.title,
        8,
        filters,
        'specter',
        'hybrid',
        'relevance',
        categories.length > 0 ? categories : null,
      );

      const items = (data.results || [])
        .filter((item) => item.paper.paper_id !== paper.paper_id)
        .slice(0, 4);

      setSimilarResults(items);
    } catch (error) {
      console.error('Similar papers error:', error);
      setSimilarPapersError('Similar papers could not be loaded right now.');
    } finally {
      setLoadingSimilarPapers(false);
    }
  };

  return (
    <article className="rounded-[26px] border border-surface-200 bg-white/95 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover">
      <div className="p-4 sm:p-5 lg:p-6">
        <div className="space-y-4">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                {paper.url ? (
                  <a
                    href={paper.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-start gap-2 text-lg font-semibold leading-snug text-surface-950 transition hover:text-scholar-700 md:text-xl"
                  >
                    <span>{paper.title}</span>
                    <svg className="mt-1 h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                ) : (
                  <h3 className="text-lg font-semibold leading-snug text-surface-950 md:text-xl">
                    {paper.title}
                  </h3>
                )}
                <p className="mt-2 text-sm leading-relaxed text-surface-500">
                  {authors}
                </p>
              </div>

              <div className="relative flex-shrink-0">
                <button
                  type="button"
                  onClick={handleBookmark}
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border transition-all duration-200 ${
                    isBookmarked
                      ? 'border-amber-200 bg-amber-50 text-accent-amber'
                      : 'border-surface-200 bg-white text-surface-400 hover:border-surface-300 hover:text-accent-amber'
                  }`}
                  title={isBookmarked ? 'Remove from library' : 'Save to library'}
                >
                  <svg className="h-4 w-4" fill={isBookmarked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                </button>
                {bookmarkError && (
                  <div className="absolute right-0 top-full z-10 mt-2 whitespace-nowrap rounded-xl bg-surface-900 px-3 py-1.5 text-xs text-white shadow-lg">
                    {bookmarkError}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {metadataChips.map((chip) => {
                const chipClassName = `inline-flex max-w-full items-center rounded-full px-3 py-1.5 text-xs font-medium ${
                  chip.tone === 'solid'
                    ? 'bg-surface-900 text-white'
                    : 'bg-surface-100 text-surface-600'
                } ${chip.href ? 'transition hover:bg-surface-200 hover:text-surface-900' : ''}`;

                if (chip.href) {
                  return (
                    <a
                      key={chip.key}
                      href={chip.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={chipClassName}
                      title={chip.label}
                    >
                      <span className="truncate">{chip.label}</span>
                    </a>
                  );
                }

                return (
                  <span
                    key={chip.key}
                    className={chipClassName}
                    title={chip.label}
                  >
                    <span className="truncate">{chip.label}</span>
                  </span>
                );
              })}
              {categories.map((category) => (
                <span
                  key={category}
                  className="inline-flex items-center rounded-full border border-scholar-100 bg-scholar-50 px-3 py-1.5 text-xs font-medium text-scholar-700"
                >
                  {category}
                </span>
              ))}
            </div>

            <div className="space-y-3">
              {paper.tldr && (
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex-shrink-0 rounded-full bg-scholar-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white">
                    TLDR
                  </span>
                  <p className="text-sm leading-7 text-surface-700 sm:text-[15px]">
                    {paper.tldr}
                  </p>
                </div>
              )}
              <p className="text-sm leading-7 text-surface-600 sm:text-[15px]">
                {abstractText}
              </p>

              <div className="rounded-[22px] border border-scholar-100 bg-gradient-to-br from-scholar-50 via-white to-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-surface-400">
                    XAI preview
                  </p>
                  <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-violet shadow-card">
                    {METHOD_LABELS[explanationMethod]}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-surface-700 line-clamp-5">
                  {currentExplanation?.explanation_text || 'Open the explanation panel to inspect why this paper ranked well for your query.'}
                </p>
                {currentExplanation?.top_keywords?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {currentExplanation.top_keywords.slice(0, 4).map((keyword) => (
                      <span
                        key={keyword}
                        className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-surface-600 shadow-card"
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-surface-100 pt-4">
            <button
              type="button"
              onClick={async () => {
                const nextValue = !showExplanation;
                setShowExplanation(nextValue);
                if (nextValue && explanationMethod === 'keywords') {
                  await loadOverviewBundle();
                }
              }}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 ${
                showExplanation
                  ? 'bg-accent-violet text-white'
                  : 'bg-surface-900 text-white hover:bg-surface-800'
              }`}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              {showExplanation ? 'Hide XAI' : 'Show XAI'}
            </button>

            <button
              type="button"
              onClick={handleToggleSimilarPapers}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all duration-200 ${
                showSimilarPapers
                  ? 'border-scholar-200 bg-scholar-50 text-scholar-700'
                  : 'border-surface-200 bg-white text-surface-700 hover:border-surface-300 hover:text-surface-900'
              }`}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16l-4-4m0 0l4-4m-4 4h10m2 0h4m0 0l-4-4m4 4l-4 4" />
              </svg>
              Similar papers
            </button>
          </div>

          {showSimilarPapers && (
            <div className="space-y-3 rounded-[22px] border border-surface-200 bg-surface-50/90 p-4 animate-slide-up">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-surface-900">Similar papers</p>
                  <p className="text-xs text-surface-500">Papers related to this title and topic.</p>
                </div>
                {similarResults.length > 0 && (
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-surface-500 shadow-card">
                    {similarResults.length} shown
                  </span>
                )}
              </div>

              {loadingSimilarPapers ? (
                <div className="rounded-[18px] border border-surface-200 bg-white px-4 py-8 text-center">
                  <div className="mx-auto mb-3 h-5 w-5 animate-spin rounded-full border-2 border-surface-300 border-t-scholar-500" />
                  <p className="text-sm text-surface-500">Finding related papers...</p>
                </div>
              ) : similarPapersError ? (
                <div className="rounded-[18px] border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {similarPapersError}
                </div>
              ) : similarResults.length > 0 ? (
                <div className="grid gap-3 lg:grid-cols-2">
                  {similarResults.map((item) => {
                    const similarPaper = item.paper;
                    const similarSource = getSourceLabel(similarPaper);
                    const similarVenue = String(similarPaper.venue || '').trim();
                    const cardContent = (
                      <>
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold leading-6 text-surface-900 line-clamp-2">
                              {similarPaper.title}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2 text-xs text-surface-500">
                              {similarPaper.year ? <span>{similarPaper.year}</span> : null}
                              <span>{`Source: ${similarSource}`}</span>
                              {similarVenue && normalizeMetaValue(similarVenue) !== normalizeMetaValue(similarSource) ? <span>{similarVenue}</span> : null}
                            </div>
                          </div>
                          {similarPaper.url && (
                            <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          )}
                        </div>
                        {similarPaper.abstract && (
                          <p className="mt-3 text-sm leading-6 text-surface-600">
                            {similarPaper.abstract}
                          </p>
                        )}
                      </>
                    );

                    if (similarPaper.url) {
                      return (
                        <a
                          key={similarPaper.paper_id}
                          href={similarPaper.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-[18px] border border-surface-200 bg-white p-4 transition hover:border-scholar-200 hover:shadow-card"
                        >
                          {cardContent}
                        </a>
                      );
                    }

                    return (
                      <div
                        key={similarPaper.paper_id}
                        className="rounded-[18px] border border-surface-200 bg-white p-4"
                      >
                        {cardContent}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-[18px] border border-surface-200 bg-white px-4 py-4 text-sm text-surface-500">
                  No similar papers were found for this item yet.
                </div>
              )}
            </div>
          )}

          {showExplanation && (
            <div className="space-y-3 rounded-[22px] border border-surface-200 bg-surface-50/90 p-4 animate-slide-up">
              <div className="relative w-full sm:w-auto sm:min-w-[180px]">
                <select
                  value={explanationMethod}
                  onChange={(event) => handleExplanationMethod(event.target.value)}
                  disabled={loadingExplanation}
                  className="w-full appearance-none rounded-full border border-surface-200 bg-white py-2.5 pl-4 pr-11 text-sm font-medium text-surface-700 shadow-card transition focus:border-scholar-300 focus:outline-none focus:ring-2 focus:ring-scholar-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {Object.entries(METHOD_LABELS).map(([method, label]) => (
                    <option key={method} value={method}>
                      {label}
                    </option>
                  ))}
                </select>
                <svg
                  className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>

              {loadingExplanation ? (
                <div className="rounded-[18px] border border-surface-200 bg-white px-4 py-8 text-center">
                  <div className="mx-auto mb-3 h-5 w-5 animate-spin rounded-full border-2 border-surface-300 border-t-scholar-500" />
                  <p className="text-sm text-surface-500">
                    Building the {METHOD_LABELS[explanationMethod]?.toLowerCase()} explanation...
                  </p>
                </div>
              ) : explanationError ? (
                <div className="rounded-[18px] border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {explanationError}
                </div>
              ) : currentExplanation ? (
                <ExplanationView explanation={currentExplanation} />
              ) : null}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export default PaperCard;
