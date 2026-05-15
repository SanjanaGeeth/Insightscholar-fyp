import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import ShapForcePlot from './ShapForcePlot';
import AnchorExplanation from './AnchorExplanation';

const CHART_COLORS = ['#4263eb', '#5c7cfa', '#748ffc', '#91a7ff', '#845ef7', '#20c997'];
const METHOD_LABELS = {
  keywords: 'Overview',
  ebm: 'EBM terms',
  shap: 'EBM terms',
  anchors: 'Anchors',
};
const EVIDENCE_SOURCE_LABELS = {
  title: 'Title',
  abstract: 'Abstract',
};

function normalizeContribution(value) {
  return Math.abs(value) <= 1 ? value * 100 : value;
}

function toTitleCase(label) {
  return label.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ExplanationView({ explanation }) {
  const overviewBundle = explanation.overview_bundle || null;
  const ebmOverview = explanation.method === 'keywords' ? overviewBundle?.ebm || null : null;
  const anchorOverview = explanation.method === 'keywords' ? overviewBundle?.anchors || null : null;
  const chartSource = ebmOverview || explanation;

  const chartData = Object.entries(chartSource.feature_importance || {})
    .map(([key, value]) => ({
      name: toTitleCase(key),
      value: normalizeContribution(value),
    }))
    .sort((left, right) => Math.abs(right.value) - Math.abs(left.value))
    .slice(0, 6);

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload || payload.length === 0) {
      return null;
    }

    return (
      <div className="rounded-2xl bg-surface-950 px-3 py-2 text-xs text-white shadow-lg">
        <p className="font-semibold">{payload[0].payload.name}</p>
        <p className="mt-1 text-surface-200">
          Contribution <span className="font-semibold text-white">{payload[0].value.toFixed(2)}</span>
        </p>
      </div>
    );
  };

  const methodLabel = METHOD_LABELS[explanation.method] || 'Overview';
  const hasTermsView = explanation.method === 'ebm' || explanation.method === 'shap';
  const hasKeywords = explanation.top_keywords && explanation.top_keywords.length > 0;
  const evidenceSpans = explanation.evidence_spans || [];
  const factorLabels = (chartSource.feature_highlights || chartData.slice(0, 4).map((item) => item.name)).slice(0, 4);

  const renderSidePanel = () => {
    if (hasTermsView) {
      return <ShapForcePlot explanation={explanation} />;
    }

    if (explanation.method === 'anchors') {
      return <AnchorExplanation explanation={explanation} />;
    }

    if (factorLabels.length === 0) {
      return null;
    }

    return (
      <div className="rounded-[22px] border border-surface-200 bg-surface-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-surface-400">
          Ranking factors
        </p>
        <h5 className="mt-1 text-base font-semibold text-surface-950">
          What helped surface this paper
        </h5>
        <p className="mt-2 text-sm leading-6 text-surface-600">
          These model signals stayed positive after matching the paper content to your query.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {factorLabels.map((name) => (
            <span
              key={name}
              className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-surface-700 shadow-card"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-[24px] border border-surface-200 bg-white p-4 md:p-5">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-surface-400">
              XAI explanation
            </p>
            <h4 className="mt-1 text-lg font-semibold text-surface-950">
              Why this paper surfaced for your query
            </h4>
          </div>
          <span className="inline-flex items-center self-start rounded-full border border-accent-violet/20 bg-accent-violet/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-accent-violet">
            {methodLabel}
          </span>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(300px,0.95fr)]">
          <div className="rounded-[22px] border border-surface-200 bg-surface-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-surface-400">
              Summary
            </p>
            <p className="mt-3 text-sm leading-7 text-surface-700">
              {explanation.explanation_text}
            </p>

            {evidenceSpans.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-surface-400">
                  Evidence from paper
                </p>
                <div className="mt-2 space-y-2.5">
                  {evidenceSpans.map((span, index) => (
                    <div
                      key={`${span.source}-${index}`}
                      className="rounded-2xl border border-surface-200 bg-white px-4 py-3 shadow-card"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-surface-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-surface-600">
                          {EVIDENCE_SOURCE_LABELS[span.source] || 'Paper'}
                        </span>
                        {span.matched_terms?.map((term) => (
                          <span
                            key={`${span.source}-${term}`}
                            className="rounded-full bg-scholar-50 px-2.5 py-1 text-xs font-medium text-scholar-700"
                          >
                            {term}
                          </span>
                        ))}
                      </div>
                      <p className="mt-3 text-sm leading-6 text-surface-700">
                        {span.text}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {evidenceSpans.length === 0 && hasKeywords && (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-surface-400">
                  Matched query terms
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {explanation.top_keywords.map((keyword) => (
                    <span
                      key={keyword}
                      className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-surface-700 shadow-card"
                    >
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {renderSidePanel()}
        </div>

        {explanation.method === 'keywords' && (ebmOverview || anchorOverview) && (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(300px,0.95fr)]">
            {ebmOverview ? <ShapForcePlot explanation={ebmOverview} /> : <div />}
            {anchorOverview ? <AnchorExplanation explanation={anchorOverview} /> : <div />}
          </div>
        )}

        {chartData.length > 0 && (
          <div className="rounded-[22px] border border-surface-200 bg-surface-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-surface-400">
                  Contribution chart
                </p>
                <p className="mt-1 text-sm text-surface-500">
                  The strongest features pushing this paper up or down the ranking.
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-[20px] border border-surface-200 bg-white p-3">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 12, left: 16, bottom: 4 }}>
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#7b8db5' }} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11, fill: '#4a5a7d' }}
                    width={118}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(66, 99, 235, 0.04)' }} />
                  <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={18}>
                    {chartData.map((entry, index) => (
                      <Cell
                        key={`${entry.name}-${index}`}
                        fill={entry.value >= 0 ? CHART_COLORS[index % CHART_COLORS.length] : '#94a3b8'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ExplanationView;