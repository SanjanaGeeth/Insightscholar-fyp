import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';

function toTitleCase(label) {
  return label.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ShapForcePlot({ explanation }) {
  const termContributions = explanation.term_contributions || [];
  const fallbackKeys = Object.keys(explanation.feature_importance || {});

  const chartData = termContributions.length > 0
    ? termContributions.map((item) => ({
        name: toTitleCase(item.feature),
        value: item.contribution,
        absValue: Math.abs(item.contribution),
      }))
    : fallbackKeys.map((key) => ({
        name: toTitleCase(key),
        value: explanation.feature_importance[key],
        absValue: Math.abs(explanation.feature_importance[key]),
      }));

  if (chartData.length === 0) {
    return (
      <div className="rounded-[22px] border border-surface-200 bg-surface-50 p-4">
        <p className="text-sm text-surface-500">
          Term-level contributions are not available for this explanation.
        </p>
      </div>
    );
  }

  chartData.sort((left, right) => right.absValue - left.absValue);
  const topTerms = chartData.slice(0, 6);

  return (
    <div className="rounded-[22px] border border-surface-200 bg-surface-50 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-surface-400">
            Model terms
          </p>
          <h5 className="mt-1 text-base font-semibold text-surface-950">
            Additive contribution view
          </h5>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-surface-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#4263eb]" />
            Boosts ranking
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#94a3b8]" />
            Lowers ranking
          </span>
        </div>
      </div>

      <div className="mt-4 rounded-[20px] border border-surface-200 bg-white p-3">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={topTerms} layout="vertical" margin={{ top: 4, right: 12, left: 16, bottom: 4 }}>
            <XAxis type="number" tick={{ fontSize: 10, fill: '#7b8db5' }} axisLine={false} tickLine={false} />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 11, fill: '#4a5a7d' }}
              width={118}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip formatter={(value) => [Number(value).toFixed(4), 'Contribution']} />
            <ReferenceLine x={0} stroke="#94a3b8" strokeDasharray="3 3" />
            <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={18}>
              {topTerms.map((entry, index) => (
                <Cell
                  key={`${entry.name}-${index}`}
                  fill={entry.value >= 0 ? '#4263eb' : '#94a3b8'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default ShapForcePlot;
