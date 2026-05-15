import React from 'react';

function AnchorExplanation({ explanation }) {
  if (!explanation.anchor_rules || explanation.anchor_rules.length === 0) {
    return (
      <div className="rounded-[22px] border border-surface-200 bg-surface-50 p-4">
        <p className="text-sm text-surface-500">
          No anchor rules were generated for this paper.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[22px] border border-surface-200 bg-surface-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-surface-400">
        Anchor rules
      </p>
      <h5 className="mt-1 text-base font-semibold text-surface-950">
        Stable conditions behind the recommendation
      </h5>

      <div className="mt-4 space-y-3">
        {explanation.anchor_rules.map((rule, index) => (
          <div
            key={rule}
            className="flex items-start gap-3 rounded-2xl border border-surface-200 bg-white px-4 py-3 shadow-card"
          >
            <span className="mt-0.5 inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-scholar-50 text-xs font-semibold text-scholar-700">
              {index + 1}
            </span>
            <p className="text-sm leading-6 text-surface-700">{rule}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {explanation.anchor_precision != null && (
          <div className="rounded-2xl border border-surface-200 bg-white px-4 py-3 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-surface-400">Precision</p>
            <p className="mt-1 text-lg font-semibold text-surface-900">
              {(explanation.anchor_precision * 100).toFixed(1)}%
            </p>
          </div>
        )}
        {explanation.anchor_coverage != null && (
          <div className="rounded-2xl border border-surface-200 bg-white px-4 py-3 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-surface-400">Coverage</p>
            <p className="mt-1 text-lg font-semibold text-surface-900">
              {(explanation.anchor_coverage * 100).toFixed(1)}%
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default AnchorExplanation;