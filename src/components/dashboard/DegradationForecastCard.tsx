import React from 'react';
import { ModelDerivedData, SamplingNode } from '../../types';
import { DirectVsModelBadge } from '../common/DirectVsModelBadge';
import { Sparkles, TrendingUp, ArrowRight, Activity, Layers, ShieldCheck } from 'lucide-react';
import clsx from 'clsx';

interface DegradationForecastCardProps {
  model: ModelDerivedData | null;
  node: SamplingNode | null;
}

export const DegradationForecastCard: React.FC<DegradationForecastCardProps> = ({
  model,
  node,
}) => {
  if (!model || !node) {
    return (
      <div className="p-6 rounded-xl bg-[#0a101b] border border-slate-800 animate-pulse text-center font-mono text-xs text-slate-400">
        COMPUTING 48-HOUR DEGRADATION TRAJECTORY...
      </div>
    );
  }

  const { riskScore, degradationRisk, degradationProgression } = model;

  // Generate 48-hour forward projection steps based on current riskScore and progression
  const forecastSteps = [
    { label: 'Now', hours: 0, score: riskScore },
    { label: '+6h', hours: 6, score: Math.min(100, Math.max(5, Math.round(riskScore * 1.05 + 1))) },
    { label: '+12h', hours: 12, score: Math.min(100, Math.max(5, Math.round(riskScore * 1.12 + 2))) },
    { label: '+24h', hours: 24, score: Math.min(100, Math.max(5, Math.round(riskScore * 1.25 + 5))) },
    { label: '+48h', hours: 48, score: Math.min(100, Math.max(5, Math.round(riskScore * 1.45 + 9))) },
  ];

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-rose-400 bg-rose-950/40 border-rose-600/50';
    if (score >= 50) return 'text-amber-400 bg-amber-950/40 border-amber-600/50';
    if (score >= 30) return 'text-yellow-400 bg-yellow-950/30 border-yellow-600/40';
    return 'text-emerald-400 bg-emerald-950/30 border-emerald-600/40';
  };

  const getScoreBadge = (score: number) => {
    if (score >= 70) return 'CRITICAL';
    if (score >= 50) return 'ELEVATED';
    if (score >= 30) return 'MODERATE';
    return 'LOW';
  };

  const contributingFactors = [
    { name: 'TDS Accumulation Rate', weight: 38, color: 'bg-sky-400', desc: 'Evaporative concentration & ionic stagnation' },
    { name: 'Thermal Kinetic Acceleration', weight: 30, color: 'bg-cyan-400', desc: 'Arrhenius thermal reaction kinetics & growth suitability' },
    { name: 'pH Drift Gradient', weight: 22, color: 'bg-teal-400', desc: 'Chemical drift & potential organic imbalance' },
    { name: 'Spatial Runoff Coupling', weight: 10, color: 'bg-emerald-400', desc: 'Estimated tributary seepage dynamics' },
  ];

  return (
    <div className="rounded-xl bg-[#0a101b] border border-slate-800 p-5 shadow-lg flex flex-col justify-between space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-teal-400" />
          <h3 className="font-mono font-bold text-sm text-slate-100">
            Predicted Degradation (48-Hour Horizon)
          </h3>
        </div>
        <DirectVsModelBadge type="PREDICTED" variant="minimal" />
      </div>

      {/* 48-Hour Horizon Step Timeline */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
          <span>Forward Degradation Trajectory (Simulated Model Output)</span>
          <span className="text-teal-400">Target Timeframe: 48h</span>
        </div>

        <div className="grid grid-cols-5 gap-2 pt-1">
          {forecastSteps.map((step, idx) => {
            const badge = getScoreBadge(step.score);
            const style = getScoreColor(step.score);

            return (
              <div
                key={idx}
                className={clsx(
                  'p-2.5 rounded-lg border text-center font-mono transition-all',
                  style
                )}
              >
                <div className="text-[10px] text-slate-400">{step.label}</div>
                <div className="text-base sm:text-lg font-extrabold my-0.5 tracking-tight">
                  {step.score}
                </div>
                <div className="text-[9px] font-bold uppercase tracking-wider">
                  {badge}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Primary Degradation Contributing Factors */}
      <div className="pt-2 border-t border-slate-800/80 space-y-2 font-mono text-xs">
        <div className="flex items-center justify-between text-[10px] text-slate-400 uppercase tracking-wider">
          <span>Primary Degradation Risk Drivers</span>
          <span>Relative Weight</span>
        </div>

        <div className="space-y-2">
          {contributingFactors.map((factor, idx) => (
            <div key={idx} className="space-y-1">
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-slate-300">{factor.name}</span>
                <span className="text-slate-400 font-bold">{factor.weight}%</span>
              </div>
              <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden border border-slate-800">
                <div
                  className={clsx('h-full rounded-full', factor.color)}
                  style={{ width: `${factor.weight}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
