import React from 'react';

const SORT_OPTIONS = [
  { value: 'relevance', label: 'Best Match' },
  { value: 'recency', label: 'Newest' },
  { value: 'citations', label: 'Most Cited' },
];

function SortDropdown({ value, onChange }) {
  return (
    <div className="flex w-full flex-col items-start gap-2 sm:w-auto sm:items-end">
      <span className="text-xs font-semibold uppercase tracking-[0.2em] text-surface-400">
        Sort
      </span>
      <div className="inline-flex w-full flex-wrap rounded-full border border-surface-200 bg-white p-1 shadow-card sm:w-auto">
        {SORT_OPTIONS.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`rounded-full px-3 py-2 text-sm font-medium transition-all duration-200 sm:px-3.5 ${
                selected
                  ? 'bg-surface-900 text-white shadow-sm'
                  : 'text-surface-500 hover:text-surface-800'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default SortDropdown;
