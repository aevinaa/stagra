import React from 'react';
import {
  BrainCircuit,
  Activity,
  Hourglass,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Biohazard,
  ShieldCheck,
  Percent,
} from 'lucide-react';
import { ModelDerivedData, SamplingNode } from '../../types';
import { DirectVsModelBadge } from '../common/DirectVsModelBadge';
import { StatusPill } from '../common/StatusPill';
import clsx from 'clsx';

interface ModelDerivedPanelProps {
  model: ModelDerivedData | null;
  node: SamplingNode | null;
}

export const ModelDerivedPanel: React.FC<ModelDerivedPanelProps> = ({ model, node }) => {
  if (!model || !node) {
    return (
      <div className="p-8 rounded-xl bg-[#0b121e] border border-emerald-800/40 animate-pulse text-center font-mono text-xs text-emerald-400">
        INITIALIZING TRANSFORMER & GNN INFERENCE STREAM...
      </div>
    );
  }

  const {
    waterCondition,
    degradationRisk,
    riskScore,
    modelConfidence,
    degradationProgression,
  } = model;

  // Visual styling for risk level
  const getRiskStyles = () => {
    switch (degradationRisk) {
      case 'CRITICAL':
        return {
          badge: 'bg-rose-950/80 text-rose-300 border-rose-600/60',
          text: 'text-rose-400',
          border: 'border-rose-600/40',
          bg: 'bg-rose-950/20',
          indicator: 'bg-rose-500',
          icon: Biohazard,
        };
      case 'ELEVATED':
        return {
          badge: 'bg-amber-950/80 text-amber-300 border-amber-600/60',
          text: 'text-amber-400',
          border: 'border-amber-600/40',
          bg: 'bg-amber-950/20',
          indicator: 'bg-amber-500',
          icon: AlertTriangle,
        };
      case 'MODERATE':
        return {
          badge: 'bg-yellow-950/70 text-yellow-300 border-yellow-600/50',
          text: 'text-yellow-400',
          border: 'border-yellow-600/30',
          bg: 'bg-yellow-950/15',
          indicator: 'bg-yellow-400',
          icon: Activity,
        };
      case 'LOW':
      default:
        return {
          badge: 'bg-emerald-950/70 text-emerald-300 border-emerald-600/50',
          text: 'text-emerald-400',
          border: 'border-emerald-600/30',
          bg: 'bg-emerald-950/15',
          indicator: 'bg-emerald-400',
          icon: ShieldCheck,
        };
    }
  };

  const riskStyle = getRiskStyles();
  const RiskIcon = riskStyle.icon;

  return (
    <div className="rounded-xl bg-[#0a101b] border border-emerald-500/30 p-5 shadow-lg relative overflow-hidden">
      {/* Subtle top indicator line */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-teal-500 via-emerald-400 to-teal-600" />

      {/* Header section with DERIVED & PREDICTED DATA banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800/80">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <DirectVsModelBadge type="DERIVED" variant="header-tag" subtext="Calculated Water Condition, Risk Score & Stagnant Trends" />
          </div>
          <p className="text-xs text-slate-400 font-sans">
            Condition indices derived from physical sensor telemetry and kinetic models
          </p>
        </div>

        {/* Model Inference Metadata */}
        <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#070c14] border border-slate-800">
            <Sparkles className="w-3.5 h-3.5 text-teal-400" />
            <span>Confidence: <strong className="text-emerald-300 font-bold">{modelConfidence}%</strong></span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#070c14] border border-slate-800">
            <BrainCircuit className="w-3.5 h-3.5 text-teal-400" />
            <span>Model: <strong className="text-teal-300">Proposed Architecture</strong></span>
          </div>
        </div>
      </div>

      {/* Model-Derived High Priority Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
        
        {/* 1. WATER CONDITION CLASSIFICATION */}
        <div className="p-4 rounded-xl bg-[#0d1624] border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                WATER CONDITION
              </span>
              <span className="text-[10px] font-mono text-teal-300 px-1.5 py-0.2 rounded bg-teal-950/60 border border-teal-800/50 font-bold">
                DERIVED
              </span>
            </div>
            <h4 className="font-mono font-bold text-base text-slate-100 mt-2 leading-snug">
              {waterCondition}
            </h4>
            <p className="text-[11px] text-slate-400 font-sans mt-1.5 leading-relaxed">
              Multi-parameter classification calculated from thermal kinetics, pH drift, and ionic solids.
            </p>
          </div>

          <div className="mt-4 pt-2 border-t border-slate-800 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-teal-400" />
            <span className="text-[11px] font-mono text-slate-300">
              Growth Suitability Index: <strong className="text-teal-300">{degradationProgression.bacterialGrowthIndexEst}/100</strong>
            </span>
          </div>
        </div>

        {/* 2. DEGRADATION RISK SCORE */}
        <div className={clsx('p-4 rounded-xl border flex flex-col justify-between transition-all', riskStyle.bg, riskStyle.border)}>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-300">
                DEGRADATION RISK
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono text-teal-300 px-1.5 py-0.2 rounded bg-teal-950/80 border border-teal-700/60 font-bold">
                  DERIVED
                </span>
                <RiskIcon className={clsx('w-4 h-4', riskStyle.text)} />
              </div>
            </div>

            <div className="flex items-baseline gap-2 mt-2">
              <span className={clsx('text-3xl font-extrabold font-mono tracking-tight', riskStyle.text)}>
                {riskScore}
              </span>
              <span className="text-xs font-mono text-slate-400">/ 100</span>
              <StatusPill level={degradationRisk} size="sm" className="ml-auto" />
            </div>

            <p className="text-[11px] text-slate-300 font-sans mt-2">
              Calculated risk score synthesizing multi-sensor drifts and kinetic accumulation.
            </p>
          </div>

          {/* Risk Score Gauge Meter */}
          <div className="mt-4 pt-2 border-t border-slate-800/60">
            <div className="h-2 w-full rounded-full bg-[#080d16] border border-slate-800 overflow-hidden">
              <div
                className={clsx('h-full transition-all duration-700', riskStyle.indicator)}
                style={{ width: `${riskScore}%` }}
              />
            </div>
            <div className="flex justify-between text-[9px] font-mono text-slate-400 mt-1">
              <span>0 (Fresh)</span>
              <span>50 (Threshold)</span>
              <span>100 (Critical)</span>
            </div>
          </div>
        </div>

        {/* 3. ESTIMATED DEGRADATION PROGRESSION */}
        <div className="p-4 rounded-xl bg-[#0d1624] border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                TIME TO ELEVATED RISK
              </span>
              <span className="text-[10px] font-mono text-indigo-300 px-1.5 py-0.2 rounded bg-indigo-950/60 border border-indigo-800/50 font-bold">
                PREDICTED
              </span>
            </div>

            <div className="flex items-baseline gap-1.5 font-mono mt-2">
              <span className="text-3xl font-extrabold text-slate-100">
                {degradationProgression.timeToCriticalHours}
              </span>
              <span className="text-sm font-semibold text-indigo-400">hours</span>
            </div>

            <p className="text-[11px] text-slate-400 font-sans mt-2">
              Estimated duration generated by ML model before accelerated stagnation and degradation progression occurs.
            </p>
          </div>

          <div className="mt-4 pt-2 border-t border-slate-800">
            <div className="text-[11px] font-mono text-slate-300 flex items-center justify-between">
              <span className="text-slate-400">Degradation Velocity:</span>
              <span className="text-indigo-300 font-semibold">+{degradationProgression.decayRatePerHour}% / hr</span>
            </div>
          </div>
        </div>

        {/* 4. DEGRADATION TREND VECTOR */}
        <div className="p-4 rounded-xl bg-[#0d1624] border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                STAGNATION TENDENCY
              </span>
              <span className="text-[10px] font-mono text-teal-300 px-1.5 py-0.2 rounded bg-teal-950/60 border border-teal-800/50 font-bold">
                DERIVED
              </span>
            </div>

            <h4 className="font-mono font-bold text-sm text-slate-100 mt-2">
              {degradationProgression?.oxygenDepletionTrend?.replace(/_/g, ' ') || 'STABLE'}
            </h4>

            <p className="text-[11px] text-slate-400 font-sans mt-2">
              Stagnation degradation tendency calculated from thermal kinetics and TDS accumulation trends.
            </p>
          </div>

          <div className="mt-4 pt-2 border-t border-slate-800">
            <div className="text-[10px] font-mono text-teal-400/90 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
              <span>Future Expansion: DO Sensor (Phase II)</span>
            </div>
          </div>
        </div>

      </div>

      {/* Degradation Progression Stage Banner */}
      <div className="mt-4 p-3.5 rounded-lg bg-[#070c14] border border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2 font-mono text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">ESTIMATED PROGRESSION STAGE:</span>
            <strong className="text-cyan-300">{degradationProgression.currentStage}</strong>
          </div>
          <span className="text-[11px] text-slate-400">
            Stage Completion: <strong className="text-slate-200">{degradationProgression.stageProgressPct}%</strong>
          </span>
        </div>

        {/* 4-Stage Visual Progress Bar */}
        <div className="grid grid-cols-4 gap-1.5 h-2 rounded-full overflow-hidden">
          <div className={clsx('h-full rounded-l', riskScore >= 10 ? 'bg-emerald-500' : 'bg-slate-800')} title="Phase 1: Initial Stagnant Thermal Layering" />
          <div className={clsx('h-full', riskScore >= 35 ? 'bg-yellow-500' : 'bg-slate-800')} title="Phase 2: Organic Accumulation & Nutrient Layering" />
          <div className={clsx('h-full', riskScore >= 55 ? 'bg-amber-500' : 'bg-slate-800')} title="Phase 3: Elevated Growth Suitability & Bio-Load" />
          <div className={clsx('h-full rounded-r', riskScore >= 75 ? 'bg-rose-500' : 'bg-slate-800')} title="Phase 4: Critical Stagnant Water Degradation" />
        </div>

        <div className="flex justify-between text-[9px] font-mono text-slate-400 mt-1.5 px-0.5">
          <span>Stage 1: Thermal Layering</span>
          <span>Stage 2: Organic Load</span>
          <span>Stage 3: Growth Suitability</span>
          <span>Stage 4: Critical Degradation</span>
        </div>
      </div>
    </div>
  );
};
