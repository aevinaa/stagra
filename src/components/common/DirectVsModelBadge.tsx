import React from 'react';
import { Cpu, Activity, BrainCircuit, Sparkles } from 'lucide-react';
import clsx from 'clsx';

export type DataCategoryType =
  | 'MEASURED'
  | 'DERIVED'
  | 'PREDICTED'
  | 'DIRECT_SENSOR'
  | 'MODEL_DERIVED';

interface DirectVsModelBadgeProps {
  type: DataCategoryType;
  variant?: 'badge' | 'header-tag' | 'minimal';
  className?: string;
  subtext?: string;
}

export const DirectVsModelBadge: React.FC<DirectVsModelBadgeProps> = ({
  type,
  variant = 'badge',
  className,
  subtext,
}) => {
  // Normalize legacy types to standard 3 categories
  const category: 'MEASURED' | 'DERIVED' | 'PREDICTED' =
    type === 'DIRECT_SENSOR' || type === 'MEASURED'
      ? 'MEASURED'
      : type === 'DERIVED'
      ? 'DERIVED'
      : 'PREDICTED';

  const config = {
    MEASURED: {
      label: 'MEASURED',
      headerLabel: 'MEASURED SENSOR DATA',
      cardTitle: 'MEASURED SENSOR TELEMETRY',
      cardSub: 'Physical Hardware Probes (Temp, pH, TDS)',
      icon: Cpu,
      dotColor: 'bg-cyan-400',
      minimalClass: 'bg-cyan-950/60 text-cyan-300 border-cyan-700/60',
      headerClass:
        'bg-cyan-950/40 text-cyan-300 border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.15)]',
      badgeClass: 'bg-cyan-950/30 text-cyan-300 border-cyan-800/60',
      iconColor: 'text-cyan-400',
      titleColor: 'text-cyan-200',
      subColor: 'text-cyan-400/80',
    },
    DERIVED: {
      label: 'DERIVED',
      headerLabel: 'DERIVED METRIC CALCULATIONS',
      cardTitle: 'DERIVED WATER CONDITION & RISK',
      cardSub: 'Calculated from Physical Telemetry & Kinetic Drift',
      icon: Activity,
      dotColor: 'bg-teal-400',
      minimalClass: 'bg-teal-950/60 text-teal-300 border-teal-700/60',
      headerClass:
        'bg-teal-950/40 text-teal-300 border-teal-500/40 shadow-[0_0_12px_rgba(20,184,166,0.15)]',
      badgeClass: 'bg-teal-950/30 text-teal-300 border-teal-800/60',
      iconColor: 'text-teal-400',
      titleColor: 'text-teal-200',
      subColor: 'text-teal-400/80',
    },
    PREDICTED: {
      label: 'PREDICTED',
      headerLabel: 'PREDICTED ML FORECAST',
      cardTitle: 'PREDICTED DEGRADATION & SPATIAL RISK',
      cardSub: 'Proposed Transformer + GNN Architecture (Simulated)',
      icon: BrainCircuit,
      dotColor: 'bg-indigo-400',
      minimalClass: 'bg-indigo-950/60 text-indigo-300 border-indigo-700/60',
      headerClass:
        'bg-indigo-950/40 text-indigo-300 border-indigo-500/40 shadow-[0_0_12px_rgba(99,102,241,0.15)]',
      badgeClass: 'bg-indigo-950/30 text-indigo-300 border-indigo-800/60',
      iconColor: 'text-indigo-400',
      titleColor: 'text-indigo-200',
      subColor: 'text-indigo-400/80',
    },
  }[category];

  const Icon = config.icon;

  if (variant === 'minimal') {
    return (
      <span
        className={clsx(
          'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider uppercase border',
          config.minimalClass,
          className
        )}
      >
        <Icon className={clsx('w-3 h-3', config.iconColor)} />
        {config.label}
      </span>
    );
  }

  if (variant === 'header-tag') {
    return (
      <div
        className={clsx(
          'inline-flex items-center gap-2 px-2.5 py-1 rounded-md text-xs font-mono font-semibold tracking-wider uppercase border',
          config.headerClass,
          className
        )}
      >
        <span className={clsx('w-2 h-2 rounded-full animate-pulse', config.dotColor)} />
        <span>{config.headerLabel}</span>
        {subtext && <span className="text-[10px] text-slate-400 normal-case font-normal">({subtext})</span>}
      </div>
    );
  }

  return (
    <div
      className={clsx(
        'inline-flex items-center gap-2.5 px-3 py-1.5 rounded-lg border text-xs font-mono font-medium',
        config.badgeClass,
        className
      )}
    >
      <Icon className={clsx('w-4 h-4 shrink-0', config.iconColor)} />
      <div>
        <div className={clsx('font-semibold tracking-wider text-[11px] uppercase', config.titleColor)}>
          {config.cardTitle}
        </div>
        <div className={clsx('text-[10px]', config.subColor)}>{subtext || config.cardSub}</div>
      </div>
    </div>
  );
};
