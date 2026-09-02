import React from 'react';
import clsx from 'clsx';

interface MetricGaugeProps {
  value: number;
  min: number;
  max: number;
  unit: string;
  label: string;
  optimalRange?: [number, number];
  warningThreshold?: number;
  criticalThreshold?: number;
  reverseDanger?: boolean; // if true, lower values are more dangerous (like pH low)
  size?: 'sm' | 'md' | 'lg';
  precision?: number;
  showTicks?: boolean;
  colorScheme?: 'cyan' | 'teal' | 'emerald' | 'amber' | 'rose' | 'adaptive';
}

export const MetricGauge: React.FC<MetricGaugeProps> = ({
  value,
  min,
  max,
  unit,
  label,
  optimalRange,
  warningThreshold,
  criticalThreshold,
  reverseDanger = false,
  size = 'md',
  precision = 1,
  showTicks = true,
  colorScheme = 'adaptive',
}) => {
  // Normalize percentage
  const clampedVal = Math.max(min, Math.min(max, value));
  const percentage = Math.round(((clampedVal - min) / (max - min)) * 100);

  // Compute status color
  const getStatusColor = () => {
    if (colorScheme !== 'adaptive') {
      switch (colorScheme) {
        case 'cyan': return { bar: 'bg-cyan-400', text: 'text-cyan-300', glow: 'shadow-[0_0_12px_rgba(6,182,212,0.4)]' };
        case 'teal': return { bar: 'bg-teal-400', text: 'text-teal-300', glow: 'shadow-[0_0_12px_rgba(20,184,166,0.4)]' };
        case 'emerald': return { bar: 'bg-emerald-400', text: 'text-emerald-300', glow: 'shadow-[0_0_12px_rgba(16,185,129,0.4)]' };
        case 'amber': return { bar: 'bg-amber-400', text: 'text-amber-300', glow: 'shadow-[0_0_12px_rgba(245,158,11,0.4)]' };
        case 'rose': return { bar: 'bg-rose-400', text: 'text-rose-300', glow: 'shadow-[0_0_12px_rgba(244,63,94,0.4)]' };
      }
    }

    if (criticalThreshold !== undefined) {
      const isCritical = reverseDanger ? value <= criticalThreshold : value >= criticalThreshold;
      if (isCritical) {
        return { bar: 'bg-rose-500', text: 'text-rose-400', glow: 'shadow-[0_0_12px_rgba(244,63,94,0.5)]' };
      }
    }

    if (warningThreshold !== undefined) {
      const isWarning = reverseDanger ? value <= warningThreshold : value >= warningThreshold;
      if (isWarning) {
        return { bar: 'bg-amber-400', text: 'text-amber-300', glow: 'shadow-[0_0_12px_rgba(245,158,11,0.4)]' };
      }
    }

    if (optimalRange) {
      if (value < optimalRange[0] || value > optimalRange[1]) {
        return { bar: 'bg-amber-400', text: 'text-amber-300', glow: 'shadow-[0_0_12px_rgba(245,158,11,0.4)]' };
      }
    }

    return { bar: 'bg-cyan-400', text: 'text-cyan-300', glow: 'shadow-[0_0_10px_rgba(6,182,212,0.3)]' };
  };

  const status = getStatusColor();

  return (
    <div className="w-full space-y-1.5 font-mono">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400 text-[11px] uppercase tracking-wider">{label}</span>
        <div className="flex items-baseline gap-1">
          <span className={clsx('text-base font-bold tracking-tight', status.text)}>
            {value.toFixed(precision)}
          </span>
          <span className="text-[11px] text-slate-400 font-medium">{unit}</span>
        </div>
      </div>

      {/* Instrumentation Gauge Track */}
      <div className="relative h-2 w-full rounded-full bg-[#080e18] border border-slate-800 overflow-hidden">
        <div
          className={clsx('h-full rounded-full transition-all duration-700 ease-out', status.bar, status.glow)}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Gauge Scale Labels */}
      {showTicks && (
        <div className="flex justify-between text-[9px] text-slate-400 px-0.5">
          <span>{min} {unit}</span>
          {optimalRange && (
            <span className="text-cyan-400/80">
              Opt: {optimalRange[0]}-{optimalRange[1]}
            </span>
          )}
          <span>{max} {unit}</span>
        </div>
      )}
    </div>
  );
};
