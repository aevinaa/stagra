import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import { getModelComparison } from '../services/api';
import { ModelComparisonResult } from '../types';
import { ChartTooltip } from '../components/ui/ChartTooltip';
import { DataNotice } from '../components/common/DataNotice';
import {
  Award,
  Info,
  RefreshCw,
  CheckCircle2,
  SlidersHorizontal,
  FileSpreadsheet,
} from 'lucide-react';

type EvaluationMetricKey = 'accuracy' | 'f1Score' | 'mae' | 'rmse';

interface MetricMeta {
  key: EvaluationMetricKey;
  label: string;
  category: 'Classification' | 'Regression';
  unit: string;
  direction: 'higher-is-better' | 'lower-is-better';
  description: string;
}

const METRICS_META: Record<EvaluationMetricKey, MetricMeta> = {
  accuracy: {
    key: 'accuracy',
    label: 'Accuracy',
    category: 'Classification',
    unit: '%',
    direction: 'higher-is-better',
    description: 'Fraction of air quality level classifications correctly predicted.',
  },
  f1Score: {
    key: 'f1Score',
    label: 'F1 Score',
    category: 'Classification',
    unit: '',
    direction: 'higher-is-better',
    description: 'Harmonic mean of precision and recall across discrete classes.',
  },
  mae: {
    key: 'mae',
    label: 'MAE',
    category: 'Regression',
    unit: 'sensor units',
    direction: 'lower-is-better',
    description: 'Mean Absolute Error in raw continuous sensor units.',
  },
  rmse: {
    key: 'rmse',
    label: 'RMSE',
    category: 'Regression',
    unit: 'sensor units',
    direction: 'lower-is-better',
    description: 'Root Mean Squared Error, penalizing larger prediction deviations.',
  },
};

export function ModelsView() {
  const [models, setModels] = useState<ModelComparisonResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // True when the API layer reports that no model results exist (real mode, nothing evaluated yet)
  const [isUnavailable, setIsUnavailable] = useState(false);

  // Selected primary metric for ranking the best performing candidate
  const [primaryMetric, setPrimaryMetric] = useState<EvaluationMetricKey>('accuracy');
  const [hoveredModel, setHoveredModel] = useState<string | null>(null);

  const fetchModelData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getModelComparison();
      setModels(data ?? []);
      setIsUnavailable(data === null);
    } catch (err: any) {
      console.error('Failed to load model comparison:', err);
      setError('Unable to load model evaluation benchmarks from service.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchModelData();
  }, []);

  if (isLoading) {
    return (
      <div className="py-24 text-center">
        <p className="type-body text-[#607780] font-mono">Loading model evaluation benchmarks...</p>
      </div>
    );
  }

  if (isUnavailable) {
    return (
      <div className="space-y-6">
        <div className="pb-3 border-b border-[#D5E0E4]">
          <h2 className="type-page-title text-[#19323C]">Model Comparison</h2>
          <p className="type-body text-[#607780] mt-0.5">
            Evaluation results for machine learning models trained on real sensor data.
          </p>
        </div>
        <DataNotice variant="unavailable" title="No evaluated models yet">
          No model has been trained and evaluated on held-out real sensor data, so there are no model
          metrics to compare. Results will appear here only after a model has been evaluated.
        </DataNotice>
      </div>
    );
  }

  if (error || models.length === 0) {
    return (
      <div className="py-16 text-center space-y-3">
        <p className="type-body text-[#C94343] font-mono">{error || 'No benchmark data available.'}</p>
        <button
          onClick={fetchModelData}
          className="px-3 py-1.5 text-xs font-mono font-medium rounded-[6px] bg-[#FAFCFC] border border-[#D5E0E4] text-[#19323C] hover:bg-[#E8F0F2] cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  // Determine "Best Performing Model" dynamically based on selected primary metric
  const sortedModels = [...models].sort((a, b) => {
    const meta = METRICS_META[primaryMetric];
    const valA = (a as any)[primaryMetric] ?? 0;
    const valB = (b as any)[primaryMetric] ?? 0;

    if (meta.direction === 'higher-is-better') {
      return valB - valA;
    } else {
      return valA - valB;
    }
  });

  const bestModel = sortedModels[0];
  const activeMeta = METRICS_META[primaryMetric];

  // Helper formatting for values
  const formatMetricValue = (key: EvaluationMetricKey, val: number | undefined) => {
    if (val === undefined || Number.isNaN(val)) return '—';
    if (key === 'accuracy') return `${(val * 100).toFixed(1)}%`;
    if (key === 'f1Score') return val.toFixed(3);
    return val.toFixed(2);
  };

  return (
    <div className="space-y-6">
      {/* PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-[#D5E0E4]">
        <div>
          <h2 className="type-page-title text-[#19323C]">Model Comparison</h2>
          <p className="type-body text-[#607780] mt-0.5">
            Experimental machine learning benchmarks evaluating sequential architectures for indoor air quality.
          </p>
        </div>

        {/* DEMO / MOCK RESULTS NOTICE BADGE */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-[6px] bg-[#E8F2F6] border border-[#D5E0E4] text-xs font-mono text-[#176B87]">
          <Info className="w-3.5 h-3.5 shrink-0 text-[#176B87]" />
          <span className="font-semibold tracking-wide uppercase">
            Demo / Mock Results · Illustrative benchmark values
          </span>
        </div>
      </div>


      {/* METRIC SELECTION CONTROL */}
      <Card className="p-4" elevated={false}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-[#607780]" />
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-[#19323C] block">
                Primary Evaluation Metric
              </span>
              <span className="text-[11px] text-[#607780]">
                Determines ranked leader based on chosen evaluation objective
              </span>
            </div>
          </div>

          {/* Grouped Metric Selectors */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Classification Group */}
            <div className="flex items-center gap-1 p-1 bg-[#E8F0F2] rounded-[6px] border border-[#D5E0E4]">
              <span className="text-[10px] font-mono uppercase tracking-wider px-2 text-[#8A98A8] font-semibold border-r border-[#D5E0E4] mr-0.5">
                Classification
              </span>
              <button
                type="button"
                onClick={() => setPrimaryMetric('accuracy')}
                className={`px-2.5 py-1 text-xs font-mono rounded-[4px] transition-colors cursor-pointer ${
                  primaryMetric === 'accuracy'
                    ? 'bg-[#FAFCFC] text-[#176B87] font-bold shadow-subtle border border-[#D5E0E4]'
                    : 'text-[#607780] hover:text-[#19323C]'
                }`}
              >
                Accuracy
              </button>
              <button
                type="button"
                onClick={() => setPrimaryMetric('f1Score')}
                className={`px-2.5 py-1 text-xs font-mono rounded-[4px] transition-colors cursor-pointer ${
                  primaryMetric === 'f1Score'
                    ? 'bg-[#FAFCFC] text-[#176B87] font-bold shadow-subtle border border-[#D5E0E4]'
                    : 'text-[#607780] hover:text-[#19323C]'
                }`}
              >
                F1 Score
              </button>
            </div>

            {/* Regression Group */}
            <div className="flex items-center gap-1 p-1 bg-[#E8F0F2] rounded-[6px] border border-[#D5E0E4]">
              <span className="text-[10px] font-mono uppercase tracking-wider px-2 text-[#8A98A8] font-semibold border-r border-[#D5E0E4] mr-0.5">
                Regression
              </span>
              <button
                type="button"
                onClick={() => setPrimaryMetric('mae')}
                className={`px-2.5 py-1 text-xs font-mono rounded-[4px] transition-colors cursor-pointer ${
                  primaryMetric === 'mae'
                    ? 'bg-[#FAFCFC] text-[#176B87] font-bold shadow-subtle border border-[#D5E0E4]'
                    : 'text-[#607780] hover:text-[#19323C]'
                }`}
              >
                MAE
              </button>
              <button
                type="button"
                onClick={() => setPrimaryMetric('rmse')}
                className={`px-2.5 py-1 text-xs font-mono rounded-[4px] transition-colors cursor-pointer ${
                  primaryMetric === 'rmse'
                    ? 'bg-[#FAFCFC] text-[#176B87] font-bold shadow-subtle border border-[#D5E0E4]'
                    : 'text-[#607780] hover:text-[#19323C]'
                }`}
              >
                RMSE
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* 1. DYNAMIC BEST PERFORMING MODEL CARD */}
      <section aria-labelledby="best-model-title">
        <div className="rounded-[12px] p-5 bg-[#FAFCFC] border border-[#D5E0E4] border-l-4 border-l-[#176B87] shadow-subtle space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-[8px] bg-[#E8F2F6] text-[#176B87]">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span
                    id="best-model-title"
                    className="text-[11px] uppercase tracking-wider font-bold text-[#176B87]"
                  >
                    Best Performing Model
                  </span>
                  <span className="text-[10px] font-mono text-[#8A98A8]">
                    (Evaluated by {activeMeta.label})
                  </span>
                </div>
                <h4 className="text-[20px] font-bold text-[#19323C]">
                  {bestModel.modelName}
                </h4>
              </div>
            </div>

            <div className="text-right">
              <span className="inline-block px-2.5 py-1 rounded-[4px] text-xs font-mono font-medium text-[#27845A] bg-[#EEF8F2] border border-[#D5E0E4]">
                Rank 1 on {activeMeta.label}
              </span>
              <span className="block text-[10px] font-mono text-[#8A98A8] mt-1">
                Demo / Mock Results
              </span>
            </div>
          </div>

          <p className="text-[13px] text-[#607780] leading-relaxed">
            According to the illustrative benchmark values, the <strong className="text-[#19323C]">{bestModel.modelName}</strong> architecture achieves the strongest result under the selected primary criterion of <strong>{activeMeta.label}</strong> ({formatMetricValue(primaryMetric, (bestModel as any)[primaryMetric])}{activeMeta.unit ? ` ${activeMeta.unit}` : ''}).
            {activeMeta.direction === 'higher-is-better'
              ? ' Higher values represent superior predictive performance.'
              : ' Lower values indicate smaller continuous prediction residual error.'}
          </p>

          {/* Detailed Metric Breakdown for the Ranked Leader */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-1">
            {/* Classification: Accuracy */}
            <div className={`p-3 rounded-[6px] border ${primaryMetric === 'accuracy' ? 'bg-[#E8F2F6]/60 border-[#D5E0E4]' : 'bg-[#E8F0F2] border-[#D5E0E4]'}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] uppercase font-mono tracking-wider font-semibold text-[#607780]">
                  Accuracy
                </span>
                <span className="text-[9px] font-mono text-[#8A98A8]">Classification</span>
              </div>
              <span className="text-base font-mono font-bold text-[#19323C] tabular-nums block">
                {(bestModel.accuracy * 100).toFixed(1)}%
              </span>
              <span className="text-[10px] text-[#8A98A8] font-mono">Higher is better</span>
            </div>

            {/* Classification: F1 Score */}
            <div className={`p-3 rounded-[6px] border ${primaryMetric === 'f1Score' ? 'bg-[#E8F2F6]/60 border-[#D5E0E4]' : 'bg-[#E8F0F2] border-[#D5E0E4]'}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] uppercase font-mono tracking-wider font-semibold text-[#607780]">
                  F1 Score
                </span>
                <span className="text-[9px] font-mono text-[#8A98A8]">Classification</span>
              </div>
              <span className="text-base font-mono font-bold text-[#19323C] tabular-nums block">
                {bestModel.f1Score !== undefined ? bestModel.f1Score.toFixed(3) : '—'}
              </span>
              <span className="text-[10px] text-[#8A98A8] font-mono">Higher is better</span>
            </div>

            {/* Regression: MAE */}
            <div className={`p-3 rounded-[6px] border ${primaryMetric === 'mae' ? 'bg-[#E8F2F6]/60 border-[#D5E0E4]' : 'bg-[#E8F0F2] border-[#D5E0E4]'}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] uppercase font-mono tracking-wider font-semibold text-[#607780]">
                  MAE
                </span>
                <span className="text-[9px] font-mono text-[#8A98A8]">Regression</span>
              </div>
              <span className="text-base font-mono font-bold text-[#19323C] tabular-nums block">
                {bestModel.mae.toFixed(2)}
              </span>
              <span className="text-[10px] text-[#8A98A8] font-mono">Lower is better</span>
            </div>

            {/* Regression: RMSE */}
            <div className={`p-3 rounded-[6px] border ${primaryMetric === 'rmse' ? 'bg-[#E8F2F6]/60 border-[#D5E0E4]' : 'bg-[#E8F0F2] border-[#D5E0E4]'}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] uppercase font-mono tracking-wider font-semibold text-[#607780]">
                  RMSE
                </span>
                <span className="text-[9px] font-mono text-[#8A98A8]">Regression</span>
              </div>
              <span className="text-base font-mono font-bold text-[#19323C] tabular-nums block">
                {bestModel.rmse.toFixed(2)}
              </span>
              <span className="text-[10px] text-[#8A98A8] font-mono">Lower is better</span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. RESEARCH EVALUATION BENCHMARK MATRIX */}
      <section aria-labelledby="benchmark-table-title">
        <Card className="overflow-hidden">
          <div className="p-4 border-b border-[#D5E0E4] flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 id="benchmark-table-title" className="type-card-heading text-[#19323C]">
                Benchmark Evaluation Matrix (Illustrative Benchmark Values)
              </h3>
              <p className="type-metadata text-[#607780] mt-0.5">
                Comparative results for LSTM, GRU, and Transformer architectures (Demo / Mock Results)
              </p>
            </div>
            <span className="text-xs font-mono text-[#8A98A8]">
              Evaluation Source: API Service ({models.length} Models)
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                {/* Dual-Tier Header: Clearly Separating Metric Classes */}
                <tr className="bg-[#E8F0F2] border-b border-[#D5E0E4] text-[10px] uppercase tracking-wider font-mono text-[#607780]">
                  <th scope="col" className="py-2 px-4" colSpan={1}>Architecture</th>
                  <th scope="col" className="py-2 px-4 text-center border-x border-[#D5E0E4] bg-[#E8F0F2]" colSpan={2}>
                    Regression Metrics (Continuous Error)
                  </th>
                  <th scope="col" className="py-2 px-4 text-center border-r border-[#D5E0E4] bg-[#E8F2F6]" colSpan={2}>
                    Classification Metrics (Level Accuracy)
                  </th>
                  <th scope="col" className="py-2 px-4 text-right" colSpan={2}>Evaluation</th>
                </tr>
                <tr className="bg-[#E8F0F2] border-b border-[#D5E0E4] text-xs uppercase tracking-wider font-semibold text-[#607780]">
                  <th scope="col" className="py-3 px-4">Model Name</th>
                  {/* Regression */}
                  <th scope="col" className={`py-3 px-4 font-mono text-right ${primaryMetric === 'mae' ? 'bg-[#E8F2F6] text-[#176B87]' : ''}`}>
                    MAE ↓
                  </th>
                  <th scope="col" className={`py-3 px-4 font-mono text-right border-r border-[#D5E0E4] ${primaryMetric === 'rmse' ? 'bg-[#E8F2F6] text-[#176B87]' : ''}`}>
                    RMSE ↓
                  </th>
                  {/* Classification */}
                  <th scope="col" className={`py-3 px-4 font-mono text-right ${primaryMetric === 'accuracy' ? 'bg-[#E8F2F6] text-[#176B87]' : ''}`}>
                    Accuracy ↑
                  </th>
                  <th scope="col" className={`py-3 px-4 font-mono text-right border-r border-[#D5E0E4] ${primaryMetric === 'f1Score' ? 'bg-[#E8F2F6] text-[#176B87]' : ''}`}>
                    F1 Score ↑
                  </th>
                  {/* Meta */}
                  <th scope="col" className="py-3 px-4 text-center font-mono">Status</th>
                  <th scope="col" className="py-3 px-4 text-right font-mono">Rank ({activeMeta.label})</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D5E0E4] font-mono text-xs">
                {sortedModels.map((model, index) => {
                  const isTopRank = index === 0;

                  return (
                    <tr
                      key={model.modelName}
                      className={`transition-colors hover:bg-[#E8F0F2] ${
                        isTopRank ? 'bg-[#E8F2F6]/40' : ''
                      }`}
                    >
                      {/* Model Architecture */}
                      <td className="py-3.5 px-4 font-sans text-sm text-[#19323C] font-medium flex items-center gap-2">
                        <span>{model.modelName}</span>
                        {isTopRank && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono text-[#176B87] bg-[#E8F2F6] px-2 py-0.5 rounded border border-[#D5E0E4]">
                            <CheckCircle2 className="w-3 h-3" />
                            Top
                          </span>
                        )}
                      </td>

                      {/* MAE */}
                      <td className={`py-3.5 px-4 text-right tabular-nums ${primaryMetric === 'mae' ? 'font-bold text-[#176B87]' : 'text-[#19323C]'}`}>
                        {model.mae.toFixed(2)}
                      </td>

                      {/* RMSE */}
                      <td className={`py-3.5 px-4 text-right tabular-nums border-r border-[#D5E0E4] ${primaryMetric === 'rmse' ? 'font-bold text-[#176B87]' : 'text-[#19323C]'}`}>
                        {model.rmse.toFixed(2)}
                      </td>

                      {/* Accuracy */}
                      <td className={`py-3.5 px-4 text-right tabular-nums ${primaryMetric === 'accuracy' ? 'font-bold text-[#176B87]' : 'text-[#19323C]'}`}>
                        {(model.accuracy * 100).toFixed(1)}%
                      </td>

                      {/* F1 Score */}
                      <td className={`py-3.5 px-4 text-right tabular-nums border-r border-[#D5E0E4] ${primaryMetric === 'f1Score' ? 'font-bold text-[#176B87]' : 'text-[#19323C]'}`}>
                        {model.f1Score !== undefined ? model.f1Score.toFixed(3) : '—'}
                      </td>

                      {/* Operational Status */}
                      <td className="py-3.5 px-4 text-center font-mono text-[11px] text-[#607780]">
                        <span className="px-2 py-0.5 rounded-[4px] bg-[#E8F0F2] border border-[#D5E0E4]">
                          {model.status || 'Evaluated'}
                        </span>
                      </td>

                      {/* Dynamic Rank based on active primary metric */}
                      <td className="py-3.5 px-4 text-right tabular-nums font-semibold">
                        <span className={isTopRank ? 'text-[#176B87]' : 'text-[#607780]'}>
                          #{index + 1}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="p-3 bg-[#FAFCFC] border-t border-[#D5E0E4] flex flex-wrap items-center justify-between text-[11px] text-[#607780] font-mono">
            <span>↑ Higher is better (Classification) | ↓ Lower is better (Regression)</span>
            <span>Dataset partition: Test Holdout (Simulated)</span>
          </div>
        </Card>
      </section>

      {/* 3. RELATIVE METRIC COMPARISON BARS */}
      <section aria-labelledby="relative-performance-title">
        <Card className="p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-[#D5E0E4]">
            <div>
              <h3 id="relative-performance-title" className="type-card-heading text-[#19323C]">
                Relative Metric Distribution: {activeMeta.label}
              </h3>
              <p className="type-metadata text-[#607780] mt-0.5">
                {activeMeta.category} evaluation · {activeMeta.description}
              </p>
            </div>

            <span className="text-xs font-mono text-[#607780] bg-[#E8F0F2] px-2.5 py-1 rounded-[4px] border border-[#D5E0E4]">
              Target: {activeMeta.direction === 'higher-is-better' ? 'Maximized' : 'Minimized'}
            </span>
          </div>

          {/* Horizontal Benchmark Meters with Interactive Tooltips */}
          <div className="space-y-4 pt-1">
            {sortedModels.map((model, idx) => {
              const isBest = idx === 0;
              const isHovered = hoveredModel === model.modelName;

              // Compute comparative bar width depending on metric category
              let percent = 0;
              let displayVal = '';

              if (primaryMetric === 'accuracy') {
                percent = Math.min(100, Math.max(0, model.accuracy * 100));
                displayVal = `${(model.accuracy * 100).toFixed(1)}%`;
              } else if (primaryMetric === 'f1Score') {
                const f1 = model.f1Score || 0;
                percent = Math.min(100, Math.max(0, f1 * 100));
                displayVal = f1 ? f1.toFixed(3) : '—';
              } else if (primaryMetric === 'mae') {
                const maxVal = Math.max(...models.map((m) => m.mae)) * 1.25 || 5.0;
                percent = Math.max(10, Math.min(100, ((maxVal - model.mae) / maxVal) * 100));
                displayVal = `${model.mae.toFixed(2)} sensor units`;
              } else if (primaryMetric === 'rmse') {
                const maxVal = Math.max(...models.map((m) => m.rmse)) * 1.25 || 6.0;
                percent = Math.max(10, Math.min(100, ((maxVal - model.rmse) / maxVal) * 100));
                displayVal = `${model.rmse.toFixed(2)} sensor units`;
              }

              return (
                <div
                  key={model.modelName}
                  className={`relative p-2 rounded-[6px] transition-all cursor-pointer ${
                    isHovered ? 'bg-[#E8F2F6]/60 border border-[#D5E0E4]' : 'border border-transparent'
                  }`}
                  onMouseEnter={() => setHoveredModel(model.modelName)}
                  onMouseLeave={() => setHoveredModel(null)}
                  onTouchStart={() => setHoveredModel(model.modelName)}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-[#19323C] flex items-center gap-2">
                        <span>{model.modelName}</span>
                        {isBest && (
                          <span className="text-[10px] text-[#176B87] font-mono font-semibold">
                            (Rank #1)
                          </span>
                        )}
                        <span className="text-[10px] font-mono text-[#8A98A8] hidden sm:inline">
                          · {model.status}
                        </span>
                      </span>
                      <span className="font-mono text-[#19323C] font-semibold tabular-nums">
                        {displayVal}
                      </span>
                    </div>

                    {/* Meter Track */}
                    <div className="h-3 w-full bg-[#E8F0F2] rounded-[4px] overflow-hidden border border-[#D5E0E4]">
                      <div
                        className={`h-full transition-all duration-300 rounded-[3px] ${
                          isBest ? 'bg-[#176B87]' : 'bg-[#8A98A8]'
                        } ${isHovered ? 'brightness-110' : ''}`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>

                  {/* Tooltip on Hover */}
                  {isHovered && (
                    <ChartTooltip
                      x={60}
                      y={-10}
                      isPercentagePosition={true}
                      title={`${model.modelName} Architecture`}
                      subtitle={`Model Benchmark · ${model.status}`}
                      seriesType="benchmark"
                      items={[
                        {
                          label: `Ranked on ${activeMeta.label}`,
                          value: displayVal,
                          badge: `Rank #${idx + 1}`,
                          badgeColor: '#176B87',
                          badgeBg: '#E8F2F6',
                        },
                        {
                          label: 'MAE',
                          value: model.mae.toFixed(2),
                          unit: 'sensor units',
                          color: '#C47A13',
                        },
                        {
                          label: 'RMSE',
                          value: model.rmse.toFixed(2),
                          unit: 'sensor units',
                          color: '#C47A13',
                        },
                        {
                          label: 'Accuracy',
                          value: `${(model.accuracy * 100).toFixed(1)}%`,
                          color: '#176B87',
                        },
                        {
                          label: 'F1 Score',
                          value: model.f1Score !== undefined ? model.f1Score.toFixed(3) : '—',
                          color: '#167C80',
                        },
                        {
                          label: 'Parameters',
                          value: model.parametersCount || 'N/A',
                        },
                        {
                          label: 'Latency',
                          value: model.inferenceLatencyMs ? `${model.inferenceLatencyMs} ms` : 'N/A',
                        },
                      ]}
                      footer="Illustrative benchmark values (Demo / Mock Results)"
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className="pt-2 border-t border-[#D5E0E4] text-[11px] text-[#607780] flex items-center justify-between font-mono">
            <span>Bar width reflects relative score for {activeMeta.label}</span>
            <span>
              {activeMeta.direction === 'higher-is-better'
                ? 'Longer bar = Higher accuracy/score'
                : 'Longer bar = Lower error / tighter convergence'}
            </span>
          </div>
        </Card>
      </section>

    </div>
  );
}