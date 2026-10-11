import React from 'react';

export type AQILevel = 'LOW' | 'MODERATE' | 'HIGH';
export type SystemStatusType = 'ONLINE' | 'OFFLINE' | 'STANDBY';

interface StatusPillProps {
  level?: AQILevel;
  systemStatus?: SystemStatusType;
  customLabel?: string;
  className?: string;
  size?: 'sm' | 'md';
}

export function StatusPill({
  level,
  systemStatus,
  customLabel,
  className = '',
  size = 'md',
}: StatusPillProps) {
  if (level) {
    const config = {
      LOW: {
        bg: 'bg-[#F0FDF4]',
        text: 'text-[#16A34A]',
        dot: 'bg-[#16A34A]',
        border: 'border-[#DCFCE7]',
        label: 'Low Risk',
      },
      MODERATE: {
        bg: 'bg-[#FFFBEB]',
        text: 'text-[#D97706]',
        dot: 'bg-[#D97706]',
        border: 'border-[#FEF3C7]',
        label: 'Moderate Risk',
      },
      HIGH: {
        bg: 'bg-[#FEF2F2]',
        text: 'text-[#DC2626]',
        dot: 'bg-[#DC2626]',
        border: 'border-[#FEE2E2]',
        label: 'High Risk',
      },
    }[level];

    const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';

    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${config.bg} ${config.text} ${config.border} ${sizeClasses} ${className}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} aria-hidden="true" />
        <span>{customLabel || config.label}</span>
      </span>
    );
  }

  if (systemStatus) {
    const config = {
      ONLINE: {
        bg: 'bg-[#F0FDF4]',
        text: 'text-[#16A34A]',
        dot: 'bg-[#16A34A]',
        border: 'border-[#DCFCE7]',
        label: 'System Online',
      },
      OFFLINE: {
        bg: 'bg-[#FEF2F2]',
        text: 'text-[#DC2626]',
        dot: 'bg-[#DC2626]',
        border: 'border-[#FEE2E2]',
        label: 'System Offline',
      },
      STANDBY: {
        bg: 'bg-[#F2F6F8]',
        text: 'text-[#5F6F82]',
        dot: 'bg-[#8A98A8]',
        border: 'border-[#D8E0E8]',
        label: 'Standby',
      },
    }[systemStatus];

    const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';

    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${config.bg} ${config.text} ${config.border} ${sizeClasses} ${className}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} aria-hidden="true" />
        <span>{customLabel || config.label}</span>
      </span>
    );
  }

  return null;
}
