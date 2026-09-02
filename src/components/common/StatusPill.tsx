import React from 'react';
import clsx from 'clsx';
import { RiskLevel, WaterConditionClassification } from '../../types';

interface StatusPillProps {
  level?: RiskLevel | 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'INFO';
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  showDot?: boolean;
  className?: string;
}

export const StatusPill: React.FC<StatusPillProps> = ({
  level = 'LOW',
  label,
  size = 'md',
  showDot = true,
  className,
}) => {
  const getStyles = () => {
    switch (level) {
      case 'CRITICAL':
        return {
          bg: 'bg-rose-950/60 text-rose-300 border-rose-600/50 shadow-[0_0_10px_rgba(244,63,94,0.2)]',
          dot: 'bg-rose-400 animate-ping',
          text: label || 'CRITICAL RISK',
        };
      case 'ELEVATED':
      case 'WARNING':
        return {
          bg: 'bg-amber-950/60 text-amber-300 border-amber-600/50 shadow-[0_0_10px_rgba(245,158,11,0.2)]',
          dot: 'bg-amber-400',
          text: label || 'ELEVATED RISK',
        };
      case 'MODERATE':
        return {
          bg: 'bg-yellow-950/50 text-yellow-300 border-yellow-600/40',
          dot: 'bg-yellow-400',
          text: label || 'MODERATE RISK',
        };
      case 'LOW':
      case 'HEALTHY':
      default:
        return {
          bg: 'bg-emerald-950/50 text-emerald-300 border-emerald-600/40 shadow-[0_0_10px_rgba(16,185,129,0.15)]',
          dot: 'bg-emerald-400',
          text: label || 'NORMAL / STABLE',
        };
    }
  };

  const { bg, dot, text } = getStyles();

  const sizeClasses =
    size === 'sm'
      ? 'px-2 py-0.5 text-[10px] font-mono'
      : size === 'lg'
      ? 'px-3.5 py-1.5 text-xs font-mono font-semibold'
      : 'px-2.5 py-1 text-xs font-mono font-medium';

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border uppercase tracking-wider',
        bg,
        sizeClasses,
        className
      )}
    >
      {showDot && (
        <span className="relative flex h-2 w-2">
          <span className={clsx('absolute inline-flex h-full w-full rounded-full opacity-75', dot)} />
          <span className={clsx('relative inline-flex rounded-full h-2 w-2', dot.split(' ')[0])} />
        </span>
      )}
      <span>{text}</span>
    </span>
  );
};
