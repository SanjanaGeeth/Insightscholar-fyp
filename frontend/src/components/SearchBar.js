import React, { useEffect, useMemo, useState } from 'react';

const FIELDS_OF_STUDY = [
  { label: 'Computer Science', prefix: 'ComputerScience' },
  { label: 'Medicine', prefix: 'Medicine' },
  { label: 'Biology', prefix: 'Biology' },
  { label: 'Physics', prefix: 'Physics' },
  { label: 'Mathematics', prefix: 'Mathematics' },
  { label: 'Chemistry', prefix: 'Chemistry' },
  { label: 'Engineering', prefix: 'Engineering' },
  { label: 'Psychology', prefix: 'Psychology' },
  { label: 'Economics', prefix: 'Economics' },
  { label: 'Sociology', prefix: 'Sociology' },
  { label: 'History', prefix: 'History' },
  { label: 'Philosophy', prefix: 'Philosophy' },    
];

const YEAR_PRESETS = [
  { value: 'any', label: 'Any time' },
  { value: '3y', label: 'Last 3 years' },
  { value: '5y', label: 'Last 5 years' },
  { value: '10y', label: 'Last 10 years' },
  { value: 'custom', label: 'Custom range' },
];

const RESULT_DEPTH_OPTIONS = [24, 48, 72];

function SearchBar({ onSearch, disabled, initialQuery = '' }) {
  const [query, setQuery] = useState(initialQuery);
  const [yearPreset, setYearPreset] = useState('any');
  const [yearMin, setYearMin] = useState('');
  const [yearMax, setYearMax] = useState('');
  const [model] = useState('specter');
  const rankingMethod = 'hybrid';
  const [selectedFields, setSelectedFields] = useState([]);
  const [resultDepth, setResultDepth] = useState(48);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    setQuery(initialQuery || '');
  }, [initialQuery]);

  const getFieldLabel = (prefix) => {
    const field = FIELDS_OF_STUDY.find((item) => item.prefix === prefix);
    return field ? field.label : prefix;
  };

  const applyYearPreset = (preset) => {
    const currentYear = new Date().getFullYear();
    setYearPreset(preset);

    if (preset === 'any') {
      setYearMin('');
      setYearMax('');
      return;
    }

    if (preset === 'custom') {
      if (!yearMax) {
        setYearMax(String(currentYear));
      }
      return;
    }

    const yearsBack = Number.parseInt(preset.replace('y', ''), 10);
    setYearMin(String(currentYear - yearsBack + 1));
    setYearMax(String(currentYear));
  };

  const toggleField = (prefix) => {
    setSelectedFields((previous) => (
      previous.includes(prefix)
        ? previous.filter((field) => field !== prefix)
        : [...previous, prefix]
    ));
  };

  const resetFilters = () => {
    setYearPreset('any');
    setYearMin('');
    setYearMax('');
    setSelectedFields([]);
    setResultDepth(48);
  };

  const activeFilters = useMemo(() => {
    const filters = [];

    if (yearMin || yearMax) {
      filters.push(yearMin && yearMax ? `${yearMin}-${yearMax}` : `From ${yearMin || yearMax}`);
    }
    if (resultDepth !== 48) {
      filters.push(`${resultDepth} papers`);
    }
    if (selectedFields.length > 0) {
      filters.push(...selectedFields.map(getFieldLabel));
    }

    return filters;
  }, [resultDepth, selectedFields, yearMax, yearMin]);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!query.trim()) {
      return;
    }

    const filters = {};
    if (yearMin) filters.year_min = Number.parseInt(yearMin, 10);
    if (yearMax) filters.year_max = Number.parseInt(yearMax, 10);

    onSearch(
      query.trim(),
      filters,
      model,
      rankingMethod,
      selectedFields.length > 0 ? selectedFields : null,
      resultDepth,
    );
  };

  return (
    <div className="relative">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="search-input relative flex flex-wrap items-center gap-2 rounded-[28px] border border-white/60 bg-white/95 p-2 shadow-glass backdrop-blur-xl transition-all duration-200 hover:shadow-glass-lg focus-within:border-scholar-300 sm:flex-nowrap">
          <div className="pl-3 text-surface-400">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search papers, methods, datasets, or research questions"
            className="min-w-0 flex-1 bg-transparent px-2 py-3 text-base text-surface-900 placeholder:text-surface-400 focus:outline-none"
            disabled={disabled}
          />

          <div className="flex w-full items-center gap-2 sm:w-auto">
            <button
              type="button"
              onClick={() => setShowFilters((previous) => !previous)}
              className={`relative inline-flex flex-1 items-center justify-center gap-2 rounded-2xl px-3 py-2 text-sm font-medium transition-all duration-200 sm:flex-none ${
                showFilters
                  ? 'bg-scholar-100 text-scholar-700'
                  : 'text-surface-500 hover:bg-surface-100 hover:text-surface-700'
              }`}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M7 12h10M10 18h4" />
              </svg>
              <span>Filters</span>
              {activeFilters.length > 0 && (
                <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-accent-coral px-1.5 text-[11px] font-semibold text-white">
                  {activeFilters.length}
                </span>
              )}
            </button>

            <button
              type="submit"
              disabled={disabled || !query.trim()}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-hero-mesh px-5 py-3 text-sm font-semibold text-white shadow-blue-glow transition-all duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
            >
              {disabled ? (
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : null}
              <span>{disabled ? 'Searching' : 'Search'}</span>
            </button>
          </div>
        </div>

        <div
          className="overflow-hidden transition-all duration-300"
          style={{
            maxHeight: showFilters ? '1200px' : '0px',
            opacity: showFilters ? 1 : 0,
          }}
        >
          <div className="rounded-[28px] border border-white/70 bg-white/95 p-5 shadow-glass backdrop-blur-xl">
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div />
                {activeFilters.length > 0 && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="inline-flex items-center justify-center rounded-full border border-surface-200 px-3 py-1.5 text-sm font-medium text-surface-500 transition hover:border-surface-300 hover:text-surface-700"
                  >
                    Reset filters
                  </button>
                )}
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-surface-400">
                  Time window
                </label>
                <div className="flex flex-wrap gap-2">
                  {YEAR_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => applyYearPreset(preset.value)}
                      className={`rounded-full px-3.5 py-2 text-sm font-medium transition-all duration-200 ${
                        yearPreset === preset.value
                          ? 'bg-surface-900 text-white shadow-card'
                          : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                {(yearPreset === 'custom' || yearMin || yearMax) && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <input
                      type="number"
                      value={yearMin}
                      onChange={(event) => {
                        setYearPreset('custom');
                        setYearMin(event.target.value);
                      }}
                      placeholder="From year"
                      className="w-full rounded-2xl border border-surface-200 bg-surface-50 px-4 py-3 text-sm text-surface-800 outline-none transition focus:border-scholar-400 focus:ring-2 focus:ring-scholar-100"
                    />
                    <input
                      type="number"
                      value={yearMax}
                      onChange={(event) => {
                        setYearPreset('custom');
                        setYearMax(event.target.value);
                      }}
                      placeholder="To year"
                      className="w-full rounded-2xl border border-surface-200 bg-surface-50 px-4 py-3 text-sm text-surface-800 outline-none transition focus:border-scholar-400 focus:ring-2 focus:ring-scholar-100"
                    />
                  </div>
                )}
              </div>

              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-surface-400">
                    Fields of study
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {FIELDS_OF_STUDY.map((field) => {
                      const selected = selectedFields.includes(field.prefix);
                      return (
                        <button
                          key={field.prefix}
                          type="button"
                          onClick={() => toggleField(field.prefix)}
                          className={`rounded-full border px-3 py-2 text-sm font-medium transition-all duration-200 ${
                            selected
                              ? 'border-scholar-200 bg-scholar-50 text-scholar-700'
                              : 'border-surface-200 bg-white text-surface-600 hover:border-surface-300 hover:text-surface-800'
                          }`}
                        >
                          {field.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-5">
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-surface-400">
                      Paper count
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {RESULT_DEPTH_OPTIONS.map((depth) => (
                        <button
                          key={depth}
                          type="button"
                          onClick={() => setResultDepth(depth)}
                          className={`rounded-2xl px-3 py-3 text-sm font-semibold transition-all duration-200 ${
                            resultDepth === depth
                              ? 'bg-surface-900 text-white shadow-card'
                              : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
                          }`}
                        >
                          {depth}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-surface-500">
                    </p>
                  </div>
                </div>
              </div>

              {activeFilters.length > 0 && (
                <div className="border-t border-surface-100 pt-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-surface-400">
                    Active filters
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {activeFilters.map((filter) => (
                      <span
                        key={filter}
                        className="inline-flex items-center rounded-full border border-scholar-100 bg-scholar-50 px-3 py-1.5 text-sm font-medium text-scholar-700"
                      >
                        {filter}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

export default SearchBar;
