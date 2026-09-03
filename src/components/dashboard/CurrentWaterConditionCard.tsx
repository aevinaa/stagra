import React from 'react';
import { ModelDerivedData, SamplingNode } from '../../types';
import { DirectVsModelBadge } from '../common/DirectVsModelBadge';
import {
  ShieldCheck,
  AlertTriangle,
  Biohazard,
  Activity,
  Hourglass,
  TrendingUp,
} from 'lucide-react';
import clsx from 'clsx';

interface CurrentWaterConditionCardProps {
  model: ModelDerivedData | null;
  node: SamplingNode | null;
}

export const CurrentWaterConditionCard: React.FC<
  CurrentWaterConditionCardProps
> = ({ model, node }) => {
  if (!model || !node) {
    return (
      <div className="p-6 rounded-xl bg-[#0a101b] border border-teal-500/20 animate-pulse text-center font-mono text-xs text-teal-400">
        COMPUTING WATER CONDITION &amp; DEGRADATION RISK...
      </div>
    );
  }

  const {
    waterCondition,
    degradationRisk,
    riskScore,
    degradationProgression,
  } = model;

  const getRiskTheme = () => {
    switch (degradationRisk) {
      case 'CRITICAL':
        return {
          badge:
            'bg-rose-950/80 text-rose-300 border-rose-600/60',
          scoreColor: 'text-rose-400',
          border: 'border-rose-600/40',
          icon: Biohazard,
          label: 'CRITICAL RISK',
          progressBg: 'bg-rose-500',
        };

      case 'ELEVATED':
        return {
          badge:
            'bg-amber-950/80 text-amber-300 border-amber-600/60',
          scoreColor: 'text-amber-400',
          border: 'border-amber-600/40',
          icon: AlertTriangle,
          label: 'ELEVATED RISK',
          progressBg: 'bg-amber-500',
        };

      case 'MODERATE':
        return {
          badge:
            'bg-yellow-950/70 text-yellow-300 border-yellow-600/50',
          scoreColor: 'text-yellow-400',
          border: 'border-yellow-600/30',
          icon: Activity,
          label: 'MODERATE RISK',
          progressBg: 'bg-yellow-400',
        };

      case 'LOW':
      default:
        return {
          badge:
            'bg-emerald-950/70 text-emerald-300 border-emerald-600/50',
          scoreColor: 'text-emerald-400',
          border: 'border-emerald-600/30',
          icon: ShieldCheck,
          label: 'LOW RISK',
          progressBg: 'bg-emerald-400',
        };
    }
  };

  const getStageInfo = () => {
    if (riskScore >= 75) {
      return {
        name: 'Stage 4: Elevated Degradation',
        shortName: 'Elevated Degradation',
      };
    }

    if (riskScore >= 55) {
      return {
        name: 'Stage 3: Moderate Stagnation',
        shortName: 'Moderate Stagnation',
      };
    }

    if (riskScore >= 35) {
      return {
        name: 'Stage 2: Early Stagnation',
        shortName: 'Early Stagnation',
      };
    }

    return {
      name: 'Stage 1: Initial Change',
      shortName: 'Initial Change',
    };
  };

  const theme = getRiskTheme();
  const Icon = theme.icon;
  const stageInfo = getStageInfo();

  const forecastWindow =
    degradationProgression.timeToCriticalHours > 48
      ? '> 48h'
      : `~${degradationProgression.timeToCriticalHours} hrs`;

  const stageProgress = Math.min(
    100,
    Math.max(0, degradationProgression.stageProgressPct)
  );

  return (
    <div
      className={clsx(
        'rounded-xl bg-[#0a101b] border p-5 shadow-lg relative overflow-hidden transition-all',
        theme.border
      )}
    >
      {/* Subtle top indicator */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-teal-500 via-emerald-400 to-cyan-500" />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">

        {/* =======================================================
            LEFT: CONDITION SUMMARY
            ======================================================= */}
        <div className="lg:col-span-7 space-y-3">

          <div className="flex flex-wrap items-center gap-2">
            <DirectVsModelBadge
              type="DERIVED"
              variant="minimal"
            />

            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
              Derived Water Classification
            </span>
          </div>


          <div className="flex items-start gap-3">

            <div
              className={clsx(
                'p-2.5 rounded-xl border mt-0.5 shrink-0',
                theme.badge
              )}
            >
              <Icon className="w-6 h-6" />
            </div>

            <div className="min-w-0">

              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-mono font-bold text-xl sm:text-2xl text-slate-100 tracking-tight leading-tight">
                  {waterCondition}
                </h3>

                <span className="text-[9px] font-mono text-slate-500 border border-slate-800 rounded px-1.5 py-0.5">
                  {node.code}
                </span>
              </div>

              <p className="text-[11px] text-slate-400 font-sans mt-1.5 leading-relaxed">
                Derived environmental condition based on measured
                temperature and pH behaviour.
              </p>

            </div>
          </div>


          {/* Stage progression */}
          <div className="pt-2">

            <div className="flex items-center justify-between gap-3 text-[10px] font-mono text-slate-400 mb-1.5">
              <span>
                Current Stage:{' '}
                <strong className="text-slate-200">
                  {stageInfo.name}
                </strong>
              </span>

              <span className="text-teal-400 font-bold whitespace-nowrap">
                {stageProgress}% Active
              </span>
            </div>


            <div className="grid grid-cols-4 gap-1.5 h-2 rounded-full overflow-hidden bg-slate-900 border border-slate-800">

              <div
                className={clsx(
                  'h-full rounded-l transition-all',
                  riskScore >= 0
                    ? 'bg-emerald-500'
                    : 'bg-slate-800'
                )}
                title="Stage 1: Initial Change"
              />

              <div
                className={clsx(
                  'h-full transition-all',
                  riskScore >= 35
                    ? 'bg-yellow-500'
                    : 'bg-slate-800'
                )}
                title="Stage 2: Early Stagnation"
              />

              <div
                className={clsx(
                  'h-full transition-all',
                  riskScore >= 55
                    ? 'bg-amber-500'
                    : 'bg-slate-800'
                )}
                title="Stage 3: Moderate Stagnation"
              />

              <div
                className={clsx(
                  'h-full rounded-r transition-all',
                  riskScore >= 75
                    ? 'bg-rose-500'
                    : 'bg-slate-800'
                )}
                title="Stage 4: Elevated Degradation"
              />

            </div>


            <div className="flex justify-between text-[9px] font-mono text-slate-400 mt-1 px-0.5">
              <span>Initial</span>
              <span>Early</span>
              <span>Moderate</span>
              <span>Elevated</span>
            </div>

          </div>
        </div>


        {/* =======================================================
            RIGHT: KEY METRICS
            ======================================================= */}
        <div className="lg:col-span-5 grid grid-cols-2 gap-3 pt-3 lg:pt-0 lg:border-l lg:border-slate-800/80 lg:pl-5">

          {/* Degradation Risk */}
          <div className="p-3.5 rounded-lg bg-[#0d1624] border border-slate-800/90 flex flex-col justify-between">

            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
              Degradation Risk
            </span>

            <div className="my-1.5 flex items-baseline gap-1.5">

              <span
                className={clsx(
                  'text-3xl font-extrabold font-mono tracking-tight',
                  theme.scoreColor
                )}
              >
                {riskScore}
              </span>

              <span className="text-xs text-slate-400 font-mono">
                / 100
              </span>

            </div>

            <span
              className={clsx(
                'inline-block text-[10px] font-mono font-bold px-2 py-0.5 rounded border text-center',
                theme.badge
              )}
            >
              {theme.label}
            </span>

            <p className="text-[10px] text-slate-500 font-sans mt-2 leading-relaxed">
              Derived from measured temperature and pH behaviour.
            </p>

          </div>


          {/* Forecast Window */}
          <div className="p-3.5 rounded-lg bg-[#0d1624] border border-slate-800/90 flex flex-col justify-between">

            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block flex items-center gap-1">
              <Hourglass className="w-3 h-3 text-cyan-400" />
              Forecast Window
            </span>

            <div className="my-1.5">

              <div className="text-lg sm:text-xl font-bold font-mono text-slate-100">
                {forecastWindow}
              </div>

              <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                Outlook:{' '}
                <strong className="text-teal-300">
                  {stageInfo.shortName}
                </strong>
              </div>

            </div>

            <div className="text-[10px] font-mono text-teal-400/90 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              <span>48h Forecast</span>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
};