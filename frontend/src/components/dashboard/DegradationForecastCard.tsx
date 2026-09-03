import React from 'react';
import { ModelDerivedData, SamplingNode } from '../../types';
import { DirectVsModelBadge } from '../common/DirectVsModelBadge';
import {
  TrendingUp,
  Sparkles,
} from 'lucide-react';
import clsx from 'clsx';

interface DegradationForecastCardProps {
  model: ModelDerivedData | null;
  node: SamplingNode | null;
}

export const DegradationForecastCard: React.FC<
  DegradationForecastCardProps
> = ({ model, node }) => {
  if (!model || !node) {
    return (
      <div className="p-6 rounded-xl bg-[#0a101b] border border-slate-800 animate-pulse text-center font-mono text-xs text-slate-400">
        COMPUTING 48-HOUR DEGRADATION TRAJECTORY...
      </div>
    );
  }

  const {
    riskScore,
    transformerForecast = [],
  } = model;

  /*
   * The current implementation does not contain a trained Transformer.
   * Forecast values shown here are simulated outputs produced by the
   * prototype model layer and are intended for interface/research testing.
   */

  const forecastSteps = [
    {
      label: 'Now',
      hours: 0,
      score: riskScore,
    },
    ...transformerForecast
      .filter((point) => [6, 12, 24, 48].includes(point.hoursAhead))
      .map((point) => ({
        label: `+${point.hoursAhead}h`,
        hours: point.hoursAhead,
        score: point.predictedRiskScore,
      })),
  ];

  /*
   * Guarantee a complete UI even when the backend/model layer
   * has not yet supplied a forecast array.
   */
  const fallbackOffsets = [
    { label: '+6h', hours: 6, offset: 2 },
    { label: '+12h', hours: 12, offset: 4 },
    { label: '+24h', hours: 24, offset: 7 },
    { label: '+48h', hours: 48, offset: 10 },
  ];

  const completeForecast =
    forecastSteps.length >= 5
      ? forecastSteps.slice(0, 5)
      : [
          {
            label: 'Now',
            hours: 0,
            score: riskScore,
          },
          ...fallbackOffsets.map((item) => ({
            label: item.label,
            hours: item.hours,
            score: Math.min(
              100,
              Math.max(
                0,
                Math.round(riskScore + item.offset)
              )
            ),
          })),
        ];

  const getScoreTheme = (score: number) => {
    if (score >= 75) {
      return {
        text: 'text-rose-400',
        background: 'bg-rose-950/30',
        border: 'border-rose-700/50',
        badge: 'CRITICAL',
      };
    }

    if (score >= 55) {
      return {
        text: 'text-amber-400',
        background: 'bg-amber-950/30',
        border: 'border-amber-700/50',
        badge: 'ELEVATED',
      };
    }

    if (score >= 35) {
      return {
        text: 'text-yellow-400',
        background: 'bg-yellow-950/30',
        border: 'border-yellow-700/40',
        badge: 'MODERATE',
      };
    }

    return {
      text: 'text-emerald-400',
      background: 'bg-emerald-950/30',
      border: 'border-emerald-700/40',
      badge: 'LOW',
    };
  };

  const contributingFactors = [
    {
      name: 'Temperature Trend',
      weight: 48,
      description:
        'Illustrative contribution from observed temperature changes over the temporal window.',
    },
    {
      name: 'pH Drift',
      weight: 32,
      description:
        'Illustrative contribution from changes in measured pH over time.',
    },
    {
      name: 'Temporal Pattern',
      weight: 20,
      description:
        'Illustrative contribution from the recent direction and shape of the time series.',
    },
  ];

  return (
    <div className="rounded-xl bg-[#0a101b] border border-slate-800 p-5 shadow-lg">

      {/* =====================================================
          HEADER
          ===================================================== */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800">

        <div className="flex items-center gap-3">

          <div className="p-2 rounded-lg bg-[#0d1624] border border-slate-800 text-teal-400">
            <TrendingUp className="w-5 h-5" />
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-mono font-bold text-sm text-slate-100">
                Predicted Degradation — 48h Horizon
              </h3>

              <DirectVsModelBadge
                type="PREDICTED"
                variant="minimal"
              />
            </div>

            <p className="text-[11px] text-slate-400 font-sans mt-0.5">
              Simulated forward estimate based on temporal changes in
              measured temperature and pH.
            </p>
          </div>

        </div>

        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-indigo-700/50 bg-indigo-950/20">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />

          <span className="text-[10px] font-mono font-semibold text-indigo-300">
            PROPOSED MODEL · SIMULATED OUTPUT
          </span>
        </div>

      </div>


      {/* =====================================================
          FORECAST DISCLAIMER
          ===================================================== */}
      <div className="mt-4 rounded-lg border border-indigo-900/50 bg-indigo-950/10 px-3 py-2.5">

        <div className="flex items-start gap-2">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400 mt-0.5 shrink-0" />

          <p className="text-[10px] leading-5 font-sans text-slate-400">
            The current prototype uses simulated model output for
            demonstration and interface validation. Forecast values
            are not yet predictions from a trained Transformer model
            validated against field data.
          </p>
        </div>

      </div>


      {/* =====================================================
          48-HOUR FORECAST
          ===================================================== */}
      <div className="mt-5">

        <div className="flex items-center justify-between gap-3 mb-2">

          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
            Forward Degradation Trajectory
          </span>

          <span className="text-[10px] font-mono text-indigo-300">
            Horizon: 48h
          </span>

        </div>


        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">

          {completeForecast.map((step) => {
            const theme = getScoreTheme(step.score);

            return (
              <div
                key={`${step.label}-${step.hours}`}
                className={clsx(
                  'p-3 rounded-lg border text-center font-mono transition-colors',
                  theme.background,
                  theme.border
                )}
              >

                <div className="text-[10px] text-slate-500">
                  {step.label}
                </div>

                <div
                  className={clsx(
                    'text-xl font-extrabold mt-1',
                    theme.text
                  )}
                >
                  {step.score}
                </div>

                <div
                  className={clsx(
                    'text-[9px] font-bold uppercase tracking-wider mt-0.5',
                    theme.text
                  )}
                >
                  {theme.badge}
                </div>

              </div>
            );
          })}

        </div>

      </div>


      {/* =====================================================
          SIMULATED CONTRIBUTION
          ===================================================== */}
      <div className="mt-5 pt-4 border-t border-slate-800/80">

        <div className="flex items-center justify-between mb-3">

          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
            Simulated Risk Contributions
          </span>

          <span className="text-[10px] font-mono text-slate-500">
            Illustrative
          </span>

        </div>


        <div className="space-y-3">

          {contributingFactors.map((factor) => (
            <div
              key={factor.name}
              className="space-y-1"
            >

              <div className="flex items-center justify-between gap-3">

                <div className="min-w-0">
                  <span className="block text-[11px] font-mono text-slate-300">
                    {factor.name}
                  </span>

                  <span className="block text-[9px] font-sans text-slate-500 mt-0.5">
                    {factor.description}
                  </span>
                </div>

                <span className="text-[11px] font-mono font-bold text-cyan-300 shrink-0">
                  {factor.weight}%
                </span>

              </div>


              <div className="w-full h-1.5 rounded-full bg-slate-900 border border-slate-800 overflow-hidden">

                <div
                  className="h-full rounded-full bg-cyan-500"
                  style={{
                    width: `${factor.weight}%`,
                  }}
                />

              </div>

            </div>
          ))}

        </div>

      </div>


      {/* =====================================================
          FOOTNOTE
          ===================================================== */}
      <div className="mt-5 pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">

        <span className="text-[9px] font-mono text-slate-500">
          INPUTS: TEMPERATURE + pH
        </span>

        <span className="text-[9px] font-mono text-indigo-400">
          OUTPUT: SIMULATED FORECAST
        </span>

      </div>

    </div>
  );
};