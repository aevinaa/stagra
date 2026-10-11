import React from 'react';

interface MetricDisplayProps {
  label: string;
  value: string | number;
  unit?: string;
  metadata?: string;
  statusLevel?: 'LOW' | 'MODERATE' | 'HIGH';
  className?: string;
}

export function MetricDisplay({
  label,
  value,
  unit,
  metadata,
  statusLevel,
  className = '',
}: MetricDisplayProps) {
  const statusColor = {
    LOW: 'text-[#16A34A]',
    MODERATE: 'text-[#D97706]',
    HIGH: 'text-[#DC2626]',
  }[statusLevel ?? 'LOW'];

  return (
    <div className={`p-4 bg-[#F9FBFC] rounded-[12px] border border-[#D8E0E8] shadow-subtle ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="type-metadata text-[#5F6F82] uppercase tracking-wider font-medium text-[11px]">
          {label}
        </span>
        {statusLevel && (
          <span className={`w-2 h-2 rounded-full ${statusLevel === 'LOW' ? 'bg-[#16A34A]' : statusLevel === 'MODERATE' ? 'bg-[#D97706]' : 'bg-[#DC2626]'}`} />
        )}
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className="type-metric-large text-[#1E293B] font-mono tabular-nums">
          {value}
        </span>
        {unit && (
          <span className="text-xs font-mono text-[#5F6F82] font-medium">
            {unit}
          </span>
        )}
      </div>

      {metadata && (
        <div className="mt-2 pt-2 border-t border-[#D8E0E8] flex items-center justify-between">
          <span className="type-metadata text-[#8A98A8]">{metadata}</span>
          {statusLevel && (
            <span className={`text-[11px] font-medium font-mono ${statusColor}`}>
              {statusLevel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
